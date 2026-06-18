const encoder = new TextEncoder();
const decoder = new TextDecoder();

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function decodeBase64(input: string): Uint8Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

let cachedKey: CryptoKey | null = null;

async function getAesKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const raw = decodeBase64(requiredEnv("POSTZ_TOKEN_ENCRYPTION_KEY"));
  if (raw.byteLength !== 32) {
    throw new Error("POSTZ_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  }

  cachedKey = await crypto.subtle.importKey(
    "raw",
    raw as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

/**
 * Encrypts an OAuth token for storage at rest.
 *
 * Format: `<iv_b64>:<ciphertext_b64>` (AES-256-GCM with 12-byte IV)
 */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
  return `${encodeBase64(iv)}:${encodeBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(tokenRef: string): Promise<string> {
  const [ivB64, ciphertextB64] = tokenRef.split(":");
  if (!ivB64 || !ciphertextB64) {
    throw new Error("Invalid token_ref format");
  }

  const key = await getAesKey();
  const iv = decodeBase64(ivB64);
  const ciphertext = decodeBase64(ciphertextB64);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource,
  );
  return decoder.decode(plaintext);
}
