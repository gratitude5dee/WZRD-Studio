---
name: wzrd-export-video
description: Assemble a finished WZRD project into a single exported video (Director's Cut) and return the download link. Use this when the user asks to export, render out, stitch, or download the final cut. Covers the readiness check for missing shot media, the dryRun cost preview, the explicit confirmation step before any spend, job polling, and why assembly itself is free while the shot media it needs is not.
---

# Export the final video

Tools: `export_video`, `get_job`, `get_timeline`, `get_credits`.

Assembly itself is **free**: `export_video` stitches media that already exists. The
expensive part is the shot media it needs, which is billed by the generation tools
(`wzrd-generate-shot`, `wzrd-render-timeline`) before you get here — so never
"just export" a project with missing shots and let the fix surprise the user.

## The one safety loop

1. `get_credits`.
2. Iterate free: `get_timeline` and confirm with the user that every shot they want
   in the cut actually has media. Missing shots are reported by the export sync
   step; fixing them is free, re-generating them is not.
3. `export_video { projectId, action: "sync", dryRun: true }` → `{ credits: 0,
   breakdown }` for the assembly. If shots are missing, quote what generating them
   costs with the generation tool's own `dryRun` — that is the real number.
4. Explicit user confirmation of that exact number before any generation. Assembly
   at 0 credits still needs a go-ahead, not a surprise render.
5. `export_video { projectId, action: "create", idempotencyKey: "<stable-key>" }` →
   `{ jobId, status: "queued" }` immediately.
6. Poll `get_job { jobId }` for the export URL, then present it together with
   `https://<app>/project/<projectId>?tab=timeline`.

## When export is refused

If a generation the cut depends on has no enabled, priced row in
`ai_model_catalog`, WZRD refuses rather than guessing: billing is catalog-strict.
Tell the user exactly that and offer the in-app export instead — do not invent a
credit figure and do not retry.

## Notes

- Reusing the `idempotencyKey` returns the original job; the user is charged once
  even if you retry after a timeout.
- A failed export releases the credit hold — the user is not charged for a cut they
  did not get.
- Export settings (resolution, fps) are optional; the project's defaults are used
  when omitted.
- `action` selects the phase: `sync` checks readiness, `create` starts the render
  (the default), `status` polls, `retry` re-runs a failed job.
