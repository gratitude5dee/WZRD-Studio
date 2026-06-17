import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioTrack, Clip } from '@/store/videoEditorStore';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import { useEditorShortcuts } from './useEditorShortcuts';

vi.mock('@/services/videoEditorService', () => ({
  videoEditorService: {
    saveTimelineClip: vi.fn(),
    deleteTimelineClip: vi.fn(),
    saveAudioTrack: vi.fn(),
    deleteAudioTrack: vi.fn(),
    saveKeyframe: vi.fn(),
    deleteKeyframe: vi.fn(),
    updateComposition: vi.fn(),
    getTimelineClips: vi.fn(async () => []),
    getAudioTracks: vi.fn(async () => []),
    getComposition: vi.fn(async () => undefined),
    getKeyframes: vi.fn(async () => []),
    getMediaItems: vi.fn(async () => []),
  },
}));

const createClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Shot',
  url: '/shot.mp4',
  startTime: 1000,
  duration: 4000,
  endTime: 5000,
  layer: 0,
  trackIndex: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
  ...overrides,
});

const createAudioTrack = (overrides: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 'audio-1',
  type: 'audio',
  name: 'Stem',
  url: '/stem.wav',
  startTime: 1000,
  duration: 4000,
  endTime: 5000,
  volume: 1,
  isMuted: false,
  trackIndex: 0,
  ...overrides,
});

function ShortcutHarness() {
  useEditorShortcuts();
  return <div>shortcuts active</div>;
}

describe('useEditorShortcuts', () => {
  beforeEach(() => {
    useVideoEditorStore.getState().reset();
  });

  it('deletes selected clips, audio tracks, and targeted keyframes through the OpenCut command path', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addAudioTrack(createAudioTrack());
    store.addKeyframe({
      id: 'audio-keyframe',
      targetId: 'audio-1',
      targetType: 'audio',
      time: 2000,
      propertyPath: 'volume',
      easing: 'linear',
      properties: { volume: 0.5 },
    });
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);

    render(<ShortcutHarness />);

    const historyLengthBeforeDelete = useVideoEditorStore.getState().history.past.length;
    fireEvent.keyDown(window, { key: 'Delete' });

    const state = useVideoEditorStore.getState();
    expect(state.clips).toEqual([]);
    expect(state.audioTracks).toEqual([]);
    expect(state.keyframes).toEqual([]);
    expect(state.history.past).toHaveLength(historyLengthBeforeDelete + 1);
  });

  it('deletes a selected keyframe when no media element is selected', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addKeyframe({
      id: 'clip-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 2500,
      propertyPath: 'transforms.opacity',
      easing: 'linear',
      properties: { opacity: 0.5 },
    });
    store.selectKeyframe('clip-keyframe');

    render(<ShortcutHarness />);

    fireEvent.keyDown(window, { key: 'Delete' });

    const state = useVideoEditorStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.keyframes).toEqual([]);
    expect(state.selectedKeyframeIds).toEqual([]);
  });

  it('nudges selected keyframes with ArrowLeft and ArrowRight when no media element is selected', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addKeyframe({
      id: 'clip-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 2500,
      propertyPath: 'transforms.opacity',
      easing: 'linear',
      properties: { opacity: 0.5 },
    });
    store.selectKeyframe('clip-keyframe');

    render(<ShortcutHarness />);

    const historyLengthBeforeNudge = useVideoEditorStore.getState().history.past.length;
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    let state = useVideoEditorStore.getState();
    expect(state.keyframes.find((keyframe) => keyframe.id === 'clip-keyframe')?.time).toBe(2600);
    expect(state.selectedKeyframeIds).toEqual(['clip-keyframe']);
    expect(state.history.past).toHaveLength(historyLengthBeforeNudge + 1);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    state = useVideoEditorStore.getState();
    expect(state.keyframes.find((keyframe) => keyframe.id === 'clip-keyframe')?.time).toBe(2500);
    expect(state.selectedKeyframeIds).toEqual(['clip-keyframe']);
  });

  it('selects all editor media with Cmd/Ctrl+A and clears selection with Escape', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({ id: 'clip-1' }));
    store.addClip(createClip({ id: 'clip-2', trackIndex: 1, layer: 1 }));
    store.addAudioTrack(createAudioTrack({ id: 'audio-1' }));
    store.addKeyframe({
      id: 'clip-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 2500,
      propertyPath: 'transforms.opacity',
      easing: 'linear',
      properties: { opacity: 0.5 },
    });

    render(<ShortcutHarness />);

    fireEvent.keyDown(window, { key: 'a', metaKey: true, ctrlKey: true });

    let state = useVideoEditorStore.getState();
    expect(state.selectedClipIds.sort()).toEqual(['clip-1', 'clip-2']);
    expect(state.selectedAudioTrackIds).toEqual(['audio-1']);
    expect(state.selectedKeyframeIds).toEqual(['clip-keyframe']);

    fireEvent.keyDown(window, { key: 'Escape' });

    state = useVideoEditorStore.getState();
    expect(state.selectedClipIds).toEqual([]);
    expect(state.selectedAudioTrackIds).toEqual([]);
    expect(state.selectedKeyframeIds).toEqual([]);
  });
});
