import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { DAYTONA_AGENT_DEFAULTS, DAYTONA_AGENT_ENV, getOptionalEnv } from './constants.ts';
import type { DaytonaAgentEventType, DaytonaAgentSession } from './types.ts';

export type DbClient = SupabaseClient;

export async function assertProjectAccess({
  supabase,
  userId,
  projectId,
}: {
  supabase: DbClient;
  userId: string;
  projectId: string | null;
}): Promise<void> {
  if (!projectId) return;
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    throw new Error('project_access_denied');
  }
}

export async function findReusableSession({
  supabase,
  userId,
  projectId,
}: {
  supabase: DbClient;
  userId: string;
  projectId: string | null;
}): Promise<DaytonaAgentSession | null> {
  const now = new Date().toISOString();
  let query = supabase
    .from('daytona_agent_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['creating', 'ready', 'active'])
    .gt('expires_at', now)
    .order('updated_at', { ascending: false })
    .limit(1);
  query = projectId ? query.eq('project_id', projectId) : query.is('project_id', null);
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`daytona_session_reuse_failed: ${error.message}`);
  }
  return data as DaytonaAgentSession | null;
}

export async function createSessionRecord({
  supabase,
  userId,
  projectId,
}: {
  supabase: DbClient;
  userId: string;
  projectId: string | null;
}): Promise<DaytonaAgentSession> {
  const expiresAt = new Date(Date.now() + DAYTONA_AGENT_DEFAULTS.sessionTtlMs).toISOString();
  const { data, error } = await supabase
    .from('daytona_agent_sessions')
    .insert({
      user_id: userId,
      project_id: projectId,
      status: 'creating',
      input_dir: DAYTONA_AGENT_DEFAULTS.inputDir,
      output_dir: DAYTONA_AGENT_DEFAULTS.outputDir,
      workspace_dir: getOptionalEnv(DAYTONA_AGENT_ENV.workspaceDir) || DAYTONA_AGENT_DEFAULTS.workspaceDir,
      relay_url: getOptionalEnv(DAYTONA_AGENT_ENV.relayUrl),
      expires_at: expiresAt,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`daytona_session_create_failed: ${error?.message ?? 'no data'}`);
  }
  await recordAgentEvent({
    supabase,
    userId,
    sessionId: data.id,
    eventType: 'session_created',
    metadata: { projectId },
  });
  return data as DaytonaAgentSession;
}

export async function markSessionReady({
  supabase,
  sessionId,
  sandboxId,
}: {
  supabase: DbClient;
  sessionId: string;
  sandboxId: string;
}): Promise<DaytonaAgentSession> {
  const { data, error } = await supabase
    .from('daytona_agent_sessions')
    .update({
      sandbox_id: sandboxId,
      status: 'ready',
      last_active_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`daytona_session_ready_failed: ${error?.message ?? 'no data'}`);
  }
  await recordAgentEvent({
    supabase,
    userId: data.user_id,
    sessionId: data.id,
    eventType: 'sandbox_ready',
    metadata: { sandboxId },
  });
  return data as DaytonaAgentSession;
}

export async function markSessionFailed({
  supabase,
  session,
  error,
}: {
  supabase: DbClient;
  session: DaytonaAgentSession;
  error: unknown;
}): Promise<void> {
  await supabase
    .from('daytona_agent_sessions')
    .update({
      status: 'failed',
      metadata: {
        ...(session.metadata ?? {}),
        failure: error instanceof Error ? error.message : String(error),
      },
    })
    .eq('id', session.id);
  await recordAgentEvent({
    supabase,
    userId: session.user_id,
    sessionId: session.id,
    eventType: 'sandbox_failed',
    metadata: { error: error instanceof Error ? error.message : String(error) },
  });
}

export async function loadSessionForUser({
  supabase,
  userId,
  sessionId,
}: {
  supabase: DbClient;
  userId: string;
  sessionId: string;
}): Promise<DaytonaAgentSession> {
  const { data, error } = await supabase
    .from('daytona_agent_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    throw new Error('daytona_session_not_found');
  }
  return data as DaytonaAgentSession;
}

export async function touchSession({
  supabase,
  sessionId,
  status = 'active',
}: {
  supabase: DbClient;
  sessionId: string;
  status?: 'ready' | 'active';
}): Promise<void> {
  await supabase.from('daytona_agent_sessions').update({ status, last_active_at: new Date().toISOString() }).eq('id', sessionId);
}

export async function stopSessionRecord({
  supabase,
  session,
}: {
  supabase: DbClient;
  session: DaytonaAgentSession;
}): Promise<DaytonaAgentSession> {
  const { data, error } = await supabase
    .from('daytona_agent_sessions')
    .update({ status: 'stopped', last_active_at: new Date().toISOString() })
    .eq('id', session.id)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`daytona_session_stop_failed: ${error?.message ?? 'no data'}`);
  }
  await recordAgentEvent({
    supabase,
    userId: session.user_id,
    sessionId: session.id,
    eventType: 'session_stopped',
    metadata: { sandboxId: session.sandbox_id },
  });
  return data as DaytonaAgentSession;
}

export async function recordAgentEvent({
  supabase,
  userId,
  sessionId,
  eventType,
  metadata = {},
}: {
  supabase: DbClient;
  userId: string;
  sessionId: string;
  eventType: DaytonaAgentEventType;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await supabase.from('daytona_agent_events').insert({
    user_id: userId,
    session_id: sessionId,
    event_type: eventType,
    metadata,
  });
}
