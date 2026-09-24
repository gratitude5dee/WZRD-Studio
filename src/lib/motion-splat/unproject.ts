// ---------------------------------------------------------------------------
// RGB-D → splat geometry. Camera space: origin at the eye, +X right, +Y up,
// looking down -Z (three.js convention). All functions are pure.
// ---------------------------------------------------------------------------

import type { DepthEncoding, MotionSplatCamera, MotionSplatGrid, MotionSplatQuality } from '@/types/motionSplat';
import { EDGE_ALPHA, EDGE_DEPTH_THRESHOLD, MOTION_SPLAT_GRID_PRESETS } from './constants';

export interface FrustumTangents {
  tanX: number;
  tanY: number;
}

export function frustumTangents(fovDeg: number, aspect: number): FrustumTangents {
  const tanY = Math.tan((fovDeg * Math.PI) / 360);
  return { tanX: tanY * aspect, tanY };
}

/** Grayscale (0..1) → metric depth inside [near, far]. Bright pixels are near for both encodings. */
export function decodeDepth(gray01: number, encoding: DepthEncoding, near: number, far: number): number {
  const g = gray01 < 0 ? 0 : gray01 > 1 ? 1 : gray01;
  if (encoding === 'linear-gray8') {
    return near + (1 - g) * (far - near);
  }
  // inverse-gray8: disparity is linear in brightness.
  return 1 / ((1 / near) * g + (1 / far) * (1 - g));
}

/**
 * Depth value (0..1) of pixel `p` in an RGBA buffer. Uses Rec. 709 luminance so
 * grayscale maps decode exactly and perceptually uniform colormaps (inferno,
 * viridis, magma, plasma) still decode monotonically.
 */
export function depthLuma(rgba: ArrayLike<number>, p: number): number {
  const i = p * 4;
  return (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
}

/** Inverse of `decodeDepth` (tests, tooling). */
export function encodeDepth(z: number, encoding: DepthEncoding, near: number, far: number): number {
  const clamped = Math.min(far, Math.max(near, z));
  if (encoding === 'linear-gray8') {
    return 1 - (clamped - near) / (far - near);
  }
  return (1 / clamped - 1 / far) / (1 / near - 1 / far);
}

/** Grid for a quality preset, re-shaped to the video aspect while keeping roughly the same cell count. */
export function resolveGrid(quality: Exclude<MotionSplatQuality, 'auto'>, aspect: number): MotionSplatGrid {
  const preset = MOTION_SPLAT_GRID_PRESETS[quality];
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : preset.cols / preset.rows;
  const total = preset.cols * preset.rows;
  const cols = Math.max(8, Math.round(Math.sqrt(total * safeAspect)));
  const rows = Math.max(8, Math.round(total / cols));
  return { cols, rows };
}

/**
 * Frustum corners as a flat XYZ array (8 points): near face first, then far.
 * Within each face the order is top-left, top-right, bottom-right, bottom-left.
 */
export function frustumCorners(camera: MotionSplatCamera, aspect: number): Float32Array {
  const { tanX, tanY } = frustumTangents(camera.fovDeg, aspect);
  const out = new Float32Array(24);
  const signs: ReadonlyArray<readonly [number, number]> = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];
  let k = 0;
  for (const z of [camera.near, camera.far]) {
    for (const [sx, sy] of signs) {
      out[k++] = sx * tanX * z;
      out[k++] = sy * tanY * z;
      out[k++] = -z;
    }
  }
  return out;
}

/** Line-segment index pairs into `frustumCorners` (12 edges). */
export const FRUSTUM_EDGE_INDICES: readonly number[] = [
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7,
];

/** Triangle indices into `frustumCorners` for the six glass faces. */
export const FRUSTUM_FACE_INDICES: readonly number[] = [
  0, 1, 2, 0, 2, 3,
  4, 6, 5, 4, 7, 6,
  0, 4, 5, 0, 5, 1,
  1, 5, 6, 1, 6, 2,
  2, 6, 7, 2, 7, 3,
  3, 7, 4, 3, 4, 0,
];

export function frustumCenter(camera: MotionSplatCamera): [number, number, number] {
  return [0, 0, -(camera.near + camera.far) / 2];
}

/** Largest dimension of the far face, handy for framing the camera. */
export function frustumExtent(camera: MotionSplatCamera, aspect: number): number {
  const { tanX, tanY } = frustumTangents(camera.fovDeg, aspect);
  return 2 * camera.far * Math.max(tanX, tanY);
}

/** One decoded keyframe: parallel arrays with one entry per grid cell. */
export interface RgbdFrame {
  count: number;
  /** xyz triples in camera space. */
  positions: Float32Array;
  /** rgb triples, 0..255. */
  colors: Uint8Array;
  /** 0..255 opacity (edge-aware). */
  alphas: Uint8Array;
  /** Metric depth per cell (positive). */
  depths: Float32Array;
}

export interface BuildRgbdFrameOptions {
  edgeThreshold?: number;
  edgeAlpha?: number;
}

/**
 * Unproject one RGB frame + one depth frame (both RGBA pixel buffers of
 * `grid.cols × grid.rows`) into camera-space Gaussians. Depth edges get a
 * reduced alpha so silhouettes do not smear across the depth gap.
 */
export function buildRgbdFrame(
  rgba: ArrayLike<number>,
  depthRgba: ArrayLike<number>,
  grid: MotionSplatGrid,
  camera: MotionSplatCamera,
  encoding: DepthEncoding,
  options: BuildRgbdFrameOptions = {},
): RgbdFrame {
  const { cols, rows } = grid;
  const count = cols * rows;
  const { tanX, tanY } = frustumTangents(camera.fovDeg, cols / rows);
  const edgeThreshold = options.edgeThreshold ?? EDGE_DEPTH_THRESHOLD;
  const edgeAlpha8 = Math.round((options.edgeAlpha ?? EDGE_ALPHA) * 255);

  const depths = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  const colors = new Uint8Array(count * 3);
  const alphas = new Uint8Array(count);

  for (let p = 0; p < count; p++) {
    depths[p] = decodeDepth(depthLuma(depthRgba, p), encoding, camera.near, camera.far);
  }

  for (let j = 0; j < rows; j++) {
    const v = (j + 0.5) / rows;
    const ny = (1 - v * 2) * tanY;
    for (let i = 0; i < cols; i++) {
      const p = j * cols + i;
      const z = depths[p];
      const u = (i + 0.5) / cols;
      positions[p * 3] = (u * 2 - 1) * tanX * z;
      positions[p * 3 + 1] = ny * z;
      positions[p * 3 + 2] = -z;
      colors[p * 3] = rgba[p * 4];
      colors[p * 3 + 1] = rgba[p * 4 + 1];
      colors[p * 3 + 2] = rgba[p * 4 + 2];

      const zl = depths[i > 0 ? p - 1 : p];
      const zr = depths[i < cols - 1 ? p + 1 : p];
      const zu = depths[j > 0 ? p - cols : p];
      const zd = depths[j < rows - 1 ? p + cols : p];
      const grad =
        Math.max(Math.abs(zl - z), Math.abs(zr - z), Math.abs(zu - z), Math.abs(zd - z)) / z;
      alphas[p] = grad > edgeThreshold ? edgeAlpha8 : 255;
    }
  }

  return { count, positions, colors, alphas, depths };
}
