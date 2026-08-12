---
description: Compile the Seedance reference packet for review (free) and approve it shot by shot.
argument-hint: [projectId]
---

Use the `wzrd-seedance-handoff` skill for project: $ARGUMENTS

1. `seedance_handoff { projectId, mode: "review" }` — free, never submits.
2. Present each shot's packet: prompt, negative, camera, duration, character refs,
   setting ref, style anchor, continuity frame. For every null slot, state the
   `reason` verbatim and the fix. Never omit a slot silently.
3. Fix `completeness.blocking` shots with `/wzrd:storyboard` first.
4. If the user asks for `mode: "auto"`: it is refused because Seedance 2.5 has no
   verified catalog price. Say that plainly and do not invent a price.
