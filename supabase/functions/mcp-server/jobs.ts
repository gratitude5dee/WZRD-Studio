/**
 * Billed job runner for spending MCP tools.
 *
 * Contract enforced here (asserted by the conformance + adversarial suites):
 *   - a spending call returns `{ jobId }` immediately and never blocks on the
 *     provider;
 *   - the same `idempotencyKey` twice produces one job and one ledger entry;
 *   - the credit hold is always settled: commit on success, release on failure or
 *     interruption, so no orphaned hold can survive a disconnected client.
 */
import {
  buildCreditIdempotencyKey,
  commitCredits,
  releaseCredits,
  reserveCredits,
} from '../_shared/credits.ts';
import type { AgentAuthContext } from './auth.ts';
import type { McpSupabaseClient } from './supabase-client.ts';

type SupabaseLike = McpSupabaseClient;

interface AgentJobRow extends Record<string, unknown> {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  credits_quoted: number | null;
  credits_charged: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface BilledJobResult {
  jobId: string;
  status: 'running' | 'succeeded' | 'failed';
  creditsQuoted: number;
  reused: boolean;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export interface BilledJobInput {
  supabase: SupabaseLike;
  auth: AgentAuthContext;
  tool: string;
  resourceType: string;
  quotedCredits: number;
  idempotencyKey: string;
  projectId?: string | null;
  request: Record<string, unknown>;
  run: (ctx: { jobId: string }) => Promise<Record<string, unknown>>;
}

function waitUntil(promise: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
    return;
  }
  // Local `deno run` fallback: keep the microtask alive without blocking the reply.
  void promise.catch(() => {});
}

export async function startBilledJob(input: BilledJobInput): Promise<BilledJobResult> {
  const existing = await input.supabase
    .from<AgentJobRow>('agent_jobs')
    .select('id,status,credits_quoted,credits_charged,result,error')
    .eq('user_id', input.auth.userId)
    .eq('tool', input.tool)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();

  if (existing.data) {
    return {
      jobId: existing.data.id,
      status: existing.data.status,
      creditsQuoted: existing.data.credits_quoted ?? input.quotedCredits,
      reused: true,
      result: existing.data.result ?? null,
      error: existing.data.error ?? null,
    };
  }

  const reservation = await reserveCredits({
    supabase: input.supabase,
    userId: input.auth.userId,
    resourceType: input.resourceType,
    requestedAmount: input.quotedCredits,
    referenceType: `mcp_${input.tool}`,
    referenceId: input.projectId ?? input.auth.userId,
    idempotencyKey: buildCreditIdempotencyKey('mcp', input.tool, input.auth.userId, input.idempotencyKey),
    metadata: {
      surface: 'mcp',
      tool: input.tool,
      token_id: input.auth.tokenId,
      project_id: input.projectId ?? null,
    },
  });

  const inserted = await input.supabase
    .from<AgentJobRow>('agent_jobs')
    .insert({
      user_id: input.auth.userId,
      token_id: input.auth.tokenId,
      tool: input.tool,
      project_id: input.projectId ?? null,
      idempotency_key: input.idempotencyKey,
      credit_hold_id: reservation.holdId,
      credits_quoted: input.quotedCredits,
      request: input.request,
      status: 'running',
    })
    .select('id')
    .single();

  if (inserted.error || !inserted.data) {
    // Lost an idempotency race: release our hold and return the winner's job.
    await releaseCredits({
      supabase: input.supabase,
      holdId: reservation.holdId,
      reason: 'duplicate_idempotency_key',
      userId: input.auth.userId,
    });
    const winner = await input.supabase
      .from<AgentJobRow>('agent_jobs')
      .select('id,status,credits_quoted')
      .eq('user_id', input.auth.userId)
      .eq('tool', input.tool)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();
    if (winner.data) {
      return {
        jobId: winner.data.id,
        status: winner.data.status,
        creditsQuoted: winner.data.credits_quoted ?? input.quotedCredits,
        reused: true,
      };
    }
    throw new Error(inserted.error?.message ?? 'Failed to create job');
  }

  const jobId = inserted.data.id;

  const settle = (async () => {
    try {
      const result = await input.run({ jobId });
      await commitCredits({
        supabase: input.supabase,
        holdId: reservation.holdId,
        amount: input.quotedCredits,
        metadata: { surface: 'mcp', tool: input.tool, job_id: jobId },
      });
      await input.supabase.rpc('agent_token_usage_add', {
        p_token_id: input.auth.tokenId,
        p_credits: input.quotedCredits,
      });
      await input.supabase
        .from('agent_jobs')
        .update({ status: 'succeeded', result, credits_charged: input.quotedCredits })
        .eq('id', jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'job failed';
      // Release before surfacing: a failed provider call must never leave a hold.
      await releaseCredits({
        supabase: input.supabase,
        holdId: reservation.holdId,
        reason: 'operation_failed',
        userId: input.auth.userId,
        metadata: { tool: input.tool, job_id: jobId },
      });
      await input.supabase
        .from('agent_jobs')
        .update({ status: 'failed', error: message, credits_charged: 0 })
        .eq('id', jobId);
    }
  })();

  waitUntil(settle);

  return {
    jobId,
    status: 'running',
    creditsQuoted: input.quotedCredits,
    reused: false,
  };
}
