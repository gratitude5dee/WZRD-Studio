import { describe, expect, it } from 'vitest';

import type { AudioTrack, Clip } from '@/store/videoEditorStore';
import { buildSnapPoints, snapValue } from './snapping';

const createClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-a',
  type: 'video',
  name: 'Clip',
  url: '/clip.mp4',
  startTime: 0,
  duration: 1000,
  endTime: 1000,
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

const createAudio = (overrides: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 'audio-a',
  type: 'audio',
  name: 'Audio',
  url: '/audio.wav',
  startTime: 0,
  duration: 1000,
  endTime: 1000,
  volume: 1,
  isMuted: false,
  trackIndex: 0,
  ...overrides,
});

describe('timeline snapping helpers', () => {
  it('buildSnapPoints returns sorted unique points while excluding the active item', () => {
    const clipA = createClip({ id: 'a', startTime: 0, duration: 1500, endTime: 1500 });
    const clipB = createClip({ id: 'b', startTime: 2000, duration: 500, endTime: 2500 });
    const audio = createAudio({ id: 'audio', startTime: 1500, duration: 1000, endTime: 2500 });

    const points = buildSnapPoints([clipA, clipB], [audio], 'a');

    expect(points).toEqual([1500, 2000, 2500]);
  });

  it('snapValue snaps to nearest neighbour when within threshold', () => {
    const points = [0, 1000, 2000];
    const snapped = snapValue(950, points, { snapToGrid: true, gridSize: 100 });

    expect(snapped).toBe(1000);
  });

  it('snapValue falls back to grid snapping when points are too far', () => {
    const points = [0, 4000];
    const snapped = snapValue(2100, points, { snapToGrid: true, gridSize: 100 });

    expect(snapped).toBe(2100);
  });
});
