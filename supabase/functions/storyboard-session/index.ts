/**
 * Storyboard session service (Universal Plugin Phase 3).
 *
 * Backs the three free storyboard tools:
 *   - storyboard_propose  → stage scene/shot deltas at revision + 1 (never writes shots)
 *   - storyboard_diff     → normalized diff + continuity warnings (what harnesses table-render)
 *   - storyboard_commit    → write staged deltas to scenes/shots, re-derive the continuity
 *                            graph, bump revision
 *   - set_continuity      → agent override behind update_shot({ continuity })
 *
 * None of these actions touch credits: iterating on a storyboard must be free so
 * agents converge in text before spending anything.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type CharacterNode,
  type ContinuityEdge,
  type ContinuityOverride,
  type SceneNode,
  type ShotNode,
  type StagedSceneDelta,
  type StagedShotDelta,
  type StoryboardSessionState,
  deriveContinuityEdges,
  diffStoryboard,
  emptySessionState,
  normalizeSessionState,
  orderShots,
} from '../_shared/storyboard-graph.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

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
  return !!apiKey && apiKey === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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

async function loadProject(projectId: string, userId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id,user_id,title')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // RLS-equivalent behaviour for the service-role path: a project owned by
  // someone else is reported as not found so existence never leaks.
  if (!data || data.user_id !== userId) return null;
  return data;
}

interface StoryboardRows {
  scenes: SceneNode[];
  shots: ShotNode[];
  characters: CharacterNode[];
}

async function loadStoryboard(projectId: string): Promise<StoryboardRows> {
  const [scenes, shots, characters] = await Promise.all([
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
    supabase
      .from('characters')
      .select('id,name,image_url,description')
      .eq('project_id', projectId),
  ]);

  if (scenes.error) throw new Error(scenes.error.message);
  if (shots.error) throw new Error(shots.error.message);
  if (characters.error) throw new Error(characters.error.message);

  return {
    scenes: (scenes.data ?? []) as SceneNode[],
    shots: (shots.data ?? []) as ShotNode[],
    characters: (characters.data ?? []) as CharacterNode[],
  };
}

async function getOrCreateSession(projectId: string) {
  const existing = await supabase
    .from('storyboard_sessions')
    .select('id,project_id,state,revision,updated_at')
    .eq('project_id', projectId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const created = await supabase
    .from('storyboard_sessions')
    .insert({ project_id: projectId, state: emptySessionState(), revision: 0 })
    .select('id,project_id,state,revision,updated_at')
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data;
}

/** Structural continuity warnings from the shared graph plus rubric findings. */
async function fetchEvaluationWarnings(projectId: string, authHeader: string | null) {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/evaluate-storyboard-packet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ project_id: projectId, target_type: 'scene' }),
    });
    if (!res.ok) return { available: false as const, findings: [] };
    const payload = await res.json();
    const summary = payload?.data ?? payload;
    const failed: string[] = Array.isArray(summary?.failed_judges) ? summary.failed_judges : [];
    return {
      available: true as const,
      findings: failed.map((judge) => ({
        code: `evaluation_${judge}`,
        severity: 'warn' as const,
        message: `Storyboard evaluation flagged "${judge}". Iterate in text (free) before generating.`,
      })),
    };
  } catch {
    return { available: false as const, findings: [] };
  }
}

function diffTable(entries: ReturnType<typeof diffStoryboard>['entries']): string {
  const header = '| Kind | Op | Target | Field | Before | After |\n| --- | --- | --- | --- | --- | --- |';
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '—' : String(value);
    return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120);
  };
  const rows = entries.flatMap((entry) =>
    entry.fields.length === 0
      ? [`| ${entry.kind} | ${entry.op} | ${cell(entry.label)} | — | — | — |`]
      : entry.fields.map(
          (field) =>
            `| ${entry.kind} | ${entry.op} | ${cell(entry.label)} | ${field.field} | ${cell(field.before)} | ${cell(field.after)} |`,
        ),
  );
  return [header, ...rows].join('\n');
}

async function replaceContinuityEdges(projectId: string, edges: ContinuityEdge[]) {
  const { error: deleteError } = await supabase
    .from('shot_continuity_edges')
    .delete()
    .eq('project_id', projectId);
  if (deleteError) throw new Error(deleteError.message);
  if (edges.length === 0) return;

  const { error } = await supabase.from('shot_continuity_edges').insert(
    edges.map((edge) => ({
      project_id: projectId,
      from_shot_id: edge.from_shot_id,
      to_shot_id: edge.to_shot_id,
      entity_type: edge.entity_type,
      entity_key: edge.entity_key,
      source: edge.source,
    })),
  );
  if (error) throw new Error(error.message);
}

/** Recompute the whole project's continuity graph from committed rows. */
async function rederiveGraph(projectId: string) {
  const rows = await loadStoryboard(projectId);
  const edges = deriveContinuityEdges({ ...rows, projectId }).filter(
    (edge) =>
      rows.shots.some((shot) => shot.id === edge.from_shot_id) &&
      rows.shots.some((shot) => shot.id === edge.to_shot_id),
  );
  await replaceContinuityEdges(projectId, edges);
  return { edges, rows };
}

async function applyStagedState(projectId: string, state: StoryboardSessionState) {
  const sceneIdByKey = new Map<string, string>();
  const applied = { scenesCreated: 0, scenesUpdated: 0, scenesDeleted: 0, shotsCreated: 0, shotsUpdated: 0, shotsDeleted: 0 };

  for (const delta of state.scenes as StagedSceneDelta[]) {
    if (delta.op === 'delete') {
      if (!delta.sceneId) continue;
      const { error } = await supabase.from('scenes').delete().eq('id', delta.sceneId).eq('project_id', projectId);
      if (error) throw new Error(error.message);
      applied.scenesDeleted += 1;
      continue;
    }

    const payload: Record<string, unknown> = {};
    for (const field of ['scene_number', 'title', 'description', 'location', 'lighting', 'weather'] as const) {
      if (delta[field] !== undefined) payload[field] = delta[field];
    }

    if (delta.op === 'create' && !delta.sceneId) {
      const { data, error } = await supabase
        .from('scenes')
        .insert({ project_id: projectId, scene_number: delta.scene_number ?? 1, ...payload })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      if (delta.key) sceneIdByKey.set(delta.key, data.id);
      applied.scenesCreated += 1;
      continue;
    }

    if (!delta.sceneId) continue;
    const { error } = await supabase.from('scenes').update(payload).eq('id', delta.sceneId).eq('project_id', projectId);
    if (error) throw new Error(error.message);
    if (delta.key) sceneIdByKey.set(delta.key, delta.sceneId);
    applied.scenesUpdated += 1;
  }

  for (const delta of state.shots as StagedShotDelta[]) {
    if (delta.op === 'delete') {
      if (!delta.shotId) continue;
      const { error } = await supabase.from('shots').delete().eq('id', delta.shotId).eq('project_id', projectId);
      if (error) throw new Error(error.message);
      applied.shotsDeleted += 1;
      continue;
    }

    const payload: Record<string, unknown> = {};
    for (const field of ['shot_number', 'prompt_idea', 'visual_prompt', 'dialogue', 'shot_type'] as const) {
      if (delta[field] !== undefined) payload[field] = delta[field];
    }
    if (delta.continuity !== undefined) payload.continuity = delta.continuity;

    const sceneId = delta.sceneId ?? (delta.sceneKey ? sceneIdByKey.get(delta.sceneKey) : undefined);

    if (delta.op === 'create' && !delta.shotId) {
      if (!sceneId) {
        throw new Error(`Staged shot ${delta.key ?? delta.shot_number ?? '?'} has no resolvable scene; set sceneId or sceneKey.`);
      }
      const { error } = await supabase.from('shots').insert({
        project_id: projectId,
        scene_id: sceneId,
        shot_number: delta.shot_number ?? 1,
        ...payload,
      });
      if (error) throw new Error(error.message);
      applied.shotsCreated += 1;
      continue;
    }

    if (!delta.shotId) continue;
    const { error } = await supabase
      .from('shots')
      .update({ ...payload, ...(sceneId ? { scene_id: sceneId } : {}) })
      .eq('id', delta.shotId)
      .eq('project_id', projectId);
    if (error) throw new Error(error.message);
    applied.shotsUpdated += 1;
  }

  return applied;
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

  const action = String(body.action ?? '');
  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  if (!projectId) return json({ success: false, error: 'project_id is required' }, 400);

  try {
    const project = await loadProject(projectId, userId);
    if (!project) {
      return json({ success: false, error: 'Project not found', code: 'not_found' }, 404);
    }

    const session = await getOrCreateSession(projectId);
    const state = normalizeSessionState(session.state);

    if (action === 'get') {
      const rows = await loadStoryboard(projectId);
      const diff = diffStoryboard({ revision: session.revision, state, ...rows });
      return json({
        success: true,
        data: {
          project_id: projectId,
          revision: session.revision,
          staged_revision: session.revision + 1,
          scenes: rows.scenes,
          shots: orderShots(rows.shots, rows.scenes),
          staged: state,
          diff,
          credit_cost: 0,
        },
      });
    }

    if (action === 'propose') {
      const baseRevision = body.revision === undefined ? null : Number(body.revision);
      if (baseRevision !== null && baseRevision !== session.revision) {
        return json(
          {
            success: false,
            code: 'revision_mismatch',
            error: `Storyboard moved on: you proposed against revision ${baseRevision} but the committed revision is ${session.revision}. Re-read the storyboard and re-propose.`,
            expected_revision: session.revision,
          },
          409,
        );
      }

      const incoming = normalizeSessionState({
        scenes: body.scenes,
        shots: body.shots,
        notes: body.notes,
      });
      const merge = body.merge === true;
      const nextState: StoryboardSessionState = {
        scenes: merge ? [...state.scenes, ...incoming.scenes] : incoming.scenes,
        shots: merge ? [...state.shots, ...incoming.shots] : incoming.shots,
        notes: incoming.notes ?? state.notes ?? null,
        proposedBy: userId,
        proposedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('storyboard_sessions')
        .update({ state: nextState })
        .eq('id', session.id);
      if (error) throw new Error(error.message);

      const rows = await loadStoryboard(projectId);
      const diff = diffStoryboard({ revision: session.revision, state: nextState, ...rows });
      return json({
        success: true,
        data: {
          project_id: projectId,
          revision: session.revision,
          staged_revision: session.revision + 1,
          staged: nextState,
          diff,
          credit_cost: 0,
          note: 'Nothing was written to shots. Call storyboard_diff to review, then storyboard_commit with this revision.',
        },
      });
    }

    if (action === 'diff') {
      const rows = await loadStoryboard(projectId);
      const diff = diffStoryboard({ revision: session.revision, state, ...rows });
      const evaluation = await fetchEvaluationWarnings(projectId, req.headers.get('Authorization'));
      const warnings = [...diff.warnings, ...evaluation.findings];
      return json({
        success: true,
        data: {
          project_id: projectId,
          revision: session.revision,
          staged_revision: session.revision + 1,
          entries: diff.entries,
          warnings,
          evaluation_available: evaluation.available,
          table: diffTable(diff.entries),
          credit_cost: 0,
        },
      });
    }

    if (action === 'commit') {
      if (body.revision === undefined) {
        return json(
          {
            success: false,
            code: 'revision_required',
            error: 'storyboard_commit requires the revision you diffed against so concurrent agents cannot clobber each other.',
            expected_revision: session.revision,
          },
          400,
        );
      }
      const revision = Number(body.revision);
      if (!Number.isInteger(revision) || revision !== session.revision) {
        return json(
          {
            success: false,
            code: 'revision_mismatch',
            error: `Commit rejected: you diffed revision ${revision} but the storyboard is now at revision ${session.revision}. Re-run storyboard_diff and re-confirm before committing.`,
            expected_revision: session.revision,
          },
          409,
        );
      }
      if (state.scenes.length === 0 && state.shots.length === 0) {
        return json(
          { success: false, code: 'nothing_staged', error: 'No staged deltas to commit. Call storyboard_propose first.' },
          400,
        );
      }

      // Compare-and-set the revision first: the unique row plus this guarded
      // update is the concurrency gate, so a second committer at the same
      // revision loses cleanly instead of writing shots twice.
      const claim = await supabase
        .from('storyboard_sessions')
        .update({ revision: revision + 1 })
        .eq('id', session.id)
        .eq('revision', revision)
        .select('id,revision')
        .maybeSingle();
      if (claim.error) throw new Error(claim.error.message);
      if (!claim.data) {
        const current = await supabase
          .from('storyboard_sessions')
          .select('revision')
          .eq('id', session.id)
          .maybeSingle();
        return json(
          {
            success: false,
            code: 'revision_mismatch',
            error: `Commit rejected: another agent committed revision ${revision} first. Re-diff against revision ${current.data?.revision ?? revision + 1}.`,
            expected_revision: current.data?.revision ?? revision + 1,
          },
          409,
        );
      }

      const applied = await applyStagedState(projectId, state);
      const { edges, rows } = await rederiveGraph(projectId);
      const { error: clearError } = await supabase
        .from('storyboard_sessions')
        .update({ state: emptySessionState() })
        .eq('id', session.id);
      if (clearError) throw new Error(clearError.message);

      return json({
        success: true,
        data: {
          project_id: projectId,
          revision: claim.data.revision,
          applied,
          continuity_edges: edges.length,
          shots: orderShots(rows.shots, rows.scenes).map((shot) => ({
            id: shot.id,
            scene_id: shot.scene_id,
            shot_number: shot.shot_number,
          })),
          credit_cost: 0,
        },
      });
    }

    if (action === 'set_continuity') {
      const shotId = typeof body.shot_id === 'string' ? body.shot_id : '';
      if (!shotId) return json({ success: false, error: 'shot_id is required' }, 400);
      const continuity = (body.continuity ?? null) as ContinuityOverride | null;
      const { error } = await supabase
        .from('shots')
        .update({ continuity })
        .eq('id', shotId)
        .eq('project_id', projectId);
      if (error) throw new Error(error.message);
      const { edges } = await rederiveGraph(projectId);
      return json({
        success: true,
        data: {
          shot_id: shotId,
          continuity,
          continuity_edges: edges.filter((edge) => edge.to_shot_id === shotId),
          credit_cost: 0,
        },
      });
    }

    if (action === 'graph') {
      const { data, error } = await supabase
        .from('shot_continuity_edges')
        .select('from_shot_id,to_shot_id,entity_type,entity_key,source')
        .eq('project_id', projectId);
      if (error) throw new Error(error.message);
      return json({ success: true, data: { project_id: projectId, edges: data ?? [], credit_cost: 0 } });
    }

    return json({ success: false, error: `Unknown action: ${action || '(missing)'}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Storyboard session failed';
    console.error('[storyboard-session]', message);
    return json({ success: false, error: message }, 500);
  }
});
