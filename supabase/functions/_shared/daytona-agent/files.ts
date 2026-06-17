import { DAYTONA_AGENT_DEFAULTS } from './constants.ts';
import { downloadSandboxFile, listSandboxFiles, uploadSandboxFile } from './daytona.ts';
import { recordAgentEvent, type DbClient } from './sessions.ts';
import type { AgentFileEntry, DaytonaAgentSession } from './types.ts';
import { joinSandboxPath, normalizeFilename, normalizeSandboxPath } from './validation.ts';

export async function listOutputFiles({
  supabase,
  session,
  path,
}: {
  supabase: DbClient;
  session: DaytonaAgentSession;
  path?: string;
}): Promise<AgentFileEntry[]> {
  const safePath = normalizeSandboxPath(path || session.output_dir);
  if (!isPathInsideDir(safePath, session.output_dir)) {
    throw new Error('output_path_required');
  }
  const files = await listSandboxFiles({ session, path: safePath });
  await recordAgentEvent({
    supabase,
    userId: session.user_id,
    sessionId: session.id,
    eventType: 'file_listed',
    metadata: { path: safePath },
  });
  return files.slice(0, DAYTONA_AGENT_DEFAULTS.listLimit);
}

export function isPathInsideDir(path: string, dir: string): boolean {
  const safePath = normalizeSandboxPath(path);
  const safeDir = normalizeSandboxPath(dir);
  return safePath === safeDir || safePath.startsWith(`${safeDir}/`);
}

export async function uploadInputFile({
  supabase,
  session,
  file,
}: {
  supabase: DbClient;
  session: DaytonaAgentSession;
  file: File;
}): Promise<AgentFileEntry> {
  const filename = normalizeFilename(file.name);
  if (file.size <= 0) {
    throw new Error('upload_file_empty');
  }
  if (file.size > DAYTONA_AGENT_DEFAULTS.uploadLimitBytes) {
    throw new Error('upload_file_too_large');
  }
  const entry = await uploadSandboxFile({
    session,
    dir: session.input_dir,
    filename,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  await recordAgentEvent({
    supabase,
    userId: session.user_id,
    sessionId: session.id,
    eventType: 'file_uploaded',
    metadata: { path: entry.path, bytes: entry.bytes },
  });
  return entry;
}

export async function downloadOutputFile({
  supabase,
  session,
  filename,
}: {
  supabase: DbClient;
  session: DaytonaAgentSession;
  filename: string;
}): Promise<{ filename: string; bytes: Uint8Array }> {
  const safeFilename = normalizeFilename(filename);
  const path = joinSandboxPath(session.output_dir, safeFilename);
  const bytes = await downloadSandboxFile({ session, path });
  await recordAgentEvent({
    supabase,
    userId: session.user_id,
    sessionId: session.id,
    eventType: 'file_downloaded',
    metadata: { path, bytes: bytes.byteLength },
  });
  return { filename: safeFilename, bytes };
}
