import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioTrack, Clip } from '@/store/videoEditorStore';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import {
  addKeyframeAtPlayhead,
  applyEffectToSelection,
  copyOpenCutSelection,
  clearOpenCutSelection,
  deleteSelection,
  duplicateSelection,
  moveSelectedKeyframes,
  moveSelection,
  pasteOpenCutClipboard,
  retimeSelection,
  selectAllOpenCutElements,
  separateSelectedSourceAudio,
  splitSelectedAtPlayhead,
  toggleBookmarkAtPlayhead,
  toggleMaskOnSelection,
  trimSelectionEdges,
} from './openCutCommands';

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
  trimStart: 0,
  trimEnd: 4000,
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
  startTime: 0,
  duration: 3000,
  endTime: 3000,
  volume: 0.8,
  isMuted: false,
  trackIndex: 0,
  ...overrides,
});

describe('OpenCut editor commands', () => {
  beforeEach(() => {
    useVideoEditorStore.getState().reset();
    useVideoEditorStore.getState().setTimelineZoom(50);
    useVideoEditorStore.getState().setCurrentTime(2500);
  });

  it('trims selected clip edges without losing source trim metadata', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.selectClip('clip-1');

    const count = trimSelectionEdges({ startDeltaMs: 500, endDeltaMs: -250 });

    const clip = useVideoEditorStore.getState().clips[0];
    expect(count).toBe(1);
    expect(clip.startTime).toBe(1500);
    expect(clip.endTime).toBe(4750);
    expect(clip.duration).toBe(3250);
    expect(clip.trimStart).toBe(500);
    expect(clip.trimEnd).toBe(3750);
  });

  it('retimes selected visual and audio elements and records playback rate', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addAudioTrack(createAudioTrack());
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);

    const historyLengthBeforeRetime = useVideoEditorStore.getState().history.past.length;

    const count = retimeSelection(2);

    let state = useVideoEditorStore.getState();
    expect(count).toBe(2);
    expect(state.history.past).toHaveLength(historyLengthBeforeRetime + 1);
    expect(state.clips[0].duration).toBe(2000);
    expect(state.clips[0].endTime).toBe(3000);
    expect(state.clips[0].playbackRate).toBe(2);
    expect(state.audioTracks[0].duration).toBe(1500);
    expect(state.audioTracks[0].endTime).toBe(1500);
    expect(state.audioTracks[0].playbackRate).toBe(2);

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.clips[0]).toMatchObject({ startTime: 1000, duration: 4000, endTime: 5000 });
    expect(state.clips[0].playbackRate).toBeUndefined();
    expect(state.audioTracks[0]).toMatchObject({ startTime: 0, duration: 3000, endTime: 3000 });
    expect(state.audioTracks[0].playbackRate).toBeUndefined();
    expect(state.selectedClipIds).toEqual(['clip-1']);
    expect(state.selectedAudioTrackIds).toEqual(['audio-1']);
  });

  it('trims selected visual and audio elements as one undoable command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({ trimStart: 100, trimEnd: 4100 }));
    store.addAudioTrack(createAudioTrack({ startTime: 1000, duration: 4000, endTime: 5000, trimStart: 200, trimEnd: 4200 }));
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);

    const historyLengthBeforeTrim = useVideoEditorStore.getState().history.past.length;

    expect(trimSelectionEdges({ startDeltaMs: 500, endDeltaMs: -250 })).toBe(2);

    let state = useVideoEditorStore.getState();
    expect(state.history.past).toHaveLength(historyLengthBeforeTrim + 1);
    expect(state.clips[0]).toMatchObject({
      startTime: 1500,
      duration: 3250,
      endTime: 4750,
      trimStart: 600,
      trimEnd: 3850,
    });
    expect(state.audioTracks[0]).toMatchObject({
      startTime: 1500,
      duration: 3250,
      endTime: 4750,
      trimStart: 700,
      trimEnd: 3950,
    });

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.clips[0]).toMatchObject({
      startTime: 1000,
      duration: 4000,
      endTime: 5000,
      trimStart: 100,
      trimEnd: 4100,
    });
    expect(state.audioTracks[0]).toMatchObject({ startTime: 1000, duration: 4000, endTime: 5000, trimStart: 200, trimEnd: 4200 });
    expect(state.selectedClipIds).toEqual(['clip-1']);
    expect(state.selectedAudioTrackIds).toEqual(['audio-1']);
  });

  it('moves selected visual and audio elements as one command and carries keyframes with the media', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addAudioTrack(createAudioTrack({ startTime: 500, duration: 3000, endTime: 3500 }));
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);
    addKeyframeAtPlayhead();

    const count = moveSelection({ deltaMs: -750, trackDelta: 1 });

    let state = useVideoEditorStore.getState();
    expect(count).toBe(2);
    expect(state.clips[0]).toMatchObject({
      startTime: 500,
      endTime: 4500,
      trackIndex: 1,
      layer: 1,
    });
    expect(state.audioTracks[0]).toMatchObject({
      startTime: 0,
      endTime: 3000,
      trackIndex: 1,
    });
    expect(state.keyframes[0].time).toBe(2000);

    state.undo();
    state = useVideoEditorStore.getState();
    expect(state.clips[0]).toMatchObject({ startTime: 1000, endTime: 5000, trackIndex: 0, layer: 0 });
    expect(state.audioTracks[0]).toMatchObject({ startTime: 500, endTime: 3500, trackIndex: 0 });
    expect(state.keyframes[0].time).toBe(2500);
  });

  it('does not move selected media or keyframes on locked tracks', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addAudioTrack(createAudioTrack({ startTime: 500, duration: 3000, endTime: 3500 }));
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);
    addKeyframeAtPlayhead();
    store.setTrackControl('visual-0', { locked: true });

    expect(moveSelection({ deltaMs: 500, trackDelta: 1 })).toBe(1);

    const state = useVideoEditorStore.getState();
    expect(state.clips[0]).toMatchObject({
      startTime: 1000,
      endTime: 5000,
      trackIndex: 0,
      layer: 0,
    });
    expect(state.audioTracks[0]).toMatchObject({
      startTime: 1000,
      endTime: 4000,
      trackIndex: 1,
    });
    expect(state.keyframes.find((keyframe) => keyframe.targetId === 'clip-1')?.time).toBe(2500);
    expect(state.keyframes.find((keyframe) => keyframe.targetId === 'audio-1')?.time).toBe(3000);
  });

  it('snaps command moves to neighbouring media edges when snapping is enabled', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({
      id: 'clip-1',
      startTime: 1000,
      duration: 1000,
      endTime: 2000,
    }));
    store.addClip(createClip({
      id: 'clip-2',
      startTime: 1500,
      duration: 1000,
      endTime: 2500,
      trackIndex: 1,
      layer: 1,
    }));
    store.addAudioTrack(createAudioTrack({
      id: 'audio-1',
      startTime: 3000,
      duration: 1000,
      endTime: 4000,
    }));
    store.addKeyframe({
      id: 'clip-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 1250,
      propertyPath: 'transforms',
      easing: 'linear',
      properties: {},
    });
    store.selectClip('clip-1');

    expect(moveSelection({ deltaMs: 430, snapToGrid: true })).toBe(1);

    const state = useVideoEditorStore.getState();
    expect(state.clips.find((clip) => clip.id === 'clip-1')).toMatchObject({
      startTime: 1500,
      endTime: 2500,
    });
    expect(state.keyframes.find((keyframe) => keyframe.id === 'clip-keyframe')?.time).toBe(1750);
  });

  it('adds visual transform and audio volume keyframes as one undoable command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addAudioTrack(createAudioTrack({ volume: 0.6, isMuted: true }));
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);

    const historyLengthBeforeKeyframe = useVideoEditorStore.getState().history.past.length;

    expect(addKeyframeAtPlayhead()).toBe(2);

    let state = useVideoEditorStore.getState();
    const clipKeyframe = state.keyframes.find((keyframe) => keyframe.targetId === 'clip-1');
    const audioKeyframe = state.keyframes.find((keyframe) => keyframe.targetId === 'audio-1');

    expect(state.history.past).toHaveLength(historyLengthBeforeKeyframe + 1);
    expect(clipKeyframe).toMatchObject({
      targetType: 'clip',
      time: 2500,
      propertyPath: 'transforms',
    });
    expect(audioKeyframe).toMatchObject({
      targetType: 'audio',
      time: 2500,
      propertyPath: 'volume',
      properties: { volume: 0.6, isMuted: true },
    });
    expect(state.selectedKeyframeIds).toEqual(expect.arrayContaining([clipKeyframe?.id, audioKeyframe?.id]));

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.keyframes).toEqual([]);
    expect(state.selectedKeyframeIds).toEqual([]);
  });

  it('splits selected visual and audio elements as one undoable command and retargets right-side keyframes', () => {
    const store = useVideoEditorStore.getState();
    store.setCurrentTime(3000);
    store.addClip(createClip({ trimStart: 100, trimEnd: 4100 }));
    store.addAudioTrack(createAudioTrack({ startTime: 1000, duration: 4000, endTime: 5000, trimStart: 200, trimEnd: 4200 }));
    store.addKeyframe({
      id: 'clip-before-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 2000,
      propertyPath: 'transforms',
      easing: 'linear',
      properties: {},
    });
    store.addKeyframe({
      id: 'clip-after-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 3500,
      propertyPath: 'transforms',
      easing: 'linear',
      properties: {},
    });
    store.addKeyframe({
      id: 'audio-after-keyframe',
      targetId: 'audio-1',
      targetType: 'audio',
      time: 3600,
      propertyPath: 'volume',
      easing: 'linear',
      properties: { volume: 0.25 },
    });
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);

    const historyLengthBeforeSplit = useVideoEditorStore.getState().history.past.length;

    expect(splitSelectedAtPlayhead()).toBe(2);

    let state = useVideoEditorStore.getState();
    const rightClip = state.clips.find((clip) => clip.id !== 'clip-1');
    const rightAudioTrack = state.audioTracks.find((track) => track.id !== 'audio-1');

    expect(state.history.past).toHaveLength(historyLengthBeforeSplit + 1);
    expect(state.clips).toHaveLength(2);
    expect(state.audioTracks).toHaveLength(2);
    expect(state.clips.find((clip) => clip.id === 'clip-1')).toMatchObject({
      startTime: 1000,
      duration: 2000,
      endTime: 3000,
      trimStart: 100,
      trimEnd: 2100,
    });
    expect(rightClip).toMatchObject({
      name: 'Shot split',
      startTime: 3000,
      duration: 2000,
      endTime: 5000,
      trimStart: 2100,
      trimEnd: 4100,
    });
    expect(rightAudioTrack).toMatchObject({
      name: 'Stem split',
      startTime: 3000,
      duration: 2000,
      endTime: 5000,
      trimStart: 2200,
      trimEnd: 4200,
    });
    expect(state.audioTracks.find((track) => track.id === 'audio-1')).toMatchObject({
      trimStart: 200,
      trimEnd: 2200,
    });
    expect(state.keyframes.find((keyframe) => keyframe.id === 'clip-before-keyframe')?.targetId).toBe('clip-1');
    expect(state.keyframes.find((keyframe) => keyframe.id === 'clip-after-keyframe')?.targetId).toBe(rightClip?.id);
    expect(state.keyframes.find((keyframe) => keyframe.id === 'audio-after-keyframe')?.targetId).toBe(rightAudioTrack?.id);

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.audioTracks).toHaveLength(1);
    expect(state.clips[0]).toMatchObject({ id: 'clip-1', startTime: 1000, duration: 4000, endTime: 5000 });
    expect(state.audioTracks[0]).toMatchObject({ id: 'audio-1', startTime: 1000, duration: 4000, endTime: 5000, trimStart: 200, trimEnd: 4200 });
    expect(state.keyframes.find((keyframe) => keyframe.id === 'clip-after-keyframe')?.targetId).toBe('clip-1');
    expect(state.keyframes.find((keyframe) => keyframe.id === 'audio-after-keyframe')?.targetId).toBe('audio-1');
  });

  it('duplicates selected visual and audio elements with targeted keyframes as one undoable command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addAudioTrack(createAudioTrack({ startTime: 1000, duration: 4000, endTime: 5000 }));
    store.addKeyframe({
      id: 'clip-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 2500,
      propertyPath: 'transforms',
      easing: 'linear',
      properties: {},
    });
    store.addKeyframe({
      id: 'audio-keyframe',
      targetId: 'audio-1',
      targetType: 'audio',
      time: 3000,
      propertyPath: 'volume',
      easing: 'linear',
      properties: { volume: 0.5 },
    });
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);

    const historyLengthBeforeDuplicate = useVideoEditorStore.getState().history.past.length;

    expect(duplicateSelection(500)).toBe(2);

    let state = useVideoEditorStore.getState();
    const duplicateClip = state.clips.find((clip) => clip.id !== 'clip-1');
    const duplicateAudioTrack = state.audioTracks.find((track) => track.id !== 'audio-1');

    expect(state.history.past).toHaveLength(historyLengthBeforeDuplicate + 1);
    expect(duplicateClip).toMatchObject({ name: 'Shot copy', startTime: 1500, endTime: 5500 });
    expect(duplicateAudioTrack).toMatchObject({ name: 'Stem copy', startTime: 1500, endTime: 5500 });
    expect(state.keyframes).toHaveLength(4);
    expect(
      state.keyframes.find(
        (keyframe) => keyframe.targetId === duplicateClip?.id && keyframe.propertyPath === 'transforms'
      )
    ).toMatchObject({ time: 3000 });
    expect(
      state.keyframes.find(
        (keyframe) => keyframe.targetId === duplicateAudioTrack?.id && keyframe.propertyPath === 'volume'
      )
    ).toMatchObject({ time: 3500 });

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.audioTracks).toHaveLength(1);
    expect(state.keyframes.map((keyframe) => keyframe.id).sort()).toEqual(['audio-keyframe', 'clip-keyframe']);
  });

  it('separates selected video source audio as one undoable command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({
      id: 'video-1',
      mediaItemId: 'media-1',
      name: 'A roll',
      url: '/a-roll.mp4',
      startTime: 1000,
      duration: 2500,
      endTime: 3500,
      trimStart: 750,
      trimEnd: 3250,
      playbackRate: 1.25,
    }));
    store.addClip(createClip({
      id: 'video-2',
      name: 'B roll',
      url: '/b-roll.mp4',
      startTime: 4000,
      duration: 1500,
      endTime: 5500,
      trackIndex: 1,
      layer: 1,
    }));
    store.selectClip('video-1');
    store.selectClip('video-2', true);

    const historyLengthBeforeSeparation = useVideoEditorStore.getState().history.past.length;

    expect(separateSelectedSourceAudio()).toBe(2);

    let state = useVideoEditorStore.getState();
    expect(state.history.past).toHaveLength(historyLengthBeforeSeparation + 1);
    expect(state.audioTracks).toHaveLength(2);
    expect(state.audioTracks[0]).toMatchObject({
      mediaItemId: 'media-1',
      sourceId: 'video-1',
      name: 'A roll source audio',
      url: '/a-roll.mp4',
      startTime: 1000,
      duration: 2500,
      endTime: 3500,
      trimStart: 750,
      trimEnd: 3250,
      playbackRate: 1.25,
      trackIndex: 0,
    });
    expect(state.audioTracks[1]).toMatchObject({
      sourceId: 'video-2',
      name: 'B roll source audio',
      url: '/b-roll.mp4',
      startTime: 4000,
      duration: 1500,
      endTime: 5500,
      trackIndex: 1,
    });
    expect(state.selectedAudioTrackIds).toEqual(state.audioTracks.map((track) => track.id));
    expect(state.selectedClipIds).toEqual([]);

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.audioTracks).toEqual([]);
    expect(state.selectedAudioTrackIds).toEqual([]);
    expect(state.selectedClipIds).toEqual(['video-1', 'video-2']);
  });

  it('does not duplicate source audio tracks that were already separated', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({
      id: 'video-1',
      mediaItemId: 'media-1',
      name: 'A roll',
      url: '/a-roll.mp4',
      startTime: 1000,
      duration: 2500,
      endTime: 3500,
      trimStart: 750,
      trimEnd: 3250,
    }));
    store.selectClip('video-1');

    expect(separateSelectedSourceAudio()).toBe(1);

    store.selectClip('video-1');
    const historyLengthBeforeSecondSeparation = useVideoEditorStore.getState().history.past.length;

    expect(separateSelectedSourceAudio()).toBe(0);

    const state = useVideoEditorStore.getState();
    expect(state.history.past).toHaveLength(historyLengthBeforeSecondSeparation);
    expect(state.audioTracks).toHaveLength(1);
    expect(state.audioTracks[0]).toMatchObject({
      sourceId: 'video-1',
      name: 'A roll source audio',
      url: '/a-roll.mp4',
    });
    expect(state.selectedClipIds).toEqual(['video-1']);
  });

  it('adds effects and masks to selected clips and undo restores editor metadata', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.selectClip('clip-1');

    expect(applyEffectToSelection('blur', { amount: 8 })).toBe(1);
    expect(toggleMaskOnSelection('rectangle')).toBe(1);

    let clip = useVideoEditorStore.getState().clips[0];
    expect(clip.effects?.[0]).toMatchObject({ id: 'blur', params: { amount: 8 } });
    expect(clip.masks?.[0]).toMatchObject({ type: 'rectangle', inverted: false });

    useVideoEditorStore.getState().undo();
    clip = useVideoEditorStore.getState().clips[0];
    expect(clip.effects).toEqual([{ id: 'blur', name: 'blur', type: 'filter', params: { amount: 8 } }]);
    expect(clip.masks).toBeUndefined();

    useVideoEditorStore.getState().undo();
    clip = useVideoEditorStore.getState().clips[0];
    expect(clip.effects).toBeUndefined();
  });

  it('applies effects to multiple selected clips as one undoable command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({ id: 'clip-1', name: 'A' }));
    store.addClip(createClip({ id: 'clip-2', name: 'B', startTime: 5200, endTime: 9200 }));
    store.selectClip('clip-1');
    store.selectClip('clip-2', true);

    const historyLengthBeforeEffect = useVideoEditorStore.getState().history.past.length;

    expect(applyEffectToSelection('contrast', { value: 112 })).toBe(2);

    let state = useVideoEditorStore.getState();
    expect(state.history.past).toHaveLength(historyLengthBeforeEffect + 1);
    expect(state.clips.map((clip) => clip.effects?.[0])).toEqual([
      expect.objectContaining({ id: 'contrast', params: { value: 112 } }),
      expect.objectContaining({ id: 'contrast', params: { value: 112 } }),
    ]);

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.clips.map((clip) => clip.effects)).toEqual([undefined, undefined]);
    expect(state.selectedClipIds).toEqual(['clip-1', 'clip-2']);
  });

  it('toggles masks on multiple selected clips as one undoable command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({ id: 'clip-1', name: 'A' }));
    store.addClip(createClip({ id: 'clip-2', name: 'B', startTime: 5200, endTime: 9200 }));
    store.selectClip('clip-1');
    store.selectClip('clip-2', true);

    const historyLengthBeforeMask = useVideoEditorStore.getState().history.past.length;

    expect(toggleMaskOnSelection('ellipse')).toBe(2);

    let state = useVideoEditorStore.getState();
    expect(state.history.past).toHaveLength(historyLengthBeforeMask + 1);
    expect(state.clips.map((clip) => clip.masks?.[0])).toEqual([
      expect.objectContaining({ type: 'ellipse', inverted: false }),
      expect.objectContaining({ type: 'ellipse', inverted: false }),
    ]);

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.clips.map((clip) => clip.masks)).toEqual([undefined, undefined]);
    expect(state.selectedClipIds).toEqual(['clip-1', 'clip-2']);
  });

  it('toggles a playhead bookmark and exposes it as scene metadata', () => {
    useVideoEditorStore.getState().setCurrentTime(2500);

    const added = toggleBookmarkAtPlayhead('Hook');
    expect(added).toBe(1);
    expect(useVideoEditorStore.getState().bookmarks[0]).toMatchObject({
      name: 'Hook',
      time: 2500,
    });

    const removed = toggleBookmarkAtPlayhead('Hook');
    expect(removed).toBe(1);
    expect(useVideoEditorStore.getState().bookmarks).toEqual([]);
  });

  it('copies and pastes selected clips, audio tracks, and keyframes together', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addAudioTrack(createAudioTrack());
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);
    addKeyframeAtPlayhead();

    expect(copyOpenCutSelection()).toBe(4);

    const historyLengthBeforePaste = useVideoEditorStore.getState().history.past.length;

    expect(pasteOpenCutClipboard(1000)).toBe(4);

    let state = useVideoEditorStore.getState();
    const duplicatedClip = state.clips.find((clip) => clip.id !== 'clip-1');
    const duplicatedAudioTrack = state.audioTracks.find((track) => track.id !== 'audio-1');
    expect(state.clips).toHaveLength(2);
    expect(state.audioTracks).toHaveLength(2);
    expect(state.keyframes).toHaveLength(4);
    expect(state.history.past).toHaveLength(historyLengthBeforePaste + 1);
    expect(state.clips[1]).toMatchObject({ name: 'Shot copy', startTime: 2000, endTime: 6000 });
    expect(state.audioTracks[1]).toMatchObject({ name: 'Stem copy', startTime: 1000, endTime: 4000 });
    expect(
      state.keyframes.find((keyframe) => keyframe.targetId === duplicatedClip?.id && keyframe.propertyPath === 'transforms')
    ).toMatchObject({ time: 3500 });
    expect(
      state.keyframes.find((keyframe) => keyframe.targetId === duplicatedAudioTrack?.id && keyframe.propertyPath === 'volume')
    ).toMatchObject({ time: 3500 });

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.audioTracks).toHaveLength(1);
    expect(state.keyframes).toHaveLength(2);
    expect(state.keyframes.map((keyframe) => keyframe.targetId).sort()).toEqual(['audio-1', 'clip-1']);
  });

  it('copies and pastes selected keyframes onto their existing media targets', () => {
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

    expect(copyOpenCutSelection()).toBe(1);
    expect(pasteOpenCutClipboard(500)).toBe(1);

    let state = useVideoEditorStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.keyframes).toHaveLength(2);
    expect(state.selectedKeyframeIds).toHaveLength(1);

    const pasted = state.keyframes.find((keyframe) => keyframe.id !== 'clip-keyframe');
    expect(pasted).toMatchObject({
      targetId: 'clip-1',
      targetType: 'clip',
      time: 3000,
      propertyPath: 'transforms.opacity',
      properties: { opacity: 0.5 },
    });

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.keyframes.map((keyframe) => keyframe.id)).toEqual(['clip-keyframe']);
    expect(state.selectedKeyframeIds).toEqual(['clip-keyframe']);
  });

  it('selects all visible unlocked media and their keyframes as one OpenCut selection command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({ id: 'clip-visible', trackIndex: 0, layer: 0 }));
    store.addClip(createClip({ id: 'clip-hidden', trackIndex: 1, layer: 1 }));
    store.addAudioTrack(createAudioTrack({ id: 'audio-visible', trackIndex: 0 }));
    store.addAudioTrack(createAudioTrack({ id: 'audio-locked', trackIndex: 2 }));
    store.addKeyframe({
      id: 'clip-visible-keyframe',
      targetId: 'clip-visible',
      targetType: 'clip',
      time: 2000,
      propertyPath: 'transforms',
      easing: 'linear',
      properties: {},
    });
    store.addKeyframe({
      id: 'clip-hidden-keyframe',
      targetId: 'clip-hidden',
      targetType: 'clip',
      time: 2000,
      propertyPath: 'transforms',
      easing: 'linear',
      properties: {},
    });
    store.addKeyframe({
      id: 'audio-visible-keyframe',
      targetId: 'audio-visible',
      targetType: 'audio',
      time: 2000,
      propertyPath: 'volume',
      easing: 'linear',
      properties: { volume: 0.8 },
    });
    store.setTrackControl('visual-1', { visible: false });
    store.setTrackControl('audio-2', { locked: true });

    expect(selectAllOpenCutElements()).toBe(4);

    const state = useVideoEditorStore.getState();
    expect(state.selectedClipIds).toEqual(['clip-visible']);
    expect(state.selectedAudioTrackIds).toEqual(['audio-visible']);
    expect(state.selectedKeyframeIds.sort()).toEqual(['audio-visible-keyframe', 'clip-visible-keyframe']);
  });

  it('clears selected media and keyframes through one OpenCut selection command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addAudioTrack(createAudioTrack());
    store.addKeyframe({
      id: 'clip-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 2500,
      propertyPath: 'transforms.opacity',
      easing: 'linear',
      properties: { opacity: 0.5 },
    });
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);
    store.selectKeyframe('clip-keyframe', true);

    expect(clearOpenCutSelection()).toBe(3);

    const state = useVideoEditorStore.getState();
    expect(state.selectedClipIds).toEqual([]);
    expect(state.selectedAudioTrackIds).toEqual([]);
    expect(state.selectedKeyframeIds).toEqual([]);
  });

  it('moves selected keyframes as a bounded undoable command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({ startTime: 1000, duration: 4000, endTime: 5000 }));
    store.addAudioTrack(createAudioTrack({ id: 'audio-1', startTime: 0, duration: 3000, endTime: 3000 }));
    store.addKeyframe({
      id: 'clip-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 2500,
      propertyPath: 'transforms.opacity',
      easing: 'linear',
      properties: { opacity: 0.5 },
    });
    store.addKeyframe({
      id: 'audio-keyframe',
      targetId: 'audio-1',
      targetType: 'audio',
      time: 2000,
      propertyPath: 'volume',
      easing: 'linear',
      properties: { volume: 0.4 },
    });
    store.selectKeyframe('clip-keyframe');
    store.selectKeyframe('audio-keyframe', true);

    const historyLengthBeforeMove = useVideoEditorStore.getState().history.past.length;

    expect(moveSelectedKeyframes({ deltaMs: 2000 })).toBe(2);

    let state = useVideoEditorStore.getState();
    expect(state.history.past).toHaveLength(historyLengthBeforeMove + 1);
    expect(state.keyframes.find((keyframe) => keyframe.id === 'clip-keyframe')?.time).toBe(3500);
    expect(state.keyframes.find((keyframe) => keyframe.id === 'audio-keyframe')?.time).toBe(3000);
    expect(state.playback.currentTime).toBe(3500);

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.keyframes.find((keyframe) => keyframe.id === 'clip-keyframe')?.time).toBe(2500);
    expect(state.keyframes.find((keyframe) => keyframe.id === 'audio-keyframe')?.time).toBe(2000);
    expect(state.selectedKeyframeIds.sort()).toEqual(['audio-keyframe', 'clip-keyframe']);
  });

  it('deletes selected clips, audio tracks, and their keyframes as one undoable command', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.addAudioTrack(createAudioTrack());
    store.addKeyframe({
      id: 'clip-keyframe',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 2500,
      propertyPath: 'transforms',
      easing: 'linear',
      properties: {},
    });
    store.addKeyframe({
      id: 'audio-keyframe',
      targetId: 'audio-1',
      targetType: 'audio',
      time: 1000,
      propertyPath: 'volume',
      easing: 'linear',
      properties: { volume: 0.5 },
    });
    store.selectClip('clip-1');
    store.selectAudioTrack('audio-1', true);

    expect(deleteSelection()).toBe(2);

    let state = useVideoEditorStore.getState();
    expect(state.clips).toEqual([]);
    expect(state.audioTracks).toEqual([]);
    expect(state.keyframes).toEqual([]);
    expect(state.selectedClipIds).toEqual([]);
    expect(state.selectedAudioTrackIds).toEqual([]);
    expect(state.selectedKeyframeIds).toEqual([]);

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.audioTracks).toHaveLength(1);
    expect(state.keyframes.map((keyframe) => keyframe.id).sort()).toEqual(['audio-keyframe', 'clip-keyframe']);
  });

  it('deletes a selected keyframe as a first-class command target', () => {
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

    expect(deleteSelection()).toBe(1);

    let state = useVideoEditorStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.keyframes).toEqual([]);
    expect(state.selectedKeyframeIds).toEqual([]);

    state.undo();

    state = useVideoEditorStore.getState();
    expect(state.keyframes).toHaveLength(1);
    expect(state.selectedKeyframeIds).toEqual(['clip-keyframe']);
  });
});
