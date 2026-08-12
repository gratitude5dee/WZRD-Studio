# WZRD Universal Plugin — test matrix

Two layers: the automated suites, which run in CI on every push, and the manual
live-harness matrix, which needs real external accounts (Claude Code, Codex,
Hermes, OpenClaw) and therefore stays a documented, runnable script.

## 1. Automated (CI: `.github/workflows/plugin.yml`)

| Suite | Command | What it proves |
| --- | --- | --- |
| Schemas + skills | `bun run plugin:validate` | manifest/mcp schemas, `SKILL.md` lint, tool names ≤ 40 chars, mirror + version drift, cost text on spending tools |
| Negative cases | `bun run test tests/plugin` | unknown top-level manifest field, skill name ≠ directory, description > 1024, tool name > 40, a `headers` block on `wzrd-remote`, graph/packet behaviour, PAT scope + cap errors, hook rendering |
| MCP conformance | `bun run plugin:conformance` | `initialize`, `serverInfo.version` == plugin version, `tools/list` completeness, `tools/call` shape, `-32001` / `-32002` / `-32003`, non-blocking `{ jobId }`, idempotency, no secret patterns |
| Golden path | `bun run plugin:integration` | the §11.1 sequence against the **real** ledger with a mocked provider; every delta asserted against the catalog |
| Adversarial | `bun run plugin:adversarial` | 50-shot gate, revoked-token error without retry storm, no orphaned hold after an interrupt, cross-user RLS denial without existence leak |

### Running the server-backed suites locally

```bash
# The committed migration history predates local replayability, so this swaps
# in scripts/plugin/fixtures/local-baseline.sql plus the replayable tail and
# resets the local stack. Committed migrations are left untouched.
bash scripts/plugin/local-stack.sh

printf 'WZRD_MOCK_GENERATION=1\nWZRD_INTERNAL_ACTOR_SECRET=local-internal-actor-secret\n' \
  > supabase/functions/.env
supabase functions serve --no-verify-jwt --env-file supabase/functions/.env

# in another shell
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')"
bun run plugin:conformance
bun run plugin:integration
bun run plugin:adversarial
```

`WZRD_MOCK_GENERATION=1` replaces the provider call in `generate-shot-image` with
a deterministic placeholder. Billing is untouched, so ledger assertions stay real.
It is a local/CI-only seam and must never be set on a deployed project.

### Release blockers

- Any quoted-vs-charged drift. The integration suite compares the `dryRun` quote,
  the job's `credits_charged`, and the ledger delta; a mismatch fails the build.
- Any open `credit_holds` row after a settled or interrupted job.
- Any secret pattern (JWT, `sb_secret_…`, `sk-…`) in a response or an error.

## 2. Manual live harness (§11.2) — blocked on external accounts

These require accounts the CI runner does not have. Run them by hand before a
release and record the result. `scripts/plugin/live-harness.sh` walks the matrix,
prints each step, and captures your verdicts into a report file.

```bash
export WZRD_PAT=wzrd_pat_…            # a real token from Settings → Agent access
scripts/plugin/live-harness.sh        # interactive; writes live-harness-report.md
scripts/plugin/live-harness.sh --dry  # print the matrix without prompting
```

The non-interactive checks the script performs for you (no account needed):

- `/health` reports the deployed version and commit;
- `initialize` advertises `serverInfo.version` equal to the local plugin version;
- `tools/list` matches the committed registry;
- an unauthenticated `tools/call` returns `-32001`.

| # | Client | Step | Expected |
| --- | --- | --- | --- |
| 1 | Claude Code | `/plugin marketplace add gratitude5dee/WZRD-Studio` then `/plugin install wzrd-studio` | plugin installs; nine skills listed |
| 2 | Claude Code | `/wzrd:setup` | project created, timeline deep link shown, 0 credits |
| 3 | Claude Code | `/wzrd:storyboard` ×3 iterations | free propose/diff loop, storyboard rendered as a table by the hook |
| 4 | Claude Code | `/wzrd:generate` | balance check → dry-run quote → explicit confirmation → 2 credits charged once |
| 5 | Claude Code | `/wzrd:handoff` | review packet, every slot filled or null with a reason, 0 credits |
| 6 | Claude Code | decline the confirmation | nothing charged |
| 7 | Codex | `codex mcp add wzrd-remote --url … --bearer-token-env-var WZRD_PAT` + `npx skills add …` | tools and skills available; golden path repeats |
| 8 | Hermes | `com.hermes/agent.yaml` | every generate goes through draft/approve |
| 9 | OpenClaw | manifest activation | plugin activates; skills + mcp.json alone are sufficient |
| 10 | VS Code / Cursor / Copilot / Kiro | `mcp.json` snippet from Settings → Agent access | server connects; golden path repeats |
| 11 | Any | revoke the token mid-session | next call fails with `-32001`, client stops cleanly |
| 12 | Any | token with a 1-credit monthly cap | generation refused with `-32003` and `{ used, cap, resetsAt }` |
| 13 | Web app | open the timeline tab after step 4 | the generated frame is visible in the app |
