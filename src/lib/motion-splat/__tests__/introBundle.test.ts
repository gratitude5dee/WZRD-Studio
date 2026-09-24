import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import { buildIntroBundle, buildIntroBundleArchive, relativizeManifestForBundle } from '@/lib/motion-splat/introBundle';
import { createRgbdManifest, createSplatKeyframesManifest, parseMotionSplatManifest } from '@/lib/motion-splat/manifest';
import { hashPixels } from '@/lib/motion-splat/videoFrames';

const rgbd = createRgbdManifest({
  provider: 'depth-anything-video',
  source: { videoUrl: 'https://cdn/clip.mp4', imageUrl: 'https://cdn/still.png', prompt: 'p' },
  duration: 4,
  fps: 24,
  width: 640,
  height: 360,
  depthVideoUrl: 'https://cdn/depth.mp4?token=1',
  grid: { cols: 64, rows: 36 },
  posterUrl: 'https://cdn/poster.jpg',
});

describe('relativizeManifestForBundle', () => {
  it('rewrites media to bundle-relative names and lists the files to fetch', () => {
    const { manifest, files } = relativizeManifestForBundle(rgbd);
    expect(manifest.source.videoUrl).toBe('rgb.mp4');
    expect(manifest.source.imageUrl).toBeUndefined();
    expect(manifest.track.kind === 'rgbd' && manifest.track.depthVideoUrl).toBe('depth.mp4');
    expect(manifest.posterUrl).toBe('poster.jpg');
    expect(files.map((f) => f.name)).toEqual(['rgb.mp4', 'depth.mp4', 'poster.jpg']);
    expect(parseMotionSplatManifest(manifest).id).toBe(rgbd.id);
  });

  it('handles keyframe tracks', () => {
    const manifest = createSplatKeyframesManifest({
      provider: 'triposplat',
      source: { videoUrl: 'https://cdn/clip.mp4' },
      duration: 4,
      fps: 24,
      width: 640,
      height: 360,
      keyframes: [
        { time: 0, url: 'https://cdn/a.ply', format: 'ply', sourceImageUrl: 'https://cdn/a.png' },
        { time: 2, url: 'https://cdn/b.ply', format: 'ply' },
      ],
    });
    const { manifest: bundled, files } = relativizeManifestForBundle(manifest);
    expect(bundled.track.kind === 'splat-keyframes' && bundled.track.keyframes.map((k) => k.url)).toEqual(['keyframe-0.ply', 'keyframe-1.ply']);
    expect(files).toHaveLength(3);
  });
});

describe('buildIntroBundle', () => {
  it('zips the manifest and every media file', async () => {
    const fetchImpl = vi.fn(async (url: string) => new Response(`bytes:${url}`, { status: 200 })) as unknown as typeof fetch;
    const archive = await buildIntroBundleArchive(rgbd, fetchImpl);
    const zip = await JSZip.loadAsync(await archive.generateAsync({ type: 'uint8array' }));
    expect(Object.keys(zip.files).sort()).toEqual(['depth.mp4', 'manifest.json', 'poster.jpg', 'rgb.mp4']);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.source.videoUrl).toBe('rgb.mp4');
    expect(await zip.file('rgb.mp4')!.async('string')).toBe('bytes:https://cdn/clip.mp4');
  });

  it('fails loudly when a media download fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 404 })) as unknown as typeof fetch;
    await expect(buildIntroBundle(rgbd, fetchImpl)).rejects.toThrow(/Could not download rgb\.mp4/);
  });
});

describe('hashPixels', () => {
  it('is deterministic and sensitive to content', () => {
    const a = new Uint8ClampedArray(4096 * 4).fill(10);
    const b = new Uint8ClampedArray(4096 * 4).fill(10);
    b[0] = 11;
    expect(hashPixels(a)).toBe(hashPixels(new Uint8ClampedArray(a)));
    expect(hashPixels(a)).not.toBe(hashPixels(b));
  });
});
