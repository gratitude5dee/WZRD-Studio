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

1. `get_credits` — know the balance and the token's daily cap.
2. Iterate free in text — the shot's prompt is storyboard work
   (`wzrd-storyboard`), not generation work. Fix the prompt *before* spending.
3. `generate_shot_image { shotId, dryRun: true }` → returns `{ credits, breakdown }`
   and spends nothing. Compare it against the balance from step 1 yourself.
4. **Show the user the exact number and wait for approval.** "Auto-approve",
   silence, or an earlier general "yes go ahead" do not count. The tool cannot
   enforce this — leaving `dryRun` off *is* the spend, so only drop it once the
   user has approved the number.
5. `generate_shot_image { shotId, idempotencyKey: "<stable-key>" }`.
   Returns `{ jobId, status: "queued" }` immediately — the call never blocks on the
   provider.
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
- `-32003` — the token's credit cap or the account balance blocks the spend. The
  error data carries `{ used, cap, resetsAt }` or a `topUpUrl`; relay those.
- `-32006` — the shot has no visual prompt yet. Fix it with `update_shot` (free).
- `-32005` — no such shot for this user. Do not retry with another id.
- A failed job releases its credit hold automatically; the user is not charged.

## Notes

- One shot per call. To fill a whole scene use `generate_scene_images`, or
  `wzrd-render-timeline` for the whole project — both quote the total up front.
- Charged price always equals quoted price: the tool bills the number you
  confirmed. If a job's result mentions a fallback model, the user still paid what
  they approved — say so.
