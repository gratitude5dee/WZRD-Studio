import { useEffect, useState } from 'react';

import { ShimmerText } from './ShimmerText';
import './craft.css';

/**
 * Pixel-grid loader for long-running work.
 *
 * Variants:
 *   drive — square cells, chevron wavefront driving right
 *   dots  — same wavefront, circular cells
 *   orbit — a comet lapping the grid perimeter
 *
 * Paired with a shimmering label and an optional live elapsed timer
 * in tabular figures. Reduced motion freezes the grid to its dim state.
 */

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

export type PixelLoaderVariant = 'drive' | 'dots' | 'orbit';

const PATTERNS: Record<
  PixelLoaderVariant,
  { delays: (number | null)[]; dur: number; round: boolean }
> = {
  drive: { delays: chevron, dur: 650, round: false },
  dots: { delays: chevron, dur: 650, round: true },
  orbit: { delays: orbit, dur: 950, round: false },
};

function useElapsed() {
  const [ds, setDs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDs((d) => d + 1), 100);
    return () => clearInterval(t);
  }, []);
  const total = ds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

function Elapsed() {
  const elapsed = useElapsed();
  return (
    <span className="font-mono text-xs text-text-tertiary tabular-nums">{elapsed}</span>
  );
}

export function PixelLoader({
  label = 'Working',
  variant = 'drive',
  showElapsed = false,
  className = '',
}: {
  label?: string;
  variant?: PixelLoaderVariant;
  showElapsed?: boolean;
  className?: string;
}) {
  const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.drive;

  return (
    <div className={`flex w-fit items-center gap-2.5 ${className}`} role="status" aria-label={label}>
      <span aria-hidden className="grid grid-cols-[repeat(3,4px)] gap-[1.5px]">
        {delays.map((d, i) => (
          <span
            key={i}
            className={`craft-motion size-[4px] bg-text-primary ${round ? 'rounded-full' : 'rounded-[1px]'}`}
            style={{
              opacity: d === null ? 0.07 : 0.15,
              animation:
                d === null
                  ? 'none'
                  : `craft-pixel-on ${dur}ms ease-in-out ${d}ms infinite`,
            }}
          />
        ))}
      </span>
      <ShimmerText className="text-[13px]">{label}</ShimmerText>
      {showElapsed && <Elapsed />}
    </div>
  );
}
