// ---------------------------------------------------------------------------
// Packed-splat encoding that matches @sparkjsdev/spark 0.1.10 exactly, so the
// viewer can write straight into `PackedSplats.packedArray` without per-splat
// object allocations. Kept free of any Spark import so it is unit-testable.
//
// Layout (4 × uint32 per splat):
//   word0: r | g << 8 | b << 16 | a << 24                     (uint8 each)
//   word1: half(x) | half(y) << 16
//   word2: half(z) | quatU << 16 | quatV << 24
//   word3: lnScaleX | lnScaleY << 8 | lnScaleZ << 16 | quatAngle << 24
// ---------------------------------------------------------------------------

import { LN_SCALE_MAX, LN_SCALE_MIN, SCALE_ZERO } from './constants';

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE-754 binary16 conversion (truncating, identical to Spark's JS fallback). */
export function toHalf(value: number): number {
  f32[0] = value;
  const bits = u32[0];
  const sign = (bits >> 31) & 1;
  const exp = (bits >> 23) & 255;
  const frac = bits & 8388607;
  const halfSign = sign << 15;
  if (exp === 255) {
    return frac !== 0 ? halfSign | 32767 : halfSign | 31744;
  }
  const newExp = exp - 127 + 15;
  if (newExp >= 31) {
    return halfSign | 31744;
  }
  if (newExp <= 0) {
    if (newExp < -10) {
      return halfSign;
    }
    const subFrac = (frac | 8388608) >> (1 - newExp + 13);
    return halfSign | subFrac;
  }
  return halfSign | (newExp << 10) | (frac >> 13);
}

/** Inverse of `toHalf` (used by tests and PLY readback). */
export function fromHalf(h: number): number {
  const sign = (h >> 15) & 1 ? -1 : 1;
  const exp = (h >> 10) & 31;
  const frac = h & 1023;
  if (exp === 0) {
    return sign * Math.pow(2, -14) * (frac / 1024);
  }
  if (exp === 31) {
    return frac === 0 ? sign * Infinity : NaN;
  }
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

export function floatToUint8(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

const LN_SCALE_SCALE = 254 / (LN_SCALE_MAX - LN_SCALE_MIN);

/** Spark's 8-bit log-scale quantisation (0 means "exactly zero", 1..255 span LN_SCALE_MIN..LN_SCALE_MAX). */
export function encodeLnScale(scale: number): number {
  if (!(scale >= SCALE_ZERO)) return 0;
  return Math.min(255, Math.max(1, Math.round((Math.log(scale) - LN_SCALE_MIN) * LN_SCALE_SCALE) + 1));
}

export function decodeLnScale(encoded: number): number {
  if (encoded === 0) return 0;
  return Math.exp((encoded - 1) / LN_SCALE_SCALE + LN_SCALE_MIN);
}

/**
 * Spark's 24-bit quaternion encoding: folded octahedral axis (8+8 bits) plus
 * an 8-bit rotation angle. Returns `angle << 16 | v << 8 | u`.
 */
export function encodeQuatOctXy88R8(qx: number, qy: number, qz: number, qw: number): number {
  let len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (!(len > 0)) {
    len = 1;
    qw = 1;
    qx = qy = qz = 0;
  }
  let x = qx / len;
  let y = qy / len;
  let z = qz / len;
  let w = qw / len;
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  const theta = 2 * Math.acos(Math.min(1, w));
  const xyzNorm = Math.sqrt(x * x + y * y + z * z);
  let ax = 1;
  let ay = 0;
  let az = 0;
  if (xyzNorm >= 1e-6) {
    ax = x / xyzNorm;
    ay = y / xyzNorm;
    az = z / xyzNorm;
  }
  const sum = Math.abs(ax) + Math.abs(ay) + Math.abs(az);
  let px = ax / sum;
  let py = ay / sum;
  if (az < 0) {
    const tmp = px;
    px = (1 - Math.abs(py)) * (px >= 0 ? 1 : -1);
    py = (1 - Math.abs(tmp)) * (py >= 0 ? 1 : -1);
  }
  const quantU = Math.round((px * 0.5 + 0.5) * 255);
  const quantV = Math.round((py * 0.5 + 0.5) * 255);
  const angleInt = Math.round(theta * (255 / Math.PI));
  return (angleInt << 16) | (quantV << 8) | quantU;
}

/** Encoded identity rotation; every RGB-D splat uses it. */
export const IDENTITY_QUAT_BITS = encodeQuatOctXy88R8(0, 0, 0, 1);

/** Bits of word2/word3 that a 24-bit encoded quaternion contributes. */
export function quatWordBits(encodedQuat: number): { word2: number; word3: number } {
  const u = encodedQuat & 255;
  const v = (encodedQuat >>> 8) & 255;
  const angle = (encodedQuat >>> 16) & 255;
  return { word2: ((u << 16) | (v << 24)) >>> 0, word3: (angle << 24) >>> 0 };
}

/**
 * Write one splat into a Spark packed array. Colour and alpha are 0..255,
 * scales are linear world units, `quatBits` is a 24-bit encoded rotation.
 */
export function packSplat(
  target: Uint32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  r8: number,
  g8: number,
  b8: number,
  a8: number,
  quatBits: number = IDENTITY_QUAT_BITS,
): void {
  const i4 = index * 4;
  target[i4] = (r8 | (g8 << 8) | (b8 << 16) | (a8 << 24)) >>> 0;
  target[i4 + 1] = (toHalf(x) | (toHalf(y) << 16)) >>> 0;
  target[i4 + 2] = (toHalf(z) | ((quatBits & 255) << 16) | (((quatBits >>> 8) & 255) << 24)) >>> 0;
  target[i4 + 3] =
    (encodeLnScale(scaleX) | (encodeLnScale(scaleY) << 8) | (encodeLnScale(scaleZ) << 16) | (((quatBits >>> 16) & 255) << 24)) >>> 0;
}

/** Decode a packed splat (tests, debugging). */
export function unpackSplat(source: Uint32Array, index: number) {
  const i4 = index * 4;
  const w0 = source[i4];
  const w1 = source[i4 + 1];
  const w2 = source[i4 + 2];
  const w3 = source[i4 + 3];
  return {
    r8: w0 & 255,
    g8: (w0 >>> 8) & 255,
    b8: (w0 >>> 16) & 255,
    a8: (w0 >>> 24) & 255,
    x: fromHalf(w1 & 65535),
    y: fromHalf((w1 >>> 16) & 65535),
    z: fromHalf(w2 & 65535),
    scaleX: decodeLnScale(w3 & 255),
    scaleY: decodeLnScale((w3 >>> 8) & 255),
    scaleZ: decodeLnScale((w3 >>> 16) & 255),
    quatBits: (((w2 >>> 16) & 255) | (((w2 >>> 24) & 255) << 8) | (((w3 >>> 24) & 255) << 16)) >>> 0,
  };
}
