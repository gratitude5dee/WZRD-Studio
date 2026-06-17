import { SignJWT, type JWTPayload } from 'https://esm.sh/jose@5.9.6';

import { DAYTONA_AGENT_DEFAULTS, DAYTONA_AGENT_ENV, getRequiredEnv } from './constants.ts';
import type { DaytonaAgentSession } from './types.ts';

export interface RelayClaims {
  session_id: string;
  sandbox_id: string;
  user_id: string;
  project_id?: string | null;
  workspace_dir: string;
  input_dir: string;
  output_dir: string;
}

export function buildRelayClaims(session: DaytonaAgentSession): RelayClaims {
  if (!session.sandbox_id) {
    throw new Error('session_sandbox_not_ready');
  }
  return {
    session_id: session.id,
    sandbox_id: session.sandbox_id,
    user_id: session.user_id,
    project_id: session.project_id,
    workspace_dir: session.workspace_dir,
    input_dir: session.input_dir,
    output_dir: session.output_dir,
  };
}

export async function signRelayToken(session: DaytonaAgentSession): Promise<{ token: string; expiresAt: string }> {
  const secret = getRequiredEnv(DAYTONA_AGENT_ENV.relaySecret);
  const expiresAt = new Date(Date.now() + DAYTONA_AGENT_DEFAULTS.tokenTtlSeconds * 1000);
  const token = await new SignJWT(buildRelayClaims(session) as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(DAYTONA_AGENT_DEFAULTS.tokenIssuer)
    .setAudience(DAYTONA_AGENT_DEFAULTS.tokenAudience)
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function createRelayConnectionPayload(session: DaytonaAgentSession) {
  const relayUrl = getRequiredEnv(DAYTONA_AGENT_ENV.relayUrl);
  const { token, expiresAt } = await signRelayToken(session);
  const separator = relayUrl.includes('?') ? '&' : '?';
  return {
    wsUrl: `${relayUrl}${separator}token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}
