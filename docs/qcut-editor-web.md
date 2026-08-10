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

`node scripts/qcut-ssr-hazards.mjs` walks `src/qcut/**` for module-scope `window` / `document` /
`navigator` / `localStorage` / `sessionStorage` / `indexedDB` / `MediaRecorder` / `matchMedia`
access:

```
src/qcut/app/components/ui/draggable-item.tsx:26   [navigator]
src/qcut/app/lib/debug/ios-console-bridge.ts:14    [navigator]

2 module-scope browser-global accesses in 2 files.
```

Both are `typeof navigator !== "undefined"` guarded iOS sniffs, so the vendored tree is currently
SSR-clean. This is unsurprising: the route is already a client-only island
(`src/app/projects/[projectId]/editor/page.tsx` → `src/next/RouteShellPage.tsx` →
`src/next/NextClientShell.tsx`, which imports the Vite `App` with `{ ssr: false }`). The scanner
exists so the Phase 3 re-vendor cannot silently reintroduce a hazard.

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
