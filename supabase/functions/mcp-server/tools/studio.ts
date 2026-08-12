/**
 * Studio tools: draft a node workflow, read/write the canvas graph and run it.
 */
import { internalError, validationError } from '../errors.ts';
import { loadProject, unwrap } from './shared.ts';
import { readSchema, spendingSchema, type ToolDefinition } from './types.ts';

export const studioTools: ToolDefinition[] = [
  {
    name: 'generate_workflow',
    description: 'Use to turn a plain-language brief into a Studio node graph proposal. Free.',
    scope: 'read',
    inputSchema: readSchema(
      {
        prompt: { type: 'string', minLength: 1, description: 'What the workflow should accomplish.' },
        projectId: { type: 'string', description: 'Ground the proposal in an existing project\'s assets.' },
        mode: { type: 'string', enum: ['legacy', 'plan', 'clarify', 'repair'], description: 'Default legacy.' },
        answers: { type: 'object', description: 'Answers to a previous clarify round.' },
        validationErrors: { type: 'array', items: { type: 'string' }, description: 'Errors to repair.' },
      },
      ['prompt'],
    ),
    handler: async (ctx, args) => {
      if (typeof args.projectId === 'string') await loadProject(ctx, args.projectId);
      return unwrap(
        await ctx.invoke('generate-workflow', {
          prompt: args.prompt,
          projectId: args.projectId,
          mode: args.mode ?? 'legacy',
          answers: args.answers,
          validationErrors: args.validationErrors ?? [],
        }),
        'generate-workflow',
      );
    },
  },
  {
    name: 'get_studio_graph',
    description: 'Use to read the saved Studio canvas: blocks, viewport and compute nodes/edges. Free.',
    scope: 'read',
    inputSchema: readSchema({ projectId: { type: 'string' } }, ['projectId']),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      await loadProject(ctx, projectId);

      const studio = unwrap(await ctx.invoke('studio-load-state', { projectId }), 'studio-load-state');
      const [nodes, edges] = await Promise.all([
        ctx.svc.from('compute_nodes').select('*').eq('project_id', projectId),
        ctx.svc.from('compute_edges').select('*').eq('project_id', projectId),
      ]);

      return {
        projectId,
        blocks: studio.blocks ?? [],
        canvasState: studio.canvasState ?? null,
        nodes: nodes.data ?? [],
        edges: edges.data ?? [],
      };
    },
  },
  {
    name: 'save_studio_graph',
    description:
      'Use to persist a Studio canvas: pass nodes/edges for the compute graph and/or blocks for the visual canvas. Free.',
    scope: 'read',
    inputSchema: readSchema(
      {
        projectId: { type: 'string' },
        nodes: { type: 'array', items: { type: 'object' }, description: 'Compute nodes with uuid ids.' },
        edges: { type: 'array', items: { type: 'object' }, description: 'Compute edges with uuid ids.' },
        viewState: { type: 'object' },
        blocks: { type: 'array', items: { type: 'object' }, description: 'Studio canvas blocks.' },
        canvasState: { type: 'object' },
      },
      ['projectId'],
    ),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      await loadProject(ctx, projectId);

      const hasComputeGraph = Array.isArray(args.nodes) || Array.isArray(args.edges);
      const hasBlocks = Array.isArray(args.blocks) || typeof args.canvasState === 'object';
      if (!hasComputeGraph && !hasBlocks) {
        throw validationError('Provide nodes/edges (compute graph) and/or blocks/canvasState (studio canvas).');
      }

      const saved: Record<string, unknown> = { projectId };
      if (hasComputeGraph) {
        saved.computeGraph = unwrap(
          await ctx.invoke('compute-save-graph', {
            projectId,
            nodes: args.nodes ?? [],
            edges: args.edges ?? [],
            viewState: args.viewState,
          }),
          'compute-save-graph',
        );
      }
      if (hasBlocks) {
        saved.studioState = unwrap(
          await ctx.invoke('studio-save-state', {
            projectId,
            blocks: args.blocks ?? [],
            canvasState: args.canvasState,
          }),
          'studio-save-state',
        );
      }
      return saved;
    },
  },
  {
    name: 'run_studio_graph',
    description:
      'Use to execute a project\'s saved compute graph node by node. Costs the sum of each generation node\'s model credits.',
    scope: 'generate',
    async: true,
    estimate: async (ctx, args) => {
      const projectId = String(args.projectId ?? '');
      const { data } = await ctx.svc
        .from('compute_nodes')
        .select('id,kind,params')
        .eq('project_id', projectId);
      const nodeIds = Array.isArray(args.nodeIds) ? (args.nodeIds as string[]) : null;
      const nodes = (data ?? []).filter((node: { id: string }) => !nodeIds || nodeIds.includes(node.id));

      // Generation node pricing is resolved per model inside compute-execute; the
      // estimate uses the catalog-independent floor of 1 credit per such node.
      const generationNodes = nodes.filter((node: { kind: string }) =>
        /image|video|audio|text|generate/i.test(node.kind),
      );
      return {
        credits: generationNodes.length,
        breakdown: [
          {
            step: 'compute-execute',
            credits: generationNodes.length,
            note: `minimum for ${generationNodes.length} generation node(s); the final charge follows each node's model price`,
          },
        ],
      };
    },
    inputSchema: spendingSchema(
      {
        projectId: { type: 'string' },
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Run only these nodes.' },
        useCache: { type: 'boolean', description: 'Reuse cached node outputs (default true).' },
      },
      ['projectId'],
    ),
    handler: async (ctx, args) => {
      const projectId = String(args.projectId);
      await loadProject(ctx, projectId);

      const events: Array<Record<string, unknown>> = [];
      const { status } = await ctx.invokeSse(
        'compute-execute',
        {
          projectId,
          nodeIds: args.nodeIds,
          useCache: args.useCache ?? true,
          requestId: ctx.jobId,
        },
        async (event) => {
          events.push(event);
          await ctx.progress({ step: 'compute-execute', ...event });
        },
      );

      if (status >= 400) {
        throw internalError(`compute-execute failed with status ${status}.`);
      }

      const { data: nodes } = await ctx.svc
        .from('compute_nodes')
        .select('id,kind,status,outputs,progress,error,updated_at')
        .eq('project_id', projectId);

      return { projectId, events, nodes: nodes ?? [] };
    },
  },
];
