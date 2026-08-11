export function isEditorOnlyPricing(pricing: unknown): boolean {
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
    return false;
  }

  const marker = (pricing as Record<string, unknown>).editor_only;
  return marker === true || marker === "true";
}

export function filterWorkflowCatalogRows<T extends { pricing?: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => !isEditorOnlyPricing(row.pricing));
}

export function filterStudioCatalogRows<T extends { editorOnly?: boolean }>(rows: T[]): T[] {
  return rows.filter((row) => !row.editorOnly);
}
