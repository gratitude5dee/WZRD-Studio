---
name: wzrd-storyboard
description: Build and revise a WZRD Studio storyboard for free using the propose/diff/commit loop, then commit it so the continuity graph is derived. Use this whenever the user wants to write, restructure, critique, or fix scenes and shots — including "add a scene", "make shot 3 wider", "why does shot 7 look inconsistent" — and always before any tool that spends credits. Covers storyboard_propose, storyboard_diff, storyboard_commit, get_storyboard, update_shot, get_continuity_graph, revisions, and continuity warnings.
---

# Storyboard a WZRD project (flagship skill)

Tools: `get_storyboard`, `storyboard_propose`, `storyboard_diff`,
`storyboard_commit`, `update_shot`, `get_continuity_graph`. **All free.**

This is where all the thinking happens. Iterating here costs nothing, and every
credit you eventually spend is only as good as the storyboard you spent it on.

## The one safety loop

1. Check credits (`get_credits`).
2. **Iterate free in text — this skill is that step.**
3. `dryRun` cost preview (later, in `wzrd-generate-shot`).
4. Explicit user confirmation of a specific credit number.
5. Spend with an `idempotencyKey`.
6. Present results with `https://<app>/project/<projectId>?tab=timeline`.

## Loop

1. **Read** — `get_storyboard { projectId }`. Note the `revision`. Everything you
   propose is staged against it.
2. **Propose** — `storyboard_propose { projectId, revision, scenes, shots, notes? }`.
   Nothing is written to `shots`; deltas are staged at `revision + 1`.
   - Scene delta: `{ op: "create" | "update" | "delete", sceneId?, key?, scene_number, title, description, location, lighting, weather }`
   - Shot delta: `{ op, shotId?, key?, sceneId?, sceneKey?, shot_number, prompt_idea, visual_prompt, dialogue, shot_type, continuity? }`
   - Use `key` / `sceneKey` to link new shots to new scenes in one proposal.
   - Pass `merge: true` to append to the staged set instead of replacing it.
3. **Diff** — `storyboard_diff { projectId }`. Show the user the `table`
   (markdown) and the `warnings`. Warning codes worth acting on:
   - `shot_missing_prompt` (error) — the shot cannot be compiled or generated.
   - `scene_missing_location` (warn) — no setting reference will be resolved.
   - `character_not_in_cast` (warn) — a name in a prompt has no character record,
     so no identity image will be attached.
   - `continuity_island` (info) — the shot shares no entity with any earlier shot.
4. **Revise** — re-`propose` as many times as needed. Still free.
5. **Commit** — `storyboard_commit { projectId, revision }` with the revision you
   just diffed. This writes scenes/shots and re-derives the continuity graph.

## Optimistic concurrency

`storyboard_commit` rejects a stale revision with `-32006` whose data carries
`code: "revision_mismatch"` and `expected_revision`. That is another agent (or the
user in the web app) having committed first — **never** retry blindly. Re-read with `get_storyboard`, re-diff,
show the user what changed, then commit again.

## Continuity graph

Committing derives typed edges between shots (`character`, `location`, `prop`) by
extracting known entities from shot prompts. Edges decide which frame later
generation uses as its continuity reference: a scene returning to an earlier
location inherits **that** scene's last frame, not the previous shot's.

Override per shot when the derivation is wrong:

```
update_shot { shotId, continuity: {
  characters: ["Mara"], locations: ["rooftop"], props: ["brass key"],
  predecessorShotId: "<shot-uuid>",   // force the graph predecessor
  reset: true                          // or declare a hard continuity break
}}
```

Inspect the result with `get_continuity_graph { projectId }`.

## Notes

- Never call a generation tool from this skill. Hand off to `wzrd-generate-shot`
  (one shot) or `wzrd-seedance-handoff` (a reviewed video packet).
- If the user asks for "the whole thing generated now", still commit the
  storyboard first and quote the total cost with `dryRun` before spending.
- Keep prompts concrete: subject, action, camera, light. Warning
  `shot_prompt_too_thin` means the prompt will underspecify the frame.
