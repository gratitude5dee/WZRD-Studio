# QCut editor on the web (Vercel)

Companion to [`docs/qcut-editor.md`](./qcut-editor.md), which documents the Electron path. This
document covers the browser build of the QCut editor served from Next.js at
`/projects/:projectId/editor`.

## Baseline 2026-08

Phase 1 of the QCut sync + browser-render work is diagnosis only: no behaviour was changed, and the
only product-code edits are instrumentation. This section is the evidence for what does and does not
work in a plain browser today.

### How the baseline was captured

`scripts/diagnostics/qcut-web-baseline.mjs` drives the editor through its own agent API
(`window.wzrd.editor.commands`) instead of the UI, so the run measures the pipeline rather than
selector stability. Per browser it records the bootstrap snapshot
(`window.__wzrdQcutWebBaseline`, produced by `src/qcut/diagnostics/web-baseline.ts`), every failed
request and console error, the export engine the factory selected, the graceful-null stub calls, and
whether a download ever arrives.

```bash
# Terminal 1 — app under test (auth bypass only applies in dev builds)
NEXT_PUBLIC_BYPASS_AUTH_FOR_TESTS=true NEXT_PUBLIC_USE_MOCK_ASSETS=true \
  bun run web:dev --port 3400 --hostname 127.0.0.1

# Terminal 2 — a third-party origin that sends neither CORS nor CORP headers
mkdir -p /tmp/xorigin && cp sample.mp4 /tmp/xorigin/
(cd /tmp/xorigin && python3 -m http.server 3999 --bind 127.0.0.1)

# Terminal 3 — same-origin fixture + the run itself
mkdir -p public/diagnostics && cp sample.mp4 public/diagnostics/sample.mp4
node scripts/diagnostics/qcut-web-baseline.mjs \
  --base-url http://127.0.0.1:3400 \
  --project-id diagnostic-project \
  --media-url http://127.0.0.1:3400/diagnostics/sample.mp4 \
  --remote-media-url http://127.0.0.1:3999/sample.mp4 \
  --browsers chromium,firefox,webkit \
  --out /tmp/qcut-baseline
```

Notes on the harness environment:

- The auth bypass (`shouldUseLocalProjectData`) requires a **dev** build *and* a **non-UUID**
  project id, hence `diagnostic-project`. With a UUID the editor asks Supabase for a project row,
  gets `PGRST116` (0 rows) and never activates a project — every agent command then fails with
  `Editor is not ready (no active QCut project loaded)`.
- `public/diagnostics/sample.mp4` is a local fixture and is intentionally **not** committed; pass
  `--media-url` at whatever same-origin URL you host it.
- The numbers below come from `next dev` on a headless Linux VM. Codec availability
  (notably AAC) and WASM load times differ from a real desktop Chrome/Safari, which is called out
  per finding.

### Per-browser results

| | Chromium 143 (headless) | Firefox 145 (headless) | WebKit 26 (headless) |
|---|---|---|---|
| Route mounts | yes | yes | yes (then crashes) |
| Project activates | yes | **no** — `project: null` | n/a |
| Import from URL | yes | blocked by inactive project | n/a |
| Add clip / add text | yes | text yes, clip n/a | n/a |
| Preview renders | yes | yes | n/a |
| **Export produces a file** | **no** | **no** | n/a |
| Engine selected | Muxer (mediabunny, WebCodecs) | FFmpeg WASM fallback | n/a |
| `crossOriginIsolated` | true | true | n/a |
| `typeof SharedArrayBuffer` | function | function | n/a |
| WebCodecs probe (bootstrap) | true | true | n/a |
| Export failure | `mp4a.40.2 … not supported by this browser` | `FFmpeg initialization timed out after 60s` | n/a |

Raw reports and screenshots: `/tmp/qcut-baseline/{chromium,firefox,webkit}.{json,png}`.

WebKit renders the shell and installs the agent API — the last console line before the crash is the
graceful-stub warning — then the content process dies with
`GStreamer:ERROR:../gst/gst.c:635:gst_register_core_elements: code should not be reached`. That is a
host-library incompatibility on this Ubuntu 22.04 VM (reproducible with both the pinned Playwright
WebKit and an older build), **not** an application error, so Safari remains unverified. Real Safari
coverage needs a macOS runner or a manual pass on the Vercel preview; it is the one acceptance item
Phase 1 could not produce evidence for.

### Blocked / failed requests

| Request | Browser | Result | Meaning |
|---|---|---|---|
| `http://127.0.0.1:3999/sample.mp4` (`<video src>`) | Chromium | `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep` | COEP `require-corp` blocks any third-party media that does not send CORP |
| same, Firefox | Firefox | "blocked due to its Cross-Origin-Resource-Policy header (or lack thereof)" | same |
| same, `fetch()` | both | CORS failure, `TypeError: Failed to fetch` | third-party origins without `Access-Control-Allow-Origin` are unusable directly |
| `/ffmpeg/ffmpeg-core.{js,wasm}` | Chromium | `net::ERR_ABORTED` ×3 pairs | availability probe issues `HEAD`, then re-requests; noisy but non-fatal (`ffmpegWasmFallback.available === true`) |
| `blob:…` range requests | Chromium | `ERR_REQUEST_RANGE_NOT_SATISFIABLE` ×8 | `importMediaByUrl` stores a **zero-byte** placeholder `File`; the preview element then range-requests an empty blob |

The canvas-taint probe could not run: because COEP blocks the cross-origin element load outright,
there is never a decoded frame to draw. Taint therefore cannot be measured until the COEP posture
changes — which is itself the finding.

### Graceful-null stub calls observed

Instrumented in `createGracefulNamespace` (`src/qcut/platform/web/index.ts`); every call is recorded
on `window.__wzrdQcutGracefulStubCalls` and warned once in dev.

| Call | Caller | Consequence |
|---|---|---|
| `platform.screenRecording.getStatus` | editor bootstrap | benign; UI treats null as "not recording" |
| `platform.projectJson.write` | project autosave | **project state is never persisted anywhere durable** — the write silently resolves `null`; this is the gap the Phase 2 snapshot migration closes |

The remaining graceful namespaces (`sounds`, `audio`, `video`, `screenshot`, `ffmpeg`,
`transcription`, `fal`, `geminiChat`) were not hit on a bare import/edit/export run; they are reached
from the AI panels and are Phase 2/4 work.

### SSR hazards

`node scripts/qcut-ssr-hazards.mjs` parses `src/qcut/**` with the TypeScript AST and reports every
`window` / `document` / `navigator` / `localStorage` / `sessionStorage` / `indexedDB` /
`MediaRecorder` / `matchMedia` reference that executes at import time — it descends into everything
except function-like bodies, and separates access behind a `typeof window !== "undefined"` guard
(safe on the server) from unguarded access (throws):

```
11 unguarded module-scope browser-global accesses (plus 25 behind a typeof guard) in 22 files.
```

Every unguarded one is a debug handle assigned at module scope, e.g.:

```
src/qcut/app/stores/timeline/timeline-store.ts:212      (window as any).__timelineStore = …
src/qcut/app/stores/project-store.ts:643                (window as any).__projectStore = …
src/qcut/app/stores/media/media-store.ts:746            (window as any).__mediaStore = …
src/qcut/app/stores/export-store.ts:414                 (window as any).__exportStore = …
src/qcut/app/stores/editor/editor-store.ts:123          (window as any).__editorStore = …
src/qcut/app/components/editor/media-panel/store.ts:274 (window as any).__mediaPanelStore = …
src/qcut/app/lib/media/blob-url-debug.ts:139            window.blobUrlDebug = { … }
src/qcut/app/lib/debug/ios-console-bridge.ts:17,18,48   (window as any).__qcutLogs…
src/qcut/app/lib/stickers/sticker-test-helper.ts:14     (window as any).stickerTestReady = …
```

They are inert today because the route is a client-only island
(`src/app/projects/[projectId]/editor/page.tsx` → `src/next/RouteShellPage.tsx` →
`src/next/NextClientShell.tsx`, which imports the Vite `App` with `{ ssr: false }`), so none of
these modules ever execute on the server. Each would throw `window is not defined` the moment any
part of this tree is imported from a server component — importing a single store type from a
server file is enough. The guarded set is not a hazard but is the Phase 2 storage inventory: the
`localStorage` reads in `keybindings-store.ts:19` and `adjustment-store.ts:538` run on import and
have to survive the IndexedDB migration.

The scanner exists so the Phase 3 re-vendor cannot silently increase the unguarded count.

One related item is *not* an SSR hazard but is worth recording: `src/qcut/QCutEditor.tsx` calls
`ensurePlatformInitialized()` at **module scope**. It is safe today only because the module is never
imported on the server.

### Ranked root causes

1. **The MP4 muxer aborts the whole export when the audio encoder config is unsupported.**
   `ExportEngineMuxer` configures AAC (`mp4a.40.2`, 128 kbps, 2ch, 48 kHz) unconditionally; where the
   browser has no AAC encoder the export rejects and no file is written — even though the *video*
   track encoded fine and the timeline had no audio at all. Desktop Chrome ships AAC, so this
   reproduces on Chromium-on-Linux and on any Chromium build without proprietary codecs, and it is
   the single reason "export produces a file" is `no` on the WebCodecs path. Fix: probe the audio
   config, and degrade to no-audio, to Opus, or to a labelled WebM instead of failing the export.
2. **The FFmpeg WASM fallback cannot initialise inside the 60 s budget.** Firefox took the fallback
   branch and died on `FFmpeg initialization timed out after 60s`, loading the 32 MB core through
   blob URLs. Even when it eventually loads, a 32 MB blocking download is not a viable export path.
   Fix: stream the core from the same origin without the blob indirection, raise/observe the budget,
   and report progress rather than a flat timeout.
3. **Firefox never activates a project.** `getProjectState` returns `project: null`, so every
   media/import command is rejected with "Editor is not ready". Chromium on the identical URL loads
   `wzrd:diagnostic-project`. Until this is fixed, Firefox cannot import at all.
4. **COEP `require-corp` makes all third-party media unloadable.** Confirmed in both engines. The
   self-hosted core (`public/ffmpeg/ffmpeg-core.js`) contains zero `SharedArrayBuffer`/`pthread`
   references — it is single-threaded — and the WebCodecs path does not need isolation either, so
   the isolation headers currently buy nothing and cost every remote asset. Phase 2 should drop them
   (or fall back to `credentialless`) and route the remainder through `/api/media/proxy`.
5. **`platform.projectJson.write` resolves to a silent null.** No durable project persistence on the
   web, and no error to tell the user. Needs the additive Supabase snapshot table plus a real
   adapter implementation.
6. **Web storage is `localStorage`-backed** (`qcut:` prefix in `src/qcut/platform/web/index.ts`), so
   media binaries and timeline state share a ~5 MB quota with no `QuotaExceededError` handling.
   IndexedDB/OPFS is Phase 2.
7. **`importMediaByUrl` stores a zero-byte placeholder `File`.** Every downstream consumer that
   reads bytes (preview range requests, export decode) is working against an empty file; the
   `ERR_REQUEST_RANGE_NOT_SATISFIABLE` storm is the symptom.
8. **Render offload is a stub.** `createVercelAdapter().ffmpeg.exportVideoCLI` queues a
   `web_render_jobs` row and returns `success: false` with no polling, so the "server render" escape
   hatch cannot produce a file either.

Not a defect, but relevant to the Phase 5 bundle budget: the route mounts the entire Vite SPA shell,
not just the editor.

## Phase 2 — browser render and export

Phase 2 fixes the Phase 1 findings on the currently vendored code (no re-vendor yet). What changed
and why, in the order of the ranked root causes above:

### 1. Codec negotiation instead of a hard-coded MP4/AAC pipeline

`ExportEngineMuxer` now negotiates a container and codecs against the browser before it builds the
output, using mediabunny's `getFirstEncodableVideoCodec` / `getFirstEncodableAudioCodec`:

- MP4 is tried first, with whatever video codec of `Mp4OutputFormat.getSupportedVideoCodecs()` the
  browser can actually encode at the export resolution and bitrate;
- WebM is the fallback container when no MP4 video codec is encodable (Firefox without H.264);
- audio is probed **only when the timeline actually has audio**. A container is preferred only if it
  can carry both tracks, so a timeline with sound on a browser without AAC exports as WebM/Opus
  rather than a silent MP4;
- if *no* container can encode the audio, the most preferred video-capable container is used and the
  export continues video-only with a progress message rather than rejecting. That rejection is the
  specific bug that made every Chromium-on-Linux export fail with `mp4a.40.2 … is not supported`.

The chosen plan is exposed as `engine.encodingPlan` (`{container, mimeType, fileExtension,
videoCodec, audioCodec}`) and the blob is built with `plan.mimeType`, so the fallback is visible
rather than implied. If neither container is encodable the error names the resolution instead of the
codec string.

`resolveExportFilename` (`src/qcut/app/lib/export/export-filename.ts`) derives the extension from the
blob's MIME type, not from the requested format, so a WebM fallback is saved as `.webm`. MOV keeps
its label because MOV and MP4 share a MIME type and only a genuine mismatch rewrites the extension.
Both save paths go through it: `ExportEngine.downloadVideo` and `saveExportedVideo`, which is what
the editor's export flow (`use-export-progress`) and the agent API actually call — the export history
entry and the success toast report that same corrected name.

### 2. FFmpeg WASM fallback: budget and isolation

The browser load budget is now a flat 180 s with 5 s progress logging, and the timeout message says
what is slow (fetching and compiling a ~32 MB core). The old budget branched on
`hasSharedArrayBuffer` and gave the *shorter* 60 s to the isolated path — which is exactly the path
Firefox took when it timed out.

`getFfmpegWasmFallbackState()` no longer requires cross-origin isolation by default. The self-hosted
core is single-threaded, so isolation was gating a capability it does not need; callers that ship a
multi-threaded core can still pass `requireCrossOriginIsolation: true`.

### 3. COOP/COEP posture: `require-corp` removed

`next.config.ts` keeps `Cross-Origin-Opener-Policy: same-origin` on the editor routes and drops
`Cross-Origin-Embedder-Policy: require-corp`. Evidence for the decision:

- `public/ffmpeg/ffmpeg-core.js` has zero `SharedArrayBuffer` / `pthread` references — single
  threaded, no shared memory, no isolation requirement;
- the WebCodecs/mediabunny path never needed isolation;
- `require-corp` blocked every third-party media element, font and provider asset that does not send
  CORP (measured in both Chromium and Firefox in Phase 1).

So isolation cost every remote asset and bought nothing. `credentialless` was not needed: with COEP
gone there is nothing left to relax. Should a multi-threaded core ever be adopted, this decision
reverses and the fallback must opt back in via `requireCrossOriginIsolation`.

### 4. Media import downloads real bytes

`importMediaByUrl` fetches the URL into a real `File` instead of registering a zero-byte placeholder
— directly first, then through `platform.mediaImport.cacheRemoteMedia` (which the Vercel adapter
routes to `/api/media/proxy`) for origins without CORS. The resulting object URL is same-origin, so
drawing the frame during export does not taint the canvas. An unreachable URL still lands on the
timeline as a placeholder, but now warns instead of silently exporting a blank frame.

### 5. Storage: IndexedDB with quota errors and persistence

`createVercelAdapter()` replaces the localStorage-backed `platform.storage` with
`src/qcut/platform/vercel/storage.ts`: an IndexedDB key-value store that migrates existing `qcut:`
localStorage entries once (skipping keys IndexedDB already owns, so a value written this session
wins), raises a typed `StorageQuotaError` with an actionable message instead of returning `false`,
and requests `navigator.storage.persist()` on adapter creation.

Note that QCut's own `StorageService` (projects, media blobs, timelines) was already on
IndexedDB + OPFS; `platform.storage` is the smaller preferences/state surface that was still capped
at ~5 MB.

### 6. `projectJson.write` is no longer a silent null

The Vercel adapter implements `projectJson.write` with the same
`writeQcutSnapshotToSupabase` used by the desktop adapter — it is plain PostgREST against
`projects.qcut_project_json`, with the existing `updated_at` optimistic-concurrency guard, so
browser edits persist exactly like desktop ones.

### Still open after Phase 2

- **Firefox never activates a project** (`getProjectState` returns `project: null`) — under
  investigation; it blocks the Firefox half of the export matrix.
- **Render offload polling.** `exportVideoCLI` still queues a `web_render_jobs` row and returns
  `success: false`; the client-side export path is now the supported one.
- **Safari** remains unverified (Playwright WebKit crashes on this VM's GStreamer).
- The additive project-snapshot migration and the remaining adapter overrides (fal, transcription,
  license/credits) are still to come.
