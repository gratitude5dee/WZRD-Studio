# WZRD.tech — Elemental Cathedral

## Intent

WZRD.tech is the front door to a creator operating system: cinematic enough to
feel like culture, exact enough to feel like infrastructure. The page moves
from atmosphere into evidence. It should never resemble a generic AI SaaS
homepage or a dashboard pretending to be a film.

The emotional arc is **arrival → agency → craft → culture → infrastructure →
possibility**. A visitor should understand the promise within the first screen,
then discover the system one element at a time.

## Visual language

- **Void / ink:** `#05070a`, `#071225`, and translucent blue-black establish
  the site as a nocturnal stage rather than a flat black page.
- **Air signal:** `#8cc8ff` and cloud-white carry the hero and native-agent
  chapter.
- **Studio ember:** `#f06a47` is reserved for authored media and decisive
  actions, never used as decoration everywhere.
- **Earth mineral:** `#b8b096` and deep moss support digital-to-physical
  culture.
- **Water / fire:** `#6dc8d7` and `#f0a145` only appear in the coming-soon
  horizon.
- Use hairline borders, soft grain, clipped glows, and oversized editorial
  type. Avoid glossy gradients, pill-heavy controls, generic rounded cards,
  floating icon clouds, or fake product screenshots.

## Typography

- **Editorial voice:** `Newsreader`, with Georgia as a reliable fallback. It
  carries propositions, section statements, and long-form warmth.
- **System voice:** `Azeret Mono`, with a monospace fallback. It carries
  coordinates, labels, runtime states, and utility navigation.
- The cropped WZRD raster wordmark is treated as a mark, not a substitute for
  live heading text. `Creator OS` remains real text for accessibility and
  responsive reflow.

## Layout rules

1. One visual event leads each viewport. Copy is deliberately sparse and has a
   clear next action.
2. A fixed header provides conventional wayfinding; chapter anchors make the
   long narrative scannable.
3. The hero uses one WebGL atmosphere behind semantic HTML. The DOM must be
   legible before the shader loads and must stay complete if it fails.
4. Sections are editorial scenes, not a card grid: an artifact, a conversation,
   a pocket studio, a cultural threshold, then a runtime diagram.
5. Product proof stays honest. The supplied device image appears only in
   Studio, at a scale where its native resolution holds up.
6. Mobile is a deliberate composition: no pinned scroll, no hover-only
   information, 44px minimum targets, and a short visible path to Studio.

## Motion rules

- Native scrolling is the control surface. Scroll-led motion uses transform and
  opacity, with distinct timing for the logo reveal, chapter entrances, and
  runtime signal.
- The WZRD mark crossfades/scales into **Creator OS**; it is not presented as a
  misleading literal vector morph.
- The cloud field only redraws when scroll state changes. No permanent request
  animation loop and no more than one WebGL canvas.
- `prefers-reduced-motion` and the visible Motion toggle remove pinning and
  reveal all content immediately. The CSS atmospheric fallback remains.
- Stillness is part of the pacing. Do not make every object drift, spin, or
  pulse.

## Accessibility and trust

- Semantic landmarks, in-page navigation, logical heading order, visible focus,
  and text equivalents remain present without WebGL or JavaScript.
- Decorative shader and frames are hidden from assistive technology. Status
  labels are plain language, not faux-terminal theater.
- Water and Fire are clearly marked **Coming soon** with no financial claims or
  implied availability.

## Related design docs

- [Kanvas design system](docs/design/kanvas-system.md) — tokens, theme
  recipes, primitives, accent policy, and rules of engagement for the
  `/kanvas` studio surfaces.

