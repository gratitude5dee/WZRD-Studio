/**
 * Editor tools: read/mutate the persisted QCut timeline, export a cut and
 * transcribe captions.
 */
import { internalError, notFoundError, validationError } from '../errors.ts';
import {
  applyTimelineOperations,
  readTracks,
  summarizeTimeline,
  type QcutSnapshot,
  type TimelineOperation,
} from '../timeline-ops.ts';
import { loadProject, unwrap } from './shared.ts';
import { readSchema, spendingSchema, type ToolContext, type ToolDefinition } from './types.ts';

const TRANSCRIBE_MODEL = 'fal-ai/whisper';

async function loadSnapshot(ctx: ToolContext, projectId: string): Promise<QcutSnapshot> {
  const { data, error } = await ctx.svc
    .from('projects')
    .select('qcut_project_json')
    .eq('id', projectId)
    .eq('user_id', ctx.identity.userId)
    .maybeSingle();

  if (error) {
    console.error('mcp-server: snapshot load failed', error.message);
    throw internalError('Could not load the project timeline.');
  }
  if (!data) throw notFoundError(`Project ${projectId} not found.`);

  const snapshot = data.qcut_project_json;
  if (!snapshot || typeof snapshot !== 'object') {
    throw notFoundError(
      `Project ${projectId} has no editor timeline yet. Open it in the editor once so a snapshot is saved.`,
    );
  }
  return snapshot as QcutSnapshot;
}

async function saveSnapshot(ctx: ToolContext, projectId: string, snapshot: QcutSnapshot): Promise<void> {
  const { error } = await ctx.svc
    .from('projects')
    .update({ qcut_project_json: snapshot })
    .eq('id', projectId)
    .eq('user_id', ctx.identity.userId);
  if (error) {
    console.error('mcp-server: snapshot save failed', error.message);
    throw internalError('Could not save the project timeline.');
  }
}

export const editorTools: ToolDefinition[] = [
  {
    name: 'get_timeline',
    description:
      'Use to read the editor timeline: tracks, clips, trims and the media library available for editing. Free.',
    scope: 'read',
    inputSchema: readSchema({ projectId: { type: 'string' } }, ['projectId']),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      const snapshot = await loadSnapshot(ctx, projectId);
      const media = (snapshot.media?.mediaItems ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        duration: item.duration,
      }));
      return {
        projectId,
        savedAt: snapshot.savedAt,
        timeline: summarizeTimeline(readTracks(snapshot)),
        media,
      };
    },
  },
  {
    name: 'edit_timeline',
    mutates: true,
    description:
      'Use to add, move, trim or delete timeline clips and titles; operations apply in order and all fail together. Free.',
    scope: 'read',
    inputSchema: readSchema(
      {
        projectId: { type: 'string' },
        operations: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              op: { type: 'string', enum: ['add', 'move', 'trim', 'delete'] },
              kind: { type: 'string', enum: ['media', 'text'], description: 'add: what to place.' },
              mediaId: { type: 'string', description: 'add(media): id from get_timeline.media.' },
              content: { type: 'string', description: 'add(text): the title copy.' },
              name: { type: 'string', description: 'add: element label.' },
              trackId: { type: 'string', description: 'Target track; required for move/trim/delete.' },
              toTrackId: { type: 'string', description: 'move: move onto this track.' },
              elementId: { type: 'string', description: 'Element to move/trim/delete.' },
              startTime: { type: 'number', minimum: 0, description: 'Seconds on the timeline.' },
              duration: { type: 'number', minimum: 0, description: 'add: element duration in seconds.' },
              trimStart: { type: 'number', minimum: 0 },
              trimEnd: { type: 'number', minimum: 0 },
            },
            required: ['op'],
          },
        },
      },
      ['projectId', 'operations'],
    ),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      const operations = args.operations as TimelineOperation[];
      if (!Array.isArray(operations) || operations.length === 0) {
        throw validationError('Provide at least one timeline operation.');
      }

      const snapshot = await loadSnapshot(ctx, projectId);
      const result = applyTimelineOperations(snapshot, operations);
      await saveSnapshot(ctx, projectId, result.snapshot);

      return { projectId, applied: result.applied, timeline: result.timeline };
    },
  },
  {
    name: 'export_video',
    mutates: true,
    description:
      'Use to assemble the storyboard into a rendered cut and track the render job. Free to queue; the shot generations it consumes are billed when they run.',
    scope: 'generate',
    async: true,
    estimate: async () => ({
      credits: 0,
      breakdown: [{ step: 'director-cut', credits: 0, note: 'assembly only; shot media must already exist' }],
    }),
    inputSchema: spendingSchema(
      {
        projectId: { type: 'string' },
        action: {
          type: 'string',
          enum: ['sync', 'create', 'retry', 'status'],
          description: 'sync checks readiness, create starts a render (default), status polls, retry re-runs.',
        },
        jobId: { type: 'string', description: 'Required for status/retry.' },
        settings: {
          type: 'object',
          description: 'Export settings (resolution, fps, format) passed through to the renderer.',
        },
      },
      ['projectId'],
    ),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      await loadProject(ctx, projectId);
      const action = typeof args.action === 'string' ? args.action : 'create';

      await ctx.progress({ step: 'director-cut', action, percent: 20 });
      return unwrap(
        await ctx.invoke('director-cut', {
          action,
          projectId,
          jobId: args.jobId,
          settings: args.settings,
        }),
        'director-cut',
      );
    },
  },
  {
    name: 'transcribe_captions',
    mutates: true,
    description:
      'Use to transcribe an audio or video URL into caption segments with timings. Costs the catalog price of fal-ai/whisper (about 1 credit per short clip).',
    scope: 'generate',
    async: true,
    estimate: async () => ({
      credits: 1,
      breakdown: [{ step: TRANSCRIBE_MODEL, credits: 1, note: 'catalog-strict pricing, scales with clip length' }],
    }),
    inputSchema: spendingSchema(
      {
        audioUrl: { type: 'string', minLength: 1, description: 'Publicly reachable audio/video URL.' },
        language: { type: 'string', description: 'ISO code, or omit for auto-detection.' },
        projectId: { type: 'string', description: 'Attribute the transcription to a project.' },
      },
      ['audioUrl'],
    ),
    handler: async (ctx, args) => {
      if (typeof args.projectId === 'string') await loadProject(ctx, args.projectId);

      const inputs: Record<string, unknown> = {
        audio_url: String(args.audioUrl),
        task: 'transcribe',
        chunk_level: 'segment',
      };
      if (typeof args.language === 'string' && args.language && args.language !== 'auto') {
        inputs.language = args.language;
      }

      const collected: { result: Record<string, unknown> | null; failure: string | null } = {
        result: null,
        failure: null,
      };
      await ctx.invokeSse(
        'fal-stream',
        { modelId: TRANSCRIBE_MODEL, inputs, pricingMode: 'catalog-strict', request_id: ctx.jobId },
        async (event) => {
          if (event.type === 'done') {
            collected.result = (event.result ?? null) as Record<string, unknown> | null;
          }
          if (event.type === 'error') {
            collected.failure = typeof event.error === 'string' ? event.error : 'transcription failed';
          }
          if (event.type === 'progress') {
            const inner = (event.event ?? {}) as Record<string, unknown>;
            if (typeof inner.progress === 'number') {
              await ctx.progress({ step: 'transcribe', percent: inner.progress });
            }
          }
        },
      );

      if (collected.failure) throw internalError(`Transcription failed: ${collected.failure}`);
      const result = collected.result;
      if (!result) {
        throw internalError('Transcription finished without returning a result.');
      }

      const chunks = Array.isArray(result.chunks) ? result.chunks : [];
      return {
        text: typeof result.text === 'string' ? result.text : '',
        language: result.inferred_languages ?? args.language ?? null,
        segments: chunks.map((chunk: Record<string, unknown>, index: number) => {
          const timestamp = Array.isArray(chunk.timestamp) ? chunk.timestamp : [];
          return {
            id: index,
            start: typeof timestamp[0] === 'number' ? timestamp[0] : null,
            end: typeof timestamp[1] === 'number' ? timestamp[1] : null,
            text: typeof chunk.text === 'string' ? chunk.text.trim() : '',
          };
        }),
      };
    },
  },
];
