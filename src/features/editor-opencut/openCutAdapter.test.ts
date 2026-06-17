import { describe, expect, it } from 'vitest';

import type { AudioTrack, Clip, CompositionSettings, EditorBookmark, Keyframe } from '@/store/videoEditorStore';
import { buildOpenCutProjectSnapshot } from './openCutAdapter';

const composition: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  duration: 0,
  backgroundColor: '#000000',
};

const baseClip: Clip = {
  id: 'clip-1',
  type: 'video',
  name: 'Shot',
  url: '/shot.mp4',
  startTime: 1000,
  duration: 4000,
  endTime: 5000,
  trackIndex: 0,
  layer: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
  effects: [{ id: 'blur', name: 'blur', type: 'filter', params: { amount: 4 } }],
  masks: [{ id: 'mask-1', type: 'rectangle', inverted: false, feather: 0, opacity: 1 }],
  playbackRate: 1.5,
};

const baseAudio: AudioTrack = {
  id: 'audio-1',
  type: 'audio',
  name: 'Stem',
  url: '/stem.wav',
  startTime: 0,
  duration: 5000,
  endTime: 5000,
  volume: 0.8,
  isMuted: false,
  trackIndex: 0,
  playbackRate: 0.75,
};

const keyframe: Keyframe = {
  id: 'keyframe-1',
  targetId: 'clip-1',
  targetType: 'clip',
  time: 2500,
  propertyPath: 'transforms.opacity',
  properties: { opacity: 0.5 },
  easing: 'ease-in-out',
};

const bookmark: EditorBookmark = {
  id: 'bookmark-1',
  name: 'Hook',
  time: 2500,
  color: '#f97316',
};

describe('buildOpenCutProjectSnapshot', () => {
  it('maps WZRD clips and audio tracks into OpenCut tracks and elements', () => {
    const snapshot = buildOpenCutProjectSnapshot({
      projectId: 'project-1',
      projectName: 'Demo',
      clips: [baseClip],
      audioTracks: [baseAudio],
      keyframes: [keyframe],
      bookmarks: [bookmark],
      trackControls: {
        'visual-0': { id: 'visual-0', locked: true, visible: false, muted: false },
        'audio-0': { id: 'audio-0', locked: false, visible: true, muted: true },
      },
      composition,
      selectedClipIds: ['clip-1'],
      selectedAudioTrackIds: [],
      selectedKeyframeIds: ['keyframe-1'],
    });

    expect(snapshot.tracks).toHaveLength(2);
    expect(snapshot.tracks[0].id).toBe('visual-0');
    expect(snapshot.tracks[0]).toMatchObject({ locked: true, visible: false });
    expect(snapshot.tracks[0].elements[0]).toMatchObject({
      id: 'clip-1',
      type: 'video',
      startMs: 1000,
      durationMs: 4000,
      endMs: 5000,
      playbackRate: 1.5,
    });
    expect(snapshot.tracks[0].elements[0].effects).toHaveLength(1);
    expect(snapshot.tracks[0].elements[0].masks).toHaveLength(1);
    expect(snapshot.tracks[0].elements[0].keyframes).toHaveLength(1);
    expect(snapshot.tracks[1].id).toBe('audio-0');
    expect(snapshot.tracks[1]).toMatchObject({ locked: false, visible: true, muted: true });
    expect(snapshot.tracks[1].elements[0]).toMatchObject({ playbackRate: 0.75 });
    expect(snapshot.durationMs).toBe(5000);
    expect(snapshot.bookmarks).toEqual([bookmark]);
    expect(snapshot.scenes).toEqual([
      expect.objectContaining({ id: 'scene-1', name: 'Demo', startMs: 0, endMs: 2500 }),
      expect.objectContaining({ id: 'scene-bookmark-1', name: 'Hook', startMs: 2500, endMs: 5000 }),
    ]);
    expect(snapshot.selectedElementIds).toEqual(['clip-1']);
    expect(snapshot.selectedKeyframeIds).toEqual(['keyframe-1']);
  });

  it('maps audio source trim into OpenCut audio elements', () => {
    const trimmedAudio = {
      ...baseAudio,
      trimStart: 750,
      trimEnd: 4250,
    } as AudioTrack & { trimStart: number; trimEnd: number };

    const snapshot = buildOpenCutProjectSnapshot({
      projectId: 'project-1',
      projectName: 'Demo',
      clips: [],
      audioTracks: [trimmedAudio],
      keyframes: [],
      bookmarks: [],
      composition,
      selectedClipIds: [],
      selectedAudioTrackIds: ['audio-1'],
    });

    expect(snapshot.tracks[0].elements[0]).toMatchObject({
      id: 'audio-1',
      trimStartMs: 750,
      trimEndMs: 4250,
    });
  });

  it('preserves WZRD graphic element metadata on OpenCut graphic elements', () => {
    const elementClip: Clip = {
      ...baseClip,
      id: 'element-1',
      type: 'element',
      name: 'Rectangle',
      url: '',
      element: {
        elementType: 'shape',
        shape: 'rectangle',
        color: '#FF6B4A',
      },
    };

    const snapshot = buildOpenCutProjectSnapshot({
      projectId: 'project-1',
      projectName: 'Demo',
      clips: [elementClip],
      audioTracks: [],
      keyframes: [],
      bookmarks: [],
      composition,
      selectedClipIds: ['element-1'],
      selectedAudioTrackIds: [],
    });

    expect(snapshot.tracks[0].elements[0]).toMatchObject({
      id: 'element-1',
      type: 'graphic',
      graphicElement: {
        elementType: 'shape',
        shape: 'rectangle',
        color: '#FF6B4A',
      },
    });
  });
});
