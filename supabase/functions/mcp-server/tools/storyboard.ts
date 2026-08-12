/**
 * Storyboard tools: iterate on the shot list for free (propose → diff → commit),
 * read the continuity graph, edit shot copy, render shot imagery, score a packet
 * and compile the Seedance reference packet.
 */
import { internalError, notFoundError, RpcError, validationError } from '../errors.ts';
import { loadProject, unwrap } from './shared.ts';
import { readSchema, spendingSchema, type ToolContext, type ToolDefinition } from './types.ts';

const SHOT_COLUMNS =
  'id,scene_id,project_id,shot_number,shot_type,prompt_idea,visual_prompt,dialogue,sound_effects,image_url,image_status,video_url,video_status,review_status,updated_at';

const EDITABLE_SHOT_FIELDS: Record<string, string> = {
  shotType: 'shot_type',
  promptIdea: 'prompt_idea',
  visualPrompt: 'visual_prompt',
  dialogue: 'dialogue',
  soundEffects: 'sound_effects',
  reviewStatus: 'review_status',
};

const SHOT_IMAGE_CREDITS = 2;
const SCENE_IMAGES_CREDITS = 10;

/**
 * Storyboard-session style responses nest the useful body under `data`; the tool
 * result is that body so agents do not have to know the envelope.
 */
function sessionData(
  result: Awaited<ReturnType<ToolContext['invoke']>>,
  label = 'storyboard-session',
): Record<string, unknown> {
  const body = typeof result.data === 'object' && result.data !== null
    ? (result.data as Record<string, unknown>)
    : {};

  // A stale revision or an unpriced auto handoff answers 409: the caller has to
  // change its request, so it is a validation failure, not a server fault.
  if (result.status === 409) {
    throw validationError(
      `${label}: ${typeof body.error === 'string' ? body.error : 'conflict'}`,
      Object.fromEntries(
        Object.entries(body).filter(([key]) => key !== 'success' && key !== 'error'),
      ),
    );
  }

  const unwrapped = unwrap(result, label);
  const data = unwrapped.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : unwrapped;
}

async function loadShot(ctx: ToolContext, shotId: string) {
  const { data, error } = await ctx.svc.from('shots').select(SHOT_COLUMNS).eq('id', shotId).maybeSingle();
  if (error) {
    console.error('mcp-server: shot lookup failed', error.message);
    throw internalError('Could not load the shot.');
  }
  if (!data) throw notFoundError(`No shot ${shotId}.`);
  await loadProject(ctx, data.project_id);
  return data as Record<string, unknown> & { id: string; project_id: string };
}

export const storyboardTools: ToolDefinition[] = [
  {
    name: 'get_storyboard',
    description: 'Use to read a project\'s scenes with their shots, prompts and image status. Free.',
    scope: 'read',
    inputSchema: readSchema(
      {
        projectId: { type: 'string' },
        sceneId: { type: 'string', description: 'Limit the result to one scene.' },
      },
      ['projectId'],
    ),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      await loadProject(ctx, projectId);

      let sceneQuery = ctx.svc
        .from('scenes')
        .select('id,scene_number,title,description,location,lighting,weather,voiceover,review_status')
        .eq('project_id', projectId)
        .order('scene_number', { ascending: true });
      if (typeof args.sceneId === 'string') sceneQuery = sceneQuery.eq('id', args.sceneId);

      let shotQuery = ctx.svc
        .from('shots')
        .select(SHOT_COLUMNS)
        .eq('project_id', projectId)
        .order('shot_number', { ascending: true });
      if (typeof args.sceneId === 'string') shotQuery = shotQuery.eq('scene_id', args.sceneId);

      const [scenes, shots] = await Promise.all([sceneQuery, shotQuery]);
      const shotsByScene = new Map<string, unknown[]>();
      for (const shot of shots.data ?? []) {
        const list = shotsByScene.get(shot.scene_id) ?? [];
        list.push(shot);
        shotsByScene.set(shot.scene_id, list);
      }

      return {
        projectId,
        scenes: (scenes.data ?? []).map((scene: { id: string }) => ({
          ...scene,
          shots: shotsByScene.get(scene.id) ?? [],
        })),
      };
    },
  },
  {
    name: 'update_shot',
    description: 'Use to rewrite a shot\'s visual prompt, dialogue, sound effects or shot type. Free.',
    scope: 'read',
    inputSchema: readSchema(
      {
        shotId: { type: 'string' },
        shotType: { type: 'string', description: 'e.g. wide, medium, close-up.' },
        promptIdea: { type: 'string' },
        visualPrompt: { type: 'string' },
        dialogue: { type: 'string' },
        soundEffects: { type: 'string' },
        reviewStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
        continuity: {
          type: 'object',
          description:
            'Override the derived continuity edges for this shot: { characters: [name], locations: [name], props: [name], predecessorShotId, reset }.',
          additionalProperties: true,
        },
      },
      ['shotId'],
    ),
    handler: async (ctx, args) => {
      const shot = await loadShot(ctx, String(args.shotId));

      const patch: Record<string, unknown> = {};
      for (const [argName, column] of Object.entries(EDITABLE_SHOT_FIELDS)) {
        if (typeof args[argName] === 'string') patch[column] = args[argName];
      }
      const continuity = args.continuity;
      const hasContinuity = continuity !== undefined;
      if (Object.keys(patch).length === 0 && !hasContinuity) {
        throw validationError('Provide at least one shot field to update.');
      }

      let updated = shot as Record<string, unknown>;
      if (Object.keys(patch).length > 0) {
        const { data, error } = await ctx.svc
          .from('shots')
          .update(patch)
          .eq('id', shot.id)
          .select(SHOT_COLUMNS)
          .single();
        if (error) {
          console.error('mcp-server: update_shot failed', error.message);
          throw internalError('Could not update the shot.');
        }
        updated = data as Record<string, unknown>;
      }

      if (!hasContinuity) return { shot: updated };

      // A continuity override re-derives the project's graph, so it goes through
      // the storyboard session service that owns that derivation.
      const overrideResult = unwrap(
        await ctx.invoke('storyboard-session', {
          action: 'set_continuity',
          project_id: shot.project_id,
          shot_id: shot.id,
          continuity,
        }),
        'storyboard-session',
      );
      return { shot: updated, continuity: (overrideResult.data ?? overrideResult) };
    },
  },
  {
    name: 'storyboard_propose',
    description:
      'Use to stage scene/shot changes for review without writing them. Free: iterate here until the diff looks right, then commit.',
    scope: 'read',
    inputSchema: readSchema(
      {
        projectId: { type: 'string' },
        revision: {
          type: 'integer',
          description: 'Committed revision you are proposing against (from get_storyboard/storyboard_diff).',
        },
        scenes: {
          type: 'array',
          description:
            'Staged scene deltas: { op: create|update|delete, sceneId?, key?, scene_number?, title?, description?, location?, lighting?, weather? }.',
          items: { type: 'object', additionalProperties: true },
        },
        shots: {
          type: 'array',
          description:
            'Staged shot deltas: { op: create|update|delete, shotId?, sceneId?, sceneKey?, shot_number?, prompt_idea?, visual_prompt?, dialogue?, shot_type?, continuity? }.',
          items: { type: 'object', additionalProperties: true },
        },
        notes: { type: 'string', description: 'Why this revision changes what it changes.' },
        merge: { type: 'boolean', description: 'Append to the staged deltas instead of replacing them.' },
      },
      ['projectId'],
    ),
    handler: async (ctx, args) => {
      await loadProject(ctx, String(args.projectId));
      return sessionData(
        await ctx.invoke('storyboard-session', {
          action: 'propose',
          project_id: args.projectId,
          revision: args.revision,
          scenes: args.scenes,
          shots: args.shots,
          notes: args.notes,
          merge: args.merge,
        }),
      );
    },
  },
  {
    name: 'storyboard_diff',
    description:
      'Use to review the staged storyboard deltas as a table with continuity warnings before committing. Free.',
    scope: 'read',
    inputSchema: readSchema({ projectId: { type: 'string' } }, ['projectId']),
    handler: async (ctx, args) => {
      await loadProject(ctx, String(args.projectId));
      return sessionData(
        await ctx.invoke('storyboard-session', { action: 'diff', project_id: args.projectId }),
      );
    },
  },
  {
    name: 'storyboard_commit',
    description:
      'Use to write the staged deltas to the shot list and re-derive continuity edges. Free. Pass the revision you diffed against; a stale revision is rejected.',
    scope: 'read',
    inputSchema: readSchema(
      {
        projectId: { type: 'string' },
        revision: { type: 'integer', description: 'The revision storyboard_diff reported. Required.' },
      },
      ['projectId', 'revision'],
    ),
    handler: async (ctx, args) => {
      await loadProject(ctx, String(args.projectId));
      return sessionData(
        await ctx.invoke('storyboard-session', {
          action: 'commit',
          project_id: args.projectId,
          revision: args.revision,
        }),
      );
    },
  },
  {
    name: 'get_continuity_graph',
    description:
      'Use to read the typed continuity edges (character/location/prop) between shots, e.g. to see which earlier shot a shot continues. Free.',
    scope: 'read',
    inputSchema: readSchema({ projectId: { type: 'string' } }, ['projectId']),
    handler: async (ctx, args) => {
      await loadProject(ctx, String(args.projectId));
      return sessionData(
        await ctx.invoke('storyboard-session', { action: 'graph', project_id: args.projectId }),
      );
    },
  },
  {
    name: 'generate_shot_image',
    description: `Use to render the still image for one shot from its visual prompt. Costs ${SHOT_IMAGE_CREDITS} credits.`,
    scope: 'generate',
    async: true,
    estimate: async () => ({
      credits: SHOT_IMAGE_CREDITS,
      breakdown: [{ step: 'generate-shot-image', credits: SHOT_IMAGE_CREDITS }],
    }),
    inputSchema: spendingSchema(
      {
        shotId: { type: 'string' },
        imageModel: { type: 'string', description: 'Catalog model id; defaults to the project\'s base image model.' },
        styleReferenceUrl: { type: 'string' },
      },
      ['shotId'],
    ),
    handler: async (ctx, args) => {
      const shot = await loadShot(ctx, String(args.shotId));
      if (!shot.visual_prompt) {
        throw validationError(
          `Shot ${shot.id} has no visual prompt yet. Set one with update_shot before generating an image.`,
        );
      }

      await ctx.progress({ step: 'generate-shot-image', percent: 15, shotId: shot.id });
      const result = unwrap(
        await ctx.invoke('generate-shot-image', {
          shot_id: shot.id,
          image_model: args.imageModel,
          style_reference_url: args.styleReferenceUrl,
          request_id: ctx.jobId,
        }),
        'generate-shot-image',
      );

      return { shot: await loadShot(ctx, shot.id), provider: result };
    },
  },
  {
    name: 'generate_scene_images',
    description: `Use to render still images for every shot in a scene that is missing one. Costs ${SHOT_IMAGE_CREDITS} credits per shot, about ${SCENE_IMAGES_CREDITS} credits for a typical five-shot scene.`,
    scope: 'generate',
    async: true,
    estimate: async (ctx, args) => {
      const sceneId = String(args.sceneId ?? '');
      const { data } = await ctx.svc
        .from('shots')
        .select('id,image_url')
        .eq('scene_id', sceneId);
      const pending = (data ?? []).filter((shot: { image_url: string | null }) => !shot.image_url);
      const count = pending.length || 1;
      return {
        credits: count * SHOT_IMAGE_CREDITS,
        breakdown: [
          { step: 'generate-shot-image', credits: count * SHOT_IMAGE_CREDITS, note: `${count} shot(s) without an image` },
        ],
      };
    },
    inputSchema: spendingSchema(
      {
        sceneId: { type: 'string' },
        regenerate: { type: 'boolean', description: 'Also re-render shots that already have an image.' },
        imageModel: { type: 'string' },
      },
      ['sceneId'],
    ),
    handler: async (ctx, args) => {
      const sceneId = String(args.sceneId);
      const { data: scene } = await ctx.svc
        .from('scenes')
        .select('id,project_id,scene_number')
        .eq('id', sceneId)
        .maybeSingle();
      if (!scene) throw notFoundError(`No scene ${sceneId}.`);
      await loadProject(ctx, scene.project_id);

      const { data: shots } = await ctx.svc
        .from('shots')
        .select('id,shot_number,visual_prompt,image_url')
        .eq('scene_id', sceneId)
        .order('shot_number', { ascending: true });

      const targets = (shots ?? []).filter(
        (shot: { visual_prompt: string | null; image_url: string | null }) =>
          shot.visual_prompt && (args.regenerate === true || !shot.image_url),
      );

      const results: Array<{ shotId: string; ok: boolean; error?: string }> = [];
      for (const [index, shot] of targets.entries()) {
        if (Date.now() > ctx.deadlineAt) {
          results.push({ shotId: shot.id, ok: false, error: 'skipped: job deadline reached' });
          continue;
        }
        await ctx.progress({
          step: 'generate-shot-image',
          percent: Math.round(((index + 1) / Math.max(1, targets.length)) * 100),
          shotId: shot.id,
        });
        try {
          unwrap(
            await ctx.invoke('generate-shot-image', {
              shot_id: shot.id,
              image_model: args.imageModel,
              request_id: `${ctx.jobId ?? 'scene'}:${shot.id}`,
            }),
            'generate-shot-image',
          );
          results.push({ shotId: shot.id, ok: true });
        } catch (error) {
          results.push({
            shotId: shot.id,
            ok: false,
            error: error instanceof Error ? error.message : 'generation failed',
          });
        }
      }

      const { data: refreshed } = await ctx.svc
        .from('shots')
        .select(SHOT_COLUMNS)
        .eq('scene_id', sceneId)
        .order('shot_number', { ascending: true });

      // Each shot bills itself and releases its own hold on failure, so a batch
      // where nothing rendered has charged nothing — but it must not report as a
      // successful job, or the agent tells the user the scene is done.
      if (targets.length > 0 && results.every((result) => !result.ok)) {
        throw internalError(
          `No shot in scene ${sceneId} could be rendered, so nothing was charged. First failure: ${results[0]?.error ?? 'unknown'}`,
          { sceneId, results },
        );
      }

      return { sceneId, requested: targets.length, results, shots: refreshed ?? [] };
    },
  },
  {
    name: 'evaluate_storyboard',
    description:
      'Use to score a storyline, scene or shot against the storyboard rubric and get failure tags to fix. Free.',
    scope: 'read',
    inputSchema: readSchema(
      {
        projectId: { type: 'string' },
        targetType: { type: 'string', enum: ['storyline', 'scene', 'shot'] },
        targetId: { type: 'string' },
      },
      ['projectId', 'targetType', 'targetId'],
    ),
    handler: async (ctx, args) => {
      await loadProject(ctx, String(args.projectId));
      return unwrap(
        await ctx.invoke('evaluate-storyboard-packet', {
          project_id: args.projectId,
          target_type: args.targetType,
          target_id: args.targetId,
        }),
        'evaluate-storyboard-packet',
      );
    },
  },
  {
    name: 'seedance_handoff',
    description:
      'Use to compile the Seedance reference packet for a storyboard: per shot the prompt, negative, camera, duration, character and setting references, style anchor and continuity frame. mode "review" (the default) is free and stops before submitting; mode "auto" would spend credits and is refused until Seedance catalog pricing is published.',
    scope: 'generate',
    inputSchema: spendingSchema(
      {
        projectId: { type: 'string' },
        mode: {
          type: 'string',
          enum: ['review', 'auto'],
          description: 'review (default, free) compiles and stops; auto submits and spends credits.',
        },
        shotIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Hand off only these shots instead of every shot in the project.',
        },
        negativePrompt: { type: 'string' },
        model: { type: 'string', description: 'Seedance catalog model id (auto mode only).' },
        confirm: {
          type: 'boolean',
          description: 'Auto mode only: the user confirmed the quoted credit total.',
        },
      },
      ['projectId'],
    ),
    // review mode never spends, so a dry run quotes 0 credits; auto mode has no
    // verified catalog price yet, and pricing is catalog-strict, never inferred.
    estimate: async (_ctx, args) => {
      if (args.mode === 'auto') {
        throw new RpcError(
          -32003,
          'seedance_handoff mode "auto" cannot be priced: Seedance has no verified row in the model catalog, and credit costs are never inferred. Use mode "review" (0 credits) and submit from the app once catalog pricing is published.',
          { mode: 'auto', reason: 'unpriced_model' },
        );
      }
      return { credits: 0, breakdown: [{ step: 'seedance-handoff:review', credits: 0 }] };
    },
    handler: async (ctx, args) => {
      await loadProject(ctx, String(args.projectId));
      const mode = args.mode === 'auto' ? 'auto' : 'review';
      await ctx.progress({ step: 'seedance-handoff', percent: 20, mode });
      return sessionData(
        await ctx.invoke('seedance-handoff', {
          project_id: args.projectId,
          mode,
          shot_ids: args.shotIds,
          negative_prompt: args.negativePrompt,
          model_id: args.model,
          confirm: args.confirm,
          idempotency_key: args.idempotencyKey,
        }),
        'seedance-handoff',
      );
    },
  },
];
