/**
 * gmi-execute – Edge function that routes AI generation requests to
 * the GMI Cloud API. GMI calls still consume credits and are blocked at zero balance.
 *
 * Supports three execution paths:
 *   1. LLM chat completions (text models → api.gmi-serving.com)
 *   2. Image queue (Seedream etc → console.gmicloud.ai request queue)
 *   3. Video queue (Kling V3 Omni etc → console.gmicloud.ai request queue)
 *
 * Some surfaces route GMI models here directly while Fal models use falai-execute.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { getCatalogModelById } from '../_shared/ai-model-catalog.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import {
  buildCreditIdempotencyKey,
  commitCredits,
  getGenerationCreditCost,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
  UnpricedModelError,
} from '../_shared/credits.ts';
import {
  executeGmiChatCompletion,
  executeGmiQueueModel,
  pollGmiQueueStatus,
} from '../_shared/gmi-client.ts';

interface RequestBody {
  modelId: string;
  inputs: Record<string, any>;
  mode?: 'sync' | 'queue';
  action?: 'submit' | 'poll';
  requestId?: string; // for polling
  pricingMode?: 'catalog-strict';
  metadata?: {
    userId?: string;
    projectId?: string;
    nodeId?: string;
    source?: string;
  };
}

/**
 * Settle the credit hold recorded for a queued generation once the job
 * reaches a terminal status. Idempotent: the row is claimed by a
 * status-guarded update before the ledger call, so concurrent polls settle
 * at most once.
 */
async function settleQueuedGeneration(input: {
  requestId: string;
  userId: string;
  outcome: 'committed' | 'released';
}): Promise<void> {
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const { data: claimed, error: claimError } = await serviceClient
    .from('gmi_generation_settlements')
    .update({ status: input.outcome, updated_at: new Date().toISOString() })
    .eq('request_id', input.requestId)
    .eq('user_id', input.userId)
    .eq('status', 'pending')
    .select('hold_id, hold_skipped, amount, model_id')
    .maybeSingle();

  if (claimError) {
    console.error('[gmi-execute] Settlement claim failed:', claimError.message);
    return;
  }
  if (!claimed) return; // No pending settlement (already settled, or pre-dates deferral).

  try {
    if (input.outcome === 'committed') {
      await commitCredits({
        supabase: serviceClient,
        holdId: claimed.hold_id,
        skipped: claimed.hold_skipped,
        amount: Number(claimed.amount),
        userId: input.userId,
        metadata: {
          endpoint: 'gmi-execute',
          model_id: claimed.model_id,
          request_id: input.requestId,
        },
      });
    } else {
      await releaseCredits({
        supabase: serviceClient,
        holdId: claimed.hold_id,
        skipped: claimed.hold_skipped,
        reason: 'gmi_queue_job_failed',
        userId: input.userId,
        metadata: {
          endpoint: 'gmi-execute',
          model_id: claimed.model_id,
          request_id: input.requestId,
        },
      });
    }
  } catch (error) {
    // The hold may have expired (15-minute TTL) before the job finished;
    // record that instead of charging against a dead hold.
    console.error('[gmi-execute] Settlement failed:', error);
    await serviceClient
      .from('gmi_generation_settlements')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('request_id', input.requestId)
      .eq('user_id', input.userId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  let creditReservation: { holdId: string | null; requestedAmount: number; skipped: boolean } | null = null;
  let creditCost = 0;
  let userId: string | null = null;
  let modelIdForBilling = '';
  let resourceTypeForBilling = 'generation';

  try {
    const user = await authenticateRequest(req.headers);
    userId = user.id;

    const body: RequestBody = await req.json();
    const { modelId, inputs, action = 'submit', requestId, metadata } = body;
    const strictPricing = body.pricingMode === 'catalog-strict';

    // ── Poll an existing request ────────────────────────────────────────
    if (action === 'poll') {
      if (!requestId) {
        return errorResponse('requestId is required for polling', 400);
      }

      const pollResult = await pollGmiQueueStatus(requestId);
      if (!pollResult.success) {
        return errorResponse(pollResult.error ?? 'GMI poll failed', 502);
      }

      const status = pollResult.data?.status;
      if (status === 'success' || status === 'failed' || status === 'cancelled') {
        await settleQueuedGeneration({
          requestId,
          userId,
          outcome: status === 'success' ? 'committed' : 'released',
        });
      }

      return successResponse({
        success: true,
        data: pollResult.data,
        requestId,
        status,
      });
    }

    // ── Submit a new request ────────────────────────────────────────────
    if (!modelId || typeof modelId !== 'string') {
      return errorResponse('Invalid model ID', 400);
    }

    const model = await getCatalogModelById(modelId, {
      enabledOnly: true,
    });
    if (!model || model.provider !== 'gmi-cloud') {
      return errorResponse(`Model ${modelId} is not a GMI Cloud model`, 400);
    }

    const apiModelId = model.endpointId;
    modelIdForBilling = modelId;
    resourceTypeForBilling = model.mediaType || 'generation';

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    creditCost = getGenerationCreditCost({
      pricingMode: strictPricing ? 'catalog-strict' : undefined,
      catalogModel: model,
      inputs,
      modelId,
      resourceType: resourceTypeForBilling,
    });
    creditReservation = await reserveCredits({
      supabase: serviceClient,
      userId,
      resourceType: resourceTypeForBilling,
      requestedAmount: creditCost,
      referenceType: 'gmi_execute',
      referenceId: metadata?.nodeId || requestId || crypto.randomUUID(),
      idempotencyKey: buildCreditIdempotencyKey(
        'gmi-execute',
        userId,
        metadata?.projectId,
        metadata?.nodeId,
        modelId,
        requestId,
        crypto.randomUUID(),
      ),
      metadata: {
        endpoint: 'gmi-execute',
        project_id: metadata?.projectId,
        node_id: metadata?.nodeId,
        source: metadata?.source,
        model_id: modelId,
      },
    });

    console.log('[gmi-execute] Executing model:', {
      studioModelId: modelId,
      apiModelId,
      source: metadata?.source,
    });

    // ── Text / LLM path ────────────────────────────────────────────────
    if (model.transportType === 'chat_completion' || model.mediaType === 'text') {
      const messages = inputs.messages ?? [
        { role: 'user', content: inputs.prompt ?? '' },
      ];

      const result = await executeGmiChatCompletion(apiModelId, messages, {
        max_tokens: inputs.max_tokens ?? 2000,
        temperature: inputs.temperature ?? 1,
        stream: false,
      });

      if (!result.success) {
        await releaseCredits({
          supabase: serviceClient,
          holdId: creditReservation.holdId,
          skipped: creditReservation.skipped,
          reason: 'gmi_text_failed',
          userId,
          metadata: { endpoint: 'gmi-execute', model_id: modelId },
        });
        creditReservation = null;
        return errorResponse(result.error ?? 'GMI LLM execution failed', 502);
      }

      await commitCredits({
        supabase: serviceClient,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        amount: creditCost,
        userId,
        metadata: { endpoint: 'gmi-execute', model_id: modelId },
      });
      creditReservation = null;

      return successResponse({
        success: true,
        data: result.data,
        provider: 'gmi-cloud',
      });
    }

    // ── Image / Video queue path ────────────────────────────────────────
    const payload = { ...inputs };
    // The GMI queue API wraps inputs inside a "payload" key; we pass the
    // model + payload to executeGmiQueueModel which structures it properly.

    const result = await executeGmiQueueModel(apiModelId, payload, model.payloadKeys);

    if (!result.success) {
      await releaseCredits({
        supabase: serviceClient,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        reason: 'gmi_queue_submit_failed',
        userId,
        metadata: { endpoint: 'gmi-execute', model_id: modelId },
      });
      creditReservation = null;
      return errorResponse(result.error ?? 'GMI queue submission failed', 502);
    }

    // Defer settlement to poll time: a queued job that fails or is cancelled
    // must release its hold instead of charging. If the pending-settlement
    // record can't be stored, fall back to committing now so the generation
    // is never free.
    if (result.requestId) {
      const { error: settlementError } = await serviceClient
        .from('gmi_generation_settlements')
        .insert({
          request_id: result.requestId,
          user_id: userId,
          hold_id: creditReservation.holdId,
          hold_skipped: creditReservation.skipped,
          amount: creditCost,
          model_id: modelId,
        });

      if (!settlementError) {
        creditReservation = null;
      } else {
        console.error(
          '[gmi-execute] Failed to record pending settlement, committing immediately:',
          settlementError.message,
        );
      }
    }

    if (creditReservation) {
      await commitCredits({
        supabase: serviceClient,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        amount: creditCost,
        userId,
        metadata: {
          endpoint: 'gmi-execute',
          model_id: modelId,
          request_id: result.requestId,
        },
      });
      creditReservation = null;
    }

    return successResponse({
      success: true,
      data: result.data,
      requestId: result.requestId,
      statusUrl: result.statusUrl,
      provider: 'gmi-cloud',
    });
  } catch (error) {
    console.error('[gmi-execute] Error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    if (error instanceof InsufficientCreditsError) {
      return insufficientCreditsResponse(error, corsHeaders);
    }
    if (error instanceof UnpricedModelError) {
      return errorResponse(error.message, 400);
    }

    if (creditReservation && userId) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } },
      );
      await releaseCredits({
        supabase: serviceClient,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        reason: 'gmi_execute_failed',
        userId,
        metadata: {
          endpoint: 'gmi-execute',
          model_id: modelIdForBilling,
          resource_type: resourceTypeForBilling,
        },
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to execute GMI model';
    return errorResponse(message, 500);
  }
});
