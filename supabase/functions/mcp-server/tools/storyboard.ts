/**
 * Storyboard tools: read the shot list, edit shot copy, render shot imagery and
 * score a packet. `seedance_handoff` is declared but not yet implemented.
 */
import { internalError, notFoundError, RPC_ERROR, RpcError, validationError } from '../errors.ts';
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

function notAvailable(): RpcError {
  return new RpcError(
    RPC_ERROR.internal,
    'seedance_handoff is not available yet: the storyboard packet compiler has not shipped. Use generate_shot_image / generate_scene_images for stills in the meantime.',
    { status: 'not_implemented' },
  );
}

const SHOT_IMAGE_CREDITS = 2;
const SCENE_IMAGES_CREDITS = 10;

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
    mutates: true,
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
      },
      ['shotId'],
    ),
    handler: async (ctx, args) => {
      const shot = await loadShot(ctx, String(args.shotId));

      const patch: Record<string, unknown> = {};
      for (const [argName, column] of Object.entries(EDITABLE_SHOT_FIELDS)) {
        if (typeof args[argName] === 'string') patch[column] = args[argName];
      }
      if (Object.keys(patch).length === 0) {
        throw validationError('Provide at least one shot field to update.');
      }

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
      return { shot: data };
    },
  },
  {
    name: 'generate_shot_image',
    mutates: true,
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
    mutates: true,
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
      'Use to hand a finished storyboard to Seedance for video generation. Not yet available: the packet compiler ships in a later release.',
    scope: 'generate',
    // Pricing is part of the unshipped compiler, so a dry run must say so too
    // rather than report a free call.
    estimate: () => {
      throw notAvailable();
    },
    inputSchema: spendingSchema(
      {
        projectId: { type: 'string' },
        sceneId: { type: 'string', description: 'Hand off a single scene instead of the whole project.' },
        model: { type: 'string', description: 'Seedance model id.' },
        resolution: { type: 'string', enum: ['480p', '720p', '1080p'] },
        durationSeconds: { type: 'integer', minimum: 1, maximum: 30 },
      },
      ['projectId'],
    ),
    handler: async (ctx, args) => {
      await loadProject(ctx, String(args.projectId));
      throw notAvailable();
    },
  },
];
