import { useRef } from 'react';

/**
 * Stable per-item entrance delay for staggered lists.
 *
 * A delay derived from an item's position in a filtered list changes whenever
 * the filter changes, which rewrites the inline `animation` shorthand and
 * restarts the entrance animation on cards that never left the DOM. Keying the
 * delay to the item's identity instead means each item animates once, on the
 * render that introduces it.
 */
export function useStaggerDelay(step = 60, maxSteps = 8) {
  const assigned = useRef(new Map<string, number>());

  return (id: string) => {
    const known = assigned.current.get(id);
    if (known !== undefined) return known;
    const delay = Math.min(assigned.current.size, maxSteps) * step;
    assigned.current.set(id, delay);
    return delay;
  };
}
