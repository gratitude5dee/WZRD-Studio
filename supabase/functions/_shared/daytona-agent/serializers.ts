import type { AgentFileEntry, DaytonaAgentSession, SerializedDaytonaAgentSession } from './types.ts';

export function serializeSession(session: DaytonaAgentSession): SerializedDaytonaAgentSession {
  return {
    id: session.id,
    userId: session.user_id,
    projectId: session.project_id,
    sandboxId: session.sandbox_id,
    status: session.status,
    inputDir: session.input_dir,
    outputDir: session.output_dir,
    workspaceDir: session.workspace_dir,
    relayUrl: session.relay_url,
    metadata: session.metadata ?? {},
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    lastActiveAt: session.last_active_at,
    expiresAt: session.expires_at,
  };
}

export function serializeFileEntry(file: AgentFileEntry): AgentFileEntry {
  return {
    filename: file.filename,
    path: file.path,
    bytes: file.bytes,
    isDir: file.isDir,
    contentType: file.contentType,
  };
}
