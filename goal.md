# WZRD Studio Desktop Goal Spec: QCut as the Native Agentic Editor on /editor

> Previous goal (Sourcify/Postz) is complete and archived at `docs/goals/goal-sourcify-postz.md`.

**Audience:** Kiwi Code (autonomous coding agent)
**Scope:** This repo (`WZRD.Studio-Desktop-v0-main`) ONLY. All UI changes are confined to the `/editor` page — canonical route `/projects/:projectId/editor` plus its legacy aliases `/editor/:projectId` and `/video-editor/:projectId`. No other page's UX may change.
**Source of truth for imported code:** the sibling QCut repo checkout at `../qcut-master/qcut` (referred to below as **QCUT_SRC**). It is read-only reference material — never edit it.
**Status:** Authoritative plan. Execute phases in order; each phase has acceptance criteria and must pass before the next begins.

---

## 1. Mission

Replace the bespoke editor on the `/editor` page (`src/pages/EditorPage.tsx` → `src/components/editor/VideoEditor.tsx`) with the **full QCut editor** — multi-track timeline, preview, properties, media panel with all its views, export engines, and QCut's agentic surfaces (terminal, AI chat, skills) — so QCut becomes WZRD.Studio's native, agent-drivable editor. The editor must:

1. Load WZRD projects (Supabase `projects` table) from the `projectId` route param.
2. Provide QCut's full editing feature set in-process — no iframe, no module federation, one React tree.
3. Be drivable by agents: expose timeline/media/export operations as a typed command API callable from WZRD's agent-skills, MCP server, and voice layer; and host QCut's own agent panels inside the editor.
4. Leave every other page (Studio, Storyboard/Timeline, Directors-Cut, Kanvas, Clipper, Sourcify, Postz, IP Vault, Billing…) untouched.

---

## 2. Ground truth — verified facts about both codebases

### 2.1 Host app (this repo)

- Build: Vite 5 + `@vitejs/plugin-react-swc`, TypeScript 5.5, Bun lockfile, Electron 42 shell (`electron/main.js`, `electron/preload.cjs` exposing `window.wzrdDesktop`).
- UI stack: React **18.3**, react-router-dom 6, Tailwind **3.4** + shadcn/radix, zustand 5, TanStack Query 5, framer-motion.
- Editor route today: `src/app/AuthenticatedRoutes.tsx` maps `/projects/:projectId/editor` → `src/pages/EditorPage.tsx` → `VideoEditorProvider` + `VideoEditor`. Legacy `/editor/:projectId` and `/video-editor/:projectId` redirect via `RedirectLegacyEditorProject`. Route constants live in `src/lib/routes.ts`.
- Editor state today: `src/store/videoEditorStore.ts` (zustand) — `Clip`/`AudioTrack` with transforms, effects, masks, keyframes; loaded/saved through Supabase (`src/integrations/supabase/client`).
- Current editor UI: `src/components/editor/**` (VideoEditor, VideoEditorMain, TimelinePanel/Clip/Track, EditorPreviewStage, PropertiesPanel, EditorMediaPanel, FinalExportPanel, EditframeWorkbenchCanvas, Remotion `EditorComposition`).
- Native media IPC already in place: `wzrd:media:*` and `wzrd:clip-studio:*` handlers (`electron/media-ffmpeg-runtime.js`, `media-ffmpeg-commands.js`, `media-file-access.js`, `clip-studio-ffmpeg.js`) — probe, cut, thumbnails, waveform peaks, proxy render, render-timeline, cache-remote-media, YouTube download, plus progress events.
- Agentic today: `VoiceAgentProvider` (`@openai/agents`), `agent-skills/index.json` (list-models, generate-shot, render-timeline, run-studio-graph, make-magic, billing-checkout → MCP tools), `mcp/` servers, `docs/mcp/wzrd-studio.yaml`.
- Version pins that matter: `remotion`/`@remotion/player` **^4.0.168**, `zod` **^4.4.3**, `lucide-react` 0.462, `@react-three/fiber` **8** (React-18-bound), `react-resizable-panels` **2.1**, `@fal-ai/client` 1.2.

### 2.2 QCut (QCUT_SRC)

- Layout: Bun + Turborepo monorepo. The editor app is `QCUT_SRC/apps/web` (Vite 7, React **19**, TanStack Router file routes, Tailwind **4**, zustand 5). Electron shell in `QCUT_SRC/electron`.
- Domain core: `QCUT_SRC/packages/editor-core` (`@qcut/editor-core`) — timeline types/validation/track-utils/element-utils, command history, captions (ASS parse/generate), beat detection, search engine. Pure TS, no React.
- Platform seam: `@qcut/platform-core` exposes `initPlatform(adapter)` / `platform()` (singleton in `src/provider.ts`) plus capability flags and ~25 namespaced APIs (files, storage, ffmpeg, pty, mcp, skills, fal, transcription, screenshot, screen-recording, project-folder, project-json, updates…). `@qcut/platform-web` is the browser adapter ("QCut Lite") — desktop-only namespaces throw `PlatformUnsupportedError`, web-capable gaps return graceful defaults. `@qcut/platform-desktop` is the Electron adapter. Bootstrap: `apps/web/src/main.tsx` → `src/platform-init.ts` → `setupPlatform()`.
- Editor page: routes `editor.$project_id.tsx` + `editor.$project_id.lazy.tsx` → `EditorProvider`, `EditorHeader`, panel presets `DefaultLayout` / `MediaLayout` / `InspectorLayout` / `VerticalPreviewLayout` (`components/editor/panel-layouts.tsx`, react-resizable-panels), `Onboarding`, playback controls, autosave + project-json sync hooks, PTY auto-connect to a Claude session scoped to the project folder.
- Stores (`apps/web/src/stores/`): `project-store`; modular `timeline/` (crud, add/split/track ops, normalization, persistence, autosave, gap-store, scene-store, word-timeline-store); `editor/` (panel-store, playback-store, keybindings-store, camera-selector, nano-edit); `media-store`; `export-store`; `effects-store`; `stickers(-overlay)-store`; `captions-store`; `folder-store`; `search-store`; `ai/` (text2image, remotion + action modules, segmentation, adjustment); `pty-terminal-store`; `gemini-terminal-store`; `skills-store`; `mcp-app-store`; `screen-recording-store`; `webcam-overlay-store`; `beat-detection-store`; `moyin/` suite.
- Media-panel tabs (`components/editor/media-panel/store.ts`): media, text, stickers, video-edit (Audio Studio), effects, transitions, filters, text2image, nano-edit (Skills), ai (AI Video), sounds, segmentation, remotion, **pty (Terminal)**, word-timeline (Smart Speech), project-folder, upscale, moyin, **ai-chat**, search.
- Export engines (`apps/web/src/lib/export/`): canvas renderer (`export-engine.ts`), MediaRecorder (`-recorder`), muxer via `mediabunny`, optimized variant, native-FFmpeg CLI engines (`-cli*`, Electron-only), Remotion engine (`lib/remotion/export-engine-remotion.ts`); chosen by `export-engine-factory.ts`.
- Storage (`apps/web/src/lib/storage/`): `storage-service.ts` over IndexedDB / OPFS / localStorage / Electron adapters (+`r2-client`).
- Agentic: PTY terminal views (`media-panel/views/pty-terminal/*`, xterm + node-pty over IPC), Gemini terminal views, AI chat (pi-agent: `@mariozechner/pi-agent-core|pi-ai|pi-web-ui`), skills system (`skills-store`, default skills resources), MCP SDK use.
- Version pins that matter: React 19, Remotion **4.0.424 pinned across all `remotion`/`@remotion/*`**, zod **3.25.76 pinned**, Tailwind 4 (`@tailwindcss/postcss`), `@ffmpeg/ffmpeg` 0.12 wasm, `mediabunny`, `@fal-ai/client` 1.9, lucide 0.574, `@tanstack/react-router` 1.161.
- Proof the editor runs without its Electron shell: `VITE_BUILD_TARGET=web` ("QCut Lite") builds and runs on the web adapter alone.

### 2.3 Why this integration is tractable

QCut's editor never calls Electron or a backend directly — every privileged operation goes through `platform()`. So the strategy is: vendor QCut's app layer + `editor-core` + `platform-core`/`platform-web`, then write **one new `platform-wzrd` adapter** that maps QCut's platform API onto WZRD's existing `window.wzrdDesktop` IPC, Supabase, and fal/credits plumbing. Mounting is a plain component swap on the existing route — react-router stays, TanStack Router is never imported.

---

## 3. Non-negotiable constraints

1. **Blast radius:** UI changes only on the `/editor` page. Shared-infra changes (dependency upgrades, additive electron IPC, vite/tsconfig aliases) are allowed only where §5/§6 sanctions them and must be backwards-compatible.
2. **One React, one Remotion** version in the bundle. No iframes, no module federation, no duplicated frameworks.
3. **Quarantine:** all vendored QCut code lives under `src/qcut/`. Only `src/qcut/**`, `src/pages/EditorPage.tsx`, and their tests may import from `src/qcut/**`. Enforce via ESLint `no-restricted-imports` (or boundaries plugin) from Phase 1 onward.
4. **Legacy editor survives until Phase 6** behind `/projects/:id/editor?legacy=1`. Do not delete it earlier.
5. **Never modify `../qcut-master/qcut`.**
6. **Bun stays** the package manager; all existing scripts must keep working.
7. **Secrets:** no new keys in the repo. fal/Gemini/etc. flow through existing WZRD edge functions or user-entered keys via the platform adapter. Do not expose service tokens to the renderer.
8. Electron security posture unchanged: `contextIsolation` on, no `nodeIntegration`, all new privileged ops behind explicit `ipcMain.handle` channels namespaced `wzrd:qcut:*`.
9. Supabase: no RLS loosening, no editing existing migrations, no `src/integrations/supabase/types.ts` hand-edits. New persistence = one additive migration.

---

## 4. Target architecture (end state)

```
src/
  pages/EditorPage.tsx              ← thin host: resolves projectId, mounts <QCutEditor/>; ?legacy=1 → old editor
  qcut/                             ← vendored + adapted QCut (quarantined)
    editor-core/                    ← from QCUT_SRC/packages/editor-core/src   (pure TS domain)
    platform/
      core/                         ← from QCUT_SRC/packages/platform-core/src
      web/                          ← from QCUT_SRC/packages/platform-web/src
      wzrd/                         ← NEW adapter: starts from web adapter, overrides with
        index.ts                       wzrdDesktop IPC (ffmpeg/files/pty/project-folder),
        ffmpeg.ts files.ts pty.ts      Supabase storage hooks, WZRD fal/credits, api-keys
        storage.ts fal.ts skills.ts
    app/                            ← from QCUT_SRC/apps/web/src (components, stores, lib, hooks, constants, types, config)
    QCutEditor.tsx                  ← NEW entry component replacing QCut's route files:
                                       setupPlatform(createWzrdAdapter()) → project load → panel presets → EditorProvider
    bridge/
      project-bridge.ts             ← WZRD Supabase project/assets ⇄ QCut project/media mapping + snapshot sync
      agent-api.ts                  ← typed EditorCommands façade over the vendored stores
      agent-skills.ts               ← registers EditorCommands with WZRD agent-skills / MCP / voice
      feature-flags.ts              ← which media-panel tabs are enabled per platform capability
electron/
  qcut-bridge/                      ← NEW, additive: pty.cjs (node-pty sessions), project-folder.cjs,
                                       ffmpeg-extra.cjs (generic ffmpeg runner reusing media-ffmpeg-runtime)
  preload.cjs                       ← additive `wzrdQcut` namespace alongside existing `wzrdDesktop`
agent-skills/
  edit-timeline/skill.md            ← NEW skill doc for the editor command surface (+ index.json entry)
docs/qcut-editor.md                 ← architecture, adapter map, command API reference, decision log
scripts/qcut-codemods/              ← repeatable import-rewrite codemods used during vendoring
```

Routing is untouched: `AuthenticatedRoutes.tsx` already wires the canonical route and legacy redirects to `EditorPage`.

---

## 5. Dependency reconciliation (decide once, in Phase 0)

| Package | Host | QCut | Decision |
|---|---|---|---|
| react / react-dom | ^18.3.1 | ^19.1.0 | **Upgrade host to 19.x** (vendored code is built against it). Co-requisites: `@react-three/fiber` →^9, `@react-three/drei` →^10, `@react-three/postprocessing` → compatible, `@types/react*` →19, `lucide-react` →^0.574. This is the one sanctioned app-wide change; smoke-test Studio/Kanvas/three.js pages |
| remotion + @remotion/player | ^4.0.168 | **4.0.424 pinned** | Pin host to **4.0.424 exactly** (all Remotion packages must share one version). Regression-test `EditorComposition`, Kanvas remix, `remotion:*` scripts |
| zod | ^4.4.3 | 3.25.76 pinned | Keep host on zod 4. Add alias dep `"zod3": "npm:zod@3.25.76"`; codemod vendored imports `"zod"` → `"zod3"`. Never downgrade host |
| tailwind | 3.4 | 4.x | **Stay on Tailwind 3.** Port QCut's CSS variables/design tokens from its `globals.css` into `src/qcut/qcut-theme.css` scoped under `.qcut-root`; extend tw3 config with missing animations/colors; fix v4-only utility syntax case-by-case (rare in components) |
| router | react-router-dom 6 | @tanstack/react-router | **Do not add TanStack Router.** Codemod vendored imports to `@qcut-app/lib/router-shim` (`useParams`/`useNavigate`/`Link` backed by react-router-dom) |
| react-resizable-panels | ^2.1.3 | ^4.6.4 | Bump to ^4 (QCut's panel-layouts need it). Audit host usages outside `src/qcut` and fix API deltas (small surface) |
| @fal-ai/client | ^1.2.3 | ^1.9.1 | Upgrade host to ^1.9; verify existing Kanvas/Studio fal call sites |
| zustand | ^5.0.3 | ^5.0.11 | Compatible as-is |
| New deps | — | — | `@ffmpeg/ffmpeg @ffmpeg/core @ffmpeg/util`, `mediabunny`, `idb`, `wavesurfer.js`, `@xterm/xterm @xterm/addon-fit @xterm/addon-web-links`, `@hello-pangea/dnd`, `motion`, `gif.js`, `jszip`; Phase 4: `@mariozechner/pi-agent-core @mariozechner/pi-ai @mariozechner/pi-web-ui`, `node-pty` (electron); Phase 5: `@modelcontextprotocol/sdk` if the existing `mcp/` servers don't already provide it |
| Do NOT vendor | — | — | `@qcut/auth` (better-auth), `@qcut/db` (drizzle/pg), license-server + `license-store` (stub as "desktop/pro"), blog/landing/marketing routes, Next.js bits, `@upstash/*`, `botid`, `@vercel/analytics`, drizzle migrations, iOS/Capacitor folder, electron auto-updater, **moyin** (defer — heavy, niche; capability-flag off) |

Anything not listed: keep the host version; add a QCut dep only when a vendored file actually imports it.

---

## 6. Phase plan

### Phase 0 — Branch + substrate upgrades (no QCut code yet)

1. Branch `feat/qcut-editor`.
2. Apply §5: React 19, Remotion 4.0.424 pin, r3f/drei majors, lucide, fal client, resizable-panels. Fix mechanical fallout app-wide.
3. Add the non-phase-gated new deps from §5.
4. Verify: `bun run lint`, `bun run build`, `bunx vitest run`, `bun run test:e2e`; manual smoke of Studio, Timeline/Storyboard, Kanvas (three.js scenes), Clipper, Directors-Cut, legacy editor.

**Accept:** app builds and behaves identically on the upgraded substrate; legacy editor still works.

### Phase 1 — Vendor QCut into quarantine

1. Copy (one-time; afterwards the vendored tree is owned here and adapted in place):
   - `QCUT_SRC/packages/editor-core/src` → `src/qcut/editor-core`
   - `QCUT_SRC/packages/platform-core/src` → `src/qcut/platform/core`
   - `QCUT_SRC/packages/platform-web/src` → `src/qcut/platform/web`
   - `QCUT_SRC/apps/web/src/{components,stores,lib,hooks,constants,types,config}` → `src/qcut/app/...`
   - Include QCut's vitest suites for vendored stores/lib/editor-core — they are the parity safety net.
   - Skip: `routes/`, `main.tsx`, `App.tsx`, auth/db/license/blog code, `stores/moyin` + `views/moyin`, e2e fixtures.
2. Codemods (write as repeatable scripts in `scripts/qcut-codemods/`):
   - `@/…` → `@qcut-app/…`; add tsconfig + vite aliases: `@qcut-app/*` → `src/qcut/app/*`, `@qcut/editor-core` → `src/qcut/editor-core`, `@qcut/platform-core` → `src/qcut/platform/core`, `@qcut/platform-web` → `src/qcut/platform/web`.
   - `"zod"` → `"zod3"` within `src/qcut/**`.
   - `@tanstack/react-router` → `@qcut-app/lib/router-shim`.
   - Stub at import site (`src/qcut/app/lib/host-stubs/`): better-auth hooks, license checks, analytics, botid, drizzle/db touchpoints.
3. Add the ESLint boundary rule (§3.3) and a focused tsconfig include so `tsc` is clean; vendored tree may use relaxed lint rules but must type-check.

**Accept:** repo compiles with the vendored tree present (not yet mounted); `bunx vitest run src/qcut` green; boundary lint enforced.

### Phase 2 — Mount QCut on /editor (web-adapter mode)

1. `src/qcut/platform/wzrd/index.ts`: `createWzrdAdapter()` = clone of `createWebAdapter()` with capability flags upgraded when `window.wzrdDesktop` exists. Storage namespace: keep QCut's IndexedDB/OPFS adapters (they work in Electron renderers too).
2. `src/qcut/QCutEditor.tsx`: port the body of QCut's `editor.$project_id(.lazy).tsx` — module-level `setupPlatform(createWzrdAdapter())` promise, project load/create via `project-store`, panel preset selection from `panel-store`, `EditorProvider` + `EditorHeader` + selected layout + `Onboarding`, playback/keybinding/autosave hooks. `projectId` arrives as a prop, not from a router hook.
3. Rewrite `src/pages/EditorPage.tsx`: keep `AppHeader`; render `<QCutEditor projectId={projectId}/>`; `?legacy=1` renders the old `VideoEditorProvider` + `VideoEditor` unchanged.
4. Theming: `.qcut-root` wrapper + `qcut-theme.css` mapping QCut tokens onto WZRD's dark palette (`#0A0D16` chrome) so it reads as native.
5. Tab gating via `bridge/feature-flags.ts`: desktop-only tabs (pty, project-folder…) show QCut's built-in unsupported state in web mode; moyin stays off.

**Accept (demo):** `/projects/<id>/editor` renders QCut. You can import local media, arrange multi-track timeline, trim/split/snap, add text, scrub a playing preview, undo/redo with keybindings, and export a playable file via the wasm/MediaRecorder path. `?legacy=1` still shows the old editor. All other routes byte-identical behavior.

### Phase 3 — WZRD data + native FFmpeg

1. `bridge/project-bridge.ts`:
   - On mount: fetch the WZRD project row by `projectId`; open-or-create the QCut project keyed `wzrd:<projectId>`; sync name.
   - Asset ingestion: list the WZRD project's assets (Supabase storage/asset tables) → register in QCut's `media-store` as remote media; in Electron, hydrate local files through `wzrdDesktop.cacheRemoteMedia` + `resolveMediaFileUrl`.
   - Save-back: QCut autosave remains local-first; debounce-push the project JSON snapshot to Supabase (additive migration: nullable `qcut_project_json` column or storage object per project) guarded by `updated_at` last-write-wins.
2. Platform adapter desktop wiring (`platform/wzrd/ffmpeg.ts`, `files.ts`): map probe → `wzrd:media:probe`, thumbnails → `wzrd:media:extract-thumbnail`, waveform → `wzrd:media:extract-waveform-peaks`; add `electron/qcut-bridge/ffmpeg-extra.cjs` exposing a generic argv runner `wzrd:qcut:ffmpeg-run` (reuses `media-ffmpeg-runtime.js` binary resolution + progress events) for QCut's CLI export engines; add `wzrd:qcut:project-folder-*` (root under `app.getPath('userData')/qcut-projects/<id>`).
3. Confirm `export-engine-factory.ts` selects the CLI engine in Electron and wasm in plain browser dev.
4. fal namespace: route QCut's AI tabs through WZRD's existing fal/edge-function path and model catalog (`shared/ai-model-catalog.ts`) so generation spends WZRD credits; surface credit-insufficiency to the host's `InsufficientCreditsDialog` event.

**Accept:** real WZRD project assets appear in the media panel; native-FFmpeg export with progress works in the packaged app (`bun run desktop:dist:mac`); AI image/video generation debits WZRD credits; project state survives app restart and its JSON snapshot lands in Supabase.

### Phase 4 — Agentic surfaces inside the editor

1. **PTY terminal:** `electron/qcut-bridge/pty.cjs` (node-pty: create/write/resize/kill/onData; channels `wzrd:qcut:pty-*`), preload exposure under `wzrdQcut`, platform `pty` namespace implementation. The vendored `pty-terminal` views + `pty-terminal-store` light up; keep QCut's auto-connect (terminal opens in the project folder, ready to run `claude`). Web mode: unsupported state.
2. **Skills:** platform `skills` namespace reading QCut default skills plus this repo's `agent-skills/*` into `skills-store`.
3. **AI chat (pi-agent) tab:** enable with `@mariozechner/pi-*`; provider keys via platform `apiKeys` → WZRD settings storage. If pi-web-ui integration is disproportionate, ship terminal-first and record the decision — terminal is the priority surface.
4. Gemini terminal: enable only if key plumbing is trivial; otherwise leave the capability off.

**Accept:** packaged app: Terminal tab opens a live shell scoped to the project folder and can run `claude`; skills list shows WZRD + QCut skills; enabled chat tabs respond. Browser dev mode degrades gracefully.

### Phase 5 — Agent command API (the native-agentic contract)

1. `bridge/agent-api.ts`: typed, schema-validated façade over the vendored stores. Minimum command set: `getProjectState`, `listMedia`, `importMediaByUrl`, `addClip`, `splitElement`, `trimElement`, `moveElement`, `deleteElement`, `addTrack`, `setText`, `applyEffect`, `addCaptionsFromTranscript`, `setPlayhead`, `selectElements`, `undo`, `redo`, `export({preset})`, `getExportStatus`. Every mutation flows through QCut's command/history so agent edits are user-undoable.
2. Expose three ways:
   - Renderer global `window.wzrd.editor` for the voice layer; register these as tools in `VoiceAgentProvider` so "split the clip at the playhead" works on `/editor`.
   - `agent-skills/edit-timeline/skill.md` + `agent-skills/index.json` entry (mirror existing skill format, `mcp_tool: edit_timeline`).
   - MCP toolset `editor.*` in the existing server config (`docs/mcp/wzrd-studio.yaml` + `mcp/`), proxied to the renderer over `wzrd:qcut:agent-command` request/response IPC with a permission gate.
3. Guardrails: commands reject when the editor isn't mounted; batch rate-limit; ring-buffer command log surfaced in a debug panel.

**Accept (scripted demo, end-to-end):** with a project open, an agent — via MCP tool call AND via voice — imports a clip by URL, splits it at 3s, deletes the tail, adds a title, exports 720p MP4; the UI reflects each step live and the user can undo the agent's edits one by one.

### Phase 6 — Parity, migration, cleanup, hardening

1. Parity matrix vs legacy editor (text overlays, masks, keyframes, bookmarks, retime → QCut equivalents); document gaps + workarounds in `docs/qcut-editor.md`.
2. One-time importer: convert an existing `videoEditorStore`-shaped Supabase project (clips/audioTracks) into a QCut timeline on first open; log unmappable bits.
3. Remove `?legacy=1` + dead legacy editor components ONLY after parity sign-off; first check whether `Clipper`/`ShotEditor` or others share `videoEditorStore` — if shared, leave the store.
4. Tests: vendored vitest suites in CI; new Playwright spec `tests/e2e/qcut-editor.spec.ts` (mount → import → edit → export-stub) in `test:e2e`; Electron smoke via `playwright.electron.config.ts`.
5. Perf: `/editor` lazy chunk ≤ legacy editor chunk +30%; ffmpeg-wasm and xterm stay dynamic imports; cold mount <3s on Apple Silicon; other routes' chunk sizes unchanged (diff `vite build` output).
6. Docs: finish `docs/qcut-editor.md` (architecture, adapter map, command API reference, tab flags, decision log); update `.claude/CLAUDE.md` pointers.

**Accept:** CI green (lint, unit, e2e, electron smoke); parity doc signed off; Phase-5 demo recorded; legacy path removed or consciously retained with a logged reason.

---

## 7. Execution rules for Kiwi Code

- One PR per phase, with acceptance evidence (test output, screenshots, demo notes) in the description.
- Prefer adapting at the seams (platform adapter, shims, codemods) over editing vendored internals; when you must edit a vendored file, mark the change `// WZRD-EDIT:` so future upstream syncs are diffable.
- When a vendored module drags in out-of-scope subsystems (auth, license, db, blog), stub at the import site in `host-stubs/` rather than deleting call sites.
- Ambiguity rule: pick the option with the smallest blast radius and record it in `docs/qcut-editor.md → Decision log`.
- Never commit a red tree: `bun run lint && bun run build && bunx vitest run` before every commit.
- Off-limits: Supabase RLS, billing/credit logic internals, auth flows, other pages' routes/components/nav, Electron window/security options.

## 8. Risks & mitigations

- React 19 vs `@react-three/fiber` 8 (Studio/Kanvas three.js scenes) — highest-risk upgrade; handled in Phase 0 with mandatory r3f/drei major bumps and manual scene smoke-tests.
- Remotion 4.0.168 → 4.0.424 behavior drift in existing compositions — Phase 0 regression pass on Kanvas remix + `EditorComposition`.
- Tailwind 3 hosting Tailwind-4-authored components — token sheet + per-panel visual pass; v4-only utility syntax is rare and fixed case-by-case.
- Dual zod majors — hard rule: inside `src/qcut/**` only `zod3` imports; ESLint forbids bare `zod` there.
- `node-pty` native build against Electron 42 — pin a known-good version, add rebuild step to `desktop:build`; if it fights, feature-flag the terminal tab off so the editor ships regardless.
- Bundle growth — editor stays a lazy route chunk; heavy subsystems (ffmpeg-wasm, xterm, pi-web-ui) behind dynamic imports; check build stats every phase.
- fal client 1.2→1.9 host breakage — grep host call sites; surface is small; test Kanvas/Studio generation.
- Supabase snapshot write conflicts — editor-owned snapshot, last-write-wins with `updated_at` guard; documented.

## 9. Non-Goals

- No changes to Studio node graph, Storyboard/Timeline page, Directors-Cut, Kanvas, Clipper, Sourcify, Postz, IP Vault, billing, auth, or navigation structure/order.
- No QCut marketing/blog/auth/license/db code, no moyin suite (deferred), no iOS/Capacitor, no QCut auto-updater.
- No second editor route: QCut replaces the editor at the existing `/editor` URLs rather than adding a parallel page.
- No server-side rendering or Remotion cloud rendering work in this goal.

## 10. Definition of Done

`/projects/:id/editor` (and legacy `/editor/:id`, `/video-editor/:id` aliases) serves the QCut editor as WZRD's native editor: full multi-track editing + preview + export (native FFmpeg on desktop, wasm fallback), WZRD project/asset/credit integration, terminal + skills + chat panels live on desktop, and a documented agent command API reachable via voice, agent-skills, and MCP that performs real, fully-undoable edits — with every other page unaffected beyond the sanctioned dependency upgrades, and lint, unit, e2e, and Electron smoke checks green.
