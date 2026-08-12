---
name: wzrd-render-timeline
description: Generate still frames for every shot in a WZRD project that does not have one yet, quoting the exact total before spending. Use this when the user asks to render, generate, or fill in the whole timeline or "all the shots" at once. This is the most expensive tool in the plugin — the skill covers the mandatory dryRun total, the per-shot price breakdown, the explicit confirmation of the total, idempotency, and job polling.
---

# Render a whole timeline

Tools: `render_timeline` (**spends credits**), `get_job`, `get_credits`,
`get_timeline`.

Cost = per-shot catalog price × number of shots that have a prompt but no image.
With the default model (2 credits) a 24-shot timeline is 48 credits.

## The one safety loop — no shortcuts here

1. `get_credits`. If the balance is below the quote, stop before quoting a spend
   the user cannot afford.
2. Iterate free in text: commit the storyboard first (`wzrd-storyboard`). Rendering
   a timeline you have not reviewed is how users waste credits.
3. `render_timeline { projectId, dryRun: true }` → `credits_quoted`,
   `credits_per_shot`, `shots_pending`, `credits_available_after`. Costs 0.
4. Show the user the **total**, the per-shot price, and the shot count, then wait
   for explicit approval of that total. Never batch-approve on their behalf.
5. `render_timeline { projectId, confirm: true, idempotencyKey: "<stable-key>" }`.
   Returns `{ jobId }` immediately; shots are generated sequentially in the
   background.
6. Poll `get_job { jobId }`, then present
   `https://<app>/project/<projectId>?tab=timeline` so the user watches frames land.

## Notes

- Shots that already have an image are skipped and not charged. If nothing is
  pending the tool returns `shots_pending: 0` and spends nothing.
- The whole run is billed once, at the quoted total, when it completes; a failure
  releases the hold instead of charging a partial run.
- Reusing the `idempotencyKey` returns the same job — safe retry, single charge.
- To re-render specific shots instead, use `wzrd-generate-shot` per shot: cheaper
  and easier for the user to approve.
- `-32003` means the token's monthly cap blocks the total. Relay
  `{ used, cap, resetsAt }` and offer to render a subset shot by shot.
