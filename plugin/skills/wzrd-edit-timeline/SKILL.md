---
name: wzrd-edit-timeline
description: Make non-destructive, free edits to a WZRD timeline — reorder or retime shots, rewrite prompts and dialogue, fix continuity edges — and hand the user into the web editor for anything that needs a UI. Use this when the user asks to change, trim, reorder, or fix shots in an existing project rather than generate new media. Covers get_timeline, update_shot, the storyboard propose/diff/commit loop for structural edits, and the editor deep link.
---

# Edit a WZRD timeline

Tools: `get_timeline`, `edit_timeline`, `get_storyboard`, `update_shot`,
`storyboard_propose` / `storyboard_diff` / `storyboard_commit`,
`get_continuity_graph`. **All free.**

Editing never spends credits. Only re-generating media does — and that is a
different skill (`wzrd-generate-shot`, `wzrd-render-timeline`). Before you touch
anything that could spend, run the one safety loop: `get_credits` → iterate free
here → `dryRun` cost preview → explicit user confirmation of a specific credit
number → spend once with an `idempotencyKey` → present
`https://<app>/project/<projectId>?tab=timeline`.

## What to use when

| The user wants | Do this |
| --- | --- |
| Reword one shot's prompt / dialogue / shot type | `update_shot` |
| Fix which frame a shot continues from | `update_shot { continuity: { predecessorShotId } }` |
| Add, delete, reorder, or renumber shots/scenes | `storyboard_propose` → `_diff` → `_commit` |
| Retime, trim, add or remove a timeline element | `edit_timeline { projectId, operations }` |
| Audio beds, transitions, layer compositing | Hand off to the web editor deep link |
| Re-render a changed shot | `wzrd-generate-shot`, with the full confirmation loop |

## Steps

1. `get_timeline { projectId }` and show the current shot list.
2. Apply free edits with `update_shot`, or stage structural changes with
   `storyboard_propose` and show the `storyboard_diff` table before committing.
3. Commit with the revision you diffed against; on a `revision_mismatch` rejection
   re-read and show the user what someone else changed instead of retrying blindly.
4. If a shot's prompt changed, remind the user that its existing image is now stale
   and re-generating costs credits — quote the exact number with `dryRun: true`
   before spending anything.
5. Finish with `https://<app>/project/<projectId>?tab=timeline`.

## Notes

- `edit_timeline` applies structured `operations` (add, remove, move, trim) to the
  saved timeline snapshot. Anything beyond that — audio beds, transitions, layer
  compositing — lives in the web editor and the WZRD desktop app; the portable
  plugin deliberately exposes no native editing tool. Send the deep link rather
  than pretending to edit clips.
- Deleting a shot does not refund credits already spent on it.
