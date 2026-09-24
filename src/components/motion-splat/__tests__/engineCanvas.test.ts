import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MotionSplatManifest } from '@/types/motionSplat';

/**
 * Disposing a backend loses its canvas' WebGL context for good, so the engine
 * must hand every attempt (the gpu fallback, a Retry) a brand-new canvas.
 */
const created: Array<{ kind: string; canvas: HTMLCanvasElement; disposed: boolean }> = [];

function makeBackend(kind: string, canvas: HTMLCanvasElement, shouldFail: boolean) {
  const record = { kind, canvas, disposed: false };
  created.push(record);
  return {
    kind,
    ownsClock: false,
    load: async () => {
      if (shouldFail) throw new Error(`${kind} failed`);
      return { duration: 4, keyframeTimes: new Float32Array([0]), splatCount: 1 };
    },
    seek: async () => {},
    setOrbit: () => {},
    setViewport: () => {},
    render: () => {},
    captureFrame: () => null,
    boxCorners: () => new Float32Array(24),
    dispose: () => {
      record.disposed = true;
    },
  };
}

let sparkFails = true;
let gpuFails = false;

vi.mock('../engine/backends/SparkBackend', () => ({
  SparkBackend: class {
    constructor(options: { canvas: HTMLCanvasElement }) {
      return makeBackend('spark', options.canvas, sparkFails) as never;
    }
  },
}));
vi.mock('../engine/backends/GpuBackend', () => ({
  GpuBackend: class {
    constructor(options: { canvas: HTMLCanvasElement }) {
      return makeBackend('gpu', options.canvas, gpuFails) as never;
    }
  },
}));

import { MotionSplatEngine } from '../engine/MotionSplatEngine';

const manifest: MotionSplatManifest = {
  version: 1,
  id: 'm',
  title: 'Fish',
  createdAt: 'x',
  provider: 'depth-anything-video',
  source: { videoUrl: 'https://cdn/rgb.mp4' },
  duration: 4,
  fps: 24,
  width: 640,
  height: 360,
  camera: { fovDeg: 50, near: 1, far: 3 },
  track: { kind: 'rgbd', depthVideoUrl: 'https://cdn/depth.mp4', depthEncoding: 'inverse-gray8', grid: { cols: 64, rows: 36 }, keyframeCount: 8 },
};

beforeEach(() => {
  created.length = 0;
  sparkFails = true;
  gpuFails = false;
  // The engine bails out early without WebGL2, so report it as available.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension: () => null })) as never;
});

describe('MotionSplatEngine canvas lifecycle', () => {
  it('gives the fallback backend a canvas the failed one never touched', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const engine = new MotionSplatEngine(container, { manifest });
    await engine.load();

    expect(created.map((c) => c.kind)).toEqual(['spark', 'gpu']);
    expect(created[0].disposed).toBe(true);
    expect(created[1].canvas).not.toBe(created[0].canvas);
    // Exactly one canvas is ever attached, so the stage never stacks dead ones.
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(container.querySelector('canvas')).toBe(created[1].canvas);
    engine.dispose();
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('gives a retry a fresh canvas too', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const engine = new MotionSplatEngine(container, { manifest, backend: 'gpu' });
    gpuFails = true;
    await engine.load();
    gpuFails = false;
    await engine.load();

    expect(created).toHaveLength(2);
    expect(created[1].canvas).not.toBe(created[0].canvas);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    engine.dispose();
  });
});
