---
name: wzrd-setup-project
description: Create a WZRD Studio project with a drafted storyline, scenes and shots, and orient yourself in it. Use this when the user asks to start a new film, video, ad, or music-video project in WZRD, or when any other WZRD skill needs a projectId that does not exist yet. setup_project spends credits, so this skill covers the whole safety loop — get_credits, the dryRun quote, explicit confirmation of that number, idempotencyKey, get_timeline, and the web deep link the user should open to watch progress.
---

# Set up a WZRD Studio project

Tools: `setup_project` (**spends credits**), `get_credits`, `get_timeline`,
`list_models`, `get_job` — everything except `setup_project` is free.

`setup_project` does not just create an empty project: it drafts a storyline,
scenes and shots, which is why it costs 3 credits for the storyline plus 1 credit
per drafted shot (7 credits at the default 4 shots).

## The one safety loop (applies to every WZRD skill)

1. **Check credits** — `get_credits` before proposing any work that could spend.
2. **Iterate free in text** — storyboard tools are free; converge on the plan
   before touching a generation tool.
3. **Preview cost** — call the spending tool with `dryRun: true` to get an exact
   credit number. Never estimate a price yourself.
4. **Get explicit confirmation of that number** — show the user the exact figure
   ("this will spend 2 credits, you have 40") and wait for approval. An "auto"
   mode, a prior blanket approval, or your own judgment are **not** substitutes.
5. **Spend once** — call the tool again without `dryRun` and with a stable
   `idempotencyKey`, so a retry returns the original job instead of charging twice.
6. **Present results with the deep link** —
   `https://<app>/project/<projectId>?tab=timeline`.

## Steps

1. `get_credits` → report the balance, the token's daily cap, and its scopes.
   If the token lacks the `generate` scope, say so now: everything after the
   storyboard will fail with error `-32002`.
2. `setup_project { title, concept, shotCount?, …, dryRun: true }` →
   `{ credits, breakdown }`. Costs 0. Show that number, with the balance, and wait
   for the user to approve it. `shotCount` is the lever: fewer drafted shots cost
   less.
3. `setup_project { title, concept, …, idempotencyKey: "<stable-key>" }` →
   `{ jobId, status: "queued" }`. Poll `get_job { jobId }`; the result carries the
   project id.
4. Give the user `https://<app>/project/<projectId>?tab=timeline` immediately so
   they can watch the timeline fill in, then hand off to `wzrd-storyboard` — where
   further iteration is free.

## Notes

- `aspectRatio` defaults to `16:9`. Ask before assuming a vertical format.
- Projects are per-user. A `projectId` belonging to someone else reads as `-32005`
  ("no project … for this user") — that is ownership scoping, not a bug; do not
  retry it and do not guess ids.
- Do not render any imagery here. Drafting is text; images are `wzrd-generate-shot`
  and cost more.
