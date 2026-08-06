import { useEffect, useRef } from "react";
import {
  clampDpr,
  createPixelField,
  debounce,
  registerRenderer,
  wakeEngine,
  type Pixel,
  type PixelEngineRenderer,
} from "./pixel-engine";

export type PixelLayerVariant = "default" | "wzrd";

const VARIANT_COLORS: Record<PixelLayerVariant, { colors: string[]; gap: number }> = {
  default: { colors: ["#f8fafc", "#f1f5f9", "#cbd5e1"], gap: 6 },
  /** WZRD orange accent family. */
  wzrd: { colors: ["#f97316", "#fb923c", "#fdba74"], gap: 6 },
};

export interface PixelLayerProps {
  variant?: PixelLayerVariant;
  className?: string;
  /** Disables the effect entirely (e.g. while a card is being dragged). */
  disabled?: boolean;
}

/**
 * Decorative canvas layer that reveals a shimmering pixel grid while the
 * nearest positioned ancestor is hovered or focused. Renders nothing for
 * touch-only pointers and for users preferring reduced motion.
 */
export function PixelLayer({ variant = "wzrd", className, disabled = false }: PixelLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (disabled) return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;

    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { colors, gap } = VARIANT_COLORS[variant];
    let pixels: Pixel[] = [];
    let initialized = false;
    let width = 0;
    let height = 0;

    const syncSize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = clampDpr(window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const initField = () => {
      syncSize();
      pixels = createPixelField({ width, height, gap, colors, now: performance.now() });
      initialized = true;
    };

    const setPhase = (phase: Pixel["phase"]) => {
      const now = performance.now();
      for (const pixel of pixels) {
        pixel.phase = phase;
        pixel.start = now;
      }
    };

    const renderer: PixelEngineRenderer = {
      tick(timestamp) {
        if (!initialized) return false;
        ctx.clearRect(0, 0, width, height);
        let active = false;
        for (const pixel of pixels) {
          const elapsed = timestamp - pixel.start - pixel.delay;
          if (pixel.phase === "in") {
            active = true;
            if (elapsed >= 0 && pixel.size < pixel.maxSize) {
              pixel.size = Math.min(pixel.maxSize, pixel.size + pixel.maxSize * 0.08);
            }
          } else if (pixel.phase === "out") {
            if (pixel.size > 0) {
              pixel.size = Math.max(0, pixel.size - pixel.maxSize * 0.12);
              active = true;
            }
          }
          if (pixel.size > 0.05) {
            const shimmer = 0.75 + 0.25 * Math.sin(timestamp / 400 + pixel.shimmerOffset);
            ctx.globalAlpha = shimmer;
            ctx.fillStyle = pixel.color;
            ctx.fillRect(pixel.x, pixel.y, pixel.size, pixel.size);
          }
        }
        ctx.globalAlpha = 1;
        return active;
      },
    };

    const unregister = registerRenderer(renderer);

    const handleEnter = () => {
      if (!initialized) initField();
      setPhase("in");
      wakeEngine();
    };
    const handleLeave = () => {
      if (!initialized) return;
      setPhase("out");
      wakeEngine();
    };

    const handleResize = debounce(() => {
      if (!initialized) return;
      initField();
      setPhase("in");
      wakeEngine();
    }, 150);

    const observer = new ResizeObserver(() => handleResize());
    observer.observe(host);

    host.addEventListener("mouseenter", handleEnter);
    host.addEventListener("mouseleave", handleLeave);
    host.addEventListener("focusin", handleEnter);
    host.addEventListener("focusout", handleLeave);

    return () => {
      handleResize.cancel();
      observer.disconnect();
      host.removeEventListener("mouseenter", handleEnter);
      host.removeEventListener("mouseleave", handleLeave);
      host.removeEventListener("focusin", handleEnter);
      host.removeEventListener("focusout", handleLeave);
      unregister();
    };
  }, [variant, disabled]);

  if (disabled) return null;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(hover: none)").matches
    ) {
      return null;
    }
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: -1,
      }}
    />
  );
}

export default PixelLayer;
