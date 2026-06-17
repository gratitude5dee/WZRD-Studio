import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/integrations/supabase/config';

const SUPABASE_FUNCTIONS_BASE_URL = SUPABASE_URL;

export type DaytonaAgentStatus = 'creating' | 'ready' | 'active' | 'stopped' | 'failed';

export interface DaytonaAgentSession {
  id: string;
  userId: string;
  projectId: string | null;
  sandboxId: string | null;
  status: DaytonaAgentStatus;
  inputDir: string;
  outputDir: string;
  workspaceDir: string;
  relayUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export interface AgentFileEntry {
  filename: string;
  path: string;
  bytes: number;
  isDir: boolean;
  contentType?: string;
}

export async function createDaytonaAgentSession({
  projectId,
  forceNew = false,
}: {
  projectId?: string | null;
  forceNew?: boolean;
}): Promise<DaytonaAgentSession> {
  const { data, error } = await supabase.functions.invoke<{ session: DaytonaAgentSession }>('agent-session', {
    body: { projectId: projectId ?? null, forceNew },
  });
  if (error) throw new Error(error.message);
  if (!data?.session) throw new Error('agent_session_missing');
  return data.session;
}

export async function stopDaytonaAgentSession({ sessionId }: { sessionId: string }): Promise<DaytonaAgentSession> {
  const { data, error } = await supabase.functions.invoke<{ session: DaytonaAgentSession }>('agent-session', {
    method: 'PATCH',
    body: { sessionId },
  });
  if (error) throw new Error(error.message);
  if (!data?.session) throw new Error('agent_session_missing');
  return data.session;
}

export async function createDaytonaPtyToken({ sessionId }: { sessionId: string }): Promise<{
  session: DaytonaAgentSession;
  wsUrl: string;
  expiresAt: string;
}> {
  const { data, error } = await supabase.functions.invoke<{
    session: DaytonaAgentSession;
    wsUrl: string;
    expiresAt: string;
  }>('agent-pty-token', {
    body: { sessionId },
  });
  if (error) throw new Error(error.message);
  if (!data?.wsUrl) throw new Error('agent_pty_token_missing');
  return data;
}

export async function listDaytonaAgentFiles({
  sessionId,
  path,
}: {
  sessionId: string;
  path?: string;
}): Promise<{ path: string; files: AgentFileEntry[] }> {
  const params = new URLSearchParams({ sessionId });
  if (path) params.set('path', path);
  const { data, error } = await supabase.functions.invoke<{ path: string; files: AgentFileEntry[] }>(
    `agent-files?${params.toString()}`,
    { method: 'GET' },
  );
  if (error) throw new Error(error.message);
  return { path: data?.path ?? '', files: data?.files ?? [] };
}

export async function uploadDaytonaAgentFile({ sessionId, file }: { sessionId: string; file: File }): Promise<AgentFileEntry> {
  const body = new FormData();
  body.set('sessionId', sessionId);
  body.set('file', file);
  const { data, error } = await supabase.functions.invoke<{ file: AgentFileEntry }>('agent-files', {
    body,
  });
  if (error) throw new Error(error.message);
  if (!data?.file) throw new Error('agent_file_missing');
  return data.file;
}

export async function downloadDaytonaAgentOutput({ sessionId, filename }: { sessionId: string; filename: string }): Promise<Blob> {
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new Error('not_authenticated');
  const baseUrl = `${SUPABASE_FUNCTIONS_BASE_URL}/functions/v1/agent-files`;
  const params = new URLSearchParams({ sessionId, download: filename });
  const response = await fetch(`${baseUrl}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`download_failed_${response.status}`);
  }
  return response.blob();
}
