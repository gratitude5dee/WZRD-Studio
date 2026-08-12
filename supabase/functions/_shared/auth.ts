
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Custom error class for authentication errors
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Internal actor headers.
 *
 * The MCP server resolves its caller from a personal access token, so it has no
 * user JWT to forward to the Edge Functions it orchestrates. Instead it states
 * the acting user explicitly and proves the call originated inside the platform
 * with a shared secret that is never exposed to clients. The path is disabled
 * unless `WZRD_INTERNAL_ACTOR_SECRET` is configured, so an unconfigured
 * deployment fails closed rather than trusting the header.
 */
export const INTERNAL_ACTOR_HEADER = 'x-wzrd-actor-id';
export const INTERNAL_SECRET_HEADER = 'x-wzrd-internal-secret';
/** PAT that authorised an internal call, recorded on every ledger entry it causes. */
export const INTERNAL_TOKEN_HEADER = 'x-wzrd-token-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Returns the internal actor's user id, or null when the call is not a trusted internal call. */
export function resolveInternalActorId(headers: Headers): string | null {
  const presented = headers.get(INTERNAL_SECRET_HEADER);
  if (!presented) return null;

  const expected = Deno.env.get('WZRD_INTERNAL_ACTOR_SECRET') ?? '';
  if (!expected) {
    console.error('auth: internal actor header presented but WZRD_INTERNAL_ACTOR_SECRET is not configured');
    return null;
  }
  if (!constantTimeEquals(presented, expected)) {
    console.error('auth: internal actor secret mismatch');
    return null;
  }

  const actorId = headers.get(INTERNAL_ACTOR_HEADER) ?? '';
  if (!UUID_PATTERN.test(actorId)) {
    console.error('auth: internal actor id missing or malformed');
    return null;
  }
  return actorId;
}

/**
 * Authenticates a request using the JWT from the Authorization header, or the
 * internal actor headers for platform-internal calls.
 * @param headers Request headers containing the JWT
 * @returns The authenticated user object
 * @throws AuthError if authentication fails
 */
export async function authenticateRequest(headers: Headers) {
  const internalActorId = resolveInternalActorId(headers);
  if (internalActorId) {
    return { id: internalActorId } as { id: string };
  }

  const authHeader = headers.get('Authorization');
  if (!authHeader) {
    throw new AuthError('Missing authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  
  // Create a Supabase client with the service role key
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: { user }, error } = await supabaseClient.auth.getUser(token);

  if (error || !user) {
    console.error('Authentication error:', error?.message);
    throw new AuthError(error?.message || 'Invalid authentication token');
  }

  return user;
}

export interface RequestIdentity {
  userId: string;
  /**
   * Client to read and write user data with. For JWT callers this is an anon
   * client carrying their token, so RLS still applies; for internal calls it is
   * a service-role client, and the caller MUST scope every query by `userId`.
   */
  // deno-lint-ignore no-explicit-any
  client: any;
  internal: boolean;
  /** Agent PAT behind an internal call, for credit attribution. */
  tokenId?: string;
}

/**
 * Resolves the acting user plus a client to act on their behalf, accepting both
 * user JWTs and internal actor headers.
 */
export async function resolveRequestIdentity(headers: Headers): Promise<RequestIdentity> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const internalActorId = resolveInternalActorId(headers);

  if (internalActorId) {
    const tokenId = headers.get(INTERNAL_TOKEN_HEADER) ?? '';
    return {
      userId: internalActorId,
      client: createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
      internal: true,
      tokenId: UUID_PATTERN.test(tokenId) ? tokenId : undefined,
    };
  }

  const authHeader = headers.get('Authorization');
  if (!authHeader) {
    throw new AuthError('Missing authorization header');
  }

  const client = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    throw new AuthError(error?.message || 'Invalid authentication token');
  }

  return { userId: user.id, client, internal: false };
}

/**
 * Throws when `userId` does not own `projectId`. Internal calls run under the
 * service role, so ownership can never be left to RLS.
 */
export async function assertProjectOwnership(
  // deno-lint-ignore no-explicit-any
  client: any,
  userId: string,
  projectId: string,
): Promise<void> {
  const { data, error } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new AuthError('Project not found or access denied');
  }
}
