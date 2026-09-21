import { describe, expect, it } from 'vitest';

import {
  createRgbdManifest,
  createSplatKeyframesManifest,
  isRgbdTrack,
  isSplatKeyframesTrack,
  manifestKeyframeTimes,
  parseMotionSplatManifest,
  resolveManifestUrls,
  safeParseMotionSplatManifest,
} from '@/lib/motion-splat/manifest';
import { DEFAULT_CAMERA, DEFAULT_KEYFRAME_COUNT } from '@/lib/motion-splat/constants';

const base = {
  provider: 'depth-anything-video' as const,
  source: { videoUrl: 'https://cdn.example/rgb.mp4', imageUrl: 'https://cdn.example/still.png' },
  duration: 5,
  fps: 24,
  width: 1280,
  height: 720,
};

describe('createRgbdManifest', () => {
  it('fills defaults and validates', () => {
    const manifest = createRgbdManifest({
      ...base,
      depthVideoUrl: 'https://cdn.example/depth.mp4',
      grid: { cols: 256, rows: 144 },
    });
    expect(manifest.version).toBe(1);
    expect(manifest.id).toBeTruthy();
    expect(manifest.camera).toEqual(DEFAULT_CAMERA);
    expect(isRgbdTrack(manifest.track)).toBe(true);
    if (isRgbdTrack(manifest.track)) {
      expect(manifest.track.keyframeCount).toBe(DEFAULT_KEYFRAME_COUNT);
      expect(manifest.track.depthEncoding).toBe('inverse-gray8');
    }
    expect(parseMotionSplatManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
  });

  it('derives keyframe times from the duration', () => {
    const manifest = createRgbdManifest({
      ...base,
      depthVideoUrl: 'd.mp4',
      grid: { cols: 64, rows: 36 },
      keyframeCount: 3,
    });
    const times = Array.from(manifestKeyframeTimes(manifest));
    expect(times.length).toBe(3);
    expect(times[0]).toBe(0);
    expect(times[2]).toBeCloseTo(4.95, 5);
  });
});

describe('createSplatKeyframesManifest', () => {
  it('sorts keyframes by time and exposes them as sample times', () => {
    const manifest = createSplatKeyframesManifest({
      ...base,
      provider: 'triposplat',
      keyframes: [
        { time: 2, url: 'b.ply', format: 'ply' },
        { time: 0, url: 'a.ply', format: 'ply' },
      ],
    });
    expect(isSplatKeyframesTrack(manifest.track)).toBe(true);
    expect(Array.from(manifestKeyframeTimes(manifest))).toEqual([0, 2]);
    expect(parseMotionSplatManifest(manifest).track.kind).toBe('splat-keyframes');
  });
});

describe('safeParseMotionSplatManifest', () => {
  it('rejects unknown versions, bad cameras and empty tracks with readable errors', () => {
    const good = createRgbdManifest({ ...base, depthVideoUrl: 'd.mp4', grid: { cols: 64, rows: 36 } });
    expect(safeParseMotionSplatManifest({ ...good, version: 2 }).success).toBe(false);
    const badCamera = safeParseMotionSplatManifest({ ...good, camera: { fovDeg: 50, near: 3, far: 1 } });
    expect(badCamera.success).toBe(false);
    expect(badCamera.error).toMatch(/camera/);
    const emptySequence = safeParseMotionSplatManifest({ ...good, track: { kind: 'splat-sequence', frames: [] } });
    expect(emptySequence.success).toBe(false);
    expect(emptySequence.error).toMatch(/track/);
    expect(safeParseMotionSplatManifest(null).success).toBe(false);
    expect(safeParseMotionSplatManifest('nope').success).toBe(false);
  });
});

describe('resolveManifestUrls', () => {
  it('resolves relative media against the manifest location', () => {
    const manifest = createRgbdManifest({
      ...base,
      source: { videoUrl: 'rgb.mp4' },
      depthVideoUrl: 'depth.mp4',
      grid: { cols: 64, rows: 36 },
      posterUrl: 'poster.jpg',
    });
    const resolved = resolveManifestUrls(manifest, 'https://wzrd.tech/intro-splat/manifest.json');
    expect(resolved.source.videoUrl).toBe('https://wzrd.tech/intro-splat/rgb.mp4');
    expect(resolved.posterUrl).toBe('https://wzrd.tech/intro-splat/poster.jpg');
    expect(resolved.track.kind === 'rgbd' && resolved.track.depthVideoUrl).toBe('https://wzrd.tech/intro-splat/depth.mp4');
    // absolute URLs are untouched
    const abs = resolveManifestUrls(
      createRgbdManifest({ ...base, depthVideoUrl: 'https://cdn.example/depth.mp4', grid: { cols: 64, rows: 36 } }),
      'https://wzrd.tech/x/manifest.json',
    );
    expect(abs.source.videoUrl).toBe(base.source.videoUrl);
  });
});
