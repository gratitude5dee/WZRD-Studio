---
description: Propose, diff, and commit a WZRD storyboard — entirely free.
argument-hint: [projectId] [what to change]
---

Use the `wzrd-storyboard` skill. Everything here costs 0 credits.

1. `get_storyboard { projectId }` — note the `revision`.
2. `storyboard_propose` with the scene/shot deltas implied by: $ARGUMENTS
3. `storyboard_diff` — render the returned markdown `table` and list every warning.
4. Ask the user to approve the diff, then `storyboard_commit { projectId, revision }`
   with the revision you diffed against.
5. On `revision_mismatch`, re-read and show what changed instead of retrying.

Never call a generation tool from this command.
