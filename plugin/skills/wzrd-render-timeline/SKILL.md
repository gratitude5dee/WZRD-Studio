---
name: wzrd-render-timeline
description: Generate still frames for every shot in a WZRD project that does not have one yet, scene by scene, quoting the exact total before spending. Use this when the user asks to render, generate, or fill in the whole timeline or "all the shots" at once. This is the most expensive workflow in the plugin — the skill covers the mandatory dryRun total per scene, the running total across scenes, the explicit confirmation of that number, idempotency, and job polling.
---

# Render a whole timeline

Tools: `generate_scene_images` (**spends credits**, one scene per call), `get_job`,
`get_credits`, `get_storyboard`, `get_timeline`.

There is no single "render everything" tool on purpose: a whole-project render is
the easiest way to burn a balance, so the plugin makes you quote and confirm scene
by scene. Cost = 2 credits per shot that has a visual prompt and no image yet, so
a 24-shot project is about 48 credits.

## The one safety loop — no shortcuts here

1. `get_credits`. If the balance is below the total you are about to quote, stop
   and say so instead of quoting a spend the user cannot afford.
2. Iterate free in text: commit the storyboard first (`wzrd-storyboard`). Rendering
   a timeline nobody has reviewed is how users waste credits.
3. `get_storyboard { projectId }` (free) to list the scenes and count the shots
   that still need an image, then `generate_scene_images { sceneId, dryRun: true }`
   for each scene → `{ credits, breakdown }`. Costs 0. Sum the per-scene credits
   into one project total.
4. Show the user the **total**, the per-shot price (2 credits) and the shot count,
   then wait for explicit approval of that number. Never batch-approve on their
   behalf, and never start scene 2 on the strength of an approval for scene 1.
5. For each approved scene: `generate_scene_images { sceneId, idempotencyKey:
   "<stable-key-per-scene>" }`. Each call returns `{ jobId, status: "queued" }`
   immediately; shots inside the scene are generated sequentially in the
   background.
6. Poll `get_job { jobId }` per scene, then present
   `https://<app>/project/<projectId>?tab=timeline` so the user watches frames land.

## Notes

- Shots that already have an image are skipped and not charged. Pass
  `regenerate: true` only when the user explicitly asks to redo finished shots —
  it re-charges them.
- Per-shot failures are reported in `results[]` with `ok: false`; only the shots
  that actually ran are charged, so a scene that fails entirely charges nothing.
- Reusing the same `idempotencyKey` returns the original job instead of charging
  again — safe retry, single charge.
- To re-render a handful of shots instead, use `wzrd-generate-shot` per shot:
  cheaper and easier for the user to approve.
- `-32003` means the token's credit cap blocks the total. Relay
  `{ used, cap, resetsAt }` and offer to render one scene at a time.
