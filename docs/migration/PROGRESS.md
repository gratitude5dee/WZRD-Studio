# WZRD.Studio Vercel Web Migration Progress

## Current Branch

- Branch: `codex/wzrd-vercel-web`
- Source spec: `goal-vercel.md`
- Current phase: Phase 2 - Vercel platform adapter and serverless parity scaffold

## Phase 0 Status

- [x] Created implementation branch.
- [x] Added `goal-vercel.md` to the working branch.
- [x] Generated migration inventory in `docs/migration/inventory.md`.
- [x] Added web-boundary check for direct Electron bridge globals and runtime Electron imports.
- [x] Moved `QCutEditor` remote-media caching through the platform adapter.
- [x] Run lint/test/build baseline gates.
- [x] Commit Phase 0: `d49f3c7 chore: establish vercel web migration baseline`.

## Phase 0 Verification

- `bun run lint` passes. ESLint reports existing warnings, and `bun run check:web-boundaries` passes.
- `bun x vitest run src/qcut/platform/web/__tests__/adapter.test.ts` passes: 43 tests.
- `bun run build` passes: Vite built `dist/` in 1m 15s. Existing warnings remain around third-party pure annotations, browser-externalized Node modules from Story Protocol, dynamic/static chunk overlap, and oversized chunks.
- `bun run test` is not green at baseline: `src/legacy-pages/KanvasPage.test.tsx > KanvasPage > respects the studio query param and switches studios from the shell nav` stays on the Video studio after clicking the duplicated Lip Sync nav control in jsdom, then fails to find the mocked `Talking Head` button. The targeted rerun reproduces the same failure; no Phase 0 product code was changed for this unrelated Kanvas test.

## Phase 1 Status

- [x] Added Next.js App Router shell under `src/app/**`.
- [x] Added `next.config.ts`, `next-env.d.ts`, and `vercel.json`.
- [x] Added Bun/Next scripts while preserving Vite/Electron scripts.
- [x] Moved React providers into `src/app/providers.tsx`.
- [x] Moved legacy Vite route modules from `src/pages/**` to `src/legacy-pages/**`.
- [x] Recreated the route manifest from `src/lib/routes.ts` as App Router pages that mount the client shell.
- [x] Added public env helper with `NEXT_PUBLIC_*` first and `VITE_*` migration fallback.
- [x] Split Supabase config/browser/server clients so server-only clients are lazy and browser storage is not initialized during server build.
- [x] Scoped COOP/COEP headers to `/projects/:projectId/editor/:path*`.
- [x] Added webpack compatibility aliases for existing Vite-era dependencies.

## Phase 1 Verification

- `bun run web:build` passes. Next.js 16.2.9 builds 31 App Router pages/routes with known nonfatal warnings for dynamic export/remotion imports, `@mariozechner/pi-ai`, an old Browserslist DB, and one Tailwind arbitrary easing class.
- `bun run lint` passes. ESLint reports existing warnings and `bun run check:web-boundaries` passes.
- `bun run check:web-boundaries` passes independently.
- `bun run build` passes. Vite builds `dist/` successfully with existing third-party annotation and large chunk warnings.
- `bun run test` passes: 369 files passed, 2 skipped; 3,571 tests passed, 12 skipped.
- `bun x vitest run src/qcut/platform/web/__tests__/adapter.test.ts` passes: 43 tests.

## Vercel Project Status

- [x] Created new Vercel project `wzrd-studio-web` under `5dee-studios`.
- [x] Linked the local checkout to project `prj_hbk6ccJSWObGLq3KMSNgFsudAP8T`.
- [x] Connected the project to GitHub repo `gratitude5dee/wzrd-studio-desktopfinal`.
- [x] Added `.vercelignore` so CLI deploys do not upload `node_modules`, `.next`, `dist`, or desktop release artifacts.
- [x] Confirmed Vercel env list is empty for the new project; auth/media parity still needs public Supabase env and server-only secrets.
- [x] Remote Vercel build succeeded for deployment `dpl_HNjZCnN8FK7cbhgGGLopUYQuSeii` at immutable URL `https://wzrd-studio-m883c684a-5dee-studios.vercel.app`.
- [x] The initial CLI deploy was unexpectedly marked `target=production`; removed active `wzrd-studio-web*` aliases afterward so the deployment is not intentionally promoted as the production launch.
- [ ] Git-backed/CLI preview deployments from `codex/wzrd-vercel-web` are still not usable: Vercel CLI displays them as `UNKNOWN`, while the Vercel API reports `state=BLOCKED`, `target=null`, `?` duration, and no build/runtime logs. Latest attempted preview is `dpl_5hHNz2LC8tcJ2tEvRWJr3k1DJT1h` at `https://wzrd-studio-68e4woya8-5dee-studios.vercel.app`.
- [x] Aligned Vercel project settings through `PATCH /v9/projects/prj_hbk6ccJSWObGLq3KMSNgFsudAP8T`: `framework=nextjs`, `buildCommand=bun run web:build`, `installCommand=bun install --frozen-lockfile`, and `devCommand=bun run web:dev`.

## Phase 2 Status

- [x] Added `src/qcut/platform/vercel/**` as a Vercel-aware web adapter.
- [x] Updated Next client bootstrap to initialize the Vercel adapter while preserving the WZRD desktop adapter for the Vite/Electron target.
- [x] Vercel adapter now prefers authenticated `/api/media/proxy` remote-media caching, then falls back to the browser web adapter.
- [x] Self-hosted FFmpeg core assets under `public/ffmpeg/ffmpeg-core.js` and `public/ffmpeg/ffmpeg-core.wasm` for same-origin wasm fallback.
- [x] Added authenticated App Router route handlers for `/api/media/proxy`, `/api/media/probe`, `/api/render`, `/api/render/status`, `/api/youtube`, and `/api/agent/*`.
- [x] Added basic public-URL validation for media proxy/probe routes to block unsupported schemes, credentials, localhost, and literal private IP hosts.
- [x] Kept render, YouTube, and agent routes bounded/unconfigured instead of running long work inside a single serverless request.
- [x] Split Supabase server config away from the shared Vite/Next public env helper so API route bundles do not emit `import.meta`.

## Phase 2 Verification

- `bun x vitest run src/qcut/platform/vercel/__tests__/adapter.test.ts src/app/api/_lib/__tests__/media-url.test.ts` passes: 6 tests.
- `bun run web:build` passes. Next.js lists the new API routes as dynamic server functions. Existing nonfatal warnings remain for dynamic export/remotion imports, `@mariozechner/pi-ai`, old Browserslist data, and one Tailwind arbitrary easing class.
- `bun run lint` passes. ESLint reports existing warnings, and `bun run check:web-boundaries` passes.
- `bun run build` passes for the Vite/Electron target with existing third-party annotation and large chunk warnings.
- `bun run test` passes: 371 files passed, 2 skipped; 3,577 tests passed, 12 skipped.
- Vercel CLI preview deploy after commit `6d96cc5` uploaded and entered `Building...`, but the CLI never returned a final status. `vercel inspect` reports `target=preview`, `status=UNKNOWN`, and a zero-millisecond build for `dpl_5hHNz2LC8tcJ2tEvRWJr3k1DJT1h`; Vercel app tooling reports `state=BLOCKED`, `target=null`, and no build-log events.

## Decisions And Assumptions

- Use the existing GitHub repo for the first pass.
- Create a new Vercel project named `wzrd-studio-web` when the Next.js shell has a deployable preview.
- Keep Vite/Electron desktop scripts working while adding the Next.js web target.
- No Supabase schema changes have been made yet.

## Known Follow-Ups

- Replace localStorage-backed web storage with IndexedDB/OPFS plus Supabase Storage in the persistence phase.
- Add durable `web_render_jobs` persistence before enabling render offload queue/status.
- Wire YouTube OAuth/upload and agent runtime routes once server-only Vercel env is configured.
- Add browser Playwright smoke coverage for login, authenticated editor route, reload persistence, and console-free editor bootstrap.
- Run the full browser MP4 export matrix: WebCodecs/mediabunny 30s export plus forced wasm fallback reprobe/playback.
- Investigate and reduce Next webpack warnings for dynamic export/remotion imports before production.
- Configure Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`, and server-only API/secrets as route handlers come online.
- If previews remain `BLOCKED`, continue investigating Vercel Git protection. The blocked Git deployments report `gitForkProtection=true` and branch-tip commits from the local `gratitud3@mac.lan` author email.
