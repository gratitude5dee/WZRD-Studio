export interface RelayClaims {
  session_id: string;
  sandbox_id: string;
  user_id: string;
  project_id?: string | null;
  workspace_dir: string;
  input_dir: string;
  output_dir: string;
}

const EXPECTED_ISSUER = 'wzrd-studio-desktop';
const EXPECTED_AUDIENCE = 'wzrd-studio-daytona-agent-relay';

export async function verifyToken({ token, secret }: { token: string; secret: string }): Promise<RelayClaims> {
  const [headerB64, payloadB64, sigB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('malformed_token');

  const header = JSON.parse(b64decUtf8(headerB64));
  if (header.alg !== 'HS256') throw new Error('alg_mismatch');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    toBufferSource(b64decBin(sigB64)),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) throw new Error('sig_mismatch');

  const payload = JSON.parse(b64decUtf8(payloadB64));
  if (payload.iss !== EXPECTED_ISSUER) throw new Error('issuer_mismatch');
  if (payload.aud !== EXPECTED_AUDIENCE) throw new Error('audience_mismatch');
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) throw new Error('expired');

  for (const keyName of ['session_id', 'sandbox_id', 'user_id', 'workspace_dir', 'input_dir', 'output_dir']) {
    if (typeof payload[keyName] !== 'string' || payload[keyName].length === 0) {
      throw new Error(`missing_${keyName}`);
    }
  }

  return {
    session_id: payload.session_id,
    sandbox_id: payload.sandbox_id,
    user_id: payload.user_id,
    project_id: typeof payload.project_id === 'string' ? payload.project_id : null,
    workspace_dir: payload.workspace_dir,
    input_dir: payload.input_dir,
    output_dir: payload.output_dir,
  };
}

export function peekSessionId(token: string): string | null {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(b64decUtf8(payloadB64));
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

function b64decBin(value: string): Uint8Array {
  const padded = value + (value.length % 4 === 0 ? '' : '===='.slice(value.length % 4));
  const normalized = padded.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(normalized);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function b64decUtf8(value: string): string {
  return new TextDecoder().decode(b64decBin(value));
}

function toBufferSource(bytes: Uint8Array): ArrayBufferView<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy as ArrayBufferView<ArrayBuffer>;
}
