import { describe, expect, it } from "vitest";
import {
  filterStudioCatalogRows,
  filterWorkflowCatalogRows,
  isEditorOnlyPricing,
} from "../../../../shared/editor-only-catalog";

describe("editor-only catalog visibility", () => {
  it("recognizes only the explicit editor-only marker", () => {
    expect(isEditorOnlyPricing({ editor_only: true })).toBe(true);
    expect(isEditorOnlyPricing({ editor_only: "true" })).toBe(true);
    expect(isEditorOnlyPricing({ editor_only: false })).toBe(false);
    expect(isEditorOnlyPricing({})).toBe(false);
  });

  it("excludes marked rows from workflow model ids while retaining unmarked rows", () => {
    const rows = [
      { id: "editor-only", pricing: { editor_only: true } },
      { id: "mcp-only", pricing: {} },
      { id: "legacy-empty-surfaces", pricing: { usd: 0.4 } },
    ];

    expect(filterWorkflowCatalogRows(rows).map((row) => row.id)).toEqual([
      "mcp-only",
      "legacy-empty-surfaces",
    ]);
  });

  it("excludes marked rows from Studio while retaining unmarked empty-surface rows", () => {
    const rows = [
      { id: "editor-only", editorOnly: true },
      { id: "legacy-empty-surfaces", editorOnly: false },
    ];

    expect(filterStudioCatalogRows(rows).map((row) => row.id)).toEqual([
      "legacy-empty-surfaces",
    ]);
  });
});
