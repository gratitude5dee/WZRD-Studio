import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_KEYFRAME_COUNT, DEFAULT_VIDEO_MODEL_ID } from '@/lib/motion-splat/constants';
import { createRgbdManifest } from '@/lib/motion-splat/manifest';
import { useMotionSplatStore } from '@/lib/stores/motion-splat-store';

const manifest = createRgbdManifest({
  provider: 'depth-anything-video',
  source: { videoUrl: 'https://cdn/rgb.mp4' },
  duration: 4,
  fps: 24,
  width: 640,
  height: 360,
  depthVideoUrl: 'https://cdn/depth.mp4',
  grid: { cols: 64, rows: 36 },
});

beforeEach(() => {
  useMotionSplatStore.getState().reset();
});

describe('motion-splat store', () => {
  it('starts idle with sensible defaults', () => {
    const state = useMotionSplatStore.getState();
    expect(state.step).toBe('idle');
    expect(state.busy).toBe(false);
    expect(state.videoModelId).toBe(DEFAULT_VIDEO_MODEL_ID);
    expect(state.keyframeCount).toBe(DEFAULT_KEYFRAME_COUNT);
    expect(state.buildMode).toBe('rgbd');
    expect(state.quality).toBe('auto');
  });

  it('marks busy for pipeline steps and clears on finish', () => {
    const store = useMotionSplatStore.getState();
    store.beginStep('generating-video', 'Generating');
    expect(useMotionSplatStore.getState().busy).toBe(true);
    expect(useMotionSplatStore.getState().progress).toEqual({ value: 0, label: 'Generating' });
    useMotionSplatStore.getState().setProgress({ value: 0.5, label: 'Half' });
    expect(useMotionSplatStore.getState().progress?.value).toBe(0.5);
    useMotionSplatStore.getState().finishStep('idle');
    expect(useMotionSplatStore.getState().busy).toBe(false);
    expect(useMotionSplatStore.getState().progress).toBeNull();
  });

  it('records failures and clears them', () => {
    useMotionSplatStore.getState().beginStep('building-splat');
    useMotionSplatStore.getState().fail('boom');
    const state = useMotionSplatStore.getState();
    expect(state.step).toBe('error');
    expect(state.busy).toBe(false);
    expect(state.error).toBe('boom');
    useMotionSplatStore.getState().clearError();
    expect(useMotionSplatStore.getState().step).toBe('idle');
    expect(useMotionSplatStore.getState().error).toBeNull();
  });

  it('invalidates downstream outputs when a different source image is set', () => {
    const store = useMotionSplatStore.getState();
    store.setSourceImage({ url: 'https://cdn/a.png', name: 'a.png' });
    store.setVideo({ url: 'https://cdn/v.mp4' });
    store.setManifest(manifest, 'https://cdn/m.json');
    expect(useMotionSplatStore.getState().step).toBe('ready');
    useMotionSplatStore.getState().setSourceImage({ url: 'https://cdn/b.png', name: 'b.png' });
    const state = useMotionSplatStore.getState();
    expect(state.video).toBeNull();
    expect(state.manifest).toBeNull();
    expect(state.manifestUrl).toBeNull();
    expect(state.step).toBe('idle');
  });

  it('keeps outputs when the same source is re-set (upload resolution)', () => {
    const store = useMotionSplatStore.getState();
    store.setSourceImage({ url: 'https://cdn/a.png', name: 'a.png' });
    store.setVideo({ url: 'https://cdn/v.mp4' });
    useMotionSplatStore.getState().setSourceImage({ url: 'https://cdn/a.png', name: 'a.png', path: 'p' });
    expect(useMotionSplatStore.getState().video?.url).toBe('https://cdn/v.mp4');
  });

  it('clamps keyframe counts and dedupes the library', () => {
    const store = useMotionSplatStore.getState();
    store.setKeyframeCount(1);
    expect(useMotionSplatStore.getState().keyframeCount).toBe(2);
    store.setKeyframeCount(999);
    expect(useMotionSplatStore.getState().keyframeCount).toBe(60);
    const item = { id: 'j1', title: 'A', createdAt: '2026-01-01', manifestUrl: 'https://m/1.json', provider: 'depth-anything-video' as const, trackKind: 'rgbd' as const, duration: 4 };
    store.addToLibrary(item);
    store.addToLibrary({ ...item, title: 'A2' });
    expect(useMotionSplatStore.getState().library).toHaveLength(1);
    expect(useMotionSplatStore.getState().library[0].title).toBe('A2');
  });

  it('reset restores the initial state', () => {
    useMotionSplatStore.getState().setPrompt('hello');
    useMotionSplatStore.getState().setTitle('x');
    useMotionSplatStore.getState().reset();
    expect(useMotionSplatStore.getState().prompt).toBe('');
    expect(useMotionSplatStore.getState().title).toBe('');
  });
});
