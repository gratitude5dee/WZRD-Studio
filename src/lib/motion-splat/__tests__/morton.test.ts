import { describe, expect, it } from 'vitest';

import { alignSplatSets, computeBounds, mortonCode10, mortonOrder, reorderSplatSet } from '@/lib/motion-splat/morton';
import { createSplatSet } from '@/lib/motion-splat/pack';

describe('mortonCode10', () => {
  it('interleaves bits x, y, z', () => {
    expect(mortonCode10(0, 0, 0)).toBe(0);
    expect(mortonCode10(1, 0, 0)).toBe(0b001);
    expect(mortonCode10(0, 1, 0)).toBe(0b010);
    expect(mortonCode10(0, 0, 1)).toBe(0b100);
    expect(mortonCode10(2, 0, 0)).toBe(0b001000);
    expect(mortonCode10(1023, 1023, 1023)).toBe(0x3fffffff);
  });
});

describe('mortonOrder', () => {
  it('sorts points so that spatial neighbours are adjacent', () => {
    const positions = Float32Array.from([
      10, 10, 10, // far corner
      0, 0, 0, // origin
      0.1, 0.1, 0.1, // near origin
      9.9, 9.9, 9.9, // near far corner
    ]);
    const order = Array.from(mortonOrder(positions, 4));
    expect(order.slice(0, 2).sort()).toEqual([1, 2]);
    expect(order.slice(2).sort()).toEqual([0, 3]);
  });

  it('is stable for identical points', () => {
    const positions = new Float32Array(9);
    expect(Array.from(mortonOrder(positions, 3))).toEqual([0, 1, 2]);
  });

  it('computes bounds and copes with empty input', () => {
    expect(computeBounds(new Float32Array(0), 0)).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
    expect(mortonOrder(new Float32Array(0), 0).length).toBe(0);
  });
});

describe('reorderSplatSet / alignSplatSets', () => {
  function makeSet(n: number, offset: number) {
    const set = createSplatSet(n);
    for (let p = 0; p < n; p++) {
      set.positions.set([p + offset, 0, 0], p * 3);
      set.scales.set([0.01, 0.01, 0.01], p * 3);
      set.quaternions.set([0, 0, 0, 1], p * 4);
      set.colors.set([p, p, p], p * 3);
      set.alphas[p] = 255;
    }
    return set;
  }

  it('subsamples evenly spaced ranks', () => {
    const set = makeSet(10, 0);
    const order = mortonOrder(set.positions, set.count);
    const out = reorderSplatSet(set, order, 5);
    expect(out.count).toBe(5);
    expect(Array.from(out.positions).filter((_, i) => i % 3 === 0)).toEqual([0, 2, 4, 6, 8]);
    expect(out.colors[3]).toBe(2);
  });

  it('gives every set the same count and a shared spatial ordering', () => {
    const [a, b] = alignSplatSets([makeSet(8, 0), makeSet(6, 0.5)], 100);
    expect(a.count).toBe(6);
    expect(b.count).toBe(6);
    // rank k in both sets refers to nearby x positions
    for (let k = 0; k < 6; k++) {
      expect(Math.abs(a.positions[k * 3] - b.positions[k * 3])).toBeLessThan(2.5);
    }
  });

  it('honours the max splat cap and empty input', () => {
    const [a] = alignSplatSets([makeSet(50, 0)], 7);
    expect(a.count).toBe(7);
    expect(alignSplatSets([])).toEqual([]);
  });
});
