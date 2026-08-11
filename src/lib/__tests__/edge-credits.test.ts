import { describe, expect, it, vi } from 'vitest';

import {
  getCatalogCreditCost,
  getCreditCostForModel,
  getGenerationCreditCost,
  getGenerationReservationAmount,
  InsufficientCreditsError,
  reserveCredits,
  shouldSkipCreditBilling,
  UnpricedModelError,
} from '../../../supabase/functions/_shared/credits.ts';
import {
  getDefaultFalModelForMedia,
  inferFalMediaType,
  resolveFalModelOrFallback,
} from '../../../supabase/functions/_shared/falai-client.ts';
import {
  assertStrictFalModelResolution,
  strictModelResolutionResponse,
  StrictModelResolutionError,
} from '../../../supabase/functions/_shared/fal-stream-strict.ts';

describe('edge credits shared helper', () => {
  it.each([
    'fal-ai/chatterbox/text-to-speech',
    'fal-ai/chatterbox/text-to-speech/turbo',
    'fal-ai/elevenlabs/tts/eleven-v3',
    'fal-ai/qwen-3-tts/text-to-speech/1.7b',
  ])('resolves %s directly without fallback', (modelId) => {
    const resolution = resolveFalModelOrFallback(modelId, {
      mediaTypeHint: inferFalMediaType(modelId),
      uiGroup: 'generation',
    });

    expect(resolution.model.id).toBe(modelId);
    expect(resolution.fallbackUsed).toBe(false);
  });

  it.each([
    'fal-ai/bytedance/seedream/v3/text-to-image',
    'fal-ai/bytedance/seedream/v4/text-to-image',
    'fal-ai/bytedance/seedream/v4.5/text-to-image',
    'fal-ai/flux-2-flex',
    'fal-ai/imagen4/preview/ultra',
    'fal-ai/nano-banana',
    'openai/gpt-image-2',
    'fal-ai/gpt-image-1.5',
    'fal-ai/wan/v2.7/text-to-image',
    'fal-ai/wan/v2.7/pro/text-to-image',
    'fal-ai/wan/v2.7/edit',
    'fal-ai/wan/v2.7/pro/edit',
    'fal-ai/qwen-image',
    'fal-ai/reve/text-to-image',
    'fal-ai/z-image/turbo',
    'fal-ai/phota',
  ])('resolves editor image endpoint %s directly without fallback', (modelId) => {
    const resolution = resolveFalModelOrFallback(modelId, {
      mediaTypeHint: inferFalMediaType(modelId),
      uiGroup: 'generation',
    });

    expect(resolution.model.id).toBe(modelId);
    expect(resolution.fallbackUsed).toBe(false);
  });

  it('prices a canonical image model from its image count in strict mode', () => {
    expect(getGenerationCreditCost({
      pricingMode: 'catalog-strict',
      catalogModel: {
        pricing: { unit: 'per_image', usd: 0.06 },
        pricingText: '$0.06 / per image USD',
      },
      modelId: 'fal-ai/qwen-image',
      resourceType: 'image',
      inputs: { prompt: 'a fox', num_images: 1 },
    })).toBe(6);
  });

  it('keeps the explicit non-strict audio default despite generation TTS entries', () => {
    expect(getDefaultFalModelForMedia('audio', 'generation').id)
      .toBe('fal-ai/ffmpeg-api/merge-audios');
    expect(getDefaultFalModelForMedia('image', 'generation').id)
      .toBe('fal-ai/flux/schnell');
    expect(getDefaultFalModelForMedia('video', 'generation').id)
      .toBe('fal-ai/kling-video/v3/pro/image-to-video');
  });

  it('rejects unknown models before strict Fal execution can substitute a default', () => {
    const resolution = resolveFalModelOrFallback('fal-ai/unknown-tts', {
      mediaTypeHint: 'audio',
      uiGroup: 'generation',
    });

    expect(() => assertStrictFalModelResolution('fal-ai/unknown-tts', resolution))
      .toThrow('catalog-strict rejected model substitution');
    expect(() => assertStrictFalModelResolution('fal-ai/unknown-tts', resolution))
      .toThrow('unknown_model:fal-ai/unknown-tts');
  });

  it('returns a 400 response with a code for strict model substitution refusal', async () => {
    const error = new StrictModelResolutionError(
      'fal-ai/unknown-tts',
      'fal-ai/ffmpeg-api/merge-audios',
      'unknown_model:fal-ai/unknown-tts',
    );
    const response = strictModelResolutionResponse(error, {
      'Access-Control-Allow-Origin': '*',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'catalog-strict rejected model substitution: requested "fal-ai/unknown-tts" resolved to "fal-ai/ffmpeg-api/merge-audios" (unknown_model:fal-ai/unknown-tts)',
      code: 'strict_model_resolution',
    });
  });

  it('prices a canonical TTS model from its text quantity in strict mode', () => {
    expect(getGenerationCreditCost({
      pricingMode: 'catalog-strict',
      catalogModel: {
        pricing: { unit: 'per_1k_characters', usd: 0.025 },
        pricingText: '$0.025 / per 1k characters USD',
      },
      modelId: 'fal-ai/chatterbox/text-to-speech',
      resourceType: 'audio',
      inputs: { text: 'a'.repeat(2000) },
    })).toBe(5);
  });

  it('never lets request headers bypass billing', () => {
    const headers = new Headers({ 'x-credit-billing': 'upstream' });
    expect(shouldSkipCreditBilling(headers)).toBe(false);
  });

  it('keeps legacy billing when the catalog row is absent', () => {
    expect(getGenerationCreditCost({
      modelId: 'gmi/unknown-free-model',
      resourceType: 'text',
    })).toBe(getCreditCostForModel('gmi/unknown-free-model', 'text'));
  });

  it('only applies the strict guard when the call opts into catalog pricing', () => {
    expect(() => getGenerationCreditCost({
      pricingMode: 'catalog-strict',
      catalogModel: { pricing: {} },
      modelId: 'gmi/unknown-free-model',
      resourceType: 'text',
    })).toThrow(UnpricedModelError);
  });

  it('refuses an unpriced catalog model', () => {
    expect(() => getCatalogCreditCost({})).toThrowError(UnpricedModelError);
    expect(() => getCatalogCreditCost({})).toThrow(
      "This model isn't priced yet and cannot be generated."
    );
  });

  it('accepts a catalog row priced only by its credits column', () => {
    expect(getCatalogCreditCost({}, 8, '$0.08 / images USD (partner)')).toBe(8);
    expect(getGenerationCreditCost({
      pricingMode: 'catalog-strict',
      catalogModel: {
        pricing: { raw: '2 credits', credits: 2 },
        credits: 2,
        pricingText: '2 credits',
      },
      modelId: 'fal-ai/flux/schnell',
      resourceType: 'image',
    })).toBe(2);
  });

  it('still refuses the known zero-credit placeholder rows', () => {
    expect(() => getCatalogCreditCost({}, 1, '0 credits')).toThrowError(UnpricedModelError);
  });

  it('computes per-image rates from the merged payload', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_image', usd: 0.04 },
      undefined,
      undefined,
      { num_images: 3 },
    )).toBe(12);
  });

  it('computes per-image rates from max_images', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_image', usd: 0.05 },
      undefined,
      undefined,
      { max_images: 2 },
    )).toBe(10);
  });

  it('prefers max_images when both image count fields are present', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_image', usd: 0.05 },
      undefined,
      undefined,
      { max_images: 2, num_images: 5 },
    )).toBe(10);
  });

  it('computes per-second rates from duration_seconds', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_second', usd: 0.4 },
      undefined,
      undefined,
      { duration_seconds: 2.5 },
    )).toBe(100);
  });

  it('computes per-second rates from suffixed duration strings', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_second', usd: 0.4 },
      undefined,
      undefined,
      { duration: '8s' },
    )).toBe(320);
    expect(getCatalogCreditCost(
      { unit: 'per_second', usd: 0.4 },
      undefined,
      undefined,
      { duration: '5s' },
    )).toBe(200);
    expect(getCatalogCreditCost(
      { unit: 'per_second', usd: 0.4 },
      undefined,
      undefined,
      { duration: '4.5s' },
    )).toBe(180);
  });

  it('keeps numeric duration quantities working', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_second', usd: 0.4 },
      undefined,
      undefined,
      { duration: 2.5 },
    )).toBe(100);
  });

  it('refuses junk duration strings', () => {
    expect(() => getCatalogCreditCost(
      { unit: 'per_second', usd: 0.4 },
      undefined,
      undefined,
      { duration: 'eight seconds' },
    )).toThrow('request quantity could not be determined');
  });

  it('does not parse suffixed strings for non-duration quantities', () => {
    expect(() => getCatalogCreditCost(
      { unit: 'per_image', usd: 0.05 },
      undefined,
      undefined,
      { num_images: '8s' },
    )).toThrow('request quantity could not be determined');
  });

  it('computes per-minute rates from duration in seconds', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_minute', usd: 0.6 },
      undefined,
      undefined,
      { duration: 90 },
    )).toBe(90);
  });

  it('computes per-second rates from frame count and fps', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_second', usd: 0.4 },
      undefined,
      undefined,
      { num_frames: 60, fps: 30 },
    )).toBe(80);
  });

  it('computes per-1k-character rates from text', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_1k_characters', usd: 0.02 },
      undefined,
      undefined,
      { text: 'a'.repeat(1500) },
    )).toBe(3);
  });

  it('does not infer TTS quantity from a prompt field', () => {
    expect(() => getCatalogCreditCost(
      { unit: 'per_1k_characters', usd: 0.02 },
      undefined,
      undefined,
      { prompt: 'not a TTS payload' },
    )).toThrow('request quantity could not be determined');
  });

  it('computes per-megapixel rates from explicit dimensions', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_megapixel', usd: 0.1 },
      undefined,
      undefined,
      { width: 1000, height: 1000 },
    )).toBe(10);
  });

  it('refuses rate-priced models when quantity is indeterminate', () => {
    expect(() => getCatalogCreditCost(
      { unit: 'per_second', usd: 0.4 },
      undefined,
      undefined,
      {},
    )).toThrow(
      'request quantity could not be determined'
    );
  });

  it('floors a tiny rate-priced request at one credit', () => {
    expect(getCatalogCreditCost(
      { unit: 'per_second', usd: 0.000001 },
      undefined,
      undefined,
      { duration: 0.001 },
    )).toBe(1);
  });

  it('uses the same computed amount for reservation and commit', () => {
    const cost = getGenerationCreditCost({
      pricingMode: 'catalog-strict',
      catalogModel: {
        pricing: { unit: 'per_second', usd: 0.4 },
      },
      inputs: { duration: 2.5 },
      modelId: 'fal-ai/veo3.1/extend-video',
      resourceType: 'video',
    });

    expect(cost).toBe(100);
    expect(getGenerationReservationAmount(cost)).toBe(cost);
  });

  it('converts a per-request catalog price to integer credits', () => {
    expect(getCatalogCreditCost({ unit: 'per_request', usd: 0.2 })).toBe(20);
  });

  it('floors a sub-cent per-request catalog price at one credit', () => {
    expect(getCatalogCreditCost({ unit: 'per_request', usd: 0.000001 })).toBe(1);
  });

  it('uses the resolved model price for an alias request', () => {
    expect(getGenerationCreditCost({
      pricingMode: 'catalog-strict',
      catalogModel: { pricing: { unit: 'per_request', usd: 0.08 } },
      modelId: 'fal-ai/nano-banana-2',
      resourceType: 'image',
    })).toBe(8);
  });

  it('does not require an unpriced fallback to reserve a priced primary', () => {
    const primaryCost = getGenerationCreditCost({
      pricingMode: 'catalog-strict',
      catalogModel: { pricing: { unit: 'per_request', usd: 0.2 } },
      modelId: 'fal-ai/nano-banana-2',
      resourceType: 'image',
    });
    expect(primaryCost).toBe(20);
    expect(() => getGenerationCreditCost({
      pricingMode: 'catalog-strict',
      catalogModel: { pricing: {} },
      modelId: 'fal-ai/unknown-fallback',
      resourceType: 'image',
    })).toThrowError(UnpricedModelError);
  });

  it('reserves the higher priced fallback when it is eligible', () => {
    expect(getGenerationReservationAmount(8, 20)).toBe(20);
  });

  it('leaves an unpriced fallback ineligible without reducing the primary hold', () => {
    expect(getGenerationReservationAmount(8)).toBe(8);
  });

  it('reserves through the ledger RPC instead of legacy deduct_credits', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        hold_id: 'hold-1',
        available_after: 95,
      },
      error: null,
    });

    const result = await reserveCredits({
      supabase: { rpc },
      userId: 'user-1',
      resourceType: 'image',
      requestedAmount: 5,
      referenceType: 'test',
      referenceId: 'ref-1',
      idempotencyKey: 'key-1',
      metadata: { source: 'test' },
    });

    expect(rpc).toHaveBeenCalledWith('credits_reserve', expect.objectContaining({
      resource_type: 'image',
      requested_amount: 5,
      idempotency_key: 'key-1',
    }));
    expect(rpc).not.toHaveBeenCalledWith('deduct_credits', expect.anything());
    expect(result.holdId).toBe('hold-1');
    expect(result.availableAfter).toBe(95);
  });

  it('turns insufficient reserve responses into 402-compatible errors', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        success: false,
        code: 'insufficient_credits',
        required: 20,
        available: 0,
        top_up_url: '/settings/billing',
        upgrade_url: '/settings/billing#plans',
      },
      error: null,
    });

    await expect(reserveCredits({
      supabase: { rpc },
      userId: 'user-1',
      resourceType: 'video',
      requestedAmount: 20,
      referenceType: 'test',
      referenceId: 'ref-1',
      idempotencyKey: 'key-1',
      metadata: {},
    })).rejects.toBeInstanceOf(InsufficientCreditsError);
  });
});
