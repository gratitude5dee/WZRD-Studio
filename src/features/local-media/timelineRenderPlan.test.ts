import { describe, expect, it } from 'vitest';

import { buildLocalTimelineRenderPlan } from './timelineRenderPlan';
import type { AudioTrack, Clip, CompositionSettings, Keyframe } from '@/store/videoEditorStore';

const composition: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  duration: 10_000,
  backgroundColor: '#000000',
};

const videoClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Local clip',
  url: 'file:///Users/me/video.mp4',
  startTime: 1_000,
  duration: 4_000,
  endTime: 5_000,
  layer: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
  ...overrides,
});

const audioTrack = (overrides: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 'audio-1',
  type: 'audio',
  name: 'Local audio',
  url: '/Users/me/audio.m4a',
  startTime: 0,
  duration: 5_000,
  volume: 0.8,
  isMuted: false,
  ...overrides,
});

const keyframe = (overrides: Partial<Keyframe> = {}): Keyframe => ({
  id: 'keyframe-1',
  targetId: 'clip-1',
  targetType: 'clip',
  time: 2_000,
  propertyPath: 'transforms.position',
  properties: { transforms: { position: { x: 120, y: -40 } } },
  ...overrides,
});

describe('buildLocalTimelineRenderPlan', () => {
  it('normalizes local clip and audio URLs into a local render plan', () => {
    const plan = buildLocalTimelineRenderPlan({
      projectId: 'project-1',
      clips: [videoClip()],
      audioTracks: [audioTrack()],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.composition.durationMs).toBe(10_000);
    expect(plan.visualTracks[0]).toMatchObject({
      id: 'clip-1',
      sourcePath: '/Users/me/video.mp4',
      startMs: 1_000,
      durationMs: 4_000,
    });
    expect(plan.audioTracks[0]).toMatchObject({
      sourcePath: '/Users/me/audio.m4a',
      startMs: 0,
      volume: 0.8,
    });
  });

  it('rejects remote media that has not been cached locally', () => {
    expect(() =>
      buildLocalTimelineRenderPlan({
        clips: [videoClip({ url: 'https://cdn.example.com/video.mp4' })],
        audioTracks: [],
        composition,
        outputPath: '/Users/me/Desktop/export.mp4',
        format: 'mp4',
        quality: 'high',
      }),
    ).toThrow(/downloaded or cached locally/i);
  });

  it('preserves video clip rotation for local FFmpeg export', () => {
    const plan = buildLocalTimelineRenderPlan({
      clips: [videoClip({ transforms: { ...videoClip().transforms, rotation: 15 } })],
      audioTracks: [],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.visualTracks[0].transform.rotation).toBe(15);
  });

  it('preserves text and element rotation for local FFmpeg export', () => {
    const plan = buildLocalTimelineRenderPlan({
      clips: [
        videoClip({
          id: 'text-1',
          type: 'text',
          text: 'Title',
          url: '',
          transforms: { ...videoClip().transforms, rotation: 15 },
        }),
        videoClip({
          id: 'element-1',
          type: 'element',
          url: '',
          element: {
            elementType: 'shape',
            shape: 'rectangle',
            color: '#ffffff',
          },
          transforms: { ...videoClip().transforms, rotation: -30 },
        }),
      ],
      audioTracks: [],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.visualTracks.map((track) => track.transform.rotation)).toEqual([15, -30]);
  });

  it('preserves supported editor effects for local FFmpeg export', () => {
    const plan = buildLocalTimelineRenderPlan({
      clips: [
        videoClip({
          effects: [
            { id: 'blur', name: 'Blur', type: 'filter', params: { amount: 4 } },
            { id: 'brightness', name: 'Brightness', type: 'adjustment', params: { value: 125 } },
            { id: 'saturation', name: 'Saturation', type: 'adjustment', params: { value: 80 } },
          ],
        }),
      ],
      audioTracks: [],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.visualTracks[0].effects).toEqual([
      { id: 'blur', name: 'Blur', type: 'filter', params: { amount: 4 } },
      { id: 'brightness', name: 'Brightness', type: 'adjustment', params: { value: 125 } },
      { id: 'saturation', name: 'Saturation', type: 'adjustment', params: { value: 80 } },
    ]);
  });

  it('preserves supported editor masks for local FFmpeg export', () => {
    const plan = buildLocalTimelineRenderPlan({
      clips: [
        videoClip({
          masks: [
            { id: 'mask-1', type: 'rectangle', inverted: false, feather: 8, opacity: 0.75 },
            { id: 'mask-2', type: 'ellipse', inverted: true, feather: 4, opacity: 0.5 },
          ],
        }),
      ],
      audioTracks: [],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.visualTracks[0].masks).toEqual([
      { id: 'mask-1', type: 'rectangle', inverted: false, feather: 8, opacity: 0.75 },
      { id: 'mask-2', type: 'ellipse', inverted: true, feather: 4, opacity: 0.5 },
    ]);
  });

  it('preserves text clips for local FFmpeg export', () => {
    const plan = buildLocalTimelineRenderPlan({
      clips: [
        videoClip({
          id: 'text-1',
          type: 'text',
          name: 'Title',
          url: '',
          text: 'Hello WZRD',
          style: {
            fontSize: 96,
            fontWeight: '700',
            color: '#f97316',
            backgroundColor: '#101010',
            textAlign: 'center',
          },
        }),
      ],
      audioTracks: [],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.visualTracks[0]).toMatchObject({
      id: 'text-1',
      type: 'text',
      name: 'Title',
      text: 'Hello WZRD',
      startMs: 1_000,
      durationMs: 4_000,
      style: {
        fontSize: 96,
        fontWeight: '700',
        color: '#f97316',
        backgroundColor: '#101010',
        textAlign: 'center',
      },
    });
    expect(plan.visualTracks[0]).not.toHaveProperty('sourcePath');
  });

  it('preserves graphic element clips for local FFmpeg export', () => {
    const plan = buildLocalTimelineRenderPlan({
      clips: [
        videoClip({
          id: 'element-1',
          type: 'element',
          name: 'Rectangle',
          url: '',
          element: {
            elementType: 'shape',
            shape: 'rectangle',
            color: '#FF6B4A',
          },
        } as Partial<Clip> & {
          element: {
            elementType: 'shape';
            shape: 'rectangle';
            color: string;
          };
        }),
      ],
      audioTracks: [],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.visualTracks[0]).toMatchObject({
      id: 'element-1',
      type: 'element',
      name: 'Rectangle',
      element: {
        elementType: 'shape',
        shape: 'rectangle',
        color: '#FF6B4A',
      },
    });
    expect(plan.visualTracks[0]).not.toHaveProperty('sourcePath');
  });

  it('preserves retime playback rates for local FFmpeg export', () => {
    const plan = buildLocalTimelineRenderPlan({
      clips: [
        videoClip({
          playbackRate: 2,
          duration: 2_000,
          endTime: 3_000,
        }),
      ],
      audioTracks: [
        audioTrack({
          playbackRate: 0.5,
          duration: 8_000,
          endTime: 8_000,
        }),
      ],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.visualTracks[0]).toMatchObject({
      durationMs: 2_000,
      playbackRate: 2,
    });
    expect(plan.audioTracks[0]).toMatchObject({
      durationMs: 8_000,
      playbackRate: 0.5,
    });
  });

  it('preserves audio source trim for local FFmpeg export', () => {
    const plan = buildLocalTimelineRenderPlan({
      clips: [videoClip()],
      audioTracks: [
        audioTrack({
          trimStart: 750,
          trimEnd: 3_750,
        } as Partial<AudioTrack> & { trimStart: number; trimEnd: number }),
      ],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.audioTracks[0]).toMatchObject({
      trimStartMs: 750,
      trimEndMs: 3_750,
    });
  });

  it('attaches targeted in-range keyframes to local visual and audio render tracks', () => {
    const plan = buildLocalTimelineRenderPlan({
      clips: [videoClip()],
      audioTracks: [audioTrack({ startTime: 1_000, duration: 4_000, endTime: 5_000 })],
      keyframes: [
        keyframe({ id: 'clip-position-a', time: 1_000 }),
        keyframe({ id: 'clip-position-b', time: 5_000 }),
        keyframe({ id: 'audio-volume-a', targetId: 'audio-1', targetType: 'audio', time: 2_000, propertyPath: 'volume', properties: { volume: 0.7 } }),
        keyframe({ id: 'wrong-target', targetId: 'other-clip', time: 2_000 }),
        keyframe({ id: 'out-of-range', time: 7_000 }),
      ],
      composition,
      outputPath: '/Users/me/Desktop/export.mp4',
      format: 'mp4',
      quality: 'high',
    });

    expect(plan.visualTracks[0].keyframes?.map((item) => item.id)).toEqual(['clip-position-a', 'clip-position-b']);
    expect(plan.audioTracks[0].keyframes?.map((item) => item.id)).toEqual(['audio-volume-a']);
  });
});
