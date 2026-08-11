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

describe('edge credits shared helper', () => {
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

  it('refuses rate-priced models until rate-aware reserve exists', () => {
    expect(() => getCatalogCreditCost({ unit: 'per_second', usd: 0.4 })).toThrow(
      'rate-based pricing'
    );
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
