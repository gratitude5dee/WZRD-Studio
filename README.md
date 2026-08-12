# WZRD Studio

**A creator operating system** — take a project from concept → storyboard → AI generation → editing → final delivery, in one workflow.

- **Web app**: [studio.wzrd.tech](https://studio.wzrd.tech)
- **Docs**: [studio.wzrd.tech/docs](https://studio.wzrd.tech/docs)
- **Desktop**: packaged macOS (Apple Silicon) app with native FFmpeg export, PTY terminal, and `wzrd://` deep links

Every project carries three connected surfaces:

| Surface | What it does |
|---|---|
| **Studio** | Node-based generation canvas with a prompt-to-workflow generator (the "video agent"). Wire image/video/audio model blocks into executable graphs. |
| **Timeline** | Storyboard: scenes → shots → prompts → generated frames, with character/setting continuity and one-click scene generation. Director's Cut assembles shot videos into a final cut. |
| **Editor** | Full video editor: multi-track timeline, undo/redo, effect keyframes, text animations, karaoke captions, AI panels, and client-side export (WebCodecs MP4 / WebM / GIF) or native FFmpeg on desktop. |

## Feature highlights

- **Project setup wizard** — concept, storyline, settings & cast, breakdown; AI-developed or stick-to-script.
- **Kanvas AI studios** — focused image / video / cinema / lipsync / lyric-video / remix tools.
- **Clip Studio, Sourcify & Postz** — find viral clips, source content, and schedule posts across channels (OAuth connect, multi-channel composer, calendar).
- **IP Vault** — register creative assets on-chain via Story Protocol.
- **Credits & billing** — every AI call priced server-side from a model catalog (1 credit = 1¢), strict pricing, no provider keys in the browser.
- **Agent plugin & MCP** — drive WZRD from Claude Code, Codex, Hermes, OpenClaw and other harnesses via the MCP server and `agent-skills/` bundle. Discovery: `/.well-known/agents.json`.

Full feature documentation lives at **[/docs](https://studio.wzrd.tech/docs)** (source: `src/docs/`).

## Stack

React 18 + TypeScript + Vite (renderer) · Next.js App Router (web shell on Vercel) · Electron (desktop) · Tailwind + shadcn/ui · Zustand · Remotion · Supabase (auth, DB, Deno Edge Functions) · Thirdweb wallet auth · fal.ai / GMI / Gemini / Groq / ElevenLabs providers · Story Protocol

## Development

Requirements: Bun, Node.js, Supabase project credentials.

```bash
bun install          # dependencies
bun run dev          # web renderer (Vite)
bun run desktop:dev  # Electron desktop app
```

Create a local `.env` with at minimum:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_THIRDWEB_CLIENT_ID=<thirdweb-client-id>
```

### Verification

```bash
bun run lint                 # eslint
bunx vitest run              # unit tests
bun run build                # production build
bun run desktop:test         # desktop smoke test
```

## Desktop app (macOS)

Build the Apple Silicon DMG:

```bash
bun run desktop:dist:mac
```

Outputs `release/wzrdstudiofinal555-apfs.dmg` and `release/mac-arm64/WZRD Studio.app`. The DMG build is forced to **APFS** via `hdiutil`.

### Install

1. Mount the DMG and drag **WZRD Studio.app** into **Applications**.
2. First launch (unsigned build): **right-click → Open**, or allow it under **System Settings → Privacy & Security**.

### Deep links

| Purpose | URL |
|---|---|
| Auth callback | `wzrd://auth/thirdweb` |
| Postz channel connect | `wzrd://postz/connected` |

Deep-link diagnostics (auth values redacted): `~/Library/Logs/WZRD Studio/desktop.log`

## Repo layout

- `src/` — renderer app (pages, components, features, `src/qcut/` editor engine, `src/docs/` docs site)
- `src/app/` — Next.js App Router shell
- `electron/` — desktop shell (deep links, FFmpeg, PTY)
- `supabase/functions/` — Deno Edge Functions (generation, billing, MCP server)
- `supabase/migrations/` — database migrations
- `agent-skills/` — agent-agnostic skill bundle; per-harness configs in `.claude/`, `.codex/`, `.openclaw/`, `.hermes/`
- `docs/` — architecture and goal specs

Generated outputs (`dist/`, `release/`) are ignored.

## For agents

Start at [`agents.md`](agents.md) — the canonical entry point for coding agents working in this repo (allowed/forbidden paths, commands, per-harness configs).
