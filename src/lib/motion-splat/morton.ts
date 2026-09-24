// ---------------------------------------------------------------------------
// Spatial alignment of independently generated splat sets (e.g. one TripoSplat
// result per keyframe). Sorting each set along a Morton (Z-order) curve and
// pairing by rank gives a cheap, deterministic, spatially coherent
// correspondence, which is what the viewer needs to morph between keyframes.
// ---------------------------------------------------------------------------

import { DEFAULT_MAX_KEYFRAME_SPLATS } from './constants';
import { createSplatSet, type SplatSet } from './pack';

function spread10(v: number): number {
  let x = v & 0x3ff;
  x = (x | (x << 16)) & 0x030000ff;
  x = (x | (x << 8)) & 0x0300f00f;
  x = (x | (x << 4)) & 0x030c30c3;
  x = (x | (x << 2)) & 0x09249249;
  return x;
}

/** 30-bit Morton code from three 10-bit integer coordinates. */
export function mortonCode10(x: number, y: number, z: number): number {
  return (spread10(x) | (spread10(y) << 1) | (spread10(z) << 2)) >>> 0;
}

export interface Bounds3 {
  min: [number, number, number];
  max: [number, number, number];
}

export function computeBounds(positions: Float32Array, count: number): Bounds3 {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let p = 0; p < count; p++) {
    for (let k = 0; k < 3; k++) {
      const v = positions[p * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  if (count === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return { min, max };
}

/** Indices of `positions` ordered along the Morton curve inside `bounds`. */
export function mortonOrder(positions: Float32Array, count: number, bounds?: Bounds3): Uint32Array {
  const b = bounds ?? computeBounds(positions, count);
  const codes = new Uint32Array(count);
  const inv = [0, 1, 2].map((k) => {
    const span = b.max[k] - b.min[k];
    return span > 0 ? 1023 / span : 0;
  });
  for (let p = 0; p < count; p++) {
    const x = Math.min(1023, Math.max(0, Math.round((positions[p * 3] - b.min[0]) * inv[0])));
    const y = Math.min(1023, Math.max(0, Math.round((positions[p * 3 + 1] - b.min[1]) * inv[1])));
    const z = Math.min(1023, Math.max(0, Math.round((positions[p * 3 + 2] - b.min[2]) * inv[2])));
    codes[p] = mortonCode10(x, y, z);
  }
  const order = new Uint32Array(count);
  for (let p = 0; p < count; p++) order[p] = p;
  // Stable sort by code (typed-array sort with comparator).
  order.sort((i, j) => codes[i] - codes[j] || i - j);
  return order;
}

/** Copy splats of `set` in `order`, keeping only `targetCount` evenly spaced ranks. */
export function reorderSplatSet(set: SplatSet, order: Uint32Array, targetCount: number): SplatSet {
  const n = Math.min(targetCount, order.length);
  const out = createSplatSet(n);
  for (let r = 0; r < n; r++) {
    const src = order[Math.floor((r * order.length) / n)];
    out.positions.set(set.positions.subarray(src * 3, src * 3 + 3), r * 3);
    out.scales.set(set.scales.subarray(src * 3, src * 3 + 3), r * 3);
    out.quaternions.set(set.quaternions.subarray(src * 4, src * 4 + 4), r * 4);
    out.colors.set(set.colors.subarray(src * 3, src * 3 + 3), r * 3);
    out.alphas[r] = set.alphas[src];
  }
  return out;
}

/**
 * Align several splat sets so that index `k` refers to a spatially
 * corresponding splat in every set. All sets are sorted along the Morton curve
 * of a shared bounding box and subsampled to a common count.
 */
export function alignSplatSets(sets: SplatSet[], maxSplats: number = DEFAULT_MAX_KEYFRAME_SPLATS): SplatSet[] {
  if (sets.length === 0) return [];
  const bounds: Bounds3 = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const set of sets) {
    const b = computeBounds(set.positions, set.count);
    for (let k = 0; k < 3; k++) {
      bounds.min[k] = Math.min(bounds.min[k], b.min[k]);
      bounds.max[k] = Math.max(bounds.max[k], b.max[k]);
    }
  }
  const target = Math.max(1, Math.min(maxSplats, ...sets.map((s) => s.count)));
  return sets.map((set) => reorderSplatSet(set, mortonOrder(set.positions, set.count, bounds), target));
}
