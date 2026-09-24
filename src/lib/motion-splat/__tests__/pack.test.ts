import { describe, expect, it } from 'vitest';

import { IDENTITY_QUAT_BITS, encodeQuatOctXy88R8, unpackSplat } from '@/lib/motion-splat/encoding';
import {
  clearPackedRange,
  createSplatSet,
  footprintForDepth,
  packRgbdBlend,
  packSplatSetBlend,
} from '@/lib/motion-splat/pack';
import type { RgbdFrame } from '@/lib/motion-splat/unproject';

function frame(positions: number[], colors: number[], alphas: number[]): RgbdFrame {
  const count = alphas.length;
  return {
    count,
    positions: Float32Array.from(positions),
    colors: Uint8Array.from(colors),
    alphas: Uint8Array.from(alphas),
    depths: Float32Array.from(Array.from({ length: count }, (_, p) => -positions[p * 3 + 2])),
  };
}

describe('footprintForDepth', () => {
  it('grows linearly with depth and shrinks with more rows', () => {
    expect(footprintForDepth(2, 0.5, 100, 1)).toBeCloseTo(0.02, 6);
    expect(footprintForDepth(4, 0.5, 100, 1)).toBeCloseTo(0.04, 6);
    expect(footprintForDepth(2, 0.5, 200, 1)).toBeCloseTo(0.01, 6);
  });
});

describe('packRgbdBlend', () => {
  const a = frame([0, 0, -1, 1, 1, -2], [0, 0, 0, 100, 100, 100], [255, 255]);
  const b = frame([2, 0, -3, 1, 1, -2], [200, 0, 0, 100, 100, 100], [255, 51]);
  const opts = { rows: 100, tanY: 0.5 };

  it('writes frame a verbatim when mix is 0', () => {
    const target = new Uint32Array(8);
    expect(packRgbdBlend(target, a, b, 0, opts)).toBe(2);
    const s0 = unpackSplat(target, 0);
    expect(s0.x).toBeCloseTo(0, 3);
    expect(s0.z).toBeCloseTo(-1, 3);
    expect(s0.r8).toBe(0);
    expect(s0.a8).toBe(255);
    expect(s0.quatBits).toBe(IDENTITY_QUAT_BITS);
    // footprint at depth 1: 1 * 0.5 * 2 * 0.9 / 100
    expect(Math.abs(Math.log(s0.scaleX / 0.009))).toBeLessThan(0.1);
    expect(Math.abs(Math.log(s0.scaleZ / 0.0045))).toBeLessThan(0.1);
  });

  it('interpolates position, colour and alpha at mix 0.5', () => {
    const target = new Uint32Array(8);
    packRgbdBlend(target, a, b, 0.5, opts);
    const s0 = unpackSplat(target, 0);
    expect(s0.x).toBeCloseTo(1, 3);
    expect(s0.z).toBeCloseTo(-2, 3);
    expect(s0.r8).toBe(100);
    const s1 = unpackSplat(target, 1);
    expect(s1.a8).toBe(153);
  });

  it('applies a global opacity multiplier', () => {
    const target = new Uint32Array(8);
    packRgbdBlend(target, a, null, 0, { ...opts, opacity: 0.5 });
    expect(unpackSplat(target, 0).a8).toBe(128);
  });

  it('clears trailing alpha with clearPackedRange', () => {
    const target = new Uint32Array(12).fill(0xffffffff);
    clearPackedRange(target, 1, 3);
    expect(target[0]).toBe(0xffffffff);
    expect(target[4]).toBe(0);
    expect(target[8]).toBe(0);
    expect(target[5]).toBe(0xffffffff);
  });
});

describe('packSplatSetBlend', () => {
  it('blends aligned splat sets including log-scale and rotation', () => {
    const a = createSplatSet(1);
    const b = createSplatSet(1);
    a.positions.set([0, 0, 0]);
    b.positions.set([1, 0, 0]);
    a.scales.set([0.01, 0.01, 0.01]);
    b.scales.set([0.04, 0.04, 0.04]);
    a.quaternions.set([0, 0, 0, 1]);
    b.quaternions.set([0, 0, 0, -1]); // same rotation, opposite sign
    a.colors.set([0, 0, 0]);
    b.colors.set([255, 255, 255]);
    a.alphas[0] = 255;
    b.alphas[0] = 255;
    const target = new Uint32Array(4);
    packSplatSetBlend(target, a, b, 0.5);
    const s = unpackSplat(target, 0);
    expect(s.x).toBeCloseTo(0.5, 3);
    expect(s.r8).toBe(128);
    expect(Math.abs(Math.log(s.scaleX / 0.02))).toBeLessThan(0.1);
    expect(s.quatBits).toBe(encodeQuatOctXy88R8(0, 0, 0, 1));
  });
});
