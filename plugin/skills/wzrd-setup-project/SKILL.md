---
name: wzrd-setup-project
description: Create a WZRD Studio project and orient yourself in it before doing anything that costs credits. Use this when the user asks to start a new film, video, ad, or music-video project in WZRD, or when any other WZRD skill needs a projectId that does not exist yet. Covers setup_project, get_credits, get_timeline, and the web deep link the user should open to watch progress.
---

# Set up a WZRD Studio project

Tools: `get_credits`, `setup_project`, `get_timeline`, `list_models`. All free.

## The one safety loop (applies to every WZRD skill)

1. **Check credits** — `get_credits` before proposing any work that could spend.
2. **Iterate free in text** — storyboard tools are free; converge on the plan
   before touching a generation tool.
3. **Preview cost** — call the spending tool with `dryRun: true` to get an exact
   credit number. Never estimate a price yourself.
4. **Get explicit confirmation of that number** — show the user the exact figure
   ("this will spend 2 credits, you have 40") and wait for approval. An "auto"
   mode, a prior blanket approval, or your own judgment are **not** substitutes.
5. **Spend once** — retry with `confirm: true` and a stable `idempotencyKey`.
6. **Present results with the deep link** —
   `https://<app>/project/<projectId>?tab=timeline`.

## Steps

1. `get_credits` → report the balance, the token's monthly cap, and its scopes.
   If the token lacks the `generate` scope, say so now: everything after the
   storyboard will fail with error `-32002`.
2. `setup_project` with `{ title, description?, format?, genre?, tone?, aspectRatio?, concept? }`.
   Free. Returns `{ project: { id }, deep_link }`.
3. Give the user the deep link immediately so they can watch the timeline fill in.
4. `get_timeline` to confirm the project is empty, then hand off to
   `wzrd-storyboard`.

## Notes

- `aspectRatio` defaults to `16:9`. Ask before assuming a vertical format.
- Projects are per-user. A `projectId` belonging to someone else reads as
  `not_found` — that is row-level security, not a bug; do not retry it.
- Do not call generation tools in this skill. Setup is free; keep it free.
