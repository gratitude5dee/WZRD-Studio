import { describe, expect, it } from 'vitest';

import {
  buildStoryboardAssemblyRenderPlan,
  isRemoteMediaUrl,
  preferredMediaForShot,
  type StoryboardAssemblyItem,
} from './storyboardAssembly';
import type { ShotDetails } from '@/types/storyboardTypes';

const shot = (overrides: Partial<ShotDetails> = {}): ShotDetails => ({
  id: 'shot-1',
  scene_id: 'scene-1',
  project_id: 'project-1',
  shot_number: 1,
  shot_type: null,
  prompt_idea: null,
  visual_prompt: null,
  dialogue: null,
  sound_effects: null,
  image_url: null,
  image_status: 'pending',
  video_url: null,
  video_status: 'pending',
  audio_url: null,
  audio_status: 'pending',
  luma_generation_id: null,
  ...overrides,
});

const item = (overrides: Partial<StoryboardAssemblyItem> = {}): StoryboardAssemblyItem => ({
  id: 'shot-1',
  sceneId: 'scene-1',
  sceneNumber: 1,
  shotNumber: 1,
  type: 'video',
  url: 'https://cdn.example.com/video.mp4',
  localPath: '/Users/me/video.mp4',
  name: 'Scene 1 Shot 1 video',
  durationMs: 4000,
  ...overrides,
});

describe('storyboard local assembly', () => {
  it('prefers completed shot videos and falls back to completed images', () => {
    expect(preferredMediaForShot(shot({ video_status: 'completed', video_url: 'https://cdn.example.com/shot.mp4' }), 1)).toMatchObject({
      type: 'video',
      url: 'https://cdn.example.com/shot.mp4',
    });

    expect(preferredMediaForShot(shot({ image_status: 'completed', image_url: 'https://cdn.example.com/shot.png' }), 1)).toMatchObject({
      type: 'image',
      url: 'https://cdn.example.com/shot.png',
    });

    expect(preferredMediaForShot(shot(), 1)).toBeNull();
  });

  it('detects remote media URLs that must be cached before local ffmpeg export', () => {
    expect(isRemoteMediaUrl('https://cdn.example.com/shot.mp4')).toBe(true);
    expect(isRemoteMediaUrl('file:///Users/me/shot.mp4')).toBe(false);
    expect(isRemoteMediaUrl('/Users/me/shot.mp4')).toBe(false);
  });

  it('builds sequential local timeline tracks from cached storyboard media', () => {
    const plan = buildStoryboardAssemblyRenderPlan({
      projectId: 'project-1',
      items: [
        item({ id: 'shot-2', shotNumber: 2, localPath: '/Users/me/two.mp4', audioLocalPath: '/Users/me/two.m4a' }),
        item({ id: 'shot-1', shotNumber: 1, localPath: 'file:///Users/me/one.png', type: 'image' }),
      ],
      outputPath: '/Users/me/Desktop/storyboard.mp4',
      defaultShotDurationMs: 5000,
    });

    expect(plan.composition.durationMs).toBe(8000);
    expect(plan.visualTracks.map((track) => track.id)).toEqual(['shot-1', 'shot-2']);
    expect(plan.visualTracks[0]).toMatchObject({
      type: 'image',
      sourcePath: '/Users/me/one.png',
      startMs: 0,
      durationMs: 4000,
    });
    expect(plan.visualTracks[1]).toMatchObject({
      sourcePath: '/Users/me/two.mp4',
      startMs: 4000,
    });
    expect(plan.audioTracks[0]).toMatchObject({
      sourcePath: '/Users/me/two.m4a',
      startMs: 4000,
    });
  });

  it('rejects remote media that has not been cached locally', () => {
    expect(() =>
      buildStoryboardAssemblyRenderPlan({
        projectId: 'project-1',
        items: [item({ localPath: 'https://cdn.example.com/shot.mp4' })],
        outputPath: '/Users/me/Desktop/storyboard.mp4',
      }),
    ).toThrow(/downloaded or cached locally/i);
  });
});
