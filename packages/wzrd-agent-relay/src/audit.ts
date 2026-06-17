import type { Env } from './index';

const REST_TIMEOUT_MS = 5_000;

async function rest(env: Env, method: 'POST' | 'PATCH', pathAndQuery: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function auditEvent(
  env: Env,
  sessionId: string,
  eventType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await rest(env, 'POST', 'daytona_agent_events', {
    session_id: sessionId,
    user_id: null,
    event_type: eventType,
    metadata,
    created_at: new Date().toISOString(),
  }).catch(() => {});
}

export async function markSessionStopped(env: Env, sessionId: string): Promise<void> {
  await rest(env, 'PATCH', `daytona_agent_sessions?id=eq.${sessionId}`, {
    status: 'stopped',
    last_active_at: new Date().toISOString(),
  }).catch(() => {});
}
