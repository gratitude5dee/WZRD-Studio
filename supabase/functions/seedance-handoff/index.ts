/**
 * Seedance handoff (Universal Plugin Phase 3) — reference packet compiler.
 *
 * Modes:
 *   review (default) — evaluate → compile → stop. Free. Returns the packet for
 *     shot-by-shot approval with every reference slot either populated or
 *     explicitly null with a reason.
 *   auto — evaluate → auto-fix trivial issues via build-revision-plan → compile →
 *     submit → poll. Spends credits, so it requires the `generate` scope, explicit
 *     user confirmation, and *verified catalog pricing*. Seedance 2.5 has no
 *     verified catalog rows yet, so this mode refuses with an actionable message
 *     rather than guessing a price (billing is catalog-strict and never inferred).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCatalogCreditCost } from '../_shared/credits.ts';
import {
  type CatalogPricingRow,
  type ProjectStyleContext,
  SeedanceAutoModeUnavailableError,
  assertAutoModeAvailable,
  compileReferencePackets,
  reportPacketCompleteness,
} from '../_shared/seedance-packet.ts';
import {
  type CharacterNode,
  type ContinuityEdge,
  type SceneNode,
  type ShotNode,
  deriveContinuityEdges,
} from '../_shared/storyboard-graph.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isInternalRequest(req: Request): boolean {
  const apiKey = req.headers.get('apikey') ?? req.headers.get('x-internal-key');
  return !!apiKey && apiKey === SERVICE_ROLE_KEY;
}

async function resolveUserId(req: Request, body: Record<string, unknown>): Promise<string | null> {
  if (isInternalRequest(req)) {
    return typeof body.user_id === 'string' ? body.user_id : null;
  }
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !data.user) return null;
  return data.user.id;
}

async function resolveStyleReferenceUrl(assetId: string | null): Promise<string | null> {
  if (!assetId) return null;
  const { data, error } = await supabase
    .from('media_items')
    .select('url,storage_bucket,storage_path')
    .eq('id', assetId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.url) return data.url as string;
  if (data.storage_bucket && data.storage_path) {
    return `${SUPABASE_URL}/storage/v1/object/public/${data.storage_bucket}/${data.storage_path}`;
  }
  return null;
}

async function evaluateStoryboard(projectId: string, authHeader: string | null) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/evaluate-storyboard-packet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ project_id: projectId, target_type: 'scene' }),
    });
    if (!res.ok) return { available: false as const, summary: null, failedJudges: [] as string[] };
    const payload = await res.json();
    const summary = payload?.data ?? payload ?? null;
    const failedJudges: string[] = Array.isArray(summary?.failed_judges) ? summary.failed_judges : [];
    return { available: true as const, summary, failedJudges };
  } catch {
    return { available: false as const, summary: null, failedJudges: [] as string[] };
  }
}

async function buildRevisionPlan(projectId: string, failedJudges: string[], authHeader: string | null) {
  if (failedJudges.length === 0) return { available: false as const, plan: null };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/build-revision-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ project_id: projectId, failed_judges: failedJudges }),
    });
    if (!res.ok) return { available: false as const, plan: null };
    const payload = await res.json();
    return { available: true as const, plan: payload?.data ?? payload ?? null };
  } catch {
    return { available: false as const, plan: null };
  }
}

async function loadCatalogRows(): Promise<CatalogPricingRow[]> {
  const { data, error } = await supabase
    .from('ai_model_catalog')
    .select('id,enabled,credits,pricing_text,pricing')
    .eq('media_type', 'video');
  if (error) return [];
  return (data ?? []) as CatalogPricingRow[];
}

/**
 * Submit one compiled shot through the existing fal/GMI transport. fal-stream owns
 * catalog-strict reservation/commit, so pricing stays in one place; we read the
 * stream only until the provider request id is known and return `{ jobId }` so the
 * tool call never blocks on a long generation.
 */
async function submitShot(input: {
  packetShot: { shotId: string; prompt: string; negative: string | null; duration: number; continuityFrame: { value: string | null } };
  modelId: string;
  projectId: string;
  authHeader: string;
  idempotencyKey: string;
}): Promise<{ jobId: string | null; status: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fal-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: input.authHeader,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      model: input.modelId,
      project_id: input.projectId,
      shot_id: input.packetShot.shotId,
      idempotency_key: input.idempotencyKey,
      input: {
        prompt: input.packetShot.prompt,
        negative_prompt: input.packetShot.negative,
        duration: input.packetShot.duration,
        ...(input.packetShot.continuityFrame.value ? { image_url: input.packetShot.continuityFrame.value } : {}),
      },
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Seedance submission failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const line of buffer.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
          const jobId =
            (typeof event.request_id === 'string' && event.request_id) ||
            (typeof event.job_id === 'string' && event.job_id) ||
            null;
          if (jobId) {
            return { jobId, status: typeof event.status === 'string' ? event.status : 'submitted' };
          }
        } catch {
          // partial frame; keep buffering
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { jobId: null, status: 'submitted_without_job_id' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const userId = await resolveUserId(req, body);
  if (!userId) return json({ success: false, error: 'Unauthorized', code: 'unauthorized' }, 401);

  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  if (!projectId) return json({ success: false, error: 'project_id is required' }, 400);
  const mode = body.mode === 'auto' ? 'auto' : 'review';
  const shotIds = Array.isArray(body.shot_ids) ? body.shot_ids.filter((id): id is string => typeof id === 'string') : [];

  try {
    const projectRes = await supabase
      .from('projects')
      .select('id,user_id,title,video_style,cinematic_inspiration,aspect_ratio,tone,style_reference_asset_id')
      .eq('id', projectId)
      .maybeSingle();
    if (projectRes.error) throw new Error(projectRes.error.message);
    const projectRow = projectRes.data;
    if (!projectRow || projectRow.user_id !== userId) {
      return json({ success: false, error: 'Project not found', code: 'not_found' }, 404);
    }

    const [scenesRes, shotsRes, charactersRes, styleReferenceUrl] = await Promise.all([
      supabase
        .from('scenes')
        .select('id,scene_number,title,description,location,lighting,weather')
        .eq('project_id', projectId)
        .order('scene_number'),
      supabase
        .from('shots')
        .select('id,scene_id,shot_number,prompt_idea,visual_prompt,dialogue,shot_type,image_url,video_url,shot_packet,continuity')
        .eq('project_id', projectId)
        .order('shot_number'),
      supabase.from('characters').select('id,name,image_url,description').eq('project_id', projectId),
      resolveStyleReferenceUrl((projectRow.style_reference_asset_id as string | null) ?? null),
    ]);

    if (scenesRes.error) throw new Error(scenesRes.error.message);
    if (shotsRes.error) throw new Error(shotsRes.error.message);
    if (charactersRes.error) throw new Error(charactersRes.error.message);

    const scenes = (scenesRes.data ?? []) as SceneNode[];
    const shots = (shotsRes.data ?? []) as ShotNode[];
    const characters = (charactersRes.data ?? []) as CharacterNode[];

    // Prefer persisted edges (committed graph); derive on the fly when the
    // project has not been committed through storyboard_commit yet.
    const edgeRes = await supabase
      .from('shot_continuity_edges')
      .select('from_shot_id,to_shot_id,entity_type,entity_key,source')
      .eq('project_id', projectId);
    const persistedEdges = (edgeRes.data ?? []) as ContinuityEdge[];
    const edges = persistedEdges.length > 0 ? persistedEdges : deriveContinuityEdges({ scenes, shots, characters, projectId });

    const project: ProjectStyleContext = {
      id: projectId,
      title: projectRow.title as string | null,
      video_style: projectRow.video_style as string | null,
      cinematic_inspiration: projectRow.cinematic_inspiration as string | null,
      aspect_ratio: projectRow.aspect_ratio as string | null,
      tone: projectRow.tone as string | null,
      styleReferenceUrl,
    };

    const evaluation = await evaluateStoryboard(projectId, req.headers.get('Authorization'));

    const packets = compileReferencePackets({
      project,
      scenes,
      shots,
      characters,
      edges,
      shotIds,
      negativePrompt: typeof body.negative_prompt === 'string' ? body.negative_prompt : null,
    });
    const completeness = reportPacketCompleteness(packets);

    if (mode === 'review') {
      return json({
        success: true,
        data: {
          mode: 'review',
          project_id: projectId,
          credit_cost: 0,
          evaluation: { available: evaluation.available, failed_judges: evaluation.failedJudges, summary: evaluation.summary },
          packets,
          completeness,
          continuity_edges: edges.length,
          next_step: completeness.blocking.length > 0
            ? 'Fix the blocking shots (missing prompts) with storyboard_propose, then re-run seedance_handoff review.'
            : 'Approve shot-by-shot. Submission stays disabled until Seedance 2.5 catalog pricing is published.',
          deep_link: `/project/${projectId}?tab=timeline`,
        },
      });
    }

    // ── mode: auto ────────────────────────────────────────────────────────────
    if (body.confirm !== true) {
      return json(
        {
          success: false,
          code: 'confirmation_required',
          error: 'seedance_handoff mode "auto" spends credits and requires explicit user confirmation (confirm: true) of a specific credit amount.',
        },
        400,
      );
    }

    const catalogRows = await loadCatalogRows();
    let priced: { row: CatalogPricingRow; credits: number };
    try {
      priced = assertAutoModeAvailable({
        rows: catalogRows,
        requestedModelId: typeof body.model_id === 'string' ? body.model_id : null,
        priceResolver: (row) =>
          getCatalogCreditCost(row.pricing ?? null, row.credits ?? undefined, row.pricing_text ?? undefined, {
            duration: packets[0]?.duration ?? 5,
          }),
      });
    } catch (error) {
      if (error instanceof SeedanceAutoModeUnavailableError) {
        return json(
          {
            success: false,
            code: error.code,
            error: error.message,
            model_id: error.modelId,
            fallback: { mode: 'review', credit_cost: 0 },
          },
          409,
        );
      }
      throw error;
    }

    if (completeness.blocking.length > 0) {
      return json(
        {
          success: false,
          code: 'packet_incomplete',
          error: 'Refusing to submit: some shots have no prompt.',
          blocking: completeness.blocking,
        },
        400,
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ success: false, code: 'user_token_required', error: 'auto mode must be called with the user token so generation is billed to them.' }, 401);
    }

    const revisionPlan = await buildRevisionPlan(projectId, evaluation.failedJudges, authHeader);
    const submissions: Array<{ shot_id: string; job_id: string | null; status: string; error?: string }> = [];
    for (const packetShot of packets) {
      try {
        const submitted = await submitShot({
          packetShot,
          modelId: priced.row.id,
          projectId,
          authHeader,
          idempotencyKey: `seedance-handoff:${projectId}:${packetShot.shotId}:${String(body.idempotency_key ?? 'auto')}`,
        });
        submissions.push({ shot_id: packetShot.shotId, job_id: submitted.jobId, status: submitted.status });
      } catch (error) {
        submissions.push({
          shot_id: packetShot.shotId,
          job_id: null,
          status: 'failed',
          error: error instanceof Error ? error.message : 'submission failed',
        });
      }
    }

    return json({
      success: true,
      data: {
        mode: 'auto',
        project_id: projectId,
        model_id: priced.row.id,
        quoted_credits_per_shot: priced.credits,
        quoted_credits_total: priced.credits * packets.length,
        revision_plan: revisionPlan.plan,
        submissions,
        deep_link: `/project/${projectId}?tab=timeline`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'seedance handoff failed';
    console.error('[seedance-handoff]', message);
    return json({ success: false, error: message }, 500);
  }
});
