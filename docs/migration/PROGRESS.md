# WZRD.Studio Vercel Web Migration Progress

## Current Branch

- Branch: `codex/wzrd-vercel-web`
- Source spec: `goal-vercel.md`
- Current phase: Phase 0 - baseline, inventory, guardrails

## Phase 0 Status

- [x] Created implementation branch.
- [x] Added `goal-vercel.md` to the working branch.
- [x] Generated migration inventory in `docs/migration/inventory.md`.
- [x] Added web-boundary check for direct Electron bridge globals and runtime Electron imports.
- [x] Moved `QCutEditor` remote-media caching through the platform adapter.
- [x] Run lint/test/build baseline gates.
- [ ] Commit Phase 0.

## Phase 0 Verification

- `bun run lint` passes. ESLint reports existing warnings, and `bun run check:web-boundaries` passes.
- `bun x vitest run src/qcut/platform/web/__tests__/adapter.test.ts` passes: 43 tests.
- `bun run build` passes: Vite built `dist/` in 1m 15s. Existing warnings remain around third-party pure annotations, browser-externalized Node modules from Story Protocol, dynamic/static chunk overlap, and oversized chunks.
- `bun run test` is not green at baseline: `src/pages/KanvasPage.test.tsx > KanvasPage > respects the studio query param and switches studios from the shell nav` stays on the Video studio after clicking the duplicated Lip Sync nav control in jsdom, then fails to find the mocked `Talking Head` button. The targeted rerun reproduces the same failure; no Phase 0 product code was changed for this unrelated Kanvas test.

## Decisions And Assumptions

- Use the existing GitHub repo for the first pass.
- Create a new Vercel project named `wzrd-studio-web` when the Next.js shell has a deployable preview.
- Keep Vite/Electron desktop scripts working while adding the Next.js web target.
- No Supabase schema changes have been made yet.

## Known Follow-Ups

- Add `src/qcut/platform/vercel/**` and select it for the Next.js build.
- Replace localStorage-backed web storage with IndexedDB/OPFS plus Supabase Storage in the persistence phase.
- Convert type-only Electron references under `src/qcut/app/**` into web-owned shared types before the final Next build gate.
- Add Vercel Route Handlers for media proxy/probe, render offload, YouTube ingest, and agent parity after the App Router shell is in place.
