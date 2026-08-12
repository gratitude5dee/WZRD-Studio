/**
 * WZRD Studio MCP tool surface.
 *
 * Conventions every tool in this registry obeys:
 *   - names are snake_case and ≤ 40 characters (client limit);
 *   - free tools declare `spends: false` and never touch the ledger;
 *   - spending tools declare `spends: true`, accept `dryRun`, require `confirm`,
 *     accept an `idempotencyKey`, and state their credit cost in the description
 *     so a client that only reads tools/list can still warn the user;
 *   - a spending tool's quoted price and charged price come from the same helper,
 *     so quoted-vs-charged drift is structurally impossible rather than tested for.
 */
import { getCreditCostForModel, getCatalogCreditCost } from '../_shared/credits.ts';
import { type AgentAuthContext, type AgentScope, McpAuthError, assertScope, assertWithinCap } from './auth.ts';
import { startBilledJob } from './jobs.ts';
import type { McpSupabaseClient } from './supabase-client.ts';

type SupabaseLike = McpSupabaseClient;

export interface ToolContext {
  supabase: SupabaseLike;
  auth: AgentAuthContext;
  appUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  scope: AgentScope;
  spends: boolean;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

/** Default image model for agent-driven shot generation (2 credits, catalog-priced). */
export const DEFAULT_SHOT_IMAGE_MODEL = 'gmi/seedream-5.0-lite';

export const EXPORT_CATALOG_IDS = ['wzrd/export-video', 'wzrd/director-cut'];

export class ToolError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.details = details;
  }
}

function projectDeepLink(ctx: ToolContext, projectId: string): string {
  return `${ctx.appUrl}/project/${projectId}?tab=timeline`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = asString(args[key]);
  if (!value) throw new ToolError('invalid_argument', `"${key}" is required.`);
  return value;
}

async function invokeFunction(
  ctx: ToolContext,
  fnName: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${ctx.supabaseUrl}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ctx.serviceRoleKey,
      Authorization: `Bearer ${ctx.serviceRoleKey}`,
    },
    body: JSON.stringify({ ...body, user_id: ctx.auth.userId }),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

function unwrap(response: { status: number; data: unknown }): Record<string, unknown> {
  const payload = (response.data ?? {}) as Record<string, unknown>;
  if (response.status >= 400 || payload.success === false) {
    const code = asString(payload.code) ?? 'downstream_error';
    const message = asString(payload.error) ?? `Downstream call failed (${response.status}).`;
    throw new ToolError(code, message, { status: response.status, ...(payload.expected_revision !== undefined ? { expected_revision: payload.expected_revision } : {}) });
  }
  return (payload.data ?? payload) as Record<string, unknown>;
}

async function assertProjectOwned(ctx: ToolContext, projectId: string): Promise<void> {
  const { data } = await ctx.supabase
    .from('projects')
    .select('id,user_id')
    .eq('id', projectId)
    .maybeSingle();
  // Existence is never leaked: another user's project reads as not found.
  if (!data || data.user_id !== ctx.auth.userId) {
    throw new ToolError('not_found', `Project ${projectId} was not found.`);
  }
}

async function availableCredits(ctx: ToolContext): Promise<{ available: number; total: number; used: number }> {
  const { data } = await ctx.supabase
    .from('user_credits')
    .select('total_credits,used_credits')
    .eq('user_id', ctx.auth.userId)
    .maybeSingle();
  const total = Number(data?.total_credits ?? 0);
  const used = Number(data?.used_credits ?? 0);
  return { available: Math.max(0, total - used), total, used };
}

/** Quote a spending tool. Never invents a price: catalog-strict or refuse. */
async function quoteCatalogOperation(
  ctx: ToolContext,
  candidateIds: string[],
  inputs: Record<string, unknown>,
): Promise<{ modelId: string; credits: number }> {
  const { data } = await ctx.supabase
    .from('ai_model_catalog')
    .select('id,enabled,credits,pricing_text,pricing')
    .in('id', candidateIds);
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (row.enabled === false) continue;
    try {
      const credits = getCatalogCreditCost(
        (row.pricing ?? null) as Record<string, unknown> | null,
        typeof row.credits === 'number' ? row.credits : undefined,
        typeof row.pricing_text === 'string' ? row.pricing_text : undefined,
        inputs,
      );
      if (credits > 0) return { modelId: String(row.id), credits };
    } catch {
      continue;
    }
  }
  throw new ToolError(
    'unpriced_operation',
    `This operation has no verified price in ai_model_catalog (looked for: ${candidateIds.join(', ')}). Billing is catalog-strict and never inferred, so the call is refused instead of guessing a price.`,
    { candidates: candidateIds },
  );
}

interface SpendGateInput {
  ctx: ToolContext;
  args: Record<string, unknown>;
  toolName: string;
  quotedCredits: number;
  quoteSource: string;
}

/**
 * The one safety gate every spending tool goes through: cost preview → explicit
 * confirmation of a concrete credit number → cap check → balance check.
 */
async function spendGate(input: SpendGateInput): Promise<{ dryRun: false } | { dryRun: true; preview: Record<string, unknown> }> {
  const { ctx, args, quotedCredits } = input;
  const balance = await availableCredits(ctx);

  if (args.dryRun === true) {
    return {
      dryRun: true,
      preview: {
        dryRun: true,
        tool: input.toolName,
        credits_quoted: quotedCredits,
        quote_source: input.quoteSource,
        credit_cost: 0,
        credits_available: balance.available,
        credits_available_after: balance.available - quotedCredits,
        monthly_cap: ctx.auth.monthlyCreditCap,
        monthly_cap_used: ctx.auth.creditsUsedThisPeriod,
        confirmation_prompt: `This will spend ${quotedCredits} credits (you have ${balance.available}). Reply with explicit approval, then call ${input.toolName} again with confirm: true and an idempotencyKey.`,
      },
    };
  }

  if (args.confirm !== true) {
    throw new ToolError(
      'confirmation_required',
      `${input.toolName} spends ${quotedCredits} credits. Show the user this exact number, get explicit approval, then retry with confirm: true. Run with dryRun: true first if you have not previewed the cost.`,
      { credits_quoted: quotedCredits, quote_source: input.quoteSource },
    );
  }

  assertWithinCap(ctx.auth, quotedCredits);

  if (balance.available < quotedCredits) {
    throw new ToolError(
      'insufficient_credits',
      `Not enough credits: ${quotedCredits} required, ${balance.available} available. Top up at ${ctx.appUrl}/settings/billing.`,
      { required: quotedCredits, available: balance.available, top_up_url: `${ctx.appUrl}/settings/billing` },
    );
  }

  return { dryRun: false };
}

function idempotencyKey(args: Record<string, unknown>, fallbackParts: string[]): string {
  return asString(args.idempotencyKey) ?? fallbackParts.filter(Boolean).join(':');
}

// ── Tool registry ───────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  {
    name: 'get_credits',
    description:
      'Read the credit balance for the token owner, plus this token\'s monthly credit cap and usage. Free (0 credits). Call this first in any workflow that may spend.',
    scope: 'read',
    spends: false,
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const balance = await availableCredits(ctx);
      return {
        ...balance,
        credit_cost: 0,
        monthly_cap: ctx.auth.monthlyCreditCap,
        monthly_cap_used: ctx.auth.creditsUsedThisPeriod,
        monthly_cap_resets_at: ctx.auth.resetsAt,
        scopes: ctx.auth.scopes,
        top_up_url: `${ctx.appUrl}/settings/billing`,
      };
    },
  },
  {
    name: 'list_models',
    description:
      'List models in the WZRD catalog with credit cost, provider, and capabilities. Free (0 credits). Use it to quote prices before spending.',
    scope: 'read',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: {
        mediaType: { type: 'string', enum: ['text', 'image', 'video', 'audio'] },
        provider: { type: 'string' },
      },
    },
    handler: async (args, ctx) => {
      let query = ctx.supabase
        .from('ai_model_catalog')
        .select('id,name,provider,media_type,credits,pricing_text,description')
        .eq('enabled', true)
        .or('pricing->>editor_only.is.null,pricing->>editor_only.neq.true');
      const mediaType = asString(args.mediaType);
      const provider = asString(args.provider);
      if (mediaType) query = query.eq('media_type', mediaType);
      if (provider) query = query.eq('provider', provider);
      const { data, error } = await query.order('sort_rank', { ascending: true }).limit(200);
      if (error) throw new ToolError('catalog_unavailable', error.message);
      return { models: data ?? [], credit_cost: 0 };
    },
  },
  {
    name: 'setup_project',
    description:
      'Create a WZRD project (title, description, format, genre, tone, aspect ratio) and return its id plus the web deep link. Free (0 credits).',
    scope: 'write',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        format: { type: 'string' },
        genre: { type: 'string' },
        tone: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
        concept: { type: 'string', description: 'Free-form concept text for the storyboard agent.' },
      },
      required: ['title'],
    },
    handler: async (args, ctx) => {
      const title = requireString(args, 'title');
      const { data, error } = await ctx.supabase
        .from('projects')
        .insert({
          user_id: ctx.auth.userId,
          title,
          description: asString(args.description),
          format: asString(args.format),
          genre: asString(args.genre),
          tone: asString(args.tone),
          aspect_ratio: asString(args.aspectRatio) ?? '16:9',
          concept_text: asString(args.concept),
        })
        .select('id,title,created_at')
        .single<{ id: string; title: string | null; created_at: string }>();
      if (error || !data) throw new ToolError('project_create_failed', error?.message ?? 'project insert returned no row');
      return {
        project: data,
        credit_cost: 0,
        deep_link: projectDeepLink(ctx, data.id),
        next_step: 'Call storyboard_propose to stage scenes and shots (free), then storyboard_diff and storyboard_commit.',
      };
    },
  },
  {
    name: 'get_timeline',
    description: 'Read committed scenes and shots for a project, including image/video status per shot. Free (0 credits).',
    scope: 'read',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      await assertProjectOwned(ctx, projectId);
      const [scenes, shots] = await Promise.all([
        ctx.supabase.from('scenes').select('*').eq('project_id', projectId).order('scene_number'),
        ctx.supabase.from('shots').select('*').eq('project_id', projectId).order('shot_number'),
      ]);
      return {
        scenes: scenes.data ?? [],
        shots: shots.data ?? [],
        credit_cost: 0,
        deep_link: projectDeepLink(ctx, projectId),
      };
    },
  },
  {
    name: 'get_storyboard',
    description:
      'Read the storyboard session: committed scenes/shots, staged deltas, the current revision, and the pending diff. Free (0 credits). Clients render this as a table.',
    scope: 'read',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      await assertProjectOwned(ctx, projectId);
      const result = unwrap(await invokeFunction(ctx, 'storyboard-session', { action: 'get', project_id: projectId }));
      return { ...result, deep_link: projectDeepLink(ctx, projectId) };
    },
  },
  {
    name: 'storyboard_propose',
    description:
      'Stage scene/shot deltas for review at revision + 1 without writing any shot. Free (0 credits). Iterate here as many times as you like before spending anything.',
    scope: 'write',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        revision: { type: 'integer', description: 'Revision you read; rejected if the storyboard moved on.' },
        scenes: { type: 'array', items: { type: 'object' } },
        shots: { type: 'array', items: { type: 'object' } },
        notes: { type: 'string' },
        merge: { type: 'boolean', description: 'Append to the staged set instead of replacing it.' },
      },
      required: ['projectId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      await assertProjectOwned(ctx, projectId);
      return unwrap(
        await invokeFunction(ctx, 'storyboard-session', {
          action: 'propose',
          project_id: projectId,
          revision: args.revision,
          scenes: args.scenes ?? [],
          shots: args.shots ?? [],
          notes: args.notes,
          merge: args.merge === true,
        }),
      );
    },
  },
  {
    name: 'storyboard_diff',
    description:
      'Normalized diff of staged deltas against committed scenes/shots plus continuity warnings, with a markdown table for display. Free (0 credits).',
    scope: 'read',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      await assertProjectOwned(ctx, projectId);
      return unwrap(await invokeFunction(ctx, 'storyboard-session', { action: 'diff', project_id: projectId }));
    },
  },
  {
    name: 'storyboard_commit',
    description:
      'Write the staged deltas to scenes/shots and re-derive the continuity graph. Free (0 credits). Requires the revision you diffed against; a mismatch is rejected so concurrent agents cannot clobber each other.',
    scope: 'write',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        revision: { type: 'integer', description: 'The revision returned by storyboard_diff.' },
      },
      required: ['projectId', 'revision'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      await assertProjectOwned(ctx, projectId);
      return unwrap(
        await invokeFunction(ctx, 'storyboard-session', {
          action: 'commit',
          project_id: projectId,
          revision: args.revision,
        }),
      );
    },
  },
  {
    name: 'update_shot',
    description:
      'Update one committed shot (prompt, dialogue, shot type) and/or override its continuity edges via { continuity }. Free (0 credits).',
    scope: 'write',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        shotId: { type: 'string' },
        promptIdea: { type: 'string' },
        visualPrompt: { type: 'string' },
        dialogue: { type: 'string' },
        shotType: { type: 'string' },
        continuity: {
          type: 'object',
          description: 'Continuity override: { characters, locations, props, predecessorShotId, reset }.',
          properties: {
            characters: { type: 'array', items: { type: 'string' } },
            locations: { type: 'array', items: { type: 'string' } },
            props: { type: 'array', items: { type: 'string' } },
            predecessorShotId: { type: ['string', 'null'] },
            reset: { type: 'boolean' },
          },
        },
      },
      required: ['projectId', 'shotId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      const shotId = requireString(args, 'shotId');
      await assertProjectOwned(ctx, projectId);

      const fields: Record<string, unknown> = {};
      if (args.promptIdea !== undefined) fields.prompt_idea = args.promptIdea;
      if (args.visualPrompt !== undefined) fields.visual_prompt = args.visualPrompt;
      if (args.dialogue !== undefined) fields.dialogue = args.dialogue;
      if (args.shotType !== undefined) fields.shot_type = args.shotType;
      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from('shots')
          .update(fields)
          .eq('id', shotId)
          .eq('project_id', projectId);
        if (error) throw new ToolError('shot_update_failed', error.message);
      }

      if (args.continuity !== undefined) {
        return unwrap(
          await invokeFunction(ctx, 'storyboard-session', {
            action: 'set_continuity',
            project_id: projectId,
            shot_id: shotId,
            continuity: args.continuity,
          }),
        );
      }

      return { shot_id: shotId, updated: Object.keys(fields), credit_cost: 0 };
    },
  },
  {
    name: 'get_continuity_graph',
    description: 'Read the shot continuity graph: typed edges (character / location / prop) between shots. Free (0 credits).',
    scope: 'read',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      await assertProjectOwned(ctx, projectId);
      return unwrap(await invokeFunction(ctx, 'storyboard-session', { action: 'graph', project_id: projectId }));
    },
  },
  {
    name: 'seedance_handoff',
    description:
      'Compile the Seedance reference packet for a project (prompt, negative, camera, duration, character refs, setting ref, style anchor, graph-resolved continuity frame). mode "review" (default) is free (0 credits) and stops before submitting. mode "auto" would spend credits and is currently refused because Seedance 2.5 has no verified catalog pricing.',
    scope: 'read',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        mode: { type: 'string', enum: ['review', 'auto'], default: 'review' },
        shotIds: { type: 'array', items: { type: 'string' } },
        negativePrompt: { type: 'string' },
        confirm: { type: 'boolean', description: 'Required for mode "auto" (which is currently disabled).' },
        idempotencyKey: { type: 'string' },
      },
      required: ['projectId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      await assertProjectOwned(ctx, projectId);
      const mode = args.mode === 'auto' ? 'auto' : 'review';
      // Auto mode submits, so it needs the generate scope on top of read.
      if (mode === 'auto') assertScope(ctx.auth, 'generate', 'seedance_handoff (mode: auto)');
      return unwrap(
        await invokeFunction(ctx, 'seedance-handoff', {
          project_id: projectId,
          mode,
          shot_ids: args.shotIds ?? [],
          negative_prompt: args.negativePrompt,
          confirm: args.confirm === true,
          idempotency_key: asString(args.idempotencyKey),
        }),
      );
    },
  },
  {
    name: 'generate_shot_image',
    description:
      'Generate the still frame for one shot. SPENDS CREDITS at the catalog price of the chosen model (default gmi/seedream-5.0-lite = 2 credits). Call with dryRun: true for a free cost preview, get explicit user approval of that exact number, then retry with confirm: true and an idempotencyKey. Returns { jobId } immediately; poll get_job.',
    scope: 'generate',
    spends: true,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        shotId: { type: 'string' },
        model: { type: 'string', description: `Catalog model id. Default ${DEFAULT_SHOT_IMAGE_MODEL}.` },
        dryRun: { type: 'boolean', description: 'Preview the cost without spending.' },
        confirm: { type: 'boolean', description: 'Must be true to spend; requires explicit user approval first.' },
        idempotencyKey: { type: 'string', description: 'Reusing a key returns the same job and bills once.' },
      },
      required: ['projectId', 'shotId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      const shotId = requireString(args, 'shotId');
      await assertProjectOwned(ctx, projectId);
      const model = asString(args.model) ?? DEFAULT_SHOT_IMAGE_MODEL;
      const quotedCredits = getCreditCostForModel(model, 'image');

      const gate = await spendGate({
        ctx,
        args,
        toolName: 'generate_shot_image',
        quotedCredits,
        quoteSource: `catalog:${model}`,
      });
      if (gate.dryRun) return { ...gate.preview, model, shot_id: shotId };

      const key = idempotencyKey(args, ['generate_shot_image', shotId, model]);
      const job = await startBilledJob({
        supabase: ctx.supabase,
        auth: ctx.auth,
        tool: 'generate_shot_image',
        resourceType: 'image',
        quotedCredits,
        idempotencyKey: key,
        projectId,
        request: { shot_id: shotId, model },
        run: async () => {
          const response = await invokeFunction(ctx, 'generate-shot-image', {
            shot_id: shotId,
            image_model: model,
            delegated_billing: true,
            request_id: key,
          });
          return unwrap(response);
        },
      });

      return {
        jobId: job.jobId,
        status: job.status,
        credits_charged: job.creditsQuoted,
        idempotent_replay: job.reused,
        model,
        deep_link: projectDeepLink(ctx, projectId),
      };
    },
  },
  {
    name: 'render_timeline',
    description:
      'Generate still frames for every shot in a project that has none. SPENDS CREDITS: per-shot catalog price × shot count. Always dryRun first — this is the most expensive tool in the plugin — then confirm the exact total with the user.',
    scope: 'generate',
    spends: true,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        model: { type: 'string' },
        dryRun: { type: 'boolean' },
        confirm: { type: 'boolean' },
        idempotencyKey: { type: 'string' },
      },
      required: ['projectId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      await assertProjectOwned(ctx, projectId);
      const model = asString(args.model) ?? DEFAULT_SHOT_IMAGE_MODEL;
      const perShot = getCreditCostForModel(model, 'image');

      const { data: shots } = await ctx.supabase
        .from('shots')
        .select('id,shot_number,image_url,visual_prompt')
        .eq('project_id', projectId)
        .order('shot_number');
      const pending = ((shots ?? []) as Array<Record<string, unknown>>).filter(
        (shot) => !shot.image_url && asString(shot.visual_prompt),
      );
      const quotedCredits = perShot * pending.length;

      if (pending.length === 0) {
        return { credit_cost: 0, shots_pending: 0, note: 'Every shot with a prompt already has an image.' };
      }

      const gate = await spendGate({
        ctx,
        args,
        toolName: 'render_timeline',
        quotedCredits,
        quoteSource: `catalog:${model} × ${pending.length} shots`,
      });
      if (gate.dryRun) {
        return { ...gate.preview, model, shots_pending: pending.length, credits_per_shot: perShot };
      }

      const key = idempotencyKey(args, ['render_timeline', projectId, String(pending.length)]);
      const job = await startBilledJob({
        supabase: ctx.supabase,
        auth: ctx.auth,
        tool: 'render_timeline',
        resourceType: 'image',
        quotedCredits,
        idempotencyKey: key,
        projectId,
        request: { model, shot_ids: pending.map((shot) => shot.id) },
        run: async () => {
          const results: Array<Record<string, unknown>> = [];
          for (const shot of pending) {
            const response = await invokeFunction(ctx, 'generate-shot-image', {
              shot_id: shot.id,
              image_model: model,
              delegated_billing: true,
              request_id: `${key}:${String(shot.id)}`,
            });
            results.push({ shot_id: shot.id, status: response.status });
          }
          return { shots: results };
        },
      });

      return {
        jobId: job.jobId,
        status: job.status,
        credits_charged: job.creditsQuoted,
        idempotent_replay: job.reused,
        shots_queued: pending.length,
        deep_link: projectDeepLink(ctx, projectId),
      };
    },
  },
  {
    name: 'export_video',
    description:
      'Assemble the project timeline into a final video (Director\'s Cut). SPENDS CREDITS at the catalog price for the export operation; if no catalog row is priced the call is refused rather than guessing. dryRun first, then confirm.',
    scope: 'generate',
    spends: true,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        dryRun: { type: 'boolean' },
        confirm: { type: 'boolean' },
        idempotencyKey: { type: 'string' },
        settings: { type: 'object', description: 'Optional export settings (resolution, fps).' },
      },
      required: ['projectId'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      await assertProjectOwned(ctx, projectId);
      const quote = await quoteCatalogOperation(ctx, EXPORT_CATALOG_IDS, {});

      const gate = await spendGate({
        ctx,
        args,
        toolName: 'export_video',
        quotedCredits: quote.credits,
        quoteSource: `catalog:${quote.modelId}`,
      });
      if (gate.dryRun) return { ...gate.preview, catalog_id: quote.modelId };

      const key = idempotencyKey(args, ['export_video', projectId]);
      const job = await startBilledJob({
        supabase: ctx.supabase,
        auth: ctx.auth,
        tool: 'export_video',
        resourceType: 'video',
        quotedCredits: quote.credits,
        idempotencyKey: key,
        projectId,
        request: { catalog_id: quote.modelId },
        run: async () => {
          await invokeFunction(ctx, 'director-cut', { action: 'sync', projectId, userId: ctx.auth.userId });
          const created = await invokeFunction(ctx, 'director-cut', {
            action: 'create',
            projectId,
            userId: ctx.auth.userId,
            settings: args.settings,
          });
          if (created.status >= 400) {
            throw new ToolError('export_failed', `Director's Cut export failed (${created.status}).`);
          }
          return (created.data ?? {}) as Record<string, unknown>;
        },
      });

      return {
        jobId: job.jobId,
        status: job.status,
        credits_charged: job.creditsQuoted,
        idempotent_replay: job.reused,
        catalog_id: quote.modelId,
        deep_link: projectDeepLink(ctx, projectId),
      };
    },
  },
  {
    name: 'run_studio_graph',
    description:
      'Execute a saved Studio compute graph node by node. SPENDS CREDITS per generating node at catalog prices, billed by the compute pipeline. Call with dryRun: true first for a free inventory of the nodes that would run and their maximum catalog credit cost, confirm that number with the user, then re-call with confirm: true. Requires a user session token (authToken) because graph execution runs under the user\'s row-level security context.',
    scope: 'generate',
    spends: true,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        authToken: { type: 'string', description: 'A user session JWT from the web app.' },
        dryRun: { type: 'boolean', description: 'Free node inventory and maximum cost; nothing executes.' },
        confirm: { type: 'boolean' },
      },
      required: ['projectId', 'authToken'],
    },
    handler: async (args, ctx) => {
      const projectId = requireString(args, 'projectId');
      const authToken = requireString(args, 'authToken');
      await assertProjectOwned(ctx, projectId);

      if (args.dryRun === true) {
        const { data: nodes } = await ctx.supabase
          .from('compute_nodes')
          .select('id,kind,data')
          .eq('project_id', projectId);
        const inventory = ((nodes ?? []) as Array<Record<string, unknown>>).map((node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const modelId = asString(data.modelId) ?? asString(data.model_id);
          let credits: number | null = null;
          if (modelId) {
            try {
              credits = getCreditCostForModel(modelId, asString(data.mediaType) ?? 'image');
            } catch {
              credits = null;
            }
          }
          return { node_id: node.id, kind: node.kind, model: modelId, credits };
        });
        const maxCredits = inventory.reduce((sum, node) => sum + (node.credits ?? 0), 0);
        const balance = await availableCredits(ctx);
        return {
          dryRun: true,
          credit_cost: 0,
          nodes: inventory,
          credits_quoted_max: maxCredits,
          credits_available: balance.available,
          unpriced_nodes: inventory.filter((node) => node.model && node.credits === null).map((node) => node.node_id),
          confirmation_prompt: `Running this graph will spend up to ${maxCredits} credits (you have ${balance.available}). Get explicit approval, then re-call run_studio_graph with confirm: true.`,
        };
      }

      if (args.confirm !== true) {
        throw new ToolError(
          'confirmation_required',
          'run_studio_graph spends credits for every generating node in the graph. Preview the graph with the user, get explicit approval, then retry with confirm: true.',
        );
      }
      const res = await fetch(`${ctx.supabaseUrl}/functions/v1/compute-execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          apikey: ctx.serviceRoleKey,
        },
        body: JSON.stringify({ project_id: projectId }),
      });
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        // keep raw text
      }
      if (res.status >= 400) throw new ToolError('compute_execute_failed', `compute-execute failed (${res.status}).`, { status: res.status });
      return { result: data, deep_link: projectDeepLink(ctx, projectId) };
    },
  },
  {
    name: 'get_job',
    description: 'Poll a job started by a spending tool: status, credits charged, result, or error. Free (0 credits).',
    scope: 'read',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
    },
    handler: async (args, ctx) => {
      const jobId = requireString(args, 'jobId');
      const { data } = await ctx.supabase
        .from('agent_jobs')
        .select('id,tool,status,credits_quoted,credits_charged,result,error,project_id,created_at,updated_at')
        .eq('id', jobId)
        .eq('user_id', ctx.auth.userId)
        .maybeSingle();
      if (!data) throw new ToolError('not_found', `Job ${jobId} was not found.`);
      return { ...data, credit_cost: 0 };
    },
  },
  {
    name: 'create_checkout_session',
    description:
      'Create a Stripe checkout URL so the user can buy credits or upgrade their plan. Free (0 credits) — it never charges anything itself and never changes a saved payment method.',
    scope: 'billing',
    spends: false,
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'string', enum: ['pro', 'enterprise'] },
        pack: { type: 'string', description: 'Credit pack id (alternative to plan).' },
      },
    },
    handler: async (args, ctx) => {
      const response = await invokeFunction(ctx, 'billing-checkout', { plan: args.plan, pack: args.pack });
      if (response.status >= 400) {
        throw new ToolError('checkout_unavailable', `billing-checkout failed (${response.status}).`);
      }
      return { ...(response.data as Record<string, unknown>), credit_cost: 0 };
    },
  },
];

export const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

export function toolListing(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = toolMap.get(name);
  if (!tool) throw new ToolError('unknown_tool', `Unknown tool: ${name}`);
  assertScope(ctx.auth, tool.scope, tool.name);
  return await tool.handler(args, ctx);
}

export { McpAuthError };
