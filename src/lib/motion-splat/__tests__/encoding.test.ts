import { describe, expect, it } from 'vitest';

import {
  IDENTITY_QUAT_BITS,
  decodeLnScale,
  encodeLnScale,
  encodeQuatOctXy88R8,
  floatToUint8,
  fromHalf,
  packSplat,
  quatWordBits,
  toHalf,
  unpackSplat,
} from '@/lib/motion-splat/encoding';

describe('toHalf / fromHalf', () => {
  it('encodes well-known values exactly', () => {
    expect(toHalf(0)).toBe(0x0000);
    expect(toHalf(1)).toBe(0x3c00);
    expect(toHalf(-2)).toBe(0xc000);
    expect(toHalf(0.5)).toBe(0x3800);
    expect(toHalf(65504)).toBe(0x7bff);
  });

  it('saturates to infinity and preserves sign', () => {
    expect(toHalf(1e6)).toBe(0x7c00);
    expect(toHalf(-1e6)).toBe(0xfc00);
    expect(fromHalf(0x7c00)).toBe(Infinity);
  });

  it('round-trips within half precision', () => {
    for (const v of [0.001, 0.37, 1.5, -3.25, 12.75, 1000]) {
      const back = fromHalf(toHalf(v));
      expect(Math.abs(back - v) / Math.max(Math.abs(v), 1e-3)).toBeLessThan(1 / 1024);
    }
  });
});

describe('floatToUint8', () => {
  it('rounds and clamps', () => {
    expect(floatToUint8(0)).toBe(0);
    expect(floatToUint8(1)).toBe(255);
    expect(floatToUint8(0.5)).toBe(128);
    expect(floatToUint8(2)).toBe(255);
    expect(floatToUint8(-1)).toBe(0);
  });
});

describe('encodeLnScale', () => {
  it('maps zero and tiny scales to 0 and the range ends to 1 and 255', () => {
    expect(encodeLnScale(0)).toBe(0);
    expect(encodeLnScale(Math.exp(-12))).toBe(1);
    expect(encodeLnScale(Math.exp(9))).toBe(255);
    expect(encodeLnScale(1e9)).toBe(255);
  });

  it('round-trips to within one quantisation step', () => {
    for (const s of [0.001, 0.01, 0.05, 0.5, 2, 100]) {
      const decoded = decodeLnScale(encodeLnScale(s));
      expect(Math.abs(Math.log(decoded) - Math.log(s))).toBeLessThan(21 / 254);
    }
  });
});

describe('encodeQuatOctXy88R8', () => {
  it('encodes the identity rotation the way Spark does', () => {
    // axis (1,0,0) → u=255, v=128; angle 0
    expect(IDENTITY_QUAT_BITS).toBe((128 << 8) | 255);
    expect(encodeQuatOctXy88R8(0, 0, 0, 1)).toBe(IDENTITY_QUAT_BITS);
  });

  it('treats q and -q as the same rotation', () => {
    const a = encodeQuatOctXy88R8(0.2, 0.3, 0.4, 0.8);
    const b = encodeQuatOctXy88R8(-0.2, -0.3, -0.4, -0.8);
    expect(a).toBe(b);
  });

  it('stores the rotation angle in the top byte', () => {
    const halfTurn = encodeQuatOctXy88R8(0, 1, 0, 0); // 180° about Y
    expect((halfTurn >>> 16) & 255).toBe(255);
    const quarterTurn = encodeQuatOctXy88R8(0, Math.SQRT1_2, 0, Math.SQRT1_2);
    // theta = π/2 → 127.5 steps; float rounding may land on either side
    expect(Math.abs(((quarterTurn >>> 16) & 255) - 127.5)).toBeLessThanOrEqual(0.5);
  });

  it('splits into word2/word3 contributions', () => {
    const bits = quatWordBits(IDENTITY_QUAT_BITS);
    expect(bits.word2).toBe(((255 << 16) | (128 << 24)) >>> 0);
    expect(bits.word3).toBe(0);
  });
});

describe('packSplat / unpackSplat', () => {
  it('round-trips colour, position, scale and rotation', () => {
    const target = new Uint32Array(8);
    packSplat(target, 1, 0.25, -1.5, -2, 0.01, 0.02, 0.005, 10, 200, 30, 255);
    const splat = unpackSplat(target, 1);
    expect(splat.r8).toBe(10);
    expect(splat.g8).toBe(200);
    expect(splat.b8).toBe(30);
    expect(splat.a8).toBe(255);
    expect(splat.x).toBeCloseTo(0.25, 3);
    expect(splat.y).toBeCloseTo(-1.5, 3);
    expect(splat.z).toBeCloseTo(-2, 3);
    expect(Math.abs(Math.log(splat.scaleX / 0.01))).toBeLessThan(0.1);
    expect(Math.abs(Math.log(splat.scaleZ / 0.005))).toBeLessThan(0.1);
    expect(splat.quatBits).toBe(IDENTITY_QUAT_BITS);
    // untouched neighbour
    expect(Array.from(target.subarray(0, 4))).toEqual([0, 0, 0, 0]);
  });
});
