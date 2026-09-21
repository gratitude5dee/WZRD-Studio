// ---------------------------------------------------------------------------
// Blend two keyframes and write the result straight into a Spark packed array.
// Hot path: no allocations, no per-splat function calls beyond the encoders.
// ---------------------------------------------------------------------------

import { FOOTPRINT_ANISOTROPY, FOOTPRINT_SCALE } from './constants';
import { IDENTITY_QUAT_BITS, encodeLnScale, encodeQuatOctXy88R8, toHalf } from './encoding';
import type { RgbdFrame } from './unproject';

export interface RgbdPackOptions {
  rows: number;
  /** tan(fov/2) of the virtual camera. */
  tanY: number;
  footprintScale?: number;
  anisotropy?: number;
  /** Global opacity multiplier 0..1 (crossfades). */
  opacity?: number;
}

/** Isotropic splat radius that covers one pixel cell at depth `z`. */
export function footprintForDepth(z: number, tanY: number, rows: number, scale: number = FOOTPRINT_SCALE): number {
  return (z * tanY * 2 * scale) / rows;
}

/**
 * Write `lerp(a, b, mix)` for every grid cell into `target` (Spark packed
 * layout). Frames must share the same grid. Returns the number of splats
 * written.
 */
export function packRgbdBlend(
  target: Uint32Array,
  a: RgbdFrame,
  b: RgbdFrame | null,
  mix: number,
  options: RgbdPackOptions,
): number {
  const count = a.count;
  const blend = b && b !== a && mix > 0 ? Math.min(1, mix) : 0;
  const bp = b ? b.positions : a.positions;
  const bc = b ? b.colors : a.colors;
  const ba = b ? b.alphas : a.alphas;
  const ap = a.positions;
  const ac = a.colors;
  const aa = a.alphas;
  const scale = options.footprintScale ?? FOOTPRINT_SCALE;
  const aniso = options.anisotropy ?? FOOTPRINT_ANISOTROPY;
  const opacity = options.opacity ?? 1;
  const footK = (options.tanY * 2 * scale) / options.rows;
  const quatU = IDENTITY_QUAT_BITS & 255;
  const quatV = (IDENTITY_QUAT_BITS >>> 8) & 255;
  const quatAngle = (IDENTITY_QUAT_BITS >>> 16) & 255;
  const word2Quat = ((quatU << 16) | (quatV << 24)) >>> 0;
  const word3Quat = (quatAngle << 24) >>> 0;

  for (let p = 0; p < count; p++) {
    const p3 = p * 3;
    let x = ap[p3];
    let y = ap[p3 + 1];
    let z = ap[p3 + 2];
    let r = ac[p3];
    let g = ac[p3 + 1];
    let bl = ac[p3 + 2];
    let al = aa[p];
    if (blend > 0) {
      x += (bp[p3] - x) * blend;
      y += (bp[p3 + 1] - y) * blend;
      z += (bp[p3 + 2] - z) * blend;
      r += (bc[p3] - r) * blend;
      g += (bc[p3 + 1] - g) * blend;
      bl += (bc[p3 + 2] - bl) * blend;
      al += (ba[p] - al) * blend;
    }
    const foot = -z * footK;
    const s = encodeLnScale(foot);
    const sz = encodeLnScale(foot * aniso);
    const a8 = opacity >= 1 ? Math.round(al) : Math.round(al * opacity);
    const i4 = p * 4;
    target[i4] = (Math.round(r) | (Math.round(g) << 8) | (Math.round(bl) << 16) | (a8 << 24)) >>> 0;
    target[i4 + 1] = (toHalf(x) | (toHalf(y) << 16)) >>> 0;
    target[i4 + 2] = (toHalf(z) | word2Quat) >>> 0;
    target[i4 + 3] = (s | (s << 8) | (sz << 16) | word3Quat) >>> 0;
  }
  return count;
}

/** A generic splat set (from PLY/SPZ) with parallel typed arrays. */
export interface SplatSet {
  count: number;
  positions: Float32Array;
  /** Linear scales, xyz triples. */
  scales: Float32Array;
  /** Quaternions, xyzw quadruples. */
  quaternions: Float32Array;
  /** rgb 0..255 triples. */
  colors: Uint8Array;
  /** 0..255 */
  alphas: Uint8Array;
}

export function createSplatSet(count: number): SplatSet {
  return {
    count,
    positions: new Float32Array(count * 3),
    scales: new Float32Array(count * 3),
    quaternions: new Float32Array(count * 4),
    colors: new Uint8Array(count * 3),
    alphas: new Uint8Array(count),
  };
}

export interface SplatSetPackOptions {
  opacity?: number;
}

/**
 * Blend two aligned splat sets (same count, index-correspondence) into a Spark
 * packed array. Scales interpolate in log space, rotations by normalised lerp.
 */
export function packSplatSetBlend(
  target: Uint32Array,
  a: SplatSet,
  b: SplatSet | null,
  mix: number,
  options: SplatSetPackOptions = {},
): number {
  const count = a.count;
  const blend = b && b !== a && mix > 0 ? Math.min(1, mix) : 0;
  const opacity = options.opacity ?? 1;
  const bp = b ? b.positions : a.positions;
  const bs = b ? b.scales : a.scales;
  const bq = b ? b.quaternions : a.quaternions;
  const bc = b ? b.colors : a.colors;
  const ba = b ? b.alphas : a.alphas;

  for (let p = 0; p < count; p++) {
    const p3 = p * 3;
    const p4 = p * 4;
    let x = a.positions[p3];
    let y = a.positions[p3 + 1];
    let z = a.positions[p3 + 2];
    let sx = a.scales[p3];
    let sy = a.scales[p3 + 1];
    let sz = a.scales[p3 + 2];
    let qx = a.quaternions[p4];
    let qy = a.quaternions[p4 + 1];
    let qz = a.quaternions[p4 + 2];
    let qw = a.quaternions[p4 + 3];
    let r = a.colors[p3];
    let g = a.colors[p3 + 1];
    let bl = a.colors[p3 + 2];
    let al = a.alphas[p];
    if (blend > 0) {
      x += (bp[p3] - x) * blend;
      y += (bp[p3 + 1] - y) * blend;
      z += (bp[p3 + 2] - z) * blend;
      sx = Math.exp(Math.log(Math.max(sx, 1e-9)) * (1 - blend) + Math.log(Math.max(bs[p3], 1e-9)) * blend);
      sy = Math.exp(Math.log(Math.max(sy, 1e-9)) * (1 - blend) + Math.log(Math.max(bs[p3 + 1], 1e-9)) * blend);
      sz = Math.exp(Math.log(Math.max(sz, 1e-9)) * (1 - blend) + Math.log(Math.max(bs[p3 + 2], 1e-9)) * blend);
      // nlerp with hemisphere check
      const dot = qx * bq[p4] + qy * bq[p4 + 1] + qz * bq[p4 + 2] + qw * bq[p4 + 3];
      const sign = dot < 0 ? -1 : 1;
      qx += (sign * bq[p4] - qx) * blend;
      qy += (sign * bq[p4 + 1] - qy) * blend;
      qz += (sign * bq[p4 + 2] - qz) * blend;
      qw += (sign * bq[p4 + 3] - qw) * blend;
      r += (bc[p3] - r) * blend;
      g += (bc[p3 + 1] - g) * blend;
      bl += (bc[p3 + 2] - bl) * blend;
      al += (ba[p] - al) * blend;
    }
    const quatBits = encodeQuatOctXy88R8(qx, qy, qz, qw);
    const a8 = opacity >= 1 ? Math.round(al) : Math.round(al * opacity);
    const i4 = p * 4;
    target[i4] = (Math.round(r) | (Math.round(g) << 8) | (Math.round(bl) << 16) | (a8 << 24)) >>> 0;
    target[i4 + 1] = (toHalf(x) | (toHalf(y) << 16)) >>> 0;
    target[i4 + 2] = (toHalf(z) | ((quatBits & 255) << 16) | (((quatBits >>> 8) & 255) << 24)) >>> 0;
    target[i4 + 3] =
      (encodeLnScale(sx) | (encodeLnScale(sy) << 8) | (encodeLnScale(sz) << 16) | (((quatBits >>> 16) & 255) << 24)) >>> 0;
  }
  return count;
}

/** Zero the alpha of splats `from..count` so a shrinking set leaves no ghosts. */
export function clearPackedRange(target: Uint32Array, from: number, to: number): void {
  for (let p = from; p < to; p++) {
    target[p * 4] = 0;
  }
}
