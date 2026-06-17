# Daytona Agent (QCut CLI / Daytona relay integration)

This repo now includes a **Daytona-powered agent terminal** UI and the required Supabase Edge Functions + migrations.

## UI routes

- `/agent` — global agent workspace
- `/projects/:projectId/agent` — project-scoped agent session
- `/sandbox` — QCut license-server sandbox shell (requires a `qcut_auth_token` in localStorage)

## Supabase (Edge Functions + DB)

### 1) Migrations

Apply the migration:

- `supabase/migrations/20260606090000_create_daytona_agent_runtime.sql`

This creates:

- `public.daytona_agent_sessions`
- `public.daytona_agent_events`

### 2) Edge functions

Functions added:

- `agent-session`
- `agent-pty-token`
- `agent-files`

Shared modules:

- `supabase/functions/_shared/daytona-agent/**`

### 3) Required secrets / env vars

Edge functions expect the following secrets to be configured:

- `DAYTONA_API_KEY`
- `DAYTONA_AGENT_IMAGE`
- `DAYTONA_AGENT_WORKSPACE_DIR`
- `DAYTONA_RELAY_JWT_SECRET`
- `DAYTONA_RELAY_URL` (should point to the Cloudflare Worker endpoint, e.g. `wss://<worker-domain>/pty`)

Optional (passed through to the sandbox):

- `OPENAI_API_KEY`
- `FAL_API_KEY` or `FAL_KEY`
- `GMI_API_KEY` / `GMI_CLOUD_API_KEY`
- `IMAROUTER_API_KEY`

## Relay worker (Cloudflare)

A deployable relay worker lives at:

- `packages/wzrd-agent-relay`

It expects secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DAYTONA_API_KEY`
- `DAYTONA_RELAY_JWT_SECRET`

The worker exposes:

- `GET /pty?token=<jwt>` (WebSocket upgrade)
