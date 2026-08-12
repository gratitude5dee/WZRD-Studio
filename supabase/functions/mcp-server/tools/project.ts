/**
 * Project tools: create and inspect projects, manage cast.
 */
import { getWorkflowCreditCost } from '../../_shared/credits.ts';
import { internalError, notFoundError, validationError } from '../errors.ts';
import { loadProject, PROJECT_COLUMNS, pollUntil, unwrap } from './shared.ts';
import { readSchema, spendingSchema, type ToolContext, type ToolDefinition } from './types.ts';

const DEFAULT_SHOT_COUNT = 4;

const SETTINGS_COLUMNS: Record<string, string> = {
  title: 'title',
  description: 'description',
  aspectRatio: 'aspect_ratio',
  videoStyle: 'video_style',
  genre: 'genre',
  tone: 'tone',
  format: 'format',
  cinematicInspiration: 'cinematic_inspiration',
  specialRequests: 'special_requests',
  targetAudience: 'target_audience',
  mainMessage: 'main_message',
  callToAction: 'call_to_action',
};

async function applyProjectSettings(
  ctx: ToolContext,
  projectId: string,
  args: Record<string, unknown>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  for (const [argName, column] of Object.entries(SETTINGS_COLUMNS)) {
    if (typeof args[argName] === 'string' && (args[argName] as string).length > 0) {
      patch[column] = args[argName];
    }
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await ctx.svc
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .eq('user_id', ctx.identity.userId);
  if (error) {
    console.error('mcp-server: project settings update failed', error.message);
    throw internalError('Could not update project settings.');
  }
}

async function estimateSetupProject(_ctx: ToolContext, args: Record<string, unknown>) {
  const shotCount = typeof args.shotCount === 'number' ? args.shotCount : DEFAULT_SHOT_COUNT;
  const storylines = getWorkflowCreditCost('generate-storylines');
  const shots = getWorkflowCreditCost('gen-shots', shotCount);
  return {
    credits: storylines + shots,
    breakdown: [
      { step: 'generate-storylines', credits: storylines },
      { step: 'gen-shots', credits: shots, note: `${shotCount} shot(s)` },
    ],
  };
}

export const projectTools: ToolDefinition[] = [
  {
    name: 'setup_project',
    description:
      'Use when a user describes a video idea and wants a ready-to-edit storyboard: creates the project, generates a storyline, scenes and shots in one call. Costs 3 credits for the storyline plus 1 credit per shot (default 4 shots = 7 credits).',
    scope: 'generate',
    async: true,
    estimate: estimateSetupProject,
    inputSchema: spendingSchema(
      {
        title: { type: 'string', minLength: 1, description: 'Project title.' },
        concept: { type: 'string', description: 'The idea to build the storyline from.' },
        description: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
        videoStyle: { type: 'string', description: 'e.g. cinematic, anime, documentary.' },
        genre: { type: 'string' },
        tone: { type: 'string' },
        format: { type: 'string', description: 'e.g. short_film, ad, music_video.' },
        shotCount: { type: 'integer', minimum: 1, maximum: 12, description: `Shots to draft (default ${DEFAULT_SHOT_COUNT}).` },
      },
      ['title'],
    ),
    handler: async (ctx, args) => {
      const shotCount = typeof args.shotCount === 'number' ? args.shotCount : DEFAULT_SHOT_COUNT;
      const concept = typeof args.concept === 'string' ? args.concept : String(args.title);

      await ctx.progress({ step: 'create-project', percent: 5 });
      const created = unwrap(
        await ctx.invoke('create-project', {
          title: args.title,
          description: args.description,
          aspectRatio: args.aspectRatio,
        }),
        'create-project',
      );
      const project = (created.project ?? {}) as { id?: string };
      const projectId = project.id;
      if (!projectId) throw internalError('create-project did not return a project id.');

      await applyProjectSettings(ctx, projectId, { ...args, concept: undefined });

      await ctx.progress({ step: 'generate-storylines', percent: 20, projectId });
      unwrap(
        await ctx.invoke('generate-storylines', {
          project_id: projectId,
          concept_payload: {
            option: 'ai',
            text: concept,
            format: typeof args.format === 'string' ? args.format : 'short_film',
            genre: args.genre ?? null,
            tone: args.tone ?? null,
          },
        }),
        'generate-storylines',
      );

      // generate-storylines answers 202 and writes scenes from a background task.
      const scenes = await pollUntil(
        ctx,
        async () => {
          const { data } = await ctx.svc
            .from('scenes')
            .select('id,scene_number,title,description,location')
            .eq('project_id', projectId)
            .order('scene_number', { ascending: true });
          return data && data.length > 0 ? data : null;
        },
        { budgetMs: 90_000, intervalMs: 3000 },
      );

      if (!scenes) {
        return {
          projectId,
          status: 'storyline_pending',
          message:
            'The storyline is still generating. Call get_storyboard with this projectId in a moment to pick up the scenes.',
        };
      }

      await ctx.progress({ step: 'gen-shots', percent: 55, projectId, scenes: scenes.length });
      await ctx.invokeSse(
        'gen-shots',
        { projectId, sceneId: scenes[0].id, shotCount, requestId: ctx.jobId },
        async (event) => {
          if (typeof event.phase === 'string') {
            await ctx.progress({ step: 'gen-shots', phase: event.phase, percent: 60, projectId });
          }
        },
      );

      await ctx.progress({ step: 'finalize-project-setup', percent: 85, projectId });
      unwrap(
        await ctx.invoke('finalize-project-setup', {
          project_id: projectId,
          settings: {
            aspectRatio: typeof args.aspectRatio === 'string' ? args.aspectRatio : '16:9',
            videoStyle: typeof args.videoStyle === 'string' ? args.videoStyle : 'cinematic',
            cinematicInspiration: args.cinematicInspiration ?? null,
            baseImageModel: 'fal-ai/flux/schnell',
            baseVideoModel: 'fal-ai/ltx-video',
          },
        }),
        'finalize-project-setup',
      );

      const [{ data: finalScenes }, { data: characters }, settings] = await Promise.all([
        ctx.svc
          .from('scenes')
          .select('id,scene_number,title,description,location')
          .eq('project_id', projectId)
          .order('scene_number', { ascending: true }),
        ctx.svc.from('characters').select('id,name,description,image_url,image_status').eq('project_id', projectId),
        loadProject(ctx, projectId),
      ]);

      return {
        projectId,
        status: 'ready',
        scenes: finalScenes ?? [],
        characters: characters ?? [],
        settings: {
          aspectRatio: settings.aspect_ratio,
          videoStyle: settings.video_style,
          genre: settings.genre,
          tone: settings.tone,
          format: settings.format,
          cinematicInspiration: settings.cinematic_inspiration,
        },
      };
    },
  },
  {
    name: 'list_projects',
    description: "Use to find a project id: lists this user's projects, newest first. Free.",
    scope: 'read',
    inputSchema: readSchema({
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 25.' },
      search: { type: 'string', description: 'Case-insensitive title match.' },
      status: { type: 'string', description: 'Filter by project status.' },
    }),
    handler: async (ctx, args) => {
      let query = ctx.svc
        .from('projects')
        .select(PROJECT_COLUMNS)
        .eq('user_id', ctx.identity.userId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(typeof args.limit === 'number' ? args.limit : 25);

      if (typeof args.search === 'string' && args.search) {
        query = query.ilike('title', `%${args.search}%`);
      }
      if (typeof args.status === 'string' && args.status) {
        query = query.eq('status', args.status);
      }

      const { data, error } = await query;
      if (error) {
        console.error('mcp-server: list_projects failed', error.message);
        throw internalError('Could not list projects.');
      }
      return { projects: data ?? [] };
    },
  },
  {
    name: 'get_project',
    description:
      'Use to read one project with its scene, shot and character counts before editing it. Free.',
    scope: 'read',
    inputSchema: readSchema({ projectId: { type: 'string' } }, ['projectId']),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      const project = await loadProject(ctx, projectId);
      const [scenes, shots, characters] = await Promise.all([
        ctx.svc.from('scenes').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
        ctx.svc.from('shots').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
        ctx.svc.from('characters').select('id,name,image_url,image_status').eq('project_id', projectId),
      ]);

      return {
        project,
        counts: { scenes: scenes.count ?? 0, shots: shots.count ?? 0, characters: (characters.data ?? []).length },
        characters: characters.data ?? [],
      };
    },
  },
  {
    name: 'update_project_settings',
    description: 'Use to change a project\'s title, aspect ratio, style, genre or tone. Free.',
    scope: 'read',
    inputSchema: readSchema(
      {
        projectId: { type: 'string' },
        title: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
        videoStyle: { type: 'string' },
        genre: { type: 'string' },
        tone: { type: 'string' },
        format: { type: 'string' },
        cinematicInspiration: { type: 'string' },
        specialRequests: { type: 'string' },
        targetAudience: { type: 'string' },
        mainMessage: { type: 'string' },
        callToAction: { type: 'string' },
      },
      ['projectId'],
    ),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      await loadProject(ctx, projectId);

      const { projectId: _ignored, ...patch } = args;
      if (Object.keys(patch).length === 0) {
        throw validationError('Provide at least one setting to update.');
      }
      await applyProjectSettings(ctx, projectId, patch);
      return { project: await loadProject(ctx, projectId) };
    },
  },
  {
    name: 'add_character',
    description: 'Use to add a cast member to a project before generating character art. Free.',
    scope: 'read',
    inputSchema: readSchema(
      {
        projectId: { type: 'string' },
        name: { type: 'string', minLength: 1 },
        description: { type: 'string', description: 'Appearance and personality notes used for image prompts.' },
      },
      ['projectId', 'name'],
    ),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      await loadProject(ctx, projectId);

      const { data, error } = await ctx.svc
        .from('characters')
        .insert({
          project_id: projectId,
          name: String(args.name),
          description: typeof args.description === 'string' ? args.description : null,
        })
        .select('id,name,description,image_url,image_status')
        .single();

      if (error) {
        console.error('mcp-server: add_character failed', error.message);
        throw internalError('Could not add the character.');
      }
      return { character: data };
    },
  },
  {
    name: 'generate_character_image',
    description:
      'Use to render reference art for a character already on the project. Costs image-model credits (typically 2).',
    scope: 'generate',
    async: true,
    estimate: async () => ({
      credits: 2,
      breakdown: [{ step: 'generate-character-image', credits: 2 }],
    }),
    inputSchema: spendingSchema(
      {
        characterId: { type: 'string' },
        styleReferenceUrl: { type: 'string', description: 'Optional style reference image URL.' },
      },
      ['characterId'],
    ),
    handler: async (ctx, args) => {
      const characterId = String(args.characterId);
      const { data: character } = await ctx.svc
        .from('characters')
        .select('id,project_id,name')
        .eq('id', characterId)
        .maybeSingle();
      if (!character) throw notFoundError(`No character ${characterId}.`);
      await loadProject(ctx, character.project_id);

      await ctx.progress({ step: 'generate-character-image', percent: 10 });
      const result = unwrap(
        await ctx.invoke('generate-character-image', {
          character_id: characterId,
          project_id: character.project_id,
          style_reference_url: args.styleReferenceUrl,
        }),
        'generate-character-image',
      );

      const { data: updated } = await ctx.svc
        .from('characters')
        .select('id,name,image_url,image_status,image_generation_error')
        .eq('id', characterId)
        .maybeSingle();

      return { character: updated ?? null, provider: result };
    },
  },
];
