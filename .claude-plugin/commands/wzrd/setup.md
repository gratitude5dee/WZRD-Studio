---
description: Create a new WZRD Studio project and check credits before any spending.
argument-hint: [project title and concept]
---

Use the `wzrd-setup-project` skill.

1. Call `get_credits` and report the balance, the token's monthly cap, and its scopes.
2. Call `setup_project` with a title (and description / format / genre / tone /
   aspectRatio / concept when the user gave them): $ARGUMENTS
3. Print the returned `deep_link` so the user can open the timeline.
4. Offer `/wzrd:storyboard` as the next step. Do not spend any credits in this command.
