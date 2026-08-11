import type { CanonicalFalModel } from './falai-client.ts';

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

  const reason = resolution.fallbackReason ? ` (${resolution.fallbackReason})` : '';
  throw new Error(
    `catalog-strict rejected model substitution: requested "${requestedModelId}" resolved to "${resolution.model.id}"${reason}`,
  );
}
