# WZRD.Studio Vercel Web Migration Progress

## Current Branch

- Branch: `codex/wzrd-vercel-web`
- Source spec: `goal-vercel.md`
- Current phase: Phase 1 - Next.js App Router shell

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

## Decisions And Assumptions

- Use the existing GitHub repo for the first pass.
- Create a new Vercel project named `wzrd-studio-web` when the Next.js shell has a deployable preview.
- Keep Vite/Electron desktop scripts working while adding the Next.js web target.
- No Supabase schema changes have been made yet.

## Known Follow-Ups

- Add `src/qcut/platform/vercel/**` and select it for the Next.js build.
- Replace localStorage-backed web storage with IndexedDB/OPFS plus Supabase Storage in the persistence phase.
- Add Vercel Route Handlers for media proxy/probe, render offload, YouTube ingest, and agent parity after the App Router shell is in place.
- Investigate and reduce Next webpack warnings for dynamic export/remotion imports before production.
