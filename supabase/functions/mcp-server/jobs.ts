/**
 * Durable job records for async tool calls and idempotent replays.
 *
 * Edge Function isolates are short-lived and never sticky, so anything an agent
 * polls or replays lives in `wzrd_mcp_jobs` rather than in memory. A job keyed by
 * an idempotency key is the replay record too: a repeated call returns the
 * original result instead of charging a second time.
 */
import { internalError, notFoundError } from './errors.ts';
import type { McpIdentity } from './auth.ts';
import type { ServiceClient } from './client.ts';

export interface JobRow {
  id: string;
  tool: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: Record<string, unknown>;
  result: unknown;
  error: Record<string, unknown> | null;
  credits: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const JOB_COLUMNS = 'id,tool,status,progress,result,error,credits,created_at,updated_at,completed_at';

export interface CreateJobResult {
  job: JobRow;
  /** True when an earlier call with the same idempotency key already exists. */
  replayed: boolean;
}

export async function createJob(
  svc: ServiceClient,
  input: {
    identity: McpIdentity;
    tool: string;
    args: Record<string, unknown>;
    idempotencyKey?: string;
  },
): Promise<CreateJobResult> {
  const { data, error } = await svc
    .from('wzrd_mcp_jobs')
    .insert({
      user_id: input.identity.userId,
      token_id: input.identity.tokenId,
      tool: input.tool,
      args: input.args,
      idempotency_key: input.idempotencyKey ?? null,
      status: 'queued',
    })
    .select(JOB_COLUMNS)
    .single();

  if (!error) {
    return { job: data as JobRow, replayed: false };
  }

  // 23505: the (user, tool, idempotency_key) unique index rejected a replay.
  if (error.code === '23505' && input.idempotencyKey) {
    const existing = await svc
      .from('wzrd_mcp_jobs')
      .select(JOB_COLUMNS)
      .eq('user_id', input.identity.userId)
      .eq('tool', input.tool)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();

    if (existing.data) {
      return { job: existing.data as JobRow, replayed: true };
    }
  }

  console.error('mcp-server: failed to create job', error.message);
  throw internalError('Could not queue the requested operation.');
}

export async function markJobRunning(
  svc: ServiceClient,
  jobId: string,
): Promise<void> {
  await svc.from('wzrd_mcp_jobs').update({ status: 'running' }).eq('id', jobId);
}

export async function reportProgress(
  svc: ServiceClient,
  jobId: string,
  progress: Record<string, unknown>,
): Promise<void> {
  await svc.from('wzrd_mcp_jobs').update({ progress }).eq('id', jobId);
}

export async function finishJob(
  svc: ServiceClient,
  jobId: string,
  outcome:
    | { status: 'succeeded'; result: unknown; credits?: number | null }
    | { status: 'failed'; error: Record<string, unknown> },
): Promise<void> {
  await svc
    .from('wzrd_mcp_jobs')
    .update({
      status: outcome.status,
      completed_at: new Date().toISOString(),
      ...(outcome.status === 'succeeded'
        ? { result: outcome.result ?? null, credits: outcome.credits ?? null, error: null }
        : { error: outcome.error }),
    })
    .eq('id', jobId);
}

export async function getJob(
  svc: ServiceClient,
  userId: string,
  jobId: string,
): Promise<JobRow> {
  const { data, error } = await svc
    .from('wzrd_mcp_jobs')
    .select(JOB_COLUMNS)
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('mcp-server: job lookup failed', error.message);
    throw internalError('Could not read job status.');
  }
  if (!data) {
    throw notFoundError(`No job ${jobId} for this token's user.`);
  }
  return data as JobRow;
}

/** Shape returned to agents for both fresh and polled jobs. */
export function jobEnvelope(job: JobRow) {
  return {
    jobId: job.id,
    tool: job.tool,
    status: job.status,
    progress: job.progress ?? {},
    result: job.status === 'succeeded' ? job.result : undefined,
    error: job.status === 'failed' ? job.error : undefined,
    credits: job.credits ?? undefined,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    completedAt: job.completed_at ?? undefined,
  };
}
