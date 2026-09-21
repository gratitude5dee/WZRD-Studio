// ---------------------------------------------------------------------------
// Pure camera helpers: framing the bounding box like the reference viewer
// (oblique three-quarter view, box ≈ 40% of frame height) and the cinematic
// camera path used by the landing intro.
// ---------------------------------------------------------------------------

import type { OrbitState, Vec3 } from '@/lib/motion-splat/gl/mat4';
import { easeInOutCubic } from '@/lib/motion-splat/timeline';

export interface BoxFrame {
  center: Vec3;
  /** Radius of the bounding sphere. */
  radius: number;
}

export function boxFrameFromCorners(corners: Float32Array): BoxFrame {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < corners.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = corners[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  if (!Number.isFinite(min[0])) {
    return { center: [0, 0, 0], radius: 1 };
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { center, radius: Math.max(radius, 1e-3) };
}

/**
 * Orbit that shows the whole box at roughly `fill` of the viewport height,
 * from the reference's oblique three-quarter angle.
 */
export function homeOrbitForFrame(frame: BoxFrame, fovDeg: number, fill = 0.82): OrbitState {
  const halfFov = (fovDeg * Math.PI) / 360;
  const radius = frame.radius / (Math.tan(halfFov) * fill);
  return { theta: 0.78, phi: 0.34, radius, target: [...frame.center] as Vec3 };
}

export interface CinematicKeyframe {
  theta: number;
  phi: number;
  radiusScale: number;
}

export const CINEMATIC_START: CinematicKeyframe = { theta: 1.05, phi: 0.46, radiusScale: 1.28 };
export const CINEMATIC_END: CinematicKeyframe = { theta: 0.42, phi: 0.24, radiusScale: 0.92 };

/** Camera state along the intro's slow dolly-orbit, `progress` in 0..1. */
export function cinematicOrbit(home: OrbitState, progress: number): OrbitState {
  const e = easeInOutCubic(progress);
  const theta = CINEMATIC_START.theta + (CINEMATIC_END.theta - CINEMATIC_START.theta) * e;
  const phi = CINEMATIC_START.phi + (CINEMATIC_END.phi - CINEMATIC_START.phi) * e;
  const radiusScale = CINEMATIC_START.radiusScale + (CINEMATIC_END.radiusScale - CINEMATIC_START.radiusScale) * e;
  return { theta, phi, radius: home.radius * radiusScale, target: [...home.target] as Vec3 };
}

/** Pixel ratio cap that keeps splat fill-rate sane on phones. */
export function preferredPixelRatio(devicePixelRatio: number, isCoarsePointer: boolean): number {
  const cap = isCoarsePointer ? 1.5 : 2;
  return Math.min(cap, Math.max(1, devicePixelRatio || 1));
}
