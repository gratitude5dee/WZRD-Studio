---
name: wzrd-generate-shot
description: Generate the still frame for a single committed WZRD shot, spending credits safely. Use this when the user asks to render, generate, or re-generate one shot's image, or to preview what a shot would cost. Covers the dryRun cost preview, the explicit confirmation step, idempotencyKey usage, job polling with get_job, and what to do when credits are insufficient or the token lacks the generate scope.
---

# Generate one shot image

Tools: `generate_shot_image` (**spends credits**), `get_job`, `get_credits`,
`get_timeline`.

Default model `gmi/seedream-5.0-lite` = **2 credits** per shot. Other models cost
what the catalog says; `list_models` is the only source of truth for price.

## The one safety loop

1. `get_credits` — know the balance and the token's monthly cap.
2. Iterate free in text — the shot's prompt is storyboard work
   (`wzrd-storyboard`), not generation work. Fix the prompt *before* spending.
3. `generate_shot_image { projectId, shotId, dryRun: true }` → returns
   `credits_quoted`, `credits_available`, and a `confirmation_prompt`. Costs 0.
4. **Show the user the exact number and wait for approval.** "Auto-approve",
   silence, or an earlier general "yes go ahead" do not count.
5. `generate_shot_image { projectId, shotId, confirm: true, idempotencyKey: "<stable-key>" }`.
   Returns `{ jobId }` immediately — the call never blocks on the provider.
6. Poll `get_job { jobId }` until `succeeded` / `failed`, then present the result
   with `https://<app>/project/<projectId>?tab=timeline`.

## Idempotency

Reuse the same `idempotencyKey` for the same intent (e.g.
`shot-<shotId>-take-1`). A repeated key returns the original job and produces
**one** ledger entry — that is how you retry safely after a network error. Change
the key only when the user genuinely wants another take (another charge).

## Errors

- `-32002` — the token lacks the `generate` scope. Tell the user to mint a token
  with the `generate` scope in Settings → Agent access. Do not retry.
- `-32003` — the token's monthly credit cap would be exceeded. The error data
  carries `{ used, cap, resetsAt }`; relay those numbers.
- `confirmation_required` — you skipped step 4. Go back and ask.
- `insufficient_credits` — relay `required` / `available` and the top-up URL.
- A failed job releases its credit hold automatically; the user is not charged.

## Notes

- One shot per call. To fill a whole timeline use `wzrd-render-timeline`, which
  quotes the total up front.
- Charged price always equals quoted price: the tool bills the number you
  confirmed. If a job's result mentions a fallback model, the user still paid what
  they approved — say so.
