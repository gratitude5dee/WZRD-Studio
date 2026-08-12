/**
 * PAT authentication, scope checks, and monthly credit caps for the MCP surface.
 *
 * Error codes are part of the plugin contract and are asserted by the conformance
 * suite:
 *   -32001 unauthenticated  (missing / malformed / unknown / revoked / expired token)
 *   -32002 forbidden        (token lacks the scope the tool requires; the message
 *                            names the missing scope)
 *   -32003 cap exceeded     (data carries { used, cap, resetsAt })
 *
 * No remote imports and no Deno globals: the conformance suite imports this module
 * directly to test hashing and cap arithmetic.
 */

import type { McpSupabaseClient } from './supabase-client.ts';

export const MCP_ERROR_UNAUTHENTICATED = -32001;
export const MCP_ERROR_FORBIDDEN = -32002;
export const MCP_ERROR_CAP_EXCEEDED = -32003;

export type AgentScope = 'read' | 'write' | 'generate' | 'billing';

export const TOKEN_PREFIX = 'wzrd_pat_';

export interface AgentAuthContext {
  tokenId: string;
  userId: string;
  scopes: AgentScope[];
  monthlyCreditCap: number | null;
  creditsUsedThisPeriod: number;
  resetsAt: string;
}

export class McpAuthError extends Error {
  readonly code: number;
  readonly data: Record<string, unknown> | undefined;

  constructor(code: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'McpAuthError';
    this.code = code;
    this.data = data;
  }
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function extractBearerToken(headers: Headers): string | null {
  const header = headers.get('Authorization') ?? headers.get('authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/** First day of next month, UTC — when a monthly cap resets. */
export function nextMonthlyResetIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

export function currentPeriodMonth(now = new Date()): string {
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}-01`;
}

interface TokenRow {
  id: string;
  user_id: string;
  scopes: string[] | null;
  monthly_credit_cap: number | null;
  revoked_at: string | null;
  expires_at: string | null;
}

type AuthSupabaseClient = McpSupabaseClient;

/**
 * Resolve a PAT into an auth context. Every failure is -32001 with a generic
 * message: a caller must not be able to distinguish "unknown token" from
 * "revoked token" beyond what it already knows.
 */
export async function authenticate(
  supabase: AuthSupabaseClient,
  headers: Headers,
): Promise<AgentAuthContext> {
  const token = extractBearerToken(headers);
  if (!token) {
    throw new McpAuthError(MCP_ERROR_UNAUTHENTICATED, 'Missing bearer token. Create a WZRD personal access token in Settings → Agent access.');
  }
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new McpAuthError(
      MCP_ERROR_UNAUTHENTICATED,
      `Invalid token format. WZRD personal access tokens start with "${TOKEN_PREFIX}".`,
    );
  }

  const tokenHash = await hashToken(token);
  const { data, error } = await supabase
    .from('agent_access_tokens')
    .select('id,user_id,scopes,monthly_credit_cap,revoked_at,expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    throw new McpAuthError(MCP_ERROR_UNAUTHENTICATED, 'Token verification failed.');
  }
  const row = data as TokenRow | null;
  if (!row) {
    throw new McpAuthError(MCP_ERROR_UNAUTHENTICATED, 'Token is not valid.');
  }
  if (row.revoked_at) {
    throw new McpAuthError(MCP_ERROR_UNAUTHENTICATED, 'Token has been revoked. Do not retry; create a new token in Settings → Agent access.', {
      retryable: false,
    });
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    throw new McpAuthError(MCP_ERROR_UNAUTHENTICATED, 'Token has expired. Do not retry; create a new token in Settings → Agent access.', {
      retryable: false,
    });
  }

  const usage = await supabase
    .from('agent_token_usage')
    .select('credits_used')
    .eq('token_id', row.id)
    .eq('period_month', currentPeriodMonth())
    .maybeSingle();
  const creditsUsedThisPeriod = Number((usage.data as { credits_used?: number } | null)?.credits_used ?? 0);

  await supabase
    .from('agent_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id);

  return {
    tokenId: row.id,
    userId: row.user_id,
    scopes: normalizeScopes(row.scopes),
    monthlyCreditCap: row.monthly_credit_cap,
    creditsUsedThisPeriod,
    resetsAt: nextMonthlyResetIso(),
  };
}

export function normalizeScopes(scopes: string[] | null | undefined): AgentScope[] {
  const known: AgentScope[] = ['read', 'write', 'generate', 'billing'];
  const set = new Set<AgentScope>(['read']);
  for (const scope of scopes ?? []) {
    if ((known as string[]).includes(scope)) set.add(scope as AgentScope);
  }
  return [...set];
}

export function assertScope(auth: AgentAuthContext, required: AgentScope, toolName: string): void {
  if (auth.scopes.includes(required)) return;
  throw new McpAuthError(
    MCP_ERROR_FORBIDDEN,
    `Tool "${toolName}" requires the "${required}" scope, but this token only has: ${auth.scopes.join(', ')}. Mint a token with the "${required}" scope in Settings → Agent access.`,
    { requiredScope: required, grantedScopes: auth.scopes },
  );
}

/** Enforce the token's monthly credit cap against a quoted spend. */
export function assertWithinCap(auth: AgentAuthContext, quotedCredits: number): void {
  if (auth.monthlyCreditCap === null) return;
  const projected = auth.creditsUsedThisPeriod + Math.max(0, quotedCredits);
  if (projected <= auth.monthlyCreditCap) return;
  throw new McpAuthError(
    MCP_ERROR_CAP_EXCEEDED,
    `This token's monthly credit cap would be exceeded: ${auth.creditsUsedThisPeriod} used + ${quotedCredits} quoted > ${auth.monthlyCreditCap} cap.`,
    {
      used: auth.creditsUsedThisPeriod,
      cap: auth.monthlyCreditCap,
      resetsAt: auth.resetsAt,
    },
  );
}
