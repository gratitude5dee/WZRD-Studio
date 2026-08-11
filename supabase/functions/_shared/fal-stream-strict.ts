import type { CanonicalFalModel } from './falai-client.ts';

export class StrictModelResolutionError extends Error {
  readonly code = 'strict_model_resolution';

  constructor(
    readonly requestedModelId: string,
    readonly resolvedModelId: string,
    fallbackReason?: string,
  ) {
    const reason = fallbackReason ? ` (${fallbackReason})` : '';
    super(
      `catalog-strict rejected model substitution: requested "${requestedModelId}" resolved to "${resolvedModelId}"${reason}`,
    );
    this.name = 'StrictModelResolutionError';
  }
}

export function assertStrictFalModelResolution(
  requestedModelId: string,
  resolution: {
    model: CanonicalFalModel;
    fallbackUsed: boolean;
    fallbackReason?: string;
  },
): void {
  if (!resolution.fallbackUsed && resolution.model.id === requestedModelId) {
    return;
  }

  throw new StrictModelResolutionError(
    requestedModelId,
    resolution.model.id,
    resolution.fallbackReason,
  );
}

export function strictModelResolutionResponse(
  error: StrictModelResolutionError,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: error.message, code: error.code }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
