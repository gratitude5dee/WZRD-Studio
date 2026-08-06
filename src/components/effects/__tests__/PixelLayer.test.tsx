import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { PixelLayer } from "../PixelLayer";
import { clampDpr, createPixelField, debounce, MAX_PIXELS } from "../pixel-engine";

function mockMatchMedia(matches: Record<string, boolean>) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches[query] ?? false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("PixelLayer", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a canvas by default", () => {
    mockMatchMedia({});
    const { container } = render(
      <div>
        <PixelLayer variant="wzrd" />
      </div>,
    );
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("renders null when prefers-reduced-motion is set", () => {
    mockMatchMedia({ "(prefers-reduced-motion: reduce)": true });
    const { container } = render(<PixelLayer variant="wzrd" />);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("renders null on hover-incapable pointers", () => {
    mockMatchMedia({ "(hover: none)": true });
    const { container } = render(<PixelLayer variant="wzrd" />);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("renders null when disabled (e.g. while dragging)", () => {
    mockMatchMedia({});
    const { container } = render(<PixelLayer variant="wzrd" disabled />);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("marks the canvas aria-hidden and pointer-events none", () => {
    mockMatchMedia({});
    const { container } = render(<PixelLayer variant="wzrd" />);
    const canvas = container.querySelector("canvas")!;
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    expect(canvas.style.pointerEvents).toBe("none");
  });
});

describe("pixel-engine", () => {
  it("caps the pixel field at MAX_PIXELS", () => {
    const pixels = createPixelField({
      width: 4000,
      height: 4000,
      gap: 4,
      colors: ["#f97316"],
      now: 0,
    });
    expect(pixels.length).toBeGreaterThan(0);
    expect(pixels.length).toBeLessThanOrEqual(MAX_PIXELS);
  });

  it("returns no pixels for empty dimensions", () => {
    expect(createPixelField({ width: 0, height: 0, gap: 6, colors: ["#fff"], now: 0 })).toEqual([]);
  });

  it("clamps device pixel ratio to at most 2", () => {
    expect(clampDpr(3)).toBe(2);
    expect(clampDpr(0.5)).toBe(1);
    expect(clampDpr(1.5)).toBe(1.5);
  });

  it("debounces calls and supports cancel", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
