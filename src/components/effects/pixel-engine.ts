/**
 * Shared pixel animation engine.
 *
 * A single requestAnimationFrame loop drives every registered canvas so that
 * many PixelLayer instances on one page cost one rAF subscription. Renderers
 * register lazily (on first hover/focus) and unregister on unmount.
 */

export interface PixelEngineRenderer {
  /** Advance and draw one frame. Return false when the animation is settled. */
  tick(timestamp: number): boolean;
}

type Unsubscribe = () => void;

const renderers = new Set<PixelEngineRenderer>();
let rafId: number | null = null;

function loop(timestamp: number) {
  rafId = null;
  let active = false;
  for (const renderer of renderers) {
    if (renderer.tick(timestamp)) {
      active = true;
    }
  }
  if (active && renderers.size > 0) {
    rafId = requestAnimationFrame(loop);
  }
}

/** Wake the shared loop (idempotent). */
export function wakeEngine(): void {
  if (rafId === null && renderers.size > 0) {
    rafId = requestAnimationFrame(loop);
  }
}

/** Register a renderer with the shared loop. Returns an unsubscribe fn. */
export function registerRenderer(renderer: PixelEngineRenderer): Unsubscribe {
  renderers.add(renderer);
  wakeEngine();
  return () => {
    renderers.delete(renderer);
    if (renderers.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

export interface Pixel {
  x: number;
  y: number;
  color: string;
  /** Full size the pixel grows toward while appearing. */
  maxSize: number;
  size: number;
  /** Per-pixel activation delay in ms. */
  delay: number;
  /** Timestamp when the current phase began. */
  start: number;
  phase: "in" | "out" | "idle";
  shimmerOffset: number;
}

export const MAX_PIXELS = 400;
export const MAX_DPR = 2;

export interface PixelFieldOptions {
  width: number;
  height: number;
  gap: number;
  colors: string[];
  now: number;
}

/** Build a capped grid of pixels for the given canvas size. */
export function createPixelField({ width, height, gap, colors, now }: PixelFieldOptions): Pixel[] {
  const pixels: Pixel[] = [];
  if (width <= 0 || height <= 0) return pixels;
  const cols = Math.ceil(width / gap);
  const rows = Math.ceil(height / gap);
  let step = 1;
  while ((Math.ceil(cols / step) * Math.ceil(rows / step)) > MAX_PIXELS) {
    step += 1;
  }
  const maxDistance = Math.hypot(width, height);
  for (let row = 0; row < rows; row += step) {
    for (let col = 0; col < cols; col += step) {
      const x = col * gap;
      const y = row * gap;
      pixels.push({
        x,
        y,
        color: colors[Math.floor(Math.random() * colors.length)],
        maxSize: gap * (0.4 + Math.random() * 0.4),
        size: 0,
        delay: (Math.hypot(x, y) / maxDistance) * 600 + Math.random() * 150,
        start: now,
        phase: "idle",
        shimmerOffset: Math.random() * Math.PI * 2,
      });
    }
  }
  return pixels;
}

export function clampDpr(dpr: number): number {
  return Math.min(Math.max(dpr, 1), MAX_DPR);
}

/** Debounce helper used by PixelLayer's ResizeObserver. */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}
