---
name: wzrd-studio-graph
description: Run a saved WZRD Studio node graph (the visual compute canvas) on behalf of the user. Use this when the user asks to execute, re-run, or estimate a Studio graph or canvas pipeline rather than an individual shot. Explains why a graph's total is only a floor until it runs, that every generating node spends credits at catalog prices, and the confirmation the user must give first.
---

# Run a Studio compute graph

Tools: `run_studio_graph` (**spends credits**), `get_studio_graph`,
`save_studio_graph`, `get_job`, `get_credits`.

A Studio graph is a user-authored node pipeline in the web canvas. Executing it
runs every node, and each generating node bills at its catalog price.

## Prerequisites

- The `generate` scope on the token (`-32002` otherwise).
- A saved graph on the project. Read it first with `get_studio_graph` (free) and
  walk the nodes with the user; a graph you have not read is a blank cheque.

## The one safety loop

1. `get_credits` — graphs are the least predictable spend in WZRD; know the
   balance first.
2. Iterate free in text — walk the node list with the user and agree on what will
   run. `get_timeline` and `get_storyboard` are free context.
3. Cost preview — `run_studio_graph { projectId, dryRun: true }`. Free. Returns
   `{ credits, breakdown }`, where `credits` is a **floor**: one credit per
   generation node. Each node's real charge follows its model's catalog price, so
   say "at least N credits" and name the models involved (`list_models`) rather
   than promising an exact total.
4. Explicit confirmation of that number, said out loud as a floor, before you drop
   `dryRun`.
5. `run_studio_graph { projectId, idempotencyKey: "<stable-key>" }` →
   `{ jobId, status: "queued" }`. Billing happens per node inside the compute
   pipeline; the key makes a retry of the whole run return the original job instead
   of re-charging it.
6. Present results with `https://<app>/project/<projectId>?tab=timeline`.

## Notes

- If the user just wants images for every shot, prefer `wzrd-render-timeline`: it
  quotes an exact total per scene. Graphs are for custom pipelines.
- Pass `useCache: true` (the default) so nodes whose inputs did not change are
  reused instead of re-billed.
- On a failed run, report the status and stop. Do not re-run a graph automatically
  — a retry can re-bill nodes that already succeeded.
