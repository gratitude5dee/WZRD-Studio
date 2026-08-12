---
name: wzrd-seedance-handoff
description: Compile the Seedance video reference packet for a WZRD project and walk the user through shot-by-shot approval. Use this when the user wants to turn a committed storyboard into video, asks what references each shot will send to the video model, or asks why a shot's continuity looks wrong. Explains review mode (free), why auto mode is currently refused (unverified Seedance 2.5 catalog pricing), and how to read null reference slots.
---

# Seedance handoff (reference packet review)

Tool: `seedance_handoff`. `mode: "review"` is **free**.

## What it does

For each shot it assembles the packet the video model would receive:

| Field | Source |
| --- | --- |
| `prompt` | shot `visual_prompt` (falls back to `prompt_idea`) |
| `negative` | shot packet negative, else the project default |
| `camera` | shot packet camera, else derived from `shot_type` |
| `duration` | shot packet duration, else 5s |
| `characterRefs[]` | identity images resolved through **character** continuity edges |
| `settingRef` | location + lighting + weather from the shot's scene |
| `styleAnchor` | project-level style constant (one aesthetic for the whole project) |
| `continuityFrame` | last frame of the **graph-resolved** predecessor |

`continuityFrame` is not "shot n-1". It follows the continuity graph, so a scene
that returns to an earlier location inherits that earlier scene's last frame.

## Reading reference slots

Every slot is `{ value, reason }`. Either `value` is populated and `reason` is
null, or `value` is null **with a machine-readable reason** — there is never a
silent omission. Common reasons and the fix:

- `character_has_no_generated_identity_image` — generate the character's image in
  the app, or accept a text-only likeness.
- `no_character_record_matches_this_name` — the prompt names someone who is not in
  the cast; add the character or fix the prompt (`wzrd-storyboard`).
- `scene_has_no_location_set` — set the scene location; free.
- `graph_predecessor_has_no_rendered_frame_yet` — generate the predecessor shot
  first (`wzrd-generate-shot`), otherwise this shot starts cold.
- `no_continuity_edge_shares_an_entity_with_an_earlier_shot` — intentional for an
  opening shot; otherwise add a shared character/location/prop or set
  `continuity.predecessorShotId`.
- `project_has_no_style_reference_asset_or_style_descriptors` — set a style
  reference or `video_style` on the project.

Present the packet shot by shot and get approval per shot. `completeness.blocking`
lists shots that cannot be compiled at all (no prompt) — fix those first.

## Auto mode is currently refused

`mode: "auto"` would evaluate, auto-fix trivial issues, compile, submit, and poll.
It **spends credits**, so it requires the `generate` scope, explicit confirmation,
and verified catalog pricing. Seedance 2.5 has no verified row in
`ai_model_catalog`, and WZRD billing is catalog-strict — it refuses unpriced models
rather than guessing. So the tool returns `seedance_auto_mode_unavailable`.

If the user asks for auto mode, say exactly that: submission is disabled until
Seedance 2.5 catalog pricing is published; nobody is inventing a price. Then offer
review mode (free) plus per-shot generation, which is priced.

## The one safety loop

1. `get_credits`.
2. Iterate free — review mode itself is the free iteration step.
3. `dryRun` cost preview — for the priced tools you use after review.
4. Explicit confirmation of a specific credit number.
5. Spend with an `idempotencyKey`.
6. Present results with `https://<app>/project/<projectId>?tab=timeline`.
