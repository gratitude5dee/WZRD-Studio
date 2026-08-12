---
name: wzrd-export-video
description: Assemble a finished WZRD project into a single exported video (Director's Cut) and return the download link. Use this when the user asks to export, render out, stitch, or download the final cut. Covers the readiness check for missing shot media, the catalog-priced cost preview, the explicit confirmation step, job polling, and the refusal that happens when no verified export price exists in the catalog.
---

# Export the final video

Tools: `export_video` (**spends credits**), `get_job`, `get_timeline`,
`get_credits`.

## The one safety loop

1. `get_credits`.
2. Iterate free: `get_timeline` and confirm with the user that every shot they want
   in the cut actually has media. Missing shots are reported by the export sync
   step; fixing them is free, re-generating them is not.
3. `export_video { projectId, dryRun: true }` → `credits_quoted` plus the
   `catalog_id` the price came from. Costs 0.
4. Explicit user confirmation of that exact number.
5. `export_video { projectId, confirm: true, idempotencyKey: "<stable-key>" }` →
   `{ jobId }` immediately.
6. Poll `get_job { jobId }` for the export URL, then present it together with
   `https://<app>/project/<projectId>?tab=timeline`.

## When export is refused

`unpriced_operation` means no enabled row in `ai_model_catalog` carries a verified
price for the export operation. WZRD billing is catalog-strict: it refuses rather
than guessing a price. Tell the user exactly that and offer the in-app export
instead — do not invent a credit figure and do not retry.

## Notes

- Reusing the `idempotencyKey` returns the original job; the user is charged once
  even if you retry after a timeout.
- A failed export releases the credit hold — the user is not charged for a cut they
  did not get.
- Export settings (resolution, fps) are optional; the project's defaults are used
  when omitted.
