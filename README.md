# WZRD.Studio Desktop v0

WZRD Studio Desktop is the packaged macOS build of WZRD, an AI creative studio for moving from concept to storyline, node-based generation, editing, and final delivery in one workflow.

This repository contains the React/Vite renderer, Electron shell, Supabase edge functions, and desktop deep-link/auth plumbing for the v0 desktop release.

## Download

### macOS Apple Silicon

[Download WZRD Studio v0.0.0 DMG](https://github.com/gratitude5dee/WZRD.Studio-Desktop-v0/releases/download/v0.0.0/WZRD-Studio-0.0.0-arm64.dmg)

- Architecture: Apple Silicon (`arm64`)
- File size: approximately 226 MB
- SHA-256: `26a34dc61c41bf1e0a1e17c8783488974d58f3f0b8efb22a31204c383241736f`
- Release page: [WZRD Studio Desktop v0.0.0](https://github.com/gratitude5dee/WZRD.Studio-Desktop-v0/releases/tag/v0.0.0)

The current DMG is unsigned. If macOS blocks the first launch, open **System Settings > Privacy & Security**, find the WZRD Studio notice, and select **Open Anyway**.

## Highlights

- Electron desktop app with `wzrd://` deep-link support
- Thirdweb in-app wallet auth bridged into Supabase sessions
- Google/Thirdweb browser auth return support for packaged desktop builds
- React Flow studio canvas for AI generation workflows
- Remotion-powered video editor and preview pipeline
- Supabase backend with edge functions, storage, auth, and realtime data
- Integrations for fal.ai, GMI Cloud, Groq, Lovable AI Gateway, ElevenLabs, Thirdweb, and Story Protocol components

## Desktop Auth Flow

Desktop social auth uses Thirdweb v5 in `auth.mode = "window"` so Google sign-in can complete in the system browser. The callback returns through:

```text
wzrd://auth/thirdweb
```

Electron maps that callback into the renderer login route and preserves only the Thirdweb SDK callback parameters required for auto-connect:

- `authResult`
- `authCookie`
- `walletId`
- `authProvider`

The app stores a sanitized `next` route locally before auth starts, consumes it after successful Supabase wallet auth, and falls back to `/home`.

Desktop deep-link diagnostics are written with auth values redacted:

```text
~/Library/Logs/WZRD Studio/desktop.log
```

## Requirements

- macOS on Apple Silicon for the current packaged target
- Bun
- Node.js compatible with the project toolchain
- Supabase project credentials
- Thirdweb client configuration

## Environment

Create a local `.env` file with the required public Supabase and provider values. At minimum:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_THIRDWEB_CLIENT_ID=<thirdweb-client-id>
```

Additional provider keys may be required depending on which generation workflows you run.

## Development

Install dependencies:

```bash
bun install
```

Start the web renderer:

```bash
bun run dev
```

Start the Electron desktop app in development:

```bash
bun run desktop:dev
```

## Verification

Run targeted unit tests:

```bash
bun x vitest run src/lib/thirdweb/wallets.test.ts src/lib/desktop.test.ts electron/deep-links.test.js
```

Run the desktop smoke test:

```bash
bun run desktop:test
```

Run lint:

```bash
bun run lint
```

Build the web renderer:

```bash
bun run build
```

## Packaging

Build the macOS Apple Silicon DMG:

```bash
bun run desktop:dist:mac
```

The local output is written to:

```text
release/WZRD-Studio-0.0.0-arm64.dmg
release/mac-arm64/WZRD Studio.app
```

Published builds are available from [GitHub Releases](https://github.com/gratitude5dee/WZRD.Studio-Desktop-v0/releases).

## Repo Notes

- Generated build outputs are ignored: `dist/`, `release/`, and test artifacts.
- Supabase generated types should not be edited by hand.
- Edge functions live in `supabase/functions/`.
- Desktop shell code lives in `electron/`.
- Renderer app code lives in `src/`.
