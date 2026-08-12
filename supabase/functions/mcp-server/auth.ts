/**
 * PAT identity resolution.
 *
 * Every request's identity comes from `Authorization: Bearer wzrd_pat_…` and
 * nothing else: tools no longer accept a `user_id` or `auth_token` argument, so
 * a caller can only ever act as the user who minted the token.
 */
import type { ServiceClient } from './client.ts';
import { authError } from './errors.ts';

export const TOKEN_PREFIX = 'wzrd_pat_';

export type Scope = 'read' | 'generate' | 'billing';

export interface McpIdentity {
  userId: string;
  tokenId: string;
  tokenName: string;
  scopes: Scope[];
}

interface TokenRow {
  id: string;
  user_id: string;
  name: string;
  scopes: string[] | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

const LAST_USED_DEBOUNCE_MS = 60_000;

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function bearerToken(headers: Headers): string | null {
  const header = headers.get('Authorization') ?? headers.get('authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return (match ? match[1] : header).trim() || null;
}

/**
 * Resolve the acting user from the presented PAT.
 *
 * Anything that is not a PAT — including a Supabase service key someone pastes
 * into their harness config — is rejected without echoing the presented value.
 */
export async function resolveIdentity(
  headers: Headers,
  svc: ServiceClient,
): Promise<McpIdentity> {
  const presented = bearerToken(headers);
  if (!presented) {
    throw authError(
      'Missing Authorization header. Send "Authorization: Bearer wzrd_pat_…" using a token minted at /settings/agent-access.',
    );
  }

  if (!presented.startsWith(TOKEN_PREFIX)) {
    // Never log or return the presented credential: it may be a Supabase key.
    console.error('mcp-server: rejected non-PAT credential on Authorization header');
    throw authError(
      `Authorization must carry a WZRD personal access token (starts with "${TOKEN_PREFIX}"). Supabase project keys are not accepted.`,
    );
  }

  const tokenHash = await sha256Hex(presented);
  const { data, error } = await svc
    .from('wzrd_api_tokens')
    .select('id,user_id,name,scopes,expires_at,revoked_at,last_used_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (error) {
    console.error('mcp-server: token lookup failed', error.message);
    throw authError('Could not verify the access token. Try again shortly.');
  }

  const token = data as TokenRow | null;
  if (!token) {
    throw authError('Unknown or revoked access token. Mint a new one at /settings/agent-access.');
  }

  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    throw authError('This access token has expired. Mint a new one at /settings/agent-access.');
  }

  const scopes = (token.scopes ?? []).filter(
    (scope): scope is Scope => scope === 'read' || scope === 'generate' || scope === 'billing',
  );

  await touchLastUsed(svc, token);

  return { userId: token.user_id, tokenId: token.id, tokenName: token.name, scopes };
}

/** Debounced `last_used_at` write: at most one per token per minute. */
async function touchLastUsed(svc: ServiceClient, token: TokenRow): Promise<void> {
  const last = token.last_used_at ? new Date(token.last_used_at).getTime() : 0;
  if (Date.now() - last < LAST_USED_DEBOUNCE_MS) return;

  const { error } = await svc
    .from('wzrd_api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', token.id);
  if (error) {
    console.error('mcp-server: failed to record token usage', error.message);
  }
}
