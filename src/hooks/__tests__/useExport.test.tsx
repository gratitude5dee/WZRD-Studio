import { describe, expect, it, vi } from 'vitest';

import { runExportRequest } from '../useExport';
import type { AudioTrack, Clip, CompositionSettings, Keyframe } from '@/store/videoEditorStore';

const composition: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  duration: 5_000,
  backgroundColor: '#000000',
};

const createClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Clip',
  url: 'file:///Users/me/source.mp4',
  startTime: 0,
  duration: 5_000,
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

const createAudioTrack = (overrides: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 'audio-1',
  type: 'audio',
  name: 'Audio',
  url: 'file:///Users/me/audio.m4a',
  startTime: 0,
  duration: 5_000,
  volume: 1,
  isMuted: false,
  ...overrides,
});

const createKeyframe = (overrides: Partial<Keyframe> = {}): Keyframe => ({
  id: 'keyframe-1',
  targetId: 'clip-1',
  targetType: 'clip',
  time: 2_000,
  propertyPath: 'transforms.position',
  properties: { transforms: { position: { x: 120, y: 0 } } },
  ...overrides,
});

const createContext = (overrides = {}) => ({
  projectId: 'project-1',
  clips: [createClip()],
  audioTracks: [] as AudioTrack[],
  composition,
  ...overrides,
});

describe('runExportRequest', () => {
  it('rejects unsupported formats', async () => {
    const invoke = vi.fn();
    const result = await runExportRequest({ invoke }, createContext(), { format: 'mov' as 'mp4', quality: 'high' });

    expect(result.error).toContain('Unsupported export format');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('requires the desktop runtime instead of invoking the remote export function by default', async () => {
    const invoke = vi.fn();
    const result = await runExportRequest({ invoke }, createContext(), { format: 'mp4', quality: 'high' });

    expect(result.error).toMatch(/desktop app/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('routes desktop exports through the local renderTimeline bridge', async () => {
    const invoke = vi.fn();
    const desktop = {
      selectExportFolder: vi.fn(async () => '/Users/me/Desktop'),
      renderTimeline: vi.fn(async ({ outputPath }: { outputPath: string }) => ({ outputPath })),
    };

    const result = await runExportRequest(
      { invoke, desktop, now: () => 123 },
      createContext({ audioTracks: [createAudioTrack()] }),
      { format: 'mp4', quality: 'high' },
    );

    expect(result.error).toBeUndefined();
    expect(result.path).toBe('/Users/me/Desktop/wzrd-project-1-123.mp4');
    expect(result.url).toBe('file:///Users/me/Desktop/wzrd-project-1-123.mp4');
    expect(invoke).not.toHaveBeenCalled();
    expect(desktop.renderTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'editor-export-project-1-123',
        outputPath: '/Users/me/Desktop/wzrd-project-1-123.mp4',
        timeline: expect.objectContaining({
          visualTracks: [expect.objectContaining({ sourcePath: '/Users/me/source.mp4' })],
        }),
      }),
    );
  });

  it('passes editor keyframes into the local FFmpeg render plan', async () => {
    const desktop = {
      selectExportFolder: vi.fn(async () => '/Users/me/Desktop'),
      renderTimeline: vi.fn(async ({ outputPath }: { outputPath: string }) => ({ outputPath })),
    };

    await runExportRequest(
      { desktop, now: () => 123 },
      createContext({
        audioTracks: [createAudioTrack()],
        keyframes: [
          createKeyframe(),
          createKeyframe({ id: 'audio-keyframe', targetId: 'audio-1', targetType: 'audio', propertyPath: 'volume', properties: { volume: 0.35 } }),
        ],
      }),
      { format: 'mp4', quality: 'high' },
    );

    expect(desktop.renderTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          visualTracks: [expect.objectContaining({ keyframes: [expect.objectContaining({ id: 'keyframe-1' })] })],
          audioTracks: [expect.objectContaining({ keyframes: [expect.objectContaining({ id: 'audio-keyframe' })] })],
        }),
      }),
    );
  });
});
