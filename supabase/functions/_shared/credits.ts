import { inferFalMediaType, resolveFalModelOrFallback } from './falai-client.ts';

const DEFAULT_COSTS: Record<string, number> = {
  text: 1,
  image: 5,
  video: 20,
  audio: 8,
  generation: 5,
};

const MODEL_COST_OVERRIDES: Record<string, number> = {
  // Image — text-to-image
  'fal-ai/flux-pro/v2': 7,
  'fal-ai/flux-pro/v1.1': 9,
  'fal-ai/flux-pro/v2/flex': 6,
  'fal-ai/flux/dev': 5,
  'fal-ai/flux/schnell': 2,
  'fal-ai/nano-banana-pro': 7,
  'fal-ai/nano-banana-2': 5,
  'fal-ai/gpt-image-1-5': 8,
  'fal-ai/qwen-image-2/text-to-image': 5,
  'fal-ai/ideogram/v3': 5,
  'fal-ai/seedream-4-5': 6,
  'fal-ai/recraft/v3': 5,
  // Image — image-to-image
  'fal-ai/flux-pro/kontext': 8,
  'fal-ai/flux/kontext/dev': 6,
  'fal-ai/nano-banana-pro/edit': 8,
  'fal-ai/nano-banana-2/edit': 7,
  'fal-ai/gpt-image-1-5/edit': 4,
  'fal-ai/qwen-image-2/edit': 6,
  'fal-ai/seedream-5-lite/edit': 6,
  'fal-ai/grok-imagine/edit': 5,
  // Video — text-to-video
  'fal-ai/kling-video/v3/pro/text-to-video': 30,
  'fal-ai/kling-video/v3/omni': 25,
  'fal-ai/kling-video/o3/standard/text-to-video': 22,
  'fal-ai/kling-video/o3/pro/text-to-video': 32,
  'fal-ai/kling-video/v2.5-turbo/pro/text-to-video': 22,
  'fal-ai/kling-video/o1/text-to-video': 25,
  'fal-ai/veo3.1/text-to-video': 40,
  'fal-ai/veo3.1/fast/text-to-video': 25,
  'fal-ai/sora/pro/text-to-video': 50,
  'fal-ai/sora-2/text-to-video': 35,
  'fal-ai/seedance/v2/text-to-video': 30,
  'fal-ai/bytedance/seedance/v1/pro/text-to-video': 28,
  'fal-ai/minimax/hailuo-2.3/pro': 28,
  'fal-ai/wan/v2.5/text-to-video': 15,
  'fal-ai/ltx-video/v2-19b': 12,
  'fal-ai/pixverse/v6': 18,
  'fal-ai/higgsfield/dop': 20,
  // Video — image-to-video
  'fal-ai/kling-video/v3/pro/image-to-video': 30,
  'fal-ai/kling-video/o3/standard/image-to-video': 24,
  'fal-ai/veo3.1/image-to-video': 40,
  'fal-ai/veo3.1/fast/image-to-video': 25,
  'fal-ai/sora/pro/image-to-video': 50,
  'fal-ai/seedance/v2/image-to-video': 30,
  'fal-ai/bytedance/seedance/v1/pro/image-to-video': 28,
  // Video — special
  'fal-ai/kling-video/v3/motion-control': 30,
  'fal-ai/kling-video/o1/edit': 28,
  'fal-ai/kling-video/o3/standard/video-extend': 26,
  // Lip-sync models
  'fal-ai/kling-video/lipsync/audio-to-video': 14,
  'fal-ai/kling-video/lipsync/text-to-video': 14,
  'fal-ai/sadtalker': 12,
  'fal-ai/liveportrait': 15,
  'fal-ai/latentsync': 14,
  'fal-ai/hallo2': 16,
  'fal-ai/sonic': 18,
  // Legacy overrides
  'fal-ai/sora-2/text-to-video/pro': 50,
  'fal-ai/ltx-2-19b/text-to-video': 18,
  'fal-ai/bytedance/seedance/v1/lite/text-to-video': 20,
  'fal-ai/stable-diffusion-v35-large': 4,
  'fal-ai/recraft-v3': 5,
  'fal-ai/aura-flow': 3,
  'fal-ai/hidream-i1-full': 6,
  'fal-ai/omnigen-v1': 5,
  'fal-ai/flux/dev/image-to-image': 6,
  'fal-ai/flux-pro/v1.1-ultra/redux': 9,
  'fal-ai/iclight-v2': 5,
  'fal-ai/creative-upscaler': 4,
  'fal-ai/clarity-upscaler': 4,
  'fal-ai/minimax/video-01-live': 25,
  'fal-ai/minimax/video-01/image-to-video': 28,
  'fal-ai/hunyuan-video': 22,
  'fal-ai/wan/v2.1/1.3b/text-to-video': 18,
  'fal-ai/wan/v2.1/1.3b/image-to-video': 20,
  'fal-ai/cogvideox-5b': 20,
  'fal-ai/vidu/v2.5/text-to-video': 24,
  'fal-ai/vidu/v2.5/image-to-video': 26,
  'fal-ai/stable-video': 16,
  'fal-ai/qwen-image-2/pro/text-to-image': 7,
};

// GMI Cloud per-call costs in credits (1 credit ≈ $0.01).
// Mirrors src/lib/studio-model-constants.ts so server enforcement matches UI display.
const GMI_MODEL_COSTS: Record<string, number> = {
  // Image
  'gmi/seedream-5.0': 4,
  'gmi/seedream-5.0-lite': 2,
  'gmi/gemini-3.1-flash-image-preview': 3,
  // Video
  'gmi/kling-v3-omni': 28,
  'gmi/wan2.6-t2v': 18,
  'gmi/minimax-hailuo-2.3': 22,
  'gmi/pixverse-v5-t2v': 18,
  'gmi/veo3': 40,
  'gmi/veo3-fast': 25,
  'gmi/luma-ray2': 30,
  'gmi/kling-i2v-v2.1-master': 28,
  'gmi/kling-t2v-v2.1-master': 28,
  'gmi/ltx-fast-i2v': 5,
  'gmi/ltx-pro-a2v': 12,
  'gmi/kling-create-element': 6,
  // Text
  'gmi/gemini-3.1-flash-lite': 1,
  'gmi/deepseek-r1': 2,
  'gmi/openai-o4-mini': 2,
  // Audio
  'gmi/minime-talks-workflow': 8,
  'gmi/elevenlabs-tts-v3': 6,
  'gmi/elevenlabs-tts-multilingual-v2': 6,
  'gmi/inworld-tts-1-5-max': 5,
};

const WORKFLOW_COSTS: Record<string, number> = {
  'generate-storylines': 3,
  'gen-shots': 1,
};

const TOP_UP_URL = '/settings/billing';
const UPGRADE_URL = '/settings/billing#plans';

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function safeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export class InsufficientCreditsError extends Error {
  readonly code = 'insufficient_credits';
  readonly required: number;
  readonly available: number;
  readonly topUpUrl: string;
  readonly upgradeUrl: string;

  constructor(required: number, available: number, topUpUrl = TOP_UP_URL, upgradeUrl = UPGRADE_URL) {
    super('Insufficient credits');
    this.required = required;
    this.available = available;
    this.topUpUrl = topUpUrl;
    this.upgradeUrl = upgradeUrl;
  }
}

/**
 * Raised when an agent PAT trips its own guard rails (daily credit cap or
 * request rate limit) before any credits are held.
 */
export class TokenSpendLimitError extends Error {
  readonly code: 'daily_cap' | 'rate_limited';
  readonly used?: number;
  readonly cap?: number;
  readonly limit?: number;
  readonly window?: string;
  readonly resetsAt?: string;

  constructor(input: {
    code: 'daily_cap' | 'rate_limited';
    used?: number;
    cap?: number;
    limit?: number;
    window?: string;
    resetsAt?: string;
  }) {
    super(
      input.code === 'daily_cap'
        ? 'Token daily credit cap reached'
        : 'Token rate limit exceeded',
    );
    this.name = 'TokenSpendLimitError';
    this.code = input.code;
    this.used = input.used;
    this.cap = input.cap;
    this.limit = input.limit;
    this.window = input.window;
    this.resetsAt = input.resetsAt;
  }
}

export class UnpricedModelError extends Error {
  readonly code = 'unpriced_model';

  constructor(message = "This model isn't priced yet and cannot be generated.") {
    super(message);
    this.name = 'UnpricedModelError';
  }
}

export function getCatalogCreditCost(
  pricing: Record<string, unknown> | null | undefined,
  credits?: number,
  pricingText?: string,
  inputs: Record<string, unknown> = {},
): number {
  const pricingCandidates = [
    pricing?.editor_billing &&
    typeof pricing.editor_billing === 'object' &&
    !Array.isArray(pricing.editor_billing)
      ? pricing.editor_billing as Record<string, unknown>
      : null,
    pricing,
  ];

  for (const candidate of pricingCandidates) {
    const unit = typeof candidate?.unit === 'string' ? candidate.unit : '';
    if (!unit) continue;
    const usd = typeof candidate?.usd === 'number'
      ? candidate.usd
      : Number(candidate?.usd);
    if (!Number.isFinite(usd) || usd <= 0) continue;

    if (unit === 'per_request') {
      return Math.max(1, Math.ceil(usd * 100));
    }

    const quantity = getCatalogRateQuantity(unit, inputs);
    if (quantity === undefined) {
      throw new UnpricedModelError(
        'This model cannot be billed because the request quantity could not be determined.'
      );
    }
    return Math.max(1, Math.ceil(usd * quantity * 100));
  }

  if (typeof credits === 'number' && credits > 0 && pricingText !== '0 credits') {
    return Math.max(1, Math.ceil(credits));
  }

  throw new UnpricedModelError();
}

function getFiniteInputNumber(inputs: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = typeof inputs[key] === 'number' ? inputs[key] : Number(inputs[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function getFiniteDurationNumber(inputs: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = inputs[key];
    if (typeof raw === 'number') {
      if (Number.isFinite(raw) && raw > 0) return raw;
      continue;
    }
    if (typeof raw !== 'string') continue;

    const match = raw.match(/^\s*((?:\d+(?:\.\d*)?|\.\d+))\s*(?:s|sec|seconds)?\s*$/i);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

export function getCatalogRateQuantity(
  unit: string,
  inputs: Record<string, unknown>,
): number | undefined {
  switch (unit) {
    case 'per_image':
      return getFiniteInputNumber(inputs, ['max_images', 'num_images']);
    case 'per_second':
    case 'per_minute': {
      const duration = getFiniteDurationNumber(inputs, ['duration', 'duration_seconds', 'durationSeconds']);
      if (duration !== undefined) return unit === 'per_minute' ? duration / 60 : duration;

      const frames = getFiniteInputNumber(inputs, ['num_frames']);
      const fps = getFiniteInputNumber(inputs, ['fps']);
      if (frames !== undefined && fps !== undefined) {
        const seconds = frames / fps;
        return unit === 'per_minute' ? seconds / 60 : seconds;
      }
      return undefined;
    }
    case 'per_1k_characters': {
      const text = typeof inputs.text === 'string' ? inputs.text : undefined;
      return text && text.length > 0 ? text.length / 1000 : undefined;
    }
    case 'per_megapixel': {
      const width = getFiniteInputNumber(inputs, ['width', 'output_width']);
      const height = getFiniteInputNumber(inputs, ['height', 'output_height']);
      return width !== undefined && height !== undefined ? (width * height) / 1_000_000 : undefined;
    }
    default:
      return undefined;
  }
}

export function getGenerationCreditCost(input: {
  pricingMode?: 'catalog-strict';
  catalogModel?: {
    pricing?: Record<string, unknown> | null;
    credits?: number;
    pricingText?: string;
  } | null;
  inputs?: Record<string, unknown>;
  modelId: string | null | undefined;
  resourceType: string;
}): number {
  if (input.pricingMode === 'catalog-strict') {
    return getCatalogCreditCost(
      input.catalogModel?.pricing,
      input.catalogModel?.credits,
      input.catalogModel?.pricingText,
      input.inputs,
    );
  }
  return getCreditCostForModel(input.modelId, input.resourceType);
}

export function getGenerationReservationAmount(
  primaryCost: number,
  fallbackCost?: number,
): number {
  return fallbackCost === undefined
    ? primaryCost
    : Math.max(primaryCost, fallbackCost);
}

interface CreditSupabaseError {
  message?: string;
}

interface CreditSupabaseClient {
  // PromiseLike, not Promise: supabase-js returns an awaitable query builder.
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: CreditSupabaseError | null }>;
}

export function shouldSkipCreditBilling(headers: Headers): boolean {
  // Browser callers can set arbitrary CORS-allowed headers, so credit billing
  // must not be skipped from request metadata. Composite server flows should
  // reserve once at the parent operation instead of bypassing child calls.
  void headers;
  return false;
}

export function buildCreditIdempotencyKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => String(part ?? ''))
    .filter((part) => part.length > 0)
    .join(':');
}

export function getCreditCostForModel(modelId: string | null | undefined, resourceType: string): number {
  const normalizedResource = resourceType.toLowerCase();
  const requestedModel = typeof modelId === 'string' ? modelId.trim() : '';

  // GMI Cloud models — charge based on per-call USD cost (1 credit ≈ $0.01)
  if (requestedModel.startsWith('gmi/')) {
    const gmiCost = GMI_MODEL_COSTS[requestedModel];
    if (typeof gmiCost === 'number') {
      return Math.max(1, Math.ceil(gmiCost));
    }
    // Fallback by media type when model not in table
    const fallback = normalizedResource === 'video' ? 20
      : normalizedResource === 'audio' ? 8
      : normalizedResource === 'text' ? 1
      : 5;
    return fallback;
  }

  if (!requestedModel) {
    return Math.max(1, Math.ceil(DEFAULT_COSTS[normalizedResource] ?? DEFAULT_COSTS.generation));
  }

  const resolved = resolveFalModelOrFallback(requestedModel, {
    mediaTypeHint: inferFalMediaType(requestedModel),
    uiGroup: 'generation',
  });

  const byModel = MODEL_COST_OVERRIDES[resolved.model.id] ?? MODEL_COST_OVERRIDES[requestedModel];
  if (typeof byModel === 'number') {
    return Math.max(1, Math.ceil(byModel));
  }

  const inferredMedia = resolved.model.media_type;
  return Math.max(
    1,
    Math.ceil(DEFAULT_COSTS[inferredMedia] ?? DEFAULT_COSTS[normalizedResource] ?? DEFAULT_COSTS.generation),
  );
}

export function getWorkflowCreditCost(workflow: 'generate-storylines' | 'gen-shots', units = 1): number {
  const base = WORKFLOW_COSTS[workflow] ?? 1;
  const multiplier = Math.max(1, Math.ceil(units));
  return Math.max(1, Math.ceil(base * multiplier));
}

interface ReserveCreditsInput {
  supabase: CreditSupabaseClient;
  userId: string;
  resourceType: string;
  requestedAmount: number;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  skipBilling?: boolean;
  /** Agent PAT the spend is attributed to, when the caller is the MCP server. */
  tokenId?: string;
}

interface CreditReserveResult {
  holdId: string | null;
  requestedAmount: number;
  availableAfter: number;
  skipped: boolean;
}

function parseRpcPayload(data: unknown): Record<string, unknown> {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return safeJson(parsed);
    } catch {
      return {};
    }
  }
  return safeJson(data);
}

/**
 * Enforce a PAT's rate limits and daily credit cap.
 *
 * Runs before any hold exists so a capped token never reserves credits, and
 * counts the request itself even when `credits` is 0 (a read-only tool call
 * still consumes rate-limit budget).
 */
export async function enforceTokenSpendGuard(input: {
  supabase: CreditSupabaseClient;
  tokenId: string;
  credits?: number;
  dryRun?: boolean;
  /** Set false when the request was already counted earlier in the same call. */
  countRequest?: boolean;
}): Promise<{ used: number; cap: number; resetsAt: string | null }> {
  const { data, error } = await input.supabase.rpc('wzrd_token_spend_guard', {
    p_token_id: input.tokenId,
    p_credits: Math.max(0, Math.ceil(input.credits ?? 0)),
    p_dry_run: input.dryRun === true,
    p_count_request: input.countRequest !== false,
  });

  if (error) {
    throw new Error(`Token spend guard failed: ${error.message || 'unknown error'}`);
  }

  const payload = parseRpcPayload(data);
  const resetsAt = typeof payload.resets_at === 'string' ? payload.resets_at : null;

  if (payload.allowed !== true) {
    const code = typeof payload.code === 'string' ? payload.code : 'rate_limited';
    if (code === 'daily_cap') {
      throw new TokenSpendLimitError({
        code: 'daily_cap',
        used: asNumber(payload.used, 0),
        cap: asNumber(payload.cap, 0),
        resetsAt: resetsAt ?? undefined,
      });
    }
    throw new TokenSpendLimitError({
      code: 'rate_limited',
      limit: asNumber(payload.limit, 0),
      window: typeof payload.window === 'string' ? payload.window : undefined,
      resetsAt: resetsAt ?? undefined,
    });
  }

  return {
    used: asNumber(payload.used, 0),
    cap: asNumber(payload.cap, 0),
    resetsAt,
  };
}

/** Return unspent daily headroom to a PAT after a released reservation. */
export async function releaseTokenSpend(input: {
  supabase: CreditSupabaseClient;
  tokenId: string;
  credits: number;
}): Promise<void> {
  const credits = Math.max(0, Math.ceil(input.credits));
  if (credits === 0) return;

  const { error } = await input.supabase.rpc('wzrd_token_release_spend', {
    p_token_id: input.tokenId,
    p_credits: credits,
  });
  if (error) {
    console.error('releaseTokenSpend: release failed', error.message);
  }
}

export async function reserveCredits(input: ReserveCreditsInput): Promise<CreditReserveResult> {
  const requestedAmount = Math.max(1, Math.ceil(input.requestedAmount));

  // Guard rails come first: a capped or rate-limited token must never create a
  // hold, so this runs before credits_reserve.
  if (input.tokenId) {
    await enforceTokenSpendGuard({
      supabase: input.supabase,
      tokenId: input.tokenId,
      credits: requestedAmount,
      // A `tokenId` only reaches here on a call the MCP server already counted
      // against the token's rate limit, so this pass prices credits only.
      countRequest: false,
    });
  }

  // From here on the token's daily headroom is already charged, so every exit
  // that leaves no hold behind has to give it back.
  const refundGuard = async () => {
    if (!input.tokenId) return;
    await releaseTokenSpend({
      supabase: input.supabase,
      tokenId: input.tokenId,
      credits: requestedAmount,
    });
  };

  const { data, error } = await input.supabase.rpc('credits_reserve', {
    resource_type: input.resourceType,
    requested_amount: requestedAmount,
    reference_type: input.referenceType,
    reference_id: input.referenceId,
    idempotency_key: input.idempotencyKey,
    metadata: {
      ...(input.metadata || {}),
      user_id: input.userId,
      ...(input.tokenId ? { token_id: input.tokenId } : {}),
    },
  });

  if (error) {
    await refundGuard();
    const msg = error.message || '';
    if (msg.includes('Insufficient credits')) {
      const match = msg.match(/available=([0-9.]+)/);
      const available = match ? Number(match[1]) : 0;
      throw new InsufficientCreditsError(requestedAmount, available);
    }
    if (msg.includes('No credit record found') || msg.includes('Not authenticated')) {
      throw new InsufficientCreditsError(requestedAmount, 0);
    }
    throw new Error(`Credit reservation failed: ${msg}`);
  }

  const payload = parseRpcPayload(data);
  const success = payload.success === true;
  if (!success) {
    await refundGuard();
    const code = typeof payload.code === 'string' ? payload.code : 'credit_reservation_failed';
    if (code === 'insufficient_credits') {
      throw new InsufficientCreditsError(
        requestedAmount,
        asNumber(payload.available, 0),
        typeof payload.top_up_url === 'string' ? payload.top_up_url : TOP_UP_URL,
        typeof payload.upgrade_url === 'string' ? payload.upgrade_url : UPGRADE_URL,
      );
    }
    throw new Error(`Credit reservation failed: ${code}`);
  }

  const holdId = typeof payload.hold_id === 'string' ? payload.hold_id : null;
  const availableAfter = asNumber(payload.available_after, 0);

  return {
    holdId,
    requestedAmount,
    availableAfter,
    skipped: false,
  };
}

interface CreditSettleInput {
  supabase: CreditSupabaseClient;
  holdId: string | null;
  amount?: number;
  metadata?: Record<string, unknown>;
  reason?: string;
  skipped?: boolean;
  userId?: string;
  /** Agent PAT the spend is attributed to, when the caller is the MCP server. */
  tokenId?: string;
}

export async function commitCredits(input: CreditSettleInput): Promise<void> {
  if (input.skipped || !input.holdId) return;

  const { data, error } = await input.supabase.rpc('credits_commit', {
    hold_id: input.holdId,
    actual_amount: input.amount ?? null,
    metadata: {
      ...(input.metadata || {}),
      ...(input.tokenId ? { token_id: input.tokenId } : {}),
    },
  });

  if (error) {
    throw new Error(`Credit commit failed: ${error.message || 'unknown error'}`);
  }

  const payload = parseRpcPayload(data);
  if (payload.success === false) {
    throw new Error(`Credit commit failed: ${String(payload.code || 'unknown_error')}`);
  }

  // The daily headroom was charged for the whole reservation, so a commit that
  // settles for less gives the difference back. The reservation is read from the
  // hold rather than passed in, so a caller cannot forget to reconcile.
  if (input.tokenId && typeof input.amount === 'number') {
    const { error: reconcileError } = await input.supabase.rpc('wzrd_token_commit_reconcile', {
      p_token_id: input.tokenId,
      p_hold_id: input.holdId,
      p_actual: input.amount,
    });
    if (reconcileError) {
      console.error('commitCredits: token headroom reconcile failed', reconcileError.message);
    }
  }
}

export async function releaseCredits(input: CreditSettleInput): Promise<void> {
  if (input.skipped || !input.holdId) return;

  const { data, error } = await input.supabase.rpc('credits_release', {
    hold_id: input.holdId,
    reason: input.reason || 'operation_failed',
    metadata: {
      ...(input.metadata || {}),
      ...(input.userId ? { user_id: input.userId } : {}),
      ...(input.tokenId ? { token_id: input.tokenId } : {}),
    },
  });

  if (error) {
    console.error('releaseCredits: release failed', error.message);
    return;
  }

  const payload = parseRpcPayload(data);
  if (payload.success === false) {
    console.error('releaseCredits: release failed', String(payload.code || 'unknown_error'));
    return;
  }

  // Only give the daily headroom back once the hold is actually gone, otherwise
  // the token could start work the account's held credits cannot pay for.
  if (input.tokenId && typeof input.amount === 'number') {
    await releaseTokenSpend({
      supabase: input.supabase,
      tokenId: input.tokenId,
      credits: input.amount,
    });
  }
}

export function insufficientCreditsResponse(error: InsufficientCreditsError, extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: 'Insufficient credits',
      code: error.code,
      required: error.required,
      available: error.available,
      top_up_url: error.topUpUrl,
      upgrade_url: error.upgradeUrl,
    }),
    {
      status: 402,
      headers: { ...extraHeaders, 'Content-Type': 'application/json' },
    },
  );
}
