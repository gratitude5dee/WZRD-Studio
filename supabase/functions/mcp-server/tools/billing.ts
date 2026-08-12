/**
 * Billing and meta tools: catalog, balance, checkout links, job polling, health.
 */
import { internalError } from '../errors.ts';
import { getJob } from '../jobs.ts';
import { PLUGIN_VERSION, commitSha } from '../version.ts';
import { unwrap } from './shared.ts';
import { readSchema, type ToolDefinition } from './types.ts';

export function buildBillingTools(toolCount: () => number): ToolDefinition[] {
  return [
    {
      name: 'list_models',
      description:
        'Use to pick a generation model: lists the WZRD catalog with provider, media type and credit cost. Free.',
      scope: 'read',
      inputSchema: readSchema({
        mediaType: { type: 'string', enum: ['text', 'image', 'video', 'audio'] },
        provider: { type: 'string', description: 'e.g. fal-ai, gmi, elevenlabs.' },
        search: { type: 'string', description: 'Case-insensitive name match.' },
      }),
      handler: async (ctx, args) => {
        let query = ctx.svc
          .from('ai_model_catalog')
          .select('id,name,provider,media_type,credits,pricing_text,description')
          .eq('enabled', true)
          .or('pricing->>editor_only.is.null,pricing->>editor_only.neq.true');

        if (typeof args.mediaType === 'string') query = query.eq('media_type', args.mediaType);
        if (typeof args.provider === 'string') query = query.eq('provider', args.provider);
        if (typeof args.search === 'string' && args.search) query = query.ilike('name', `%${args.search}%`);

        const { data, error } = await query.order('sort_rank', { ascending: true }).limit(200);
        if (error) {
          console.error('mcp-server: list_models failed', error.message);
          throw internalError('Could not load the model catalog.');
        }
        return { models: data ?? [] };
      },
    },
    {
      name: 'get_credits',
      description:
        'Use to check the credit balance and this token\'s remaining daily allowance before a generation. Free.',
      scope: 'read',
      inputSchema: readSchema({}),
      handler: async (ctx) => {
        const [{ data: credits, error }, guard] = await Promise.all([
          ctx.svc
            .from('user_credits')
            .select('total_credits,used_credits')
            .eq('user_id', ctx.identity.userId)
            .maybeSingle(),
          ctx.svc.rpc('wzrd_token_spend_guard', {
            p_token_id: ctx.identity.tokenId,
            p_credits: 0,
            p_dry_run: true,
          }),
        ]);

        if (error) {
          console.error('mcp-server: get_credits failed', error.message);
          throw internalError('Could not read the credit balance.');
        }

        const total = credits?.total_credits ?? 0;
        const used = credits?.used_credits ?? 0;
        const usage = (guard.data ?? {}) as { used?: number; cap?: number; resets_at?: string };

        return {
          available: Math.max(0, total - used),
          total,
          used,
          token: {
            name: ctx.identity.tokenName,
            scopes: ctx.identity.scopes,
            dailyUsed: usage.used ?? 0,
            dailyCap: usage.cap ?? null,
            dailyResetsAt: usage.resets_at ?? null,
          },
        };
      },
    },
    {
      name: 'create_checkout_session',
      description: 'Use to hand the user a Stripe link for a credit pack or plan upgrade. Free.',
      scope: 'billing',
      inputSchema: readSchema(
        {
          checkoutMode: { type: 'string', enum: ['pack', 'subscription'] },
          packCode: { type: 'string', description: 'Credit pack code (checkoutMode "pack").' },
          planCode: { type: 'string', description: 'Plan code (checkoutMode "subscription").' },
          interval: { type: 'string', enum: ['month', 'year'] },
          successUrl: { type: 'string' },
          cancelUrl: { type: 'string' },
        },
        ['checkoutMode'],
      ),
      handler: async (ctx, args) =>
        unwrap(
          await ctx.invoke('billing-checkout', {
            checkout_mode: args.checkoutMode,
            pack_code: args.packCode,
            plan_code: args.planCode,
            interval: args.interval,
            success_url: args.successUrl,
            cancel_url: args.cancelUrl,
          }),
          'billing-checkout',
        ),
    },
    {
      name: 'get_job',
      description:
        'Use to poll an async tool: returns status, progress and the final result once the job finishes. Free.',
      scope: 'read',
      inputSchema: readSchema({ jobId: { type: 'string' } }, ['jobId']),
      handler: async (ctx, args) => {
        const job = await getJob(ctx.svc, ctx.identity.userId, String(args.jobId));
        return {
          jobId: job.id,
          tool: job.tool,
          status: job.status,
          progress: job.progress ?? {},
          result: job.result ?? null,
          error: job.error ?? null,
          credits: job.credits ?? null,
          createdAt: job.created_at,
          completedAt: job.completed_at,
        };
      },
    },
    {
      name: 'health',
      description: 'Use to confirm the plugin is reachable and see which server version answered. Free.',
      scope: 'read',
      inputSchema: readSchema({}),
      handler: async () => ({
        ok: true,
        version: PLUGIN_VERSION,
        toolCount: toolCount(),
        commit: commitSha(),
      }),
    },
  ];
}
