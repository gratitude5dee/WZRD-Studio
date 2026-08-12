---
name: wzrd-studio-graph
description: Run a saved WZRD Studio node graph (the visual compute canvas) on behalf of the user. Use this when the user asks to execute, re-run, or estimate a Studio graph or canvas pipeline rather than an individual shot. Explains why a user session token is required, that every generating node spends credits at catalog prices, and the confirmation the user must give first.
---

# Run a Studio compute graph

Tool: `run_studio_graph` (**spends credits**).

A Studio graph is a user-authored node pipeline in the web canvas. Executing it
runs every node, and each generating node bills at its catalog price.

## Prerequisites

- The `generate` scope on the token (`-32002` otherwise).
- An `authToken`: a **user session JWT** from the web app. Graph execution runs
  under the user's row-level security context, so the plugin cannot substitute its
  own credentials. If the user has not provided a session token, stop and explain
  this — do not fabricate one and do not ask for their password.

## The one safety loop

1. `get_credits` — graphs are the least predictable spend in WZRD; know the
   balance first.
2. Iterate free in text — walk the node list with the user and agree on what will
   run. `get_timeline` and `get_storyboard` are free context.
3. Cost preview — `run_studio_graph { projectId, authToken, dryRun: true }`. Free.
   Returns the node inventory, `credits_quoted_max`, and `unpriced_nodes`. A
   graph's exact total depends on how many nodes actually execute, so quote the
   maximum, and name any unpriced node instead of guessing its price.
4. Explicit confirmation of that number. Then pass `confirm: true`.
5. `run_studio_graph { projectId, authToken, confirm: true }`. Billing is
   performed per node by the compute pipeline, which is idempotent per node run —
   pass an `idempotencyKey` on any shot-level tool you call afterwards so a retry
   cannot double-charge.
6. Present results with `https://<app>/project/<projectId>?tab=timeline`.

## Notes

- If the user just wants images for every shot, prefer `render_timeline`: it quotes
  an exact total. Graphs are for custom pipelines.
- On `compute_execute_failed`, report the status and stop. Do not re-run a graph
  automatically — a retry can re-bill nodes that already succeeded.
