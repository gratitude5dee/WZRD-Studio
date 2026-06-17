import type { DAYTONA_AGENT_EVENTS, DAYTONA_AGENT_STATUS } from './constants.ts';

export type DaytonaAgentStatus = (typeof DAYTONA_AGENT_STATUS)[number];
export type DaytonaAgentEventType = (typeof DAYTONA_AGENT_EVENTS)[number];

export interface DaytonaAgentSession {
  id: string;
  user_id: string;
  project_id: string | null;
  sandbox_id: string | null;
  daytona_workspace_id: string | null;
  status: DaytonaAgentStatus;
  input_dir: string;
  output_dir: string;
  workspace_dir: string;
  relay_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  expires_at: string;
}

export interface CreateSessionRequest {
  projectId?: string | null;
  forceNew?: boolean;
}

export interface CreateSessionResponse {
  session: SerializedDaytonaAgentSession;
}

export interface PtyTokenRequest {
  sessionId: string;
}

export interface PtyTokenResponse {
  session: SerializedDaytonaAgentSession;
  wsUrl: string;
  expiresAt: string;
}

export interface AgentFileEntry {
  filename: string;
  path: string;
  bytes: number;
  isDir: boolean;
  contentType?: string;
}

export interface AgentFileListResponse {
  path: string;
  files: AgentFileEntry[];
}

export interface SerializedDaytonaAgentSession {
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
