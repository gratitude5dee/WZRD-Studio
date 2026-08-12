/**
 * Response scrubber. Provider errors and Postgres messages occasionally echo keys
 * or URLs back; the conformance suite asserts that no service/anon key pattern ever
 * appears in an MCP response or error, so every payload passes through here.
 */

const REDACTED = '[redacted]';

/** Supabase JWT-shaped keys (anon / service_role) and common provider keys. */
const PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // any JWT
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g,
  /service_role["'\s:=]+[A-Za-z0-9._-]{20,}/g,
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bkey-[A-Za-z0-9]{16,}\b/g,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{16,}\b/g, // fal key id:secret
];

export function redactSecrets(value: string): string {
  let out = value;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function redactDeep<T>(value: T, extraSecrets: Array<string | undefined | null> = []): T {
  const secrets = extraSecrets.filter((secret): secret is string => typeof secret === 'string' && secret.length >= 12);
  const scrub = (input: string): string => {
    let out = redactSecrets(input);
    for (const secret of secrets) out = out.split(secret).join(REDACTED);
    return out;
  };

  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') return scrub(input);
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(input as Record<string, unknown>)) {
        out[key] = walk(entry);
      }
      return out;
    }
    return input;
  };

  return walk(value) as T;
}
