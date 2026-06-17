# Postz × Postiz — Build Spec (`postizgoal.md`)

> **Mission:** Turn the placeholder `Postz` page in **WZRD.Studio-Desktop-v0-main** into a
> full social-media scheduling product with the core functionality of **postiz-app-main**
> (the open-source Buffer/Hypefury alternative), re-homed natively onto WZRD's stack.
>
> **Audience:** an autonomous build agent (Codex / Kiwi Code / Claude Code) working **inside
> the `WZRD.Studio-Desktop-v0-main` repo**, with `postiz-app-main` available read-only as the
> reference implementation (sibling folder).
>
> **How to read this doc:** Sections 1–4 are orientation and non-negotiable guardrails. Sections
> 5–13 are the build surface (data, server, providers, scheduler, UI, AI, analytics). Section 14
> is the phased plan — **build in phase order**; each phase has its own acceptance criteria and is
> independently shippable. Sections 15–17 are testing, non-goals, and global acceptance. The
> appendices are lookup tables (provider matrix, env vars, source→target file map).

---

## 0. Decisions already made (do not re-litigate)

These were decided by the product owner. Build to them.

1. **Backend strategy — Native Supabase port.** Port Postiz's domain model to **new Supabase
   migrations**, its REST controllers to **Deno edge functions**, and its Temporal scheduler to
   **`pg_cron` + a drain edge function**. No NestJS, no Temporal, no Redis, no Prisma, no Node
   sidecar. One stack, ships inside the existing Electron app.
2. **Scope — Core scheduling parity.** Build: channel connections, multi-channel calendar,
   per-platform composer, media from finalized assets, the schedule→publish engine, analytics, AI
   copilot, tags/sets. **Defer** organizations/teams, customer sub-accounts, Stripe billing for
   Postz, public API + SDK, autopost (RSS), and plugs/auto-engagement to a later phase (Section 16).
3. **Provider rollout — Video-first, then long-tail.** Phase 3 ships TikTok, Instagram (Reels),
   YouTube, X, LinkedIn (profile + page), Facebook, Threads, Bluesky, Mastodon, Discord, Telegram.
   The remaining ~20 providers land in Phase 7.

---

## 1. Objective & product outcome

**Objective.** A WZRD user opens **Postz** from the left nav (it already sits after `Sourcify`)
and can: connect one or more social channels via OAuth; compose a post once and tailor it per
channel; attach media — especially the `finalized` video assets produced by Sourcify/Clipper;
schedule it on a calendar (or post now); have WZRD reliably publish it at the scheduled time; and
review per-post and per-channel analytics afterward. An AI copilot helps draft and adapt copy.

**Product outcome (what "done" looks like for the user).**

- A **calendar** (month / week / day) is the primary surface, showing scheduled, published, draft,
  and errored posts color-coded by state, with per-channel avatars.
- A **Channels** rail lists connected accounts with status (connected / needs-reauth / disabled)
  and an **+ Add channel** flow that runs real OAuth and stores tokens server-side.
- A **composer** modal lets the user write a global message, then override content/media per
  selected channel, with live previews that mimic each platform, plus threads, first-comment,
  and polls where the platform supports them.
- The user can **pick finalized assets** (or upload new media) directly in the composer; media is
  validated against each platform's constraints (duration, aspect ratio, size, count).
- **Scheduling** supports pick-a-time, recommended slots, recurring/repeat, and "post now"; a
  reliable server-side engine publishes due posts and records the live URL or the failure.
- **Analytics** shows per-post performance and per-channel growth where the provider exposes it.
- Everything respects WZRD's existing auth, app shell, sidebar, mobile drawer, loading/error
  states, and visual language. No marketing page — Postz opens straight into the calendar.

---

## 2. The two codebases (verified facts)

### 2.1 Target — `WZRD.Studio-Desktop-v0-main`
- **Stack:** Vite 5 + React 18 + TypeScript 5 + Tailwind v3 + shadcn/ui + framer-motion +
  `react-router-dom` + TanStack Query. Packaged as an **Electron** desktop app (`electron/main.js`),
  custom protocol scheme **`wzrd://`** already registered (`package.json` → `build.protocols`).
- **Backend:** Supabase, project ref **`ixkkrousepsiorwlaycp`**. ~117 **Deno edge functions** under
  `supabase/functions/<name>/index.ts`. SQL migrations under `supabase/migrations/` (timestamped).
- **Auth:** Thirdweb wallet → Supabase session bridge via the `wallet-auth` edge function. Client
  holds a Supabase session; edge functions authenticate the JWT.
- **Postz today:** `src/pages/Postz.tsx` is a static placeholder calendar. Route `/postz` exists
  (`src/lib/routes.ts` → `appRoutes.postz`, `ROUTE_MANIFEST` id `postz`, category `core`). Mounted
  in `src/app/AuthenticatedRoutes.tsx` (lazy `Postz`, wrapped in `StudioErrorBoundary`). Sidebar
  item exists in `src/components/home/Sidebar.tsx` (id `postz`, icon `CalendarDays`, after
  `sourcify`). It already calls `useAssets({ assetCategory: ['finalized'], assetType: ['video'] })`.
- **Assets:** table **`project_assets`** (see `src/services/assetService.ts`, `src/types/assets.ts`).
  Key columns: `id`, `user_id`, `project_id`, `file_name`, `original_file_name`, `mime_type`,
  `file_size_bytes`, `asset_type` (`image|video|audio|document|model|font|other`), `asset_category`
  (`upload|generated|system|template|**finalized**`), `storage_provider`, `storage_bucket`,
  `storage_path`, `cdn_url`, `media_metadata` (jsonb), `tags`, `processing_status`. Related:
  `asset_usage`, `asset_collections`. Hooks in `src/hooks/useAssets.ts`; service in
  `src/services/assetService.ts`; client invokes functions via `supabase.functions.invoke(name, …)`.
- **Edge-function conventions (reuse, do not reinvent):**
  - `supabase/functions/_shared/auth.ts` → `authenticateRequest(headers)` returns the Supabase
    `user` (validates the `Authorization: Bearer <jwt>` via service-role client) and throws
    `AuthError`.
  - `supabase/functions/_shared/response.ts` → `corsHeaders`, `handleCors()`, `successResponse(data,
    status?)`, `errorResponse(msg, status?, details?)`, `safeErrorResponse(err, ctx?)`.
  - **Closest existing analog to copy structure from:** `supabase/functions/sourcify-apify/index.ts`
    — a single action-dispatch function (`plan` / `run` / `results` / `finalize`) that authenticates,
    branches on an `action` field, and returns normalized JSON. Postz functions follow the same shape.

### 2.2 Source — `postiz-app-main` (reference only — never imported at build time)
- **Monorepo** (pnpm). Apps: `backend` (NestJS REST), `frontend` (Next.js UI), `orchestrator`
  (**Temporal** workflows that fire scheduled posts, autopost, analytics polling), plus `extension`,
  `commands`, `sdk`. Libraries: `nestjs-libraries` (Prisma schema, integrations/providers, services),
  `react-shared-libraries`, `helpers`.
- **Data model** (Prisma, `libraries/nestjs-libraries/src/database/prisma/schema.prisma`, ~970 lines):
  `Organization`, `User`, `UserOrganization`, `Integration` (a connected social channel: `token`,
  `refreshToken`, `tokenExpiration`, `providerIdentifier`, `profile`, `postingTimes`, `disabled`,
  `refreshNeeded`, `customerId`…), `Post` (`state` = `QUEUE|DRAFT|PUBLISHED|ERROR`, `publishDate`,
  `content`, `group`, `integrationId`, `parentPostId` for threads, `releaseURL`, `settings`, `image`,
  `intervalInDays`…), `Media`, `Comments`, `Tags`/`TagsPosts`, `Customer`, `Webhooks`, `AutoPost`,
  `Sets`, `Signatures`, `Plugs`, `Notifications`, `OAuthApp`. (The Prisma `Provider` **enum** is only
  for *auth* login methods — the ~33 social channels are plain `providerIdentifier` strings.)
- **Providers** (`libraries/nestjs-libraries/src/integrations/social/*.provider.ts`, registered in
  `integration.manager.ts`): X, LinkedIn, LinkedIn Page, Reddit, Instagram, Instagram Standalone,
  Facebook, Threads, YouTube, Google Business (gmb), TikTok, Pinterest, Dribbble, Discord, Slack,
  Kick, Twitch, Mastodon (+custom), Bluesky, Lemmy, Farcaster, Telegram, Nostr, VK, Medium, Dev.to,
  Hashnode, WordPress, Listmonk, Moltbook, Whop, Skool, MeWe. Each implements two interfaces from
  `social.integrations.interface.ts`:
  - **`IAuthenticator`** — `generateAuthUrl()`, `authenticate({code,codeVerifier,refresh?})`,
    `refreshToken()`, optional `analytics()`, `reConnect()`, `changeNickname()`,
    `changeProfilePicture()`. Returns **`AuthTokenDetails`** (`{ id, name, accessToken, refreshToken?,
    expiresIn?, picture?, username, additionalSettings? }`).
  - **`ISocialMediaIntegration`** — `post(id, accessToken, postDetails: PostDetails[], integration)`
    → `PostResponse[]` (`{ id, postId, releaseURL, status }`); optional `comment(...)`. `PostDetails`
    = `{ id, message, settings, media?: MediaContent[], poll? }`.
- **Publishing mechanism:** the **orchestrator** (`apps/orchestrator/src/activities/post.activity.ts`)
  drains due `QUEUE` posts at `publishDate`, calls the right provider's `post()` with the stored
  token (refreshing first if expired), then writes back `state` + `releaseURL` (or `ERROR` + message).
  **This is exactly what our `pg_cron` + drain function replaces.**

---

## 3. Architecture mapping (Postiz → WZRD)

| Postiz concept | WZRD target | Notes |
|---|---|---|
| NestJS REST controllers (`posts`, `integrations`, `analytics`, …) | **Action-dispatch edge functions** under `supabase/functions/postz-*` | Mirror `sourcify-apify` structure. |
| Prisma models | **New Supabase tables**, all prefixed **`postz_`** | New migration files only; never edit existing migrations or `types.ts`. |
| Temporal orchestrator (scheduled publish, autopost, analytics) | **`pg_cron`** schedule → **`postz-scheduler`** edge function (drain loop) | Phase 5. Idempotent, row-locked. |
| Redis / BullMQ queue | **DB-backed queue** = the `postz_posts` table filtered by `state='QUEUE'` + `publish_date <= now()` with `SELECT … FOR UPDATE SKIP LOCKED` | No external broker. |
| Provider classes (Node/TS) | **Deno provider modules** under `supabase/functions/_shared/postz/providers/<id>.ts` implementing the same two interfaces, ported to `fetch` | Section 7. |
| OAuth redirect (web callback) | **`postz-oauth`** edge function callback **+ `wzrd://` deep link** back into Electron | Section 7.3. |
| `Organization` / team | **WZRD user = the tenant.** Use `owner_id = auth.uid()` everywhere; keep a nullable `postz_workspace_id` for future teams | Single-user now; schema is team-ready. |
| Stripe billing for Postz | **Reuse WZRD billing/credits** if gating is needed; otherwise ungated | Don't fork billing. |
| `Media` model + uploads | **Reuse `project_assets` + Supabase Storage**; finalized assets are first-class media | Section 11. |
| Next.js frontend (`components/launches`, `new-launch`, `analytics`) | **React/shadcn components** under `src/components/postz/**` consumed by `src/pages/Postz.tsx` | Section 9. Port behavior, not markup. |
| AI copilot/generator (`copilot.controller`, agent libs) | **Reuse WZRD AI gateway** (GMI/Groq/Lovable) via a `postz-ai` edge function | Section 12. |

---

## 4. Guardrails (from `agents.md` — violations fail review)

**Allowed:** edit `src/`, add functions under `supabase/functions/<name>/index.ts`, add new SQL
migrations, edit `agent-skills/` and `docs/`.

**Forbidden / hard rules:**
- ❌ Do **not** modify `src/integrations/supabase/types.ts` (auto-generated). After adding tables,
  regenerate types out-of-band; in app code, type Postz rows locally under `src/types/postz.ts`.
- ❌ Do **not** edit any existing file under `supabase/migrations/`. **New** migration files only.
- ❌ No raw SQL via `supabase.rpc('execute_sql', …)`.
- ❌ No direct queries against `auth.users` from client or edge functions. Use `auth.uid()` / the
  authenticated `user` object from `authenticateRequest`.
- ❌ Never expose provider client secrets, `APIFY`-style tokens, or OAuth secrets to the browser.
  All secrets live as **Supabase function secrets**; tokens are stored **encrypted** server-side.
- ✅ Keep new server logic inside edge functions; keep the client thin (TanStack Query + services).
- ✅ Follow existing naming, the `_shared/auth.ts` + `_shared/response.ts` helpers, and the
  `StudioErrorBoundary` + `Sidebar` + `MobileBottomNav` app-shell patterns already in `Postz.tsx`.

**Commands (run from `WZRD.Studio-Desktop-v0-main/`):** `bun run dev`, `bun run build`,
`bun run lint`, `bunx vitest run` (fall back to the repo's available Vitest command if `bunx` is
unavailable). Edge functions deploy with `supabase functions deploy <name>` and are registered in
`supabase/config.toml` if JWT settings need overriding (default: verify JWT on).

## 5. Data model — new Supabase tables (`postz_*`)

Create in a **single new migration** (or one per phase). Every table: `id uuid pk default
gen_random_uuid()`, `owner_id uuid not null default auth.uid()` (the tenant), `created_at`,
`updated_at` (trigger), `deleted_at timestamptz null` (soft delete). **Enable RLS on every table**
with policies scoped to `owner_id = auth.uid()` for select/insert/update/delete. Add the indexes
called out below. Do not store plaintext OAuth tokens — see Section 6.4 on encryption.

### 5.1 `postz_channels` (≈ Postiz `Integration`)
A connected social account.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `owner_id` | uuid | tenant |
| `workspace_id` | uuid null | future teams; null = personal |
| `provider` | text not null | provider identifier, e.g. `tiktok`, `x`, `instagram`, `linkedin`, `linkedin-page` (matches the provider module key — Appendix A) |
| `provider_account_id` | text not null | the platform's user/account id (Postiz `internalId`) |
| `name` | text | display name |
| `username` | text null | handle |
| `picture` | text null | avatar url |
| `profile` | jsonb null | provider profile blob |
| `token_ref` | text not null | pointer/ciphertext for the access token (Section 6.4) |
| `refresh_token_ref` | text null | for the refresh token |
| `token_expires_at` | timestamptz null | |
| `status` | text not null default `'connected'` | `connected \| needs_reauth \| disabled \| error` |
| `disabled` | boolean default false | |
| `posting_times` | jsonb default `'[{"time":120},{"time":400},{"time":700}]'` | recommended slots, minutes-from-midnight (Postiz convention) |
| `additional_settings` | jsonb default `'[]'` | provider extras (e.g. board/page/subreddit) |
| `custom_instance_url` | text null | Mastodon/WordPress/etc. |
Indexes: `(owner_id)`, `(provider)`, `(status)`. Unique: `(owner_id, provider, provider_account_id)`.

### 5.2 `postz_posts` (≈ Postiz `Post`)
One row per channel per scheduled item. A "group" links the per-channel copies created together.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `owner_id` | uuid | |
| `channel_id` | uuid fk → `postz_channels` | |
| `group_id` | uuid not null | shared across channels in one compose action |
| `state` | text not null default `'QUEUE'` | `DRAFT \| QUEUE \| PUBLISHING \| PUBLISHED \| ERROR` |
| `publish_date` | timestamptz not null | when to post (UTC) |
| `content` | text not null default `''` | resolved message for this channel |
| `title` | text null | YouTube/Reddit/article platforms |
| `description` | text null | |
| `settings` | jsonb null | per-provider options (thread split, privacy, tags, board, etc.) |
| `media` | jsonb default `'[]'` | ordered refs → `project_assets.id` (+ resolved url/type/meta) |
| `poll` | jsonb null | `{ options: string[], duration: number }` where supported |
| `parent_post_id` | uuid null | thread/child posts |
| `first_comment` | text null | auto first comment where supported |
| `release_url` | text null | live URL after publish |
| `release_provider_id` | text null | platform post id |
| `error` | text null | last failure message |
| `attempts` | int default 0 | publish retry counter |
| `interval_in_days` | int null | repeat cadence |
| `creation_method` | text default `'ui'` | `ui \| ai \| api \| autopost` |
Indexes: `(owner_id)`, `(channel_id)`, `(group_id)`, `(state)`, `(publish_date)`, composite
`(state, publish_date)` for the drain query.

### 5.3 Supporting tables
- **`postz_tags`** — `{ name, color }`, unique `(owner_id, name)`.
- **`postz_post_tags`** — join `(post_id, tag_id)`.
- **`postz_sets`** — saved channel+settings presets (Postiz `Sets`): `{ name, content jsonb }`.
- **`postz_signatures`** — reusable signature snippets appended to content.
- **`postz_analytics`** — per-post / per-channel metric snapshots: `{ channel_id, post_id null,
  metric text, value numeric, captured_for date, captured_at }`. Unique
  `(channel_id, post_id, metric, captured_for)`.
- **`postz_oauth_state`** — short-lived CSRF/PKCE store for OAuth: `{ owner_id, provider, state,
  code_verifier, redirect, expires_at }`. TTL-cleaned by the scheduler.
- **`postz_publish_log`** — append-only audit of every publish attempt: `{ post_id, channel_id,
  attempt, outcome, detail jsonb, created_at }`. Useful for debugging and the activity feed.

### 5.4 RLS & ownership
Every `postz_*` table: `alter table … enable row level security;` then four policies using
`owner_id = auth.uid()`. Edge functions use the **service-role** client but **must still filter by
the authenticated user's id** (from `authenticateRequest`) on every query — never trust a client
-supplied `owner_id`. `postz_oauth_state` and `postz_publish_log` are server-only (no client reads).

---

## 6. Edge functions (server API)

All under `supabase/functions/`. Each: handle CORS (`handleCors()` on `OPTIONS`), authenticate
(`authenticateRequest(req.headers)` → `user`), branch on a JSON `action`, return via
`successResponse` / `errorResponse` / `safeErrorResponse`. Use the **service-role** Supabase client
internally; scope all reads/writes to `user.id`. Mirror `sourcify-apify/index.ts`.

### 6.1 `postz-channels` — connection management
Actions:
- `list` → channels for the user (never returns token material).
- `get` `{ id }` → one channel + `additional_settings`.
- `update` `{ id, name?, disabled?, posting_times?, additional_settings? }`.
- `disconnect` `{ id }` → soft-delete + revoke token best-effort.
- `refresh` `{ id }` → force a token refresh via the provider's `refreshToken()`.
- `reauth-url` `{ id }` → returns a fresh OAuth URL for an expired channel.

### 6.2 `postz-oauth` — connect flow (Section 7.3 has the full sequence)
Actions:
- `start` `{ provider, redirect? }` → calls provider `generateAuthUrl()`, persists PKCE/state in
  `postz_oauth_state`, returns `{ url }`.
- `callback` (GET, no body — invoked by the provider redirect) `?code&state` → exchanges via
  provider `authenticate()`, upserts `postz_channels`, encrypts tokens, then redirects to a success
  page / `wzrd://postz/connected?...` deep link.
- Provider-specific extra steps (e.g. choosing a Facebook Page, LinkedIn org, Pinterest board,
  subreddit) handled via an `inBetweenSteps` action `list-targets` `{ provider, tempTokenRef }`.

### 6.3 `postz-posts` — compose / schedule / CRUD (≈ Postiz `posts.controller`)
Actions (map to the verified Postiz routes — see `apps/backend/src/api/routes/posts.controller.ts`):
- `list` `{ from, to, state? }` → posts in a date window for the calendar (grouped by `group_id`).
- `get` `{ id }` / `get-group` `{ group_id }`.
- `create` `{ group: { channels: [{channel_id, content, title?, media?, settings?, poll?,
  first_comment?}], publish_date, state, tags?, repeat? } }` → fan-out: one `postz_posts` row per
  channel sharing a new `group_id`; validates each channel's media/poll/length (Section 7.4);
  returns the created group.
- `update` / `update-date` `{ id|group_id, publish_date }` (calendar drag-reschedule).
- `delete` `{ group_id }` (soft).
- `duplicate` `{ group_id }`.
- `validate` `{ … }` → dry-run constraint check, returns per-channel warnings/errors (used live in
  composer; mirrors Postiz `/posts/valid`).
- `find-slot` `{ channel_id? }` → next recommended `publish_date` from `posting_times` (mirrors
  Postiz `/posts/find-slot`).
- `post-now` `{ group_id }` → sets `publish_date = now()` and `state = QUEUE` so the next drain
  picks it up (or directly invokes the publish core for instant feedback).

### 6.4 `postz-publish` — the publish core (called by scheduler **and** `post-now`)
Not directly client-callable for arbitrary posts. Given a `post_id`: load post + channel, decrypt
token (refresh if `token_expires_at` is past — persist the new token), resolve `media` refs to
signed URLs, call the provider module's `post()`, then write `state=PUBLISHED` + `release_url` +
`release_provider_id`, or `state=ERROR` + `error` and increment `attempts`. Append to
`postz_publish_log`. Must be **idempotent** (guard on current `state`).

**Token encryption.** Store tokens encrypted at rest. Use an AES-GCM key from a Supabase secret
`POSTZ_TOKEN_ENCRYPTION_KEY` (32-byte, base64). Implement `encryptToken`/`decryptToken` in
`_shared/postz/crypto.ts` using Deno `crypto.subtle`. `token_ref`/`refresh_token_ref` hold the
ciphertext (`iv:ciphertext` base64). Never log decrypted tokens (respect `safe-logger.ts`).

### 6.5 `postz-analytics`
Actions: `overview` (per-channel headline metrics + sparkline from `postz_analytics`), `post`
`{ id }` (per-post metrics), `refresh` `{ channel_id }` (pull latest via provider `analytics()` /
`postAnalytics()` and upsert snapshots). The scheduled refresh is driven by `pg_cron` (Section 8).

### 6.6 `postz-ai` — copilot/generator (Section 12)
Actions: `generate` (draft N variations from a brief), `rewrite` `{ text, tone }`, `adapt`
`{ text, provider }` (fit one channel's constraints/voice), `hashtags`, `caption-from-asset`
`{ asset_id }` (caption a finalized video using existing vision/text edge functions). Routes through
WZRD's AI gateway; no new model keys.

### 6.7 `postz-scheduler` — drain + maintenance (Section 8)
Invoked **only** by `pg_cron` (protect with a shared secret header `x-postz-cron`). Actions:
`drain` (publish due posts), `retry` (re-attempt `ERROR` posts under the retry policy),
`refresh-tokens` (proactively refresh soon-to-expire channel tokens), `poll-analytics`,
`gc` (purge expired `postz_oauth_state`).

---

## 7. Provider porting layer

The crown jewel of Postiz is its providers. Port them to Deno, preserving interface shape so the
publish core and OAuth flow stay provider-agnostic.

### 7.1 Location & contract
`supabase/functions/_shared/postz/providers/<provider>.ts`, each default-exporting an object
implementing:

```ts
// _shared/postz/providers/types.ts  (port of social.integrations.interface.ts)
export interface AuthTokenDetails {
  id: string; name: string; accessToken: string; refreshToken?: string;
  expiresIn?: number; picture?: string; username: string;
  additionalSettings?: { title: string; description: string;
    type: 'checkbox'|'text'|'textarea'; value: unknown; regex?: string }[];
  error?: string;
}
export interface PostDetails { id: string; message: string; settings: any;
  media?: { id: string; url: string; type: 'image'|'video'; meta?: any }[];
  poll?: { options: string[]; duration: number }; }
export interface PostResponse { id: string; postId: string; releaseURL: string; status: string; }

export interface PostzProvider {
  identifier: string;                 // e.g. 'tiktok' — must match postz_channels.provider
  name: string;                       // display
  capabilities: ProviderCapabilities; // Section 7.4
  generateAuthUrl(input: { state: string; codeVerifier: string; redirect: string }):
    Promise<{ url: string; codeVerifier: string; state: string }>;
  authenticate(input: { code: string; codeVerifier: string; redirect: string }):
    Promise<AuthTokenDetails>;
  refreshToken(refreshToken: string): Promise<AuthTokenDetails>;
  post(channel: ChannelRow, accessToken: string, posts: PostDetails[]): Promise<PostResponse[]>;
  analytics?(channel: ChannelRow, accessToken: string, sinceDays: number): Promise<AnalyticsData[]>;
  listTargets?(accessToken: string): Promise<{ id: string; name: string }[]>; // pages/boards/etc.
}
```

A registry `_shared/postz/providers/index.ts` maps `identifier → provider` (the port of
`integration.manager.ts`). The publish core and OAuth function look providers up here.

### 7.2 Porting method (per provider)
For each provider, open the Postiz source
`libraries/nestjs-libraries/src/integrations/social/<name>.provider.ts` and:
1. Copy the **OAuth endpoints, scopes, and request/response shapes** verbatim (these are the
   hard-won, correct bits). Confirm the real `identifier` getter — use that exact string.
2. Replace NestJS/axios/node specifics with Deno `fetch`. Replace `@upstash`/Prisma calls with
   parameters passed in. Replace `Buffer`/`fs` with `Uint8Array` + Storage signed URLs.
3. Preserve the **media upload sub-flows** (e.g. TikTok's init/upload/publish, YouTube resumable
   upload, Instagram container-then-publish, X chunked media). These are platform-mandated.
4. Keep `post()` returning `PostResponse[]` with a real `releaseURL` so the calendar can deep-link.
5. Surface platform errors as thrown `Error` with a clean message → becomes `postz_posts.error`.

### 7.3 OAuth + Electron deep-link sequence
1. Composer/Channels "Add channel" → client calls `postz-oauth { action:'start', provider }`.
2. Function builds PKCE (`code_verifier`/`state`), saves `postz_oauth_state`, returns provider `url`.
3. Client opens `url` in the system browser (Electron: `shell.openExternal`; web: new tab).
4. User authorizes; provider redirects to
   `https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/postz-oauth?code&state`.
5. `callback` validates `state`, exchanges `code` via provider `authenticate()`, encrypts + upserts
   the channel, then **redirects to `wzrd://postz/connected?provider=…&channel=…`** so Electron
   refocuses Postz; web falls back to a small success page that `postMessage`s the opener.
6. Electron already registers `wzrd://` and has a dedicated deep-link router at
   **`electron/deep-links.js`** (`createDeepLink`, `resolveDeepLinkToAppUrl`, with
   `electron/deep-links.test.js` covering e.g. `wzrd://auth/thirdweb`, `wzrd://billing/success`).
   **Extend that file** to route `wzrd://postz/connected` → navigate the renderer to `/postz` and
   invalidate the channels query; add a matching test. Follow its existing param-sanitization
   pattern (it already strips secrets/`authCookie`).
7. Providers needing a second choice (Facebook Page, LinkedIn org, Pinterest board, Reddit
   subreddit, Mastodon instance, Discord/Telegram chat) set `inBetweenSteps`: the UI calls
   `list-targets` and the user picks before the channel is finalized.

**Provider secrets** are Supabase function secrets, one pair per provider, named
`POSTZ_<PROVIDER>_CLIENT_ID` / `POSTZ_<PROVIDER>_CLIENT_SECRET` (+ extras like
`POSTZ_X_API_KEY`). A provider with no secrets configured must report **"not configured"** in the
Add-channel UI rather than erroring. See Appendix B.

### 7.4 Capabilities & validation
Each provider declares `capabilities` so the composer can validate before scheduling:

```ts
interface ProviderCapabilities {
  text: { maxLength: number; supportsThreads: boolean };
  media: { images: boolean; video: boolean; maxImages: number; maxVideoSeconds: number;
           maxFileBytes: number; aspectRatios?: string[]; required?: boolean };
  poll?: { maxOptions: number; maxDurationHours: number };
  firstComment: boolean;
  title?: boolean;   // YouTube/Reddit/articles
}
```

`postz-posts { action:'validate' }` and the composer both consult this. Examples to encode from the
Postiz providers: TikTok/Reels/Shorts require **video**; X thread + 280 chars (or premium long);
YouTube requires **title**; Instagram needs a public media URL for the container step; Bluesky 300
chars; LinkedIn document/video variants. **Confirm every limit against the provider source — do not
guess.**

### 7.5 Provider phases
- **Phase 3 (video-first):** `x`, `linkedin`, `linkedin-page`, `facebook`, `instagram`,
  `instagram-standalone`, `threads`, `youtube`, `tiktok`, `bluesky`, `mastodon`, `discord`,
  `telegram`.
- **Phase 7 (long-tail):** `reddit`, `pinterest`, `gmb`, `twitch`, `kick`, `dribbble`, `slack`,
  `lemmy`, `farcaster`, `nostr`, `vk`, `medium`, `dev.to`, `hashnode`, `wordpress`, `listmonk`,
  `whop`, `skool`, `mewe`, `moltbook`. (Full matrix in Appendix A.)

---

## 8. Scheduling & publish engine (replaces Temporal)

1. **Enable `pg_cron`** (and `pg_net` for HTTP) in a new migration (`create extension if not
   exists pg_cron;`). Schedule a job **every minute** that calls the `postz-scheduler` edge function
   `{ action:'drain' }` via `net.http_post`, sending the `x-postz-cron` shared-secret header
   (secret `POSTZ_CRON_SECRET`). Add separate, less-frequent cron rows for `retry` (every 5 min),
   `refresh-tokens` (hourly), `poll-analytics` (every 6 h), and `gc` (hourly).
2. **Drain query** (in `postz-scheduler`): `select … from postz_posts where state='QUEUE' and
   publish_date <= now() and deleted_at is null order by publish_date for update skip locked limit
   N;` — flip each to `PUBLISHING`, then invoke the publish core (Section 6.4) per row. `SKIP
   LOCKED` makes concurrent drains safe.
3. **Retry policy:** on `ERROR`, retry with exponential backoff (e.g. attempts at +1m, +5m, +30m,
   max 4) **only** for transient errors (5xx / rate-limit / network). Auth failures (401/invalid
   token) set the channel `status='needs_reauth'` and do **not** auto-retry — they notify the user.
4. **Token refresh:** before publishing, if `token_expires_at < now()+60s`, call provider
   `refreshToken()`, persist the new token/expiry; if refresh fails, mark `needs_reauth`.
5. **Time zones:** store `publish_date` in UTC; the UI converts to the user's local zone. Recommended
   slots (`posting_times`) are minutes-from-midnight in the user's zone (Postiz convention).
6. **"Post now"** uses the same core for one row so the user sees an immediate result rather than
   waiting up to a minute for cron.

## 9. Frontend — rebuild the Postz page

Replace the placeholder `src/pages/Postz.tsx` body (keep the app-shell wrapper: `Sidebar`,
`MobileBottomNav`, `useSidebar`, `motion.main`, `StudioErrorBoundary` already in
`AuthenticatedRoutes`). Build feature components under **`src/components/postz/**`** using existing
shadcn/ui primitives (`@/components/ui/*`), `lucide-react` icons, `framer-motion`, and the dark
WZRD visual language (zinc/`#08090d` bg, orange accents already used in `Postz.tsx`). **Port
behavior from Postiz, not its markup** — Postiz uses its own design system; we use shadcn.

### 9.1 Layout
A header (title + view switch Month/Week/Day + "New post" button), a left **Channels rail**, the
**Calendar** as the main surface, and a right rail reused for **Finalized assets** + **Queue
health**. Collapses to a single column + `MobileBottomNav` on mobile (keep the responsive
`marginLeft` animation already in `Postz.tsx`).

### 9.2 Component inventory (target → Postiz reference)
| WZRD component (`src/components/postz/`) | Responsibility | Postiz reference |
|---|---|---|
| `PostzCalendar.tsx` | Month/week/day grid; posts as chips colored by `state`; drag to reschedule (`@dnd-kit` already a dep) → `postz-posts update-date`; click empty slot → composer prefilled | `components/launches/calendar.tsx`, `time.table.tsx` |
| `ChannelRail.tsx` | List channels w/ avatar + status; add/reauth/disable | `components/launches/internal.channels.tsx`, `add.provider.component.tsx` |
| `AddChannelDialog.tsx` | Provider picker (grouped, "not configured" disabled); kicks off `postz-oauth start`; handles `list-targets` step | `components/launches/...add.provider...` |
| `PostComposer.tsx` | The modal: global editor + per-channel tabs/overrides, schedule controls, media, poll, first-comment, preview; calls `validate` live then `create` | `components/new-launch/*` (`editor.tsx`, `picks.socials.component.tsx`, `add.edit.modal.tsx`) |
| `ChannelTabContent.tsx` | Per-channel content override + character counter from `capabilities` | `new-launch/providers/*` |
| `MediaPicker.tsx` | Tabs: **Finalized assets** (`useAssets({assetCategory:['finalized']})`), all assets, upload; multi-select; validates against capabilities | `components/launches/...`, `components/media/*` |
| `PostPreview.tsx` | Platform-styled preview per channel | `components/preview/*`, `provider-preview/*` |
| `SchedulePopover.tsx` | Date/time picker (`date-fns` dep), "recommended slot" (`find-slot`), repeat, post-now | `components/launches/repeat.component.tsx` |
| `PostzAnalytics.tsx` | Per-channel overview + per-post drill-down (`recharts`) | `components/analytics/*`, `platform-analytics/*` |
| `AiAssist.tsx` | Inline copilot: generate/rewrite/adapt/hashtags/caption-from-asset | `components/launches/generator/*`, agents |
| `TagManager.tsx`, `SetsMenu.tsx` | Tags + saved channel sets | `tags.component.tsx`, `components/sets/*` |
| `PostStatePill.tsx`, `EmptyState.tsx` | State chips + empty/onboarding states | — |

### 9.3 States (must all render)
empty (no channels → CTA to connect; no posts → CTA to compose), loading, scheduled, publishing,
published (with "View on <platform>" link), error (with reason + retry/edit), needs-reauth
(channel-level banner), and "no configured providers" (link to where secrets are set). Empty media
state points users to **finalize assets in Sourcify/Clipper** (consistent with the current
placeholder's copy).

### 9.4 Client services & hooks
- `src/services/postzService.ts` — thin wrappers over `supabase.functions.invoke('postz-*', { body:
  { action, … } })`, mirroring `assetService.ts` style. One method per action.
- `src/hooks/postz/` — TanStack Query hooks: `usePostzChannels`, `usePostzCalendar(range)`,
  `useCreatePost`, `useUpdatePostDate`, `usePostzAnalytics`, `useConnectChannel`, `usePostzAi`.
  Query-key factory like `ASSET_QUERY_KEYS`; invalidate on mutations and on the `wzrd://` connect
  deep-link event.
- `src/types/postz.ts` — local row/types for `postz_*` (do **not** touch generated `types.ts`).

---

## 10. Routing, nav, shell (mostly already wired — verify, don't duplicate)
- `/postz` route, `appRoutes.postz`, manifest entry, lazy mount with `StudioErrorBoundary`, and the
  Sidebar item (`id: 'postz'`, `CalendarDays`, after `sourcify`) **already exist**. Keep them.
  Update the Sidebar `showBadge`/active handling if Postz should show a count (optional).
- Ensure `Postz.tsx` still passes `activeView="postz"` to `Sidebar` and `MobileBottomNav`.
- Extend the existing Electron deep-link router `electron/deep-links.js` to handle
  `wzrd://postz/connected` (Section 7.3) — do not invent a new handler.

---

## 11. Media & finalized-asset integration
- **Reuse `project_assets`** as the media library. The composer's default media tab is finalized
  video (the exact query the placeholder already uses). Selecting an asset stores a ref in
  `postz_posts.media` (`{ asset_id, url, type, meta }`); resolve to a **signed Storage URL** at
  publish time (providers like Instagram require a publicly fetchable URL — generate a time-boxed
  signed URL or a temporary public link, then revoke).
- New uploads from the composer go through the **existing `asset-upload` edge function**; tag them
  with `asset_category` as appropriate (don't force `finalized` unless the user finalizes).
- Validate media against provider `capabilities` **before** scheduling; if a finalized video is too
  long/large/wrong-aspect for a selected channel, surface a per-channel warning and offer to trim
  (Clipper) or drop that channel. Don't silently fail at publish time.
- Record provenance already on the asset (source platform/URL, actor, run) — useful for attribution
  in captions via `postz-ai caption-from-asset`.

---

## 12. AI copilot / generator
Reuse WZRD's AI gateway (GMI default, plus Groq/Lovable/Gemini text functions already present —
e.g. `generate-text-generic`, `groq-chat`). `postz-ai` composes prompts and calls those; it does
**not** add new model credentials. Capabilities: draft N caption variations from a brief; rewrite
for tone; **adapt** one message to a specific channel's `capabilities` (length, hashtag norms,
thread-splitting for X); suggest hashtags; and **caption a finalized video** by reusing existing
vision/analysis functions (e.g. `gemini-image-analysis` on a thumbnail, or transcript if available).
Surface AI inline in the composer (`AiAssist.tsx`) with one-click "apply to this channel / all
channels." Respect WZRD credits/billing if the gateway already meters usage.

---

## 13. Analytics
- `postz_analytics` stores periodic snapshots; `postz-scheduler poll-analytics` pulls via each
  provider's optional `analytics()`/`postAnalytics()` (port from the provider source — many already
  implement it). Providers without analytics simply contribute nothing.
- `PostzAnalytics.tsx`: per-channel headline tiles (followers, impressions, engagement where
  available) with `recharts` sparklines, and a per-post table linking to `release_url`. Keep it
  graceful when a provider exposes no metrics ("Analytics not available for <provider>").

## 14. Phased delivery plan

Build in order. **Each phase is independently shippable, ends green (`lint` + `build` + `vitest`),
and meets its own acceptance criteria.** Don't start a phase before the prior one passes.

### Phase 1 — Data & contracts (foundation)
- New migration(s): all `postz_*` tables (Section 5) + RLS + indexes + `updated_at` triggers.
- Enable `pg_cron` + `pg_net` extensions (no jobs yet).
- `src/types/postz.ts`; stub `src/services/postzService.ts` + query-key factory.
- **Accept:** migration applies cleanly to a fresh DB; RLS denies cross-user access (test); types
  compile; no existing migration/`types.ts` touched.

### Phase 2 — Calendar & composer with mock publish
- Rebuild `Postz.tsx` + `PostzCalendar`, `ChannelRail` (read-only), `PostComposer`, `MediaPicker`
  (finalized assets), `PostPreview`, `SchedulePopover`, state pills/empty states.
- `postz-posts` function: `list`, `create`, `update-date`, `delete`, `validate`, `find-slot`.
  `state` flows `DRAFT/QUEUE` but publishing is stubbed (no real network).
- **Accept:** user can create a multi-channel draft against **seeded** channels, see it on the
  calendar, drag to reschedule, edit, delete; composer validation reflects `capabilities`; finalized
  video assets attach; renders on desktop + mobile; all states visible.

### Phase 3 — Real channels + OAuth + first providers (video-first)
- Provider port framework (`_shared/postz/providers/{types,index,crypto}.ts`) + the 13 video-first
  providers (Section 7.5) with real OAuth, token encryption, `list-targets`, capabilities.
- `postz-oauth` (`start`/`callback`/`list-targets`) + `postz-channels` (full) + Electron `wzrd://`
  deep-link handler. `AddChannelDialog` wired to real OAuth.
- **Accept:** user connects at least X, TikTok, YouTube, Instagram, LinkedIn end-to-end; tokens
  stored encrypted; "not configured" providers are clearly disabled; reauth flow works; no secret
  ever reaches the client.

### Phase 4 — Publish core (manual)
- `postz-publish` core + `postz-posts post-now`; per-provider `post()` for the Phase-3 providers,
  including media upload sub-flows + signed media URLs; `postz_publish_log`.
- **Accept:** "Post now" publishes a real post to each connected platform and stores a working
  `release_url`; failures land as `ERROR` with a readable reason; idempotent (no double-post).

### Phase 5 — Scheduler (automated publish)
- `postz-scheduler` (`drain`/`retry`/`refresh-tokens`/`gc`) + `pg_cron` rows; backoff + token
  refresh + `needs_reauth` handling.
- **Accept:** a post scheduled 2 minutes out publishes automatically; expired tokens refresh
  transparently; transient failures retry, auth failures don't; concurrent drains never double-post
  (`SKIP LOCKED`).

### Phase 6 — AI copilot + analytics
- `postz-ai` + `AiAssist`; `postz-analytics` + `poll-analytics` cron + `PostzAnalytics`.
- **Accept:** copilot generates/adapts copy per channel and applies it; analytics shows real
  per-channel/per-post numbers where the provider supports it, and degrades gracefully otherwise.

### Phase 7 — Long-tail providers
- Remaining ~20 providers (Appendix A) behind the same framework + capabilities; "not configured"
  until secrets set.
- **Accept:** each added provider connects, posts, and (if supported) reports analytics; no
  regression to Phase-3 providers.

### Phase 8 — Polish & hardening
- Tags/sets/signatures UI; repeat/recurring posts; bulk actions; keyboard/drag UX; rate-limit and
  error telemetry via `observability.ts`; docs in `docs/` + an `agent-skills/postz/skill.md`.
- **Accept:** full E2E smoke (connect → compose multi-channel → schedule → auto-publish → view live
  → analytics) passes; lint/build/tests green; known warnings reported.

---

## 15. Testing & verification

Add focused coverage alongside the existing Vitest suite (see `src/pages/Postz.test.tsx`,
`src/lib/routes.sourcify.test.ts` for patterns). Mock network/provider calls; **never hit real
social APIs in tests.**

- **Routing/nav:** `/postz` registered; Sidebar order `Clipper → Sourcify → Postz` unchanged;
  Postz mounts under auth + error boundary.
- **Data/RLS:** `postz_*` migration applies; RLS blocks cross-user reads; soft-delete hides rows.
- **Composer/validate:** per-provider `capabilities` enforced (length, media required, poll limits,
  title-required); fan-out creates one row per channel sharing `group_id`.
- **Provider units:** for each ported provider — `generateAuthUrl` shape, `authenticate` token
  mapping, `post()` request construction + `PostResponse` parsing, error mapping (mock `fetch`).
- **Publish core:** idempotency (won't republish `PUBLISHED`), token-refresh-then-publish, error →
  `ERROR` + `attempts++`, log row written.
- **Scheduler:** drain selects only due `QUEUE` rows; `SKIP LOCKED` prevents double-send; retry
  backoff vs. no-retry on auth errors.
- **Media:** finalized-asset selection → `media` ref → signed URL resolution; oversize/aspect
  rejection per provider.
- **Crypto:** `encryptToken`/`decryptToken` round-trip; ciphertext ≠ plaintext; no token in logs.

**Run from repo root:** `bun run lint`, `bun run build`, `bunx vitest run` (or the available Vitest
command). **Smoke (manual/E2E):** connect a channel via OAuth; compose to ≥2 channels with a
finalized video; schedule 2 min out; confirm auto-publish + live URL; drag-reschedule; post-now;
analytics renders; mobile layout intact.

---

## 16. Non-goals (this spec) / explicitly deferred
- ❌ Organizations/teams, customer sub-accounts, role management.
- ❌ Stripe billing **for Postz** (reuse WZRD credits only if gating is needed).
- ❌ Public API + SDK + browser extension parity.
- ❌ Autopost (RSS→social), "plugs"/auto-engagement, marketplace/agency, web3 post features.
- ❌ Importing Postiz's NestJS/Temporal/Redis/Prisma runtime, or running any Node sidecar.
- ❌ Editing existing migrations or `src/integrations/supabase/types.ts`; exposing any secret to the
  client; raw SQL RPC; querying `auth.users`.
These are future phases, not part of "done" here. Architect the schema (e.g. nullable
`workspace_id`) so they remain possible without rework.

---

## 17. Global acceptance criteria
- Postz opens directly into a working calendar (no marketing page) for authenticated users, on
  desktop and mobile, within the existing app shell.
- Users connect real social channels via OAuth; tokens are stored **encrypted server-side** and
  never exposed to the browser.
- A post composed once can be tailored per channel, attach finalized/uploaded media, validated
  against each platform's real constraints, and scheduled on the calendar or posted now.
- A `pg_cron`-driven engine reliably publishes due posts, refreshes tokens, retries transient
  failures, flags auth failures for reauth, and records the live URL or a readable error — with no
  double-posting.
- Video-first providers (Phase 3) work end-to-end; long-tail providers (Phase 7) connect/post where
  configured and show "not configured" otherwise.
- AI copilot drafts/adapts copy per channel; analytics renders where providers support it.
- `lint`, `build`, and `vitest` pass; no existing migration or generated types modified; all new
  server code lives in edge functions with secrets server-side; pre-existing warnings reported.

---

## Appendix A — Provider matrix
Build phase, identifier (confirm each against the provider file's `identifier` getter), auth model,
and primary media. **Verify all limits/scopes against the Postiz source — values below are guidance.**

| Provider | `identifier` | Phase | Auth | Media focus | Notes / `list-targets` |
|---|---|---|---|---|---|
| X (Twitter) | `x` | 3 | OAuth2 (PKCE) + API key/secret | text, image, video | threads; chunked media upload |
| LinkedIn (profile) | `linkedin` | 3 | OAuth2 | text, image, video, doc | |
| LinkedIn Page | `linkedin-page` | 3 | OAuth2 | text, image, video, doc | pick org via `list-targets` |
| Facebook | `facebook` | 3 | OAuth2 | text, image, video | pick Page via `list-targets` |
| Instagram | `instagram` | 3 | OAuth2 (FB Graph) | image, **video/Reels** | container→publish; public media URL |
| Instagram Standalone | `instagram-standalone` | 3 | OAuth2 | image, video | non-Graph path |
| Threads | `threads` | 3 | OAuth2 | text, image, video | |
| YouTube | `youtube` | 3 | OAuth2 (Google) | **video** (Shorts/long) | resumable upload; **title required** |
| TikTok | `tiktok` | 3 | OAuth2 | **video** | init/upload/publish; privacy settings |
| Bluesky | `bluesky` | 3 | App password / OAuth | text, image, video | ~300 chars |
| Mastodon | `mastodon` | 3 | OAuth2 per instance | text, image, video | `custom_instance_url` |
| Discord | `discord` | 3 | Bot/OAuth2 | text, media | pick channel via `list-targets` |
| Telegram | `telegram` | 3 | Bot token | text, media | pick chat/channel |
| Reddit | `reddit` | 7 | OAuth2 | text, image, link | pick subreddit; flair |
| Pinterest | `pinterest` | 7 | OAuth2 | image, video | pick board |
| Google Business | `gmb` | 7 | OAuth2 (Google) | text, image | pick location |
| Twitch | `twitch` | 7 | OAuth2 | metadata/clip | |
| Kick | `kick` | 7 | OAuth2 | metadata | |
| Dribbble | `dribbble` | 7 | OAuth2 | image | |
| Slack | `slack` | 7 | OAuth2 | text, media | pick channel |
| Lemmy | `lemmy` | 7 | login | text, link | community |
| Farcaster (Warpcast) | `farcaster` | 7 | signer | text, image | |
| Nostr | `nostr` | 7 | key | text, image | relays |
| VK | `vk` | 7 | OAuth2 | text, media | |
| Medium | `medium` | 7 | token | article | title/body |
| Dev.to | `dev.to` | 7 | API key | article | |
| Hashnode | `hashnode` | 7 | token | article | tags |
| WordPress | `wordpress` | 7 | app password | article, media | `custom_instance_url` |
| Listmonk | `listmonk` | 7 | API | newsletter | self-hosted |
| Whop | `whop` | 7 | OAuth2 | text | |
| Skool | `skool` | 7 | login | text | |
| MeWe | `mewe` | 7 | login | text, media | |
| Moltbook | `moltbook` | 7 | API | text | also a `_shared/moltbook.ts` exists |

> The list mirrors `integration.manager.ts`. If an identifier or capability differs in source,
> **source wins** — confirm before coding each provider.

## Appendix B — Supabase function secrets (set before the relevant phase)
- **Core:** `POSTZ_TOKEN_ENCRYPTION_KEY` (base64 32-byte), `POSTZ_CRON_SECRET`, `POSTZ_PUBLIC_BASE_URL`
  (the functions base, `https://ixkkrousepsiorwlaycp.supabase.co/functions/v1`), `POSTZ_APP_DEEPLINK`
  (`wzrd://postz`). Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are already available to
  functions.
- **Per provider (Phase 3+):** `POSTZ_<PROVIDER>_CLIENT_ID`, `POSTZ_<PROVIDER>_CLIENT_SECRET` (+
  provider extras, e.g. `POSTZ_X_API_KEY`/`POSTZ_X_API_SECRET`, `POSTZ_TELEGRAM_BOT_TOKEN`,
  `POSTZ_DISCORD_BOT_TOKEN`). A missing pair ⇒ provider shows **"not configured."**
- Reuse existing AI/provider secrets for `postz-ai`; **do not** add new model keys.

## Appendix C — Source → target file map (where to look / what to create)
| Need | Postiz reference (read-only) | WZRD target (create/edit) |
|---|---|---|
| Provider interfaces | `…/integrations/social/social.integrations.interface.ts` | `_shared/postz/providers/types.ts` |
| Provider registry | `…/integrations/integration.manager.ts` | `_shared/postz/providers/index.ts` |
| Each provider | `…/integrations/social/<name>.provider.ts` | `_shared/postz/providers/<id>.ts` |
| Posts API | `apps/backend/src/api/routes/posts.controller.ts` + `…/database/prisma/posts/posts.service.ts` | `supabase/functions/postz-posts/index.ts` |
| Integrations/OAuth API | `…/routes/integrations.controller.ts`, `oauth.controller.ts` | `postz-channels`, `postz-oauth` |
| Analytics API | `…/routes/analytics.controller.ts` | `postz-analytics` |
| Scheduled publish | `apps/orchestrator/src/activities/post.activity.ts` | `postz-scheduler` + `postz-publish` + `pg_cron` |
| Data model | `…/database/prisma/schema.prisma` (`Post`, `Integration`, `Tags`, `Sets`…) | new `postz_*` migration |
| Calendar UI | `apps/frontend/src/components/launches/calendar.tsx`, `time.table.tsx` | `src/components/postz/PostzCalendar.tsx` |
| Composer UI | `apps/frontend/src/components/new-launch/*` | `src/components/postz/PostComposer.tsx` (+ children) |
| Channel UI | `…/components/launches/internal.channels.tsx`, `add.provider.component.tsx` | `ChannelRail.tsx`, `AddChannelDialog.tsx` |
| Analytics UI | `…/components/analytics/*`, `platform-analytics/*` | `PostzAnalytics.tsx` |
| Existing WZRD patterns to copy | `supabase/functions/sourcify-apify/index.ts`, `_shared/auth.ts`, `_shared/response.ts`, `src/services/assetService.ts`, `src/hooks/useAssets.ts`, `src/pages/Postz.tsx` | — |

---

### Definition of done (one line)
Postz is a working, single-user social scheduler: connect channels via OAuth, compose once / tailor
per channel with finalized media, schedule on a calendar, auto-publish reliably via `pg_cron`, and
review analytics — all on WZRD's Supabase + Electron stack, with no secrets in the browser and no
changes to forbidden files.



