import { describe, expect, it } from 'vitest';

import type { AudioTrack, Clip } from '@/store/videoEditorStore';
import { resolveTimelineSelectionBox } from './selectionBox';

const createClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Shot',
  url: '/shot.mp4',
  startTime: 1000,
  duration: 1000,
  endTime: 2000,
  trackIndex: 0,
  layer: 0,
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
  startTime: 2500,
  duration: 1000,
  endTime: 3500,
  volume: 1,
  isMuted: false,
  trackIndex: 0,
  ...overrides,
});

describe('resolveTimelineSelectionBox', () => {
  it('selects visual and audio elements intersecting a marquee rectangle', () => {
    const result = resolveTimelineSelectionBox({
      clips: [
        createClip({ id: 'clip-1', startTime: 1000, duration: 1000, endTime: 2000, trackIndex: 0 }),
        createClip({ id: 'clip-2', startTime: 4000, duration: 1000, endTime: 5000, trackIndex: 0 }),
      ],
      audioTracks: [createAudioTrack({ id: 'audio-1', startTime: 2500, duration: 1000, endTime: 3500 })],
      zoom: 100,
      rectangle: {
        left: 90,
        top: 36,
        right: 360,
        bottom: 208,
      },
    });

    expect(result).toEqual({
      clipIds: ['clip-1'],
      audioTrackIds: ['audio-1'],
    });
  });

  it('normalizes reverse drag rectangles and ignores hidden tracks', () => {
    const result = resolveTimelineSelectionBox({
      clips: [createClip({ id: 'clip-hidden', startTime: 1000, duration: 1000, endTime: 2000, trackIndex: 0 })],
      audioTracks: [createAudioTrack({ id: 'audio-hidden', startTime: 1000, duration: 1000, endTime: 2000 })],
      zoom: 100,
      hiddenTrackIds: new Set(['visual-0']),
      rectangle: {
        left: 220,
        top: 210,
        right: 80,
        bottom: 40,
      },
    });

    expect(result).toEqual({
      clipIds: [],
      audioTrackIds: ['audio-hidden'],
    });
  });

  it('uses sparse audio track indices when applying hidden track controls', () => {
    const result = resolveTimelineSelectionBox({
      clips: [],
      audioTracks: [createAudioTrack({ id: 'audio-sparse', trackIndex: 3, startTime: 1000, duration: 1000, endTime: 2000 })],
      zoom: 100,
      hiddenTrackIds: new Set(['audio-3']),
      rectangle: {
        left: 90,
        top: 40,
        right: 220,
        bottom: 120,
      },
    });

    expect(result).toEqual({
      clipIds: [],
      audioTrackIds: [],
    });
  });
});
