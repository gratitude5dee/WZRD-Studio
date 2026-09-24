# Motion Splat — time-aware Gaussian splats

Motion Splat turns a single image into a short video and then into a **4D
Gaussian splat** the user can orbit and scrub through time, rendered inside the
camera frustum it was captured from. The same asset doubles as the wzrd.tech
intro animation.

Route: `/motion-splat` (Kanvas group → Motion Splat). Edge function:
`supabase/functions/motion-splat`.

## 1. Pipeline

```
image ──▶ fal image-to-video ──▶ rgb.mp4
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        ▼ Depth video (default)                               ▼ 3D keyframes
  fal-ai/depth-anything-video → depth.mp4          tripo3d/triposplat × K stills → .ply
        │                                                      │
        └──────────────▶  MotionSplatManifest v1 (JSON)  ◀─────┘
                                   │
                          viewer (Spark or WebGL2 backend)
```

| Stage | Where | Model | Credits |
| --- | --- | --- | --- |
| Upload image / stills | browser → `workflow-media` bucket (`motion-splat/<user>/uploads/`) | — | 0 |
| Video | `motion-splat` action `submit` stage `video` | one of the eight models in `MOTION_SPLAT_VIDEO_MODELS` (default `fal-ai/kling-video/o3/standard/image-to-video`) | 20–32, per the table |
| Depth video | stage `depth` | `fal-ai/depth-anything-video` | 10 |
| 3D keyframe | stage `triposplat` (one job per still, 6 stills) | `tripo3d/triposplat` | 12 each |
| Manifest | action `manifest` | — | 0 |

Every fal output is copied into Storage under `motion-splat/<userId>/<jobId>/`
so the viewer never depends on temporary fal.media URLs, and each job is a
`generation_jobs` row (`config.kind = 'motion_splat'`) so the UI can resume
and list saved splats through RLS.

### Video models and pricing

`MOTION_SPLAT_VIDEO_MODELS` in `supabase/functions/_shared/motion-splat.ts`
lists every image-to-video model the studio offers, with the credits reserved
for it. `src/lib/motion-splat/constants.ts` mirrors that table, the model
picker offers exactly those ids, and the quote on the Generate button comes
from the same numbers. Anything outside the table is rejected with 400 rather
than silently priced as a fallback model, and
`src/lib/motion-splat/__tests__/videoModels.test.ts` fails if the two tables
or the catalog prices drift apart.

### Two-phase jobs

`submit` reserves credits, records the job and enqueues the fal request; the
browser then calls `status` every ~2.5 s. When fal reports `COMPLETED`, the
first `status` call to observe it claims the row (`worker_id`), copies the
outputs to Storage, commits the credit hold and marks the row completed. A
failed job releases the hold. Long generations therefore never run inside one
edge request.

Three details keep the credit ledger honest:

- **Idempotent submit.** A repeated `clientRequestId` for the same stage
  returns the job it already created (`deduplicated: true`); the hold is keyed
  by the server-generated job id, so one hold can never back two fal runs.
- **Leased claims.** The `worker_id` claim carries the time it was taken. If
  the claiming request dies mid-copy, a later `status` call takes the claim
  over once `MOTION_SPLAT_CLAIM_LEASE_MS` (3 min) has passed, instead of
  leaving the job processing forever with its credits held.
- **Cancel.** Action `cancel` takes the claim, releases the hold and marks the
  row cancelled. The studio calls it for every in-flight job when the user
  cancels or navigates away, so an abandoned build is not billed. The fal job
  itself is abandoned, not recalled.

### Manifest v1

```ts
{
  version: 1, id, title, createdAt, provider,        // 'depth-anything-video' | 'triposplat' | 'diff4splat'
  source: { videoUrl, imageUrl?, prompt?, videoModel? },
  duration, fps, width, height,
  camera: { fovDeg: 50, near: 1, far: 3 },            // virtual pinhole; near/far bound the glass box
  track:
    | { kind: 'rgbd', depthVideoUrl, depthEncoding: 'inverse-gray8', grid: { cols, rows }, keyframeCount }
    | { kind: 'splat-keyframes', keyframes: [{ time, url, format: 'ply' }] }
    | { kind: 'splat-sequence', frames: [{ time, url, format }] }   // reserved for Diff4Splat
}
```

Schema and helpers live in `src/lib/motion-splat/manifest.ts` (zod). Media
URLs may be relative to the manifest location (used by the intro bundle).

## 2. Rendering

`MotionSplatEngine` (`src/components/motion-splat/engine/`) owns the canvas,
clock and orbit camera and picks a backend:

- **Spark backend** — true 3DGS via `@sparkjsdev/spark` + three. RGB-D
  keyframes are decoded from the two videos, unprojected on the CPU and
  written straight into Spark's packed texture; scrubbing lerps neighbouring
  keyframes per splat. TripoSplat keyframes are Morton-aligned and morphed the
  same way. Update sequence per frame: mutate `packedArray` →
  `packedSplats.needsUpdate = true` → `mesh.needsUpdate = true`.
- **GPU backend** — dependency-free WebGL2 (`src/lib/motion-splat/gl/`). Each
  grid cell is an instanced Gaussian billboard unprojected in the vertex shader
  from the depth video texture, so time is simply the videos' `currentTime`
  and motion plays at the clip's native frame rate. Used when Spark is
  unavailable (the Next.js bundle stubs Spark) and by the landing intro.

Both draw the reference look: black stage, translucent camera-frustum box
(edges 35 % white, faces 5 %), oblique three-quarter framing, idle drift.

Depth is decoded from **luminance** (`inverse-gray8`: brightness ∝ disparity),
so grayscale and perceptually uniform colormaps (inferno, viridis, magma)
from the depth model all work.

Keyboard: Space play/pause · J/K previous/next keyframe · ←/→ frame step
(Shift: keyframe) · Home/End · L loop · R reset camera. The timeline is an
ARIA slider.

## 3. Landing intro

`src/components/landing/SplatIntroOverlay.tsx` plays a manifest once in
cinematic mode (slow dolly-orbit, wordmark reveal, fade) on the GPU backend.

- **wzrd.tech (Next):** `src/app/page.tsx` wraps the hero and landing in
  `LandingIntroGate`, which renders the page untouched on the server and first
  client render, then (after mount) raises a black shield and unmounts the
  page while the intro plays — so the Spline hero and fx canvases release the
  GPU. When the intro finishes or is unavailable the page remounts.
- **Vite landing:** `src/legacy-pages/Landing.tsx` prefers the splat intro and
  falls back to `VideoIntroOverlay` (`/introani.mp4`).

Gating (`src/components/landing/introGate.ts`): skipped on
`prefers-reduced-motion`, when the visitor turned the landing Motion toggle
off, without WebGL2, or once per session (`sessionStorage`
`wzrd-splat-intro-seen`). `?intro=1` forces a replay, `?intro=0` skips. The
manifest is probed with a 1.5 s, uncached `GET`; any failure means no intro.

The landing stays mounted while the probe runs, so a deployment without an
intro asset never tears down and rebuilds the hero. A failed probe is
remembered for the session (`wzrd-splat-intro-missing`) and the gate is not
armed again. The page is handed back unconditionally after 4 s of probing or
30 s of intro, whatever the overlay is doing.

Note the trade-off while the intro plays: the landing is unmounted so only one
WebGL context is live. A JavaScript-rendering crawler that snapshots during
those seconds sees the intro, not the landing copy. That only applies to
deployments that ship an intro asset.

### Producing the asset

Either click **Use as site intro** in the studio (downloads `intro-splat.zip`)
or run the script:

```bash
FAL_KEY=… node scripts/motion-splat/build-intro-asset.mjs --video path/or/url.mp4 --out public/intro-splat
```

Unzip / write into `public/intro-splat/{manifest.json,rgb.mp4,depth.mp4}`.
Keep the clip ≤ 8 s at 720p. To host elsewhere set
`VITE_SPLAT_INTRO_MANIFEST_URL` (Vite) / `NEXT_PUBLIC_SPLAT_INTRO_MANIFEST_URL`
(Next, Vercel) to the manifest URL; the media must be served with CORS
(`Access-Control-Allow-Origin`) because it is uploaded as WebGL textures.

## 4. Deployment

```bash
npx supabase functions deploy motion-splat
npx supabase secrets set FAL_KEY=…            # already set for the other fal functions
# optional: tune the depth model's inputs once verified against fal's schema
npx supabase secrets set MOTION_SPLAT_DEPTH_EXTRA_INPUT='{"colormap":"gray"}'
```

The function uses the `workflow-media` public bucket (browser uploads need an
authenticated INSERT policy on it, as the Studio upload nodes already rely on)
and the existing `generation_jobs` table — no migration.

| Failure | Behaviour |
| --- | --- |
| Missing `FAL_KEY` | `submit` / `status` return 500 |
| Insufficient credits | 402 payload → global top-up dialog |
| fal job failed | row `failed`, hold released, UI toast |
| Output copy failed | row `failed`, hold released |
| No WebGL2 in the viewer | native `<video>` fallback (still scrubbable) |
| Spark stubbed (Next) | GPU backend |

## 5. Verification

```bash
bun run test -- src/lib/motion-splat src/components/motion-splat src/components/landing
bun run lint
bun run build
deno test supabase/functions/_shared/motion-splat.test.ts   # CI does not run Deno tests
```

Related: [DESIGN.md](../DESIGN.md) motion rules, [Kanvas design system](design/kanvas-system.md).
