import { describe, expect, it } from 'vitest';

import type { AudioTrack, Clip, Keyframe } from '@/store/videoEditorStore';
import { evaluateOpenCutAudioAtTime, evaluateOpenCutClipAtTime } from './openCutKeyframes';

const clip: Clip = {
  id: 'clip-1',
  type: 'video',
  name: 'Scene',
  url: '/scene.mp4',
  startTime: 0,
  duration: 4_000,
  endTime: 4_000,
  trackIndex: 0,
  layer: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
};

const audioTrack: AudioTrack = {
  id: 'audio-1',
  type: 'audio',
  name: 'Stem',
  url: '/stem.wav',
  startTime: 0,
  duration: 2_000,
  endTime: 2_000,
  volume: 1,
  isMuted: false,
  trackIndex: 0,
};

describe('OpenCut keyframe evaluation', () => {
  it('interpolates clip transform keyframes at the playhead time', () => {
    const keyframes: Keyframe[] = [
      {
        id: 'kf-start',
        targetId: 'clip-1',
        targetType: 'clip',
        time: 1_000,
        propertyPath: 'transforms',
        easing: 'linear',
        properties: {
          transforms: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
          },
        },
      },
      {
        id: 'kf-end',
        targetId: 'clip-1',
        targetType: 'clip',
        time: 3_000,
        propertyPath: 'transforms',
        easing: 'linear',
        properties: {
          transforms: {
            position: { x: 200, y: -100 },
            scale: { x: 2, y: 0.5 },
            rotation: 90,
            opacity: 0.25,
          },
        },
      },
    ];

    const evaluated = evaluateOpenCutClipAtTime(clip, keyframes, 2_000);

    expect(evaluated.transforms).toEqual({
      position: { x: 100, y: -50 },
      scale: { x: 1.5, y: 0.75 },
      rotation: 45,
      opacity: 0.625,
    });
    expect(clip.transforms.position.x).toBe(0);
  });

  it('interpolates audio volume and steps boolean mute state from keyframes', () => {
    const keyframes: Keyframe[] = [
      {
        id: 'audio-start',
        targetId: 'audio-1',
        targetType: 'audio',
        time: 0,
        propertyPath: 'volume',
        easing: 'linear',
        properties: { volume: 1, isMuted: false },
      },
      {
        id: 'audio-end',
        targetId: 'audio-1',
        targetType: 'audio',
        time: 1_000,
        propertyPath: 'volume',
        easing: 'linear',
        properties: { volume: 0.2, isMuted: true },
      },
    ];

    const middle = evaluateOpenCutAudioAtTime(audioTrack, keyframes, 500);
    const after = evaluateOpenCutAudioAtTime(audioTrack, keyframes, 1_200);

    expect(middle.volume).toBeCloseTo(0.6);
    expect(middle.isMuted).toBe(false);
    expect(after.volume).toBe(0.2);
    expect(after.isMuted).toBe(true);
  });
});
