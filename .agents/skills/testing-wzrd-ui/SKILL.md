---
name: testing-wzrd-ui
description: How to run and browser-test the WZRD Studio Vite/React app locally — dev server flags, bypassing auth to reach protected dashboard/studio/observability/billing routes, route map, known pre-existing console errors, and how to exercise data-gated charts.
---

# Browser-testing WZRD Studio locally

## Start the dev server

```bash
bun install                       # covered by the repo blueprint's maintenance step
VITE_BYPASS_AUTH_FOR_TESTS=true VITE_USE_MOCK_ASSETS=true bun run dev
# serves on http://localhost:8080 (NOT 5173)
```

Dark theme is the app default, so no theme toggling is needed for dark-mode checks. The theme
toggle button lives in the dashboard header (`aria-label="Toggle theme"`).

## Reaching protected routes without credentials

Everything except `/` and `/login` is behind `AuthenticatedRoutes`. Instead of hunting for real
Supabase credentials, use the repo's own dev-only bypass:

* `src/providers/AuthProvider.tsx` and `src/components/ProjectAccessGate.tsx` both check
  `import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true'`.
* With the flag on, `ProjectAccessGate` accepts **any** UUID-shaped project id and registers it as
  "Test Project", so per-project routes render immediately.
* A convenient synthetic id: `00000000-0000-4000-8000-000000000abc`.

Note that with the bypass enabled, `/login?mode=signup` redirects straight to `/home`. That still
proves a landing CTA is clickable (URL leaves `/`), but you cannot test the real signup form this
way — disable the flag if the login UI itself is under test.

## Route map (`src/lib/routes.ts`)

| Page | Path |
|---|---|
| Landing | `/` |
| Login | `/login` (`?mode=signup`) |
| Dashboard / Home | `/home` |
| Settings | `/settings` |
| Billing | `/settings/billing` |
| Agent access (PATs / MCP install) | `/settings/agent-access` |
| Studio (ReactFlow canvas) | `/projects/:projectId/studio` |
| Timeline | `/projects/:projectId/timeline` |
| Observability | `/projects/:projectId/observability` |

Protected pages first paint a "Preparing studio" skeleton while the lazy bundle loads — wait and
re-view before concluding a page is broken.

`/settings/agent-access` is reached from `/settings` → the **Agent access** button in the Billing
card (`src/legacy-pages/SettingsPage.tsx`). The page is fully client-side except for
`useAgentTokens`, which reads/writes `public.wzrd_api_tokens` through PostgREST. If the
`wzrd_api_tokens` migration is not applied to the remote Supabase project, every list/mint call
returns `Could not find the table 'public.wzrd_api_tokens' in the schema cache`; the page surfaces
it as an inline rose error line and a sonner toast and stays usable. Treat that as the expected
state until the migration is deployed, and check the harness-snippet tabs / validation toasts
instead.

## Capturing sonner toasts in a saved screenshot

Toasts auto-dismiss in ~4 s, which is shorter than a browser `view` round-trip, so
`save_screenshot` usually lands after the toast is gone. Two things that do NOT work: arming a
background `import -window root` / `scrot` on a timer (the browser tool-call latency is
unpredictable, so the capture fires before the click dispatches), and X root captures generally —
they miss Chrome's toast layer. What works reliably: **hover the toast** (sonner pauses its
dismiss timer while the pointer is over it), then take the screenshot:

1. click the action that raises the toast,
2. `move_mouse` to the toast (bottom-right, roughly `885,673` in a 1024x768 viewport),
3. `view` with `save_screenshot` — the toast is still on screen.

Crop/zoom the saved PNG with PIL to make the toast text legible (saved shots are 1600px wide vs.
1024px browser coords, so scale by `img.width / 1024`).

## Clipboard assertions

`navigator.clipboard.readText()` from the console triggers a Chrome permission bubble that then
sits on top of the page and steals your next clicks — avoid it. For "copy" buttons that flip a
Copy icon to a Check icon only after `await navigator.clipboard.writeText()` resolves (the
`CopyBlock` pattern used on the Agent access page), the icon swap is itself sufficient proof the
write succeeded; assert on that in a screenshot instead of reading the clipboard back.

## Vite HMR can reset your form state mid-test

If you (or another agent in the same checkout) touch a file under `src/`, HMR reloads the page and
clears typed inputs / checkbox state. Re-`view` and re-enter form values before asserting rather
than trusting an earlier `type` call. Also note `devinid` attributes are re-numbered whenever a
toast mounts or unmounts, so re-read the DOM before each click in a toast-heavy flow.

## Known pre-existing console noise (do NOT report as new regressions)

Verify against the base branch before blaming a PR; these all reproduce on a synthetic/anon project:

* Landing: framer-motion warning *"Please ensure that the container has a non-static position…"*.
* Studio: `Error initializing project`, `Error loading graph` / `Error saving graph`
  (`FunctionsHttpError: Edge Function returned a non-2xx status code`).
* Billing: toast "Edge Function returned a non-2xx status code" (Stripe catalog not configured).
* `/projects/:id/timeline`: "Error Loading Project" + "Failed to load storyboard: Cannot coerce the
  result to a single JSON object". The timeline route requires a **real** project with storyboard
  rows, so timeline behaviour is effectively untestable with a synthetic id — say so explicitly
  rather than implying it passed. If a cheap mock is acceptable, add a temporary `?mockStoryboard=1`
  URL-flag branch in `StoryboardPage.tsx`'s `fetchData` (synthetic project + scenes) and in
  `supabaseService.ts` `shots.listByScene` (fake shots) — this renders full scene rows and shot
  cards; revert both files after. Expect `Error updating shot` console errors whenever anything
  autosaves on mock data — not a regression.
* Timeline mock: `Failed to load scene objects` / `Failed to load enabled state` also fire on load.
* `/settings` and `/settings/agent-access` are **clean** — the only console output is `[vite]
  connecting/connected` plus the React DevTools info notice. Any `Error`/`Warning` there is new.
  Notably, PostgREST 404s from the missing `wzrd_api_tokens` table are handled in code and do NOT
  reach the console, so a console error on that page is a real regression.

## Data-gated UI (charts, lists)

Several panels only render when backend data exists, e.g. the Observability **Runs** tab chart is
guarded by `timelineItems.length > 0` in `src/pages/ProjectObservabilityPage.tsx` and otherwise
shows "No runs yet." The anon Supabase project has no rows.

Workaround that keeps the code under test untouched: add a *temporary* URL-flag mock in the service
layer (e.g. `src/services/observabilityService.ts`, returning rows only when
`?mockRuns=1` is present), exercise the UI, then `git checkout --` the file and confirm
`git status --porcelain` is clean. Always disclose in the report that such a panel was verified
against seeded data, not real data.

## Verifying clipboard "copy" buttons

Headless-profile Chrome here allows `navigator.clipboard.writeText` but **denies** `readText`
(`NotAllowedError: Read permission denied`, and running it from the devtools console pops a
permission prompt that lands on top of the app — dismiss it before taking screenshots). `xclip`/
`xsel` are not installed. Practical proof that a copy button really copied the right text:

1. Click the copy button (an icon swap to a check only happens after `writeText` resolves).
2. Focus the browser URL bar and paste with `xdotool key ctrl+v` on `DISPLAY=:0`, then screenshot
   the full screen (`import -window root`) — the pasted text is legible in the omnibox.
3. Press `Escape` and click back into the page.

Because the check icon reverts after ~1.5s, a saved screenshot of it needs the click and the capture
in one shell command: `xdotool mousemove X Y click 1; sleep 0.6; import -window root out.png`.
Screen is 1600x1122 while browser-tool coordinates are 1024 wide — scale accordingly.

## Interaction tips

* ReactFlow pan: a synthetic click is not enough — use a real held drag
  (`xdotool mousedown 1` → `mousemove` → screenshot **while still held** → `mouseup`) so the
  screenshot proves the viewport translated. This is the assertion that catches an overlay stealing
  pointer events.
* Studio nodes: the "Start WZRD example" preset on the empty-canvas state seeds a graph quickly
  (toast "WZRD example inserted"); then click a node to check the selection outline.
* Canvas-rendered visuals (dither washes, dither charts/avatars) do not appear in the DOM text, so
  assert on screenshots — and crop/zoom with PIL to make the pattern legible. Saved browser
  screenshots are 1600px wide while browser coordinates are 1024px wide: scale crop boxes by
  `img.width / 1024`.
* dnd-kit shot reorder (timeline): drag listeners are on the small handle at the shot card's
  top-left (`.cursor-grab`, appears on hover). Do a real held xdotool drag over the handle;
  verify activation via `onDragStart`/`onDragEnd` (temporarily instrument `DndContext` in
  `ShotsRow.tsx` with console.log, then revert). The sortable transform lands on the
  `[data-voice-shot-id]` motion.div, not `[data-shot-id]`. Activation can be flaky on the first
  attempts; retry after the instrumented HMR reload.
* `react-resizable-panels` is v4: numeric `defaultSize`/`minSize`/`maxSize` are PIXELS; use
  strings like `"20%"` for percentages. If a resizable sidebar looks like a ~30px sliver, this
  is likely the cause — measure panel widths via `getBoundingClientRect` and report it.
* Landing anchor nav links (Features/Pricing/Testimonials) do not always scroll; scroll manually or
  press `End` then scroll up to reach lower sections such as the testimonials grid.

## Devin Secrets Needed

None — the `VITE_BYPASS_AUTH_FOR_TESTS` dev flag removes the need for login credentials. Real
Supabase/Stripe keys would only be needed to exercise backend-dependent flows (timeline storyboard,
Stripe checkout, real observability runs).
