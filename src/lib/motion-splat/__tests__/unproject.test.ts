import { describe, expect, it } from 'vitest';

import {
  FRUSTUM_EDGE_INDICES,
  FRUSTUM_FACE_INDICES,
  buildRgbdFrame,
  decodeDepth,
  encodeDepth,
  frustumCenter,
  frustumCorners,
  frustumExtent,
  frustumTangents,
  resolveGrid,
} from '@/lib/motion-splat/unproject';
import { DEFAULT_CAMERA, MOTION_SPLAT_GRID_PRESETS } from '@/lib/motion-splat/constants';

describe('frustumTangents', () => {
  it('derives half-angle tangents from vertical fov and aspect', () => {
    const { tanX, tanY } = frustumTangents(90, 2);
    expect(tanY).toBeCloseTo(1, 6);
    expect(tanX).toBeCloseTo(2, 6);
  });
});

describe('decodeDepth', () => {
  it('maps bright pixels to the near plane and dark pixels to the far plane', () => {
    expect(decodeDepth(1, 'inverse-gray8', 1, 3)).toBeCloseTo(1, 6);
    expect(decodeDepth(0, 'inverse-gray8', 1, 3)).toBeCloseTo(3, 6);
    expect(decodeDepth(1, 'linear-gray8', 1, 3)).toBeCloseTo(1, 6);
    expect(decodeDepth(0, 'linear-gray8', 1, 3)).toBeCloseTo(3, 6);
  });

  it('is linear in disparity for the inverse encoding', () => {
    const z = decodeDepth(0.5, 'inverse-gray8', 1, 3);
    expect(1 / z).toBeCloseTo((1 / 1 + 1 / 3) / 2, 6);
  });

  it('clamps out-of-range brightness', () => {
    expect(decodeDepth(1.7, 'inverse-gray8', 1, 3)).toBeCloseTo(1, 6);
    expect(decodeDepth(-2, 'linear-gray8', 1, 3)).toBeCloseTo(3, 6);
  });

  it('round-trips through encodeDepth', () => {
    for (const encoding of ['inverse-gray8', 'linear-gray8'] as const) {
      for (const z of [1, 1.4, 2.2, 3]) {
        expect(decodeDepth(encodeDepth(z, encoding, 1, 3), encoding, 1, 3)).toBeCloseTo(z, 6);
      }
    }
  });
});

describe('resolveGrid', () => {
  it('returns the preset for 16:9 content', () => {
    const grid = resolveGrid('medium', 16 / 9);
    expect(grid).toEqual(MOTION_SPLAT_GRID_PRESETS.medium);
  });

  it('keeps the cell count while re-shaping to portrait', () => {
    const preset = MOTION_SPLAT_GRID_PRESETS.high;
    const grid = resolveGrid('high', 9 / 16);
    expect(grid.cols).toBeLessThan(grid.rows);
    const ratio = (grid.cols * grid.rows) / (preset.cols * preset.rows);
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  it('falls back to the preset aspect for invalid input', () => {
    expect(resolveGrid('low', NaN)).toEqual(MOTION_SPLAT_GRID_PRESETS.low);
    expect(resolveGrid('low', 0)).toEqual(MOTION_SPLAT_GRID_PRESETS.low);
  });
});

describe('frustumCorners', () => {
  it('produces a near face and a far face on the -Z axis', () => {
    const corners = frustumCorners({ fovDeg: 90, near: 1, far: 3 }, 1);
    expect(corners.length).toBe(24);
    // near top-left
    expect(Array.from(corners.subarray(0, 3))).toEqual([-1, 1, -1]);
    // far bottom-right (index 6)
    expect(Array.from(corners.subarray(18, 21))).toEqual([3, -3, -3]);
  });

  it('has 12 edges and 12 triangles that reference valid corners', () => {
    expect(FRUSTUM_EDGE_INDICES.length).toBe(24);
    expect(FRUSTUM_FACE_INDICES.length).toBe(36);
    for (const i of [...FRUSTUM_EDGE_INDICES, ...FRUSTUM_FACE_INDICES]) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(8);
    }
  });

  it('centres the box between the planes and reports its extent', () => {
    expect(frustumCenter(DEFAULT_CAMERA)).toEqual([0, 0, -2]);
    expect(frustumExtent({ fovDeg: 90, near: 1, far: 3 }, 1)).toBeCloseTo(6, 6);
  });
});

describe('buildRgbdFrame', () => {
  const grid = { cols: 4, rows: 2 };
  const camera = { fovDeg: 90, near: 1, far: 3 };

  function pixels(fill: (p: number) => [number, number, number]) {
    const out = new Uint8ClampedArray(grid.cols * grid.rows * 4);
    for (let p = 0; p < grid.cols * grid.rows; p++) {
      const [r, g, b] = fill(p);
      out.set([r, g, b, 255], p * 4);
    }
    return out;
  }

  it('unprojects every cell along its pixel ray at the decoded depth', () => {
    const rgb = pixels((p) => [p * 10, 100, 200]);
    const depth = pixels(() => [255, 255, 255]); // everything at the near plane
    const frame = buildRgbdFrame(rgb, depth, grid, camera, 'inverse-gray8');
    expect(frame.count).toBe(8);
    for (let p = 0; p < 8; p++) {
      expect(frame.depths[p]).toBeCloseTo(1, 6);
      expect(frame.positions[p * 3 + 2]).toBeCloseTo(-1, 6);
      expect(frame.colors[p * 3]).toBe(p * 10);
      expect(frame.alphas[p]).toBe(255);
    }
    // first cell is top-left: negative x, positive y
    expect(frame.positions[0]).toBeLessThan(0);
    expect(frame.positions[1]).toBeGreaterThan(0);
    // last cell is bottom-right
    expect(frame.positions[7 * 3]).toBeGreaterThan(0);
    expect(frame.positions[7 * 3 + 1]).toBeLessThan(0);
    // symmetric about the axis
    expect(frame.positions[0]).toBeCloseTo(-frame.positions[3 * 3], 6);
  });

  it('lowers alpha on depth discontinuities only', () => {
    const rgb = pixels(() => [1, 2, 3]);
    // left half near (bright), right half far (dark)
    const depth = pixels((p) => (p % grid.cols < 2 ? [255, 255, 255] : [0, 0, 0]));
    const frame = buildRgbdFrame(rgb, depth, grid, camera, 'inverse-gray8', { edgeAlpha: 0.4 });
    // cells adjacent to the jump (columns 1 and 2) are edges, columns 0 and 3 are not
    expect(frame.alphas[0]).toBe(255);
    expect(frame.alphas[1]).toBe(102);
    expect(frame.alphas[2]).toBe(102);
    expect(frame.alphas[3]).toBe(255);
  });
});
