/**
 * Helpers shared by the tool modules: ownership checks, invoke result unwrapping
 * and deadline-aware polling.
 */
import { internalError, notFoundError, RpcError, validationError } from '../errors.ts';
import type { InvokeResult, ToolContext } from './types.ts';

export interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  aspect_ratio: string | null;
  video_style: string | null;
  genre: string | null;
  tone: string | null;
  format: string | null;
  cinematic_inspiration: string | null;
  concept_text: string | null;
  selected_storyline_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const PROJECT_COLUMNS =
  'id,title,description,status,aspect_ratio,video_style,genre,tone,format,cinematic_inspiration,concept_text,selected_storyline_id,created_at,updated_at';

/** Load a project the PAT's user owns, or raise -32005. */
export async function loadProject(ctx: ToolContext, projectId: string): Promise<ProjectRow> {
  const { data, error } = await ctx.svc
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', projectId)
    .eq('user_id', ctx.identity.userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('mcp-server: project lookup failed', error.message);
    throw internalError('Could not load the project.');
  }
  if (!data) {
    throw notFoundError(`No project ${projectId} for this user. Use list_projects to see available projects.`);
  }
  return data as ProjectRow;
}

/** Unwrap an Edge Function response, mapping failures onto RPC errors. */
export function unwrap(result: InvokeResult, context: string): Record<string, unknown> {
  if (result.status >= 200 && result.status < 300) {
    return (result.data ?? {}) as Record<string, unknown>;
  }

  const body = typeof result.data === 'object' && result.data !== null
    ? (result.data as Record<string, unknown>)
    : null;
  const message =
    (body && typeof body.error === 'string'
      ? body.error
      : typeof result.data === 'string'
        ? result.data
        : '') || `failed with status ${result.status}`;

  if (result.status === 402) {
    throw new RpcError(-32003, `${context}: ${message}`, {
      topUpUrl: '/settings/billing',
    });
  }
  if (result.status === 404) {
    throw notFoundError(`${context}: ${message}`);
  }
  if (result.status === 400) {
    throw validationError(`${context}: ${message}`);
  }
  throw internalError(`${context}: ${message}`);
}

export function remainingMs(ctx: ToolContext): number {
  return ctx.deadlineAt - Date.now();
}

/**
 * Poll `probe` until it returns a value, the budget runs out, or the request
 * deadline is reached. Returns null on timeout so callers can decide whether a
 * partially finished pipeline is still a useful result.
 */
export async function pollUntil<T>(
  ctx: ToolContext,
  probe: () => Promise<T | null>,
  options: { budgetMs: number; intervalMs?: number },
): Promise<T | null> {
  const interval = options.intervalMs ?? 2000;
  const until = Math.min(Date.now() + options.budgetMs, ctx.deadlineAt);

  for (;;) {
    const value = await probe();
    if (value !== null && value !== undefined) return value;
    if (Date.now() + interval >= until) return null;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
