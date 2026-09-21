import { describe, expect, it } from 'vitest';

import { frustumCorners } from '@/lib/motion-splat/unproject';
import { orbitEye } from '@/lib/motion-splat/gl/mat4';
import { CINEMATIC_END, CINEMATIC_START, boxFrameFromCorners, cinematicOrbit, homeOrbitForFrame, preferredPixelRatio } from '../engine/cameraFraming';
import { OrbitController } from '../engine/OrbitController';

describe('boxFrameFromCorners', () => {
  it('finds the centre and bounding radius of the frustum', () => {
    const frame = boxFrameFromCorners(frustumCorners({ fovDeg: 90, near: 1, far: 3 }, 1));
    expect(frame.center).toEqual([0, 0, -2]);
    // far face spans 6 units, depth spans 2 → half diagonal
    expect(frame.radius).toBeCloseTo(Math.hypot(6, 6, 2) / 2, 5);
  });

  it('copes with empty input', () => {
    expect(boxFrameFromCorners(new Float32Array(0))).toEqual({ center: [0, 0, 0], radius: 1 });
  });
});

describe('homeOrbitForFrame', () => {
  it('backs off far enough to fit the box and looks at its centre', () => {
    const frame = { center: [0, 0, -2] as [number, number, number], radius: 2 };
    const orbit = homeOrbitForFrame(frame, 42, 0.8);
    expect(orbit.target).toEqual([0, 0, -2]);
    expect(orbit.radius).toBeCloseTo(2 / (Math.tan((42 * Math.PI) / 360) * 0.8), 5);
    const eye = orbitEye(orbit);
    expect(Math.hypot(eye[0], eye[1], eye[2] + 2)).toBeCloseTo(orbit.radius, 5);
    expect(eye[1]).toBeGreaterThan(0); // slightly above, like the reference
  });
});

describe('cinematicOrbit', () => {
  const home = { theta: 0.5, phi: 0.3, radius: 10, target: [1, 2, 3] as [number, number, number] };
  it('starts and ends on the authored keyframes', () => {
    const start = cinematicOrbit(home, 0);
    const end = cinematicOrbit(home, 1);
    expect(start.theta).toBeCloseTo(CINEMATIC_START.theta, 6);
    expect(start.radius).toBeCloseTo(home.radius * CINEMATIC_START.radiusScale, 6);
    expect(end.theta).toBeCloseTo(CINEMATIC_END.theta, 6);
    expect(end.radius).toBeCloseTo(home.radius * CINEMATIC_END.radiusScale, 6);
    expect(end.target).toEqual(home.target);
    expect(end.target).not.toBe(home.target);
  });

  it('is monotonic in between', () => {
    let previous = cinematicOrbit(home, 0).theta;
    for (let i = 1; i <= 10; i++) {
      const next = cinematicOrbit(home, i / 10).theta;
      expect(next).toBeLessThanOrEqual(previous + 1e-9);
      previous = next;
    }
  });
});

describe('preferredPixelRatio', () => {
  it('caps DPR lower on coarse pointers', () => {
    expect(preferredPixelRatio(3, false)).toBe(2);
    expect(preferredPixelRatio(3, true)).toBe(1.5);
    expect(preferredPixelRatio(0, false)).toBe(1);
  });
});

describe('OrbitController (non-pointer behaviour)', () => {
  it('drifts, zooms within limits and resets to home', () => {
    const element = document.createElement('div');
    const orbit = { theta: 0, phi: 0.2, radius: 5, target: [0, 0, 0] as [number, number, number] };
    const controller = new OrbitController({ element, orbit, limits: { minRadius: 1, maxRadius: 8 } });
    controller.drift(2, 0.5);
    expect(orbit.theta).toBeCloseTo(1, 6);
    controller.zoom(10);
    expect(orbit.radius).toBe(8);
    controller.zoom(0.01);
    expect(orbit.radius).toBe(1);
    expect(controller.update(0.016)).toBe(false);
    controller.reset();
    expect(orbit.theta).toBe(0);
    expect(orbit.radius).toBe(5);
    controller.dispose();
  });
});
