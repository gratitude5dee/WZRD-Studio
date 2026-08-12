---
description: Generate shot images after an explicit, confirmed credit quote.
argument-hint: [projectId] [shotId | all]
---

Use `wzrd-generate-shot` for one shot, `wzrd-render-timeline` for all of them: $ARGUMENTS

Mandatory order — do not skip a step:

1. `get_credits`.
2. The spending tool with `dryRun: true` (0 credits) to get `{ credits, breakdown }`.
3. Show the user that exact number and **wait for explicit approval**. Auto-approval
   is not permitted here.
4. Re-call **without** `dryRun` and with a stable `idempotencyKey` — dropping
   `dryRun` is the spend, so it happens only after step 3.
5. Poll `get_job { jobId }` and finish with the project deep link
   (`https://<app>/project/<projectId>?tab=timeline`).
