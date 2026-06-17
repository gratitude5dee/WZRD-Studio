# Lovable Prompt — Transform the landing page into "RMX.WZRD" (Artist Remix Page)

> Paste everything below the line into Lovable. It is written to operate on the existing WZRD Studio repo (Vite + React + TypeScript + shadcn/ui + Tailwind + Supabase) and only touch the frontend.

---

## ROLE

Act as a **world-class full-stack senior architect and design engineer with 30+ years of industry experience**. You write production-grade, accessible, performant React. You respect existing architecture, reuse what's already there, and never break the build. You are surgical: you change only what the brief asks for.

## MISSION

Repurpose the existing marketing **landing page** into **RMX.WZRD** — an immersive, link-in-bio "artist remix" experience. Think Linktree, but cinematic: fans step into an artist's world, remix their tracks, grab merch, and buy tickets, all on one scrollable page. **Frontend only.** Reuse the app's existing infrastructure (design system, component library, routing, providers). Do not build or alter any backend.

---

## HARD CONSTRAINTS (do not violate)

1. **Frontend only.** Do **NOT** modify, create, or delete anything under:
   - `supabase/migrations/`
   - `supabase/functions/`
   - `src/integrations/supabase/types.ts`
   - Any auth logic, providers, or data layer.
   You may *import* the existing Supabase client (`@/integrations/supabase/client`) only if a section genuinely needs it (e.g. an email capture) — but do not change its schema or types.
2. **Replace the existing landing page at route `/`.** It currently renders `src/pages/Landing.tsx`, lazy-loaded in `src/App.tsx` via `appRoutes.landing`. Rebuild this page's content as RMX.WZRD. Keep the route registration, lazy-loading, and `Suspense` boundaries intact — only change what the page renders.
3. **Reuse the existing design system. Do not introduce a new one.** Use the project's Tailwind tokens and shadcn/ui primitives in `@/components/ui` (Button, Card, Dialog, Accordion, Tabs, Carousel, etc.). Use `framer-motion` (already a dependency) for animation. Use the existing utility `cn` from `@/lib/utils`.
4. **Keep the page in forced dark mode**, exactly as the current `Landing.tsx` does (it adds `dark` to the document root on mount). Preserve `prefers-reduced-motion` handling.
5. **Do not break `bun run build` or `bunx vitest run`.** No TypeScript errors, no unused imports, no console errors. If you add a test-touching change, keep existing tests green.
6. **Mobile-first and responsive.** Must look intentional from 360px up to desktop.
7. Keep new code organized: put RMX-specific components in a new folder `src/components/rmx/` and import them into `src/pages/Landing.tsx`. Reuse landing primitives from `src/components/landing/` (e.g. `AnimatedBackground`, `ParticleField`, `LazySection`, `MassiveFooter`) where they help immersion.

## DESIGN SYSTEM TO USE (already defined in this repo)

Use these existing Tailwind/CSS-variable tokens — **do not hardcode hex values**:

- Surfaces: `surface-0` … `surface-4`
- Text: `text-primary`, `text-secondary`, `text-tertiary`
- Borders: `border-subtle`, `border-default`, `border-strong`
- Accents: `accent-orange` (primary brand), `accent-teal`, `accent-amber`, `accent-purple`, `accent-rose`, plus `gold`
- Semantic: `primary` (orange `25 95% 53%`), `secondary`, `muted`, `card`, `popover`, `ring`
- Fonts: `font-display` (headings), `font-body` (body), and `Orbitron` via the `cyber` family for futuristic accents/labels.

Aesthetic: **keep WZRD's existing dark palette** (near-black surfaces with orange / teal / amber accents). Push it toward "immersive": layered gradients, soft glows, glassmorphism cards (`backdrop-blur`, subtle borders), scroll-triggered `framer-motion` reveals, tasteful parallax. Premium, cinematic, fan-facing — not corporate.

---

## BRAND RENAME

Replace **WZRD.studio → RMX.WZRD** everywhere this page renders it: logo/wordmark, sticky nav, hero, footer, and the document `<title>` / meta. Keep the existing logo component pattern but render the `RMX.WZRD` wordmark (style "RMX" in `accent-orange`/`gold`, ".WZRD" in `text-primary`, or similar). Do not rename the npm package, the Electron `productName`, or backend identifiers — page-level branding only.

---

## SALES COPY (motif)

Lead with this motif: **"Step into the world of your favorite artists — collaborate and remix your favorite creators."**

Hero headline options (pick one, make it large and cinematic):
- **"Step Into the Sound."**
- **"Remix Your Favorite Artists."**
- **"Their World. Your Remix."**

Hero subcopy: *"Step into the world of your favorite artists. Collaborate, remix their tracks, try on the merch, and never miss a show — all in one place."*

Primary CTA: **"Start Remixing"** (scrolls to the player). Secondary CTA: **"Get Tickets"** (scrolls to tour dates).

Keep all section copy on-brand: energetic, fan-first, creator-centric. Replace any leftover video-studio/enterprise copy from the old landing (FAQ, testimonials, pricing, governance, model-ecosystem sections) — remove or repurpose them; they do not belong on RMX.WZRD.

---

## PAGE STRUCTURE (top → bottom)

A single immersive scroll. Sticky, glassy nav at top with the `RMX.WZRD` wordmark and anchor links (Remix · Selfie · Merch · Gallery · Tour). Each section below should animate in on scroll.

### 1. Hero + Remix Player (centerpiece)
Full-viewport hero with animated/gradient background (reuse `AnimatedBackground`/`ParticleField`). Headline + subcopy + CTAs on one side (or above), and the **Large Starchild remix player embedded as the visual centerpiece**. On mobile, player stacks below the copy and is centered. Caption near it: *"Create custom remixes of your favorite tracks."*

**Embed this exact player** (Large, 480×700). Because this includes a `<script>`, do **not** paste raw HTML into JSX. Instead create a dedicated React component `src/components/rmx/StarchildPlayer.tsx` that (a) renders the iframe as JSX and (b) reimplements the fullscreen `postMessage` handler from the snippet inside a `useEffect` with proper cleanup. Source HTML to port:

```html
<iframe id="starchild-large-SetMeFre"
  src="https://starchild.music/player/remix/SetMeFree5/embed-full"
  style="max-width:480px;width:100%;height:700px;border:0;border-radius:24px;display:block;margin:0 auto;transition:all 0.3s ease;"
  allow="autoplay;encrypted-media;fullscreen" allowfullscreen credentialless
  title="Set Me Free - Starchild Player"></iframe>
<script>(function(){var f=document.getElementById("starchild-large-SetMeFre");if(!f)return;var og={};window.addEventListener("message",function(e){try{if(!e.data||e.data.type!=="starchild-fullscreen"||!f||e.source!==f.contentWindow)return;if(e.data.enter){if(f.requestFullscreen){f.requestFullscreen()}else{og.pos=f.style.position;og.top=f.style.top;og.left=f.style.left;og.w=f.style.width;og.h=f.style.height;og.mw=f.style.maxWidth;og.z=f.style.zIndex;og.r=f.style.borderRadius;f.style.position="fixed";f.style.top="0";f.style.left="0";f.style.width="100vw";f.style.height="100vh";f.style.maxWidth="none";f.style.zIndex="999999";f.style.borderRadius="0"}}else{if(document.fullscreenElement){document.exitFullscreen()}else{f.style.position=og.pos||"";f.style.top=og.top||"";f.style.left=og.left||"";f.style.width=og.w||"";f.style.height=og.h||"";f.style.maxWidth=og.mw||"";f.style.zIndex=og.z||"";f.style.borderRadius=og.r||""}}}catch(x){}})}());</script>
```

React integration requirements for `StarchildPlayer.tsx`:
- Render the `<iframe>` with a `ref` (not `getElementById`), keeping the same `src`, `allow`, `allowFullScreen`, `credentialless`, `title`, and the rounded-24px / max-width-480 / 100% width / 700px height styling (use Tailwind/inline style — wrap in a glass container with a soft glow).
- In `useEffect`, add a `window` `message` listener that verifies `event.source === iframe.contentWindow` and `event.data.type === "starchild-fullscreen"`, then toggles `requestFullscreen()` with the same inline-style fixed-position fallback for browsers without the Fullscreen API. **Remove the listener on unmount.**
- Note: `credentialless` is not a standard React iframe prop — set it via the ref (`iframeEl.setAttribute('credentialless', '')`) in the effect, or spread it through props so the build doesn't error.

### 2. Remix / Tracks
Short band reinforcing the remix feature with a few "remixable track" cards (cover art, title, a "Remix" button that scrolls to / focuses the player). Polished UI; the Remix buttons are visual for now.

### 3. Selfie for Socials
A "Take a selfie with the artist" section: a stylized camera/photobooth **UI shell** — framed viewfinder, capture button, a couple of overlay/filter chips, and "Share to socials" buttons. Build it as a polished mock (no real camera wiring required); leave a clear `// TODO: wire camera capture` comment where `getUserMedia` would go. Use a placeholder image inside the viewfinder.

### 4. Merch Virtual Try-On
A "Try the merch" section: grid of merch items (tee, hoodie, cap) with thumbnails, and a try-on preview panel showing the selected item composited onto a model/silhouette placeholder. **UI shell only** — selecting an item swaps the preview image; add `// TODO: integrate virtual try-on` where AR/try-on logic would attach. Include "Add to cart" buttons (visual).

### 5. Album Gallery
An immersive gallery of albums/visuals — responsive masonry or a shadcn Carousel with cover art, hover/tap to enlarge (use the existing Dialog for a lightbox). Use placeholder cover images.

### 6. Concert Dates → Tickets
A tour list: each row = date, city, venue, and a **"Get Tickets"** button that opens an external ticketing URL in a new tab (`target="_blank" rel="noopener noreferrer"`). Use a placeholder URL constant (e.g. `https://tickets.example.com/<id>`) per show so links are easy to swap later. Sold-out rows show a disabled "Sold Out" state.

### 7. Footer
Rebranded `RMX.WZRD` footer (reuse/adapt `MassiveFooter`): artist socials, a simple email signup (visual or wired to existing client without schema changes), and "Powered by RMX.WZRD".

---

## FEATURE DEPTH

**Polished UI shells.** Every section must look finished and on-brand, with real layout, hover/tap states, and motion. Interactive actions that would require backend/hardware (camera capture, AR try-on, cart/checkout, real ticket inventory) are **visually complete but stubbed** — mark each with a clear `// TODO:` comment and use placeholder assets/links. The remix **player must actually work** (it's a live embed). External ticket links must actually open.

## ACCESSIBILITY & PERFORMANCE

- Semantic landmarks (`header`, `main`, `section` with `aria-label`, `footer`), keyboard-focusable controls, visible focus rings (`ring`), and `alt` text on all images.
- Respect `prefers-reduced-motion` (gate parallax/auto-animations), as the current landing already does.
- Lazy-load below-the-fold sections (reuse the existing `LazySection` pattern) and use `loading="lazy"` on gallery images. The iframe stays in the hero.
- No layout shift; reserve space for the player and gallery.

## DONE = ALL OF THESE

- `/` renders RMX.WZRD with all 7 sections in order; old video-studio marketing copy is gone.
- WZRD.studio is renamed to RMX.WZRD on the page (wordmark, nav, footer, title/meta).
- The Large Starchild player is embedded via `StarchildPlayer.tsx`, plays, and its fullscreen `postMessage` toggle works; the message listener is cleaned up on unmount.
- Selfie, Merch try-on, Album gallery, and Tour-dates sections are present as polished shells; "Get Tickets" opens external links in a new tab.
- Uses existing design tokens + shadcn/ui + framer-motion; forced dark mode; fully responsive 360px→desktop.
- **No changes** to `supabase/migrations/`, `supabase/functions/`, or `src/integrations/supabase/types.ts`.
- `bun run build` and `bunx vitest run` pass with no TypeScript or console errors.

## OUT OF SCOPE

Backend, database schema, auth, real payments/cart, real AR try-on, and live ticket inventory. Do not scaffold these — leave the marked `// TODO`s.
