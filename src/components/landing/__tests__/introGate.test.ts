import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_INTRO_MANIFEST_URL,
  SPLAT_INTRO_SEEN_KEY,
  markSplatIntroMissing,
  markSplatIntroSeen,
  probeIntroManifest,
  resolveIntroManifestUrl,
  shouldShowSplatIntro,
} from '@/components/landing/introGate';

const matchMediaMock = (matches: boolean) =>
  vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });

const validManifest = {
  version: 1,
  id: 'intro',
  title: 'Intro',
  createdAt: '2026-01-01T00:00:00Z',
  provider: 'depth-anything-video',
  source: { videoUrl: 'rgb.mp4' },
  duration: 6,
  fps: 24,
  width: 1280,
  height: 720,
  camera: { fovDeg: 50, near: 1, far: 3 },
  track: { kind: 'rgbd', depthVideoUrl: 'depth.mp4', depthEncoding: 'inverse-gray8', grid: { cols: 320, rows: 180 }, keyframeCount: 24 },
};

beforeEach(() => {
  sessionStorage.clear();
  window.matchMedia = matchMediaMock(false) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shouldShowSplatIntro', () => {
  it('shows once per session', () => {
    expect(shouldShowSplatIntro('')).toBe(true);
    markSplatIntroSeen();
    expect(sessionStorage.getItem(SPLAT_INTRO_SEEN_KEY)).toBe('true');
    expect(shouldShowSplatIntro('')).toBe(false);
  });

  it('honours ?intro=1 and ?intro=0 overrides', () => {
    markSplatIntroSeen();
    expect(shouldShowSplatIntro('?intro=1')).toBe(true);
    sessionStorage.clear();
    expect(shouldShowSplatIntro('?intro=0')).toBe(false);
  });

  it('skips for reduced motion and when the landing motion toggle is off', () => {
    window.matchMedia = matchMediaMock(true) as unknown as typeof window.matchMedia;
    expect(shouldShowSplatIntro('')).toBe(false);
    window.matchMedia = matchMediaMock(false) as unknown as typeof window.matchMedia;
    sessionStorage.setItem('wzrd:landing-motion', 'off');
    expect(shouldShowSplatIntro('')).toBe(false);
  });
});

describe('resolveIntroManifestUrl', () => {
  it('prefers an explicit URL and falls back to the public asset', () => {
    expect(resolveIntroManifestUrl('https://cdn/m.json')).toBe('https://cdn/m.json');
    expect(resolveIntroManifestUrl()).toBe(DEFAULT_INTRO_MANIFEST_URL);
  });
});

describe('probeIntroManifest', () => {
  it('returns a resolved manifest for a valid response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validManifest), { status: 200 })));
    const manifest = await probeIntroManifest('/intro-splat/manifest.json');
    expect(manifest?.id).toBe('intro');
    expect(manifest?.source.videoUrl).toMatch(/\/intro-splat\/rgb\.mp4$/);
    expect(fetch).toHaveBeenCalledWith('/intro-splat/manifest.json', expect.objectContaining({ cache: 'no-store' }));
  });

  it('returns null on 404, invalid JSON, invalid schema and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    expect(await probeIntroManifest('/x.json')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    expect(await probeIntroManifest('/x.json')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 2 }), { status: 200 })));
    expect(await probeIntroManifest('/x.json')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await probeIntroManifest('/x.json')).toBeNull();
  });
});

describe('missing-asset cache', () => {
  it('skips the intro for the rest of the session once a probe found no asset', () => {
    sessionStorage.clear();
    expect(shouldShowSplatIntro('')).toBe(true);
    markSplatIntroMissing();
    expect(shouldShowSplatIntro('')).toBe(false);
    // The QA override still forces a replay.
    expect(shouldShowSplatIntro('?intro=1')).toBe(true);
    sessionStorage.clear();
  });
});
