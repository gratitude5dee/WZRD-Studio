import { describe, expect, it } from 'vitest';

import type { SceneDetails, ShotDetails } from '@/types/storyboardTypes';
import {
  buildStoryboardAssemblyTimeline,
  createStoryboardAssemblyTimelineLayout,
} from './storyboardAssemblyTimeline';

const scene = (overrides: Partial<SceneDetails> = {}): Pick<SceneDetails, 'id' | 'scene_number'> => ({
  id: 'scene-1',
  scene_number: 1,
  ...overrides,
});

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

describe('storyboard assembly timeline', () => {
  it('sorts generated media by scene and shot while preserving image/video durations', () => {
    const timeline = buildStoryboardAssemblyTimeline({
      scenes: [scene({ id: 'scene-2', scene_number: 2 }), scene({ id: 'scene-1', scene_number: 1 })],
      shots: [
        shot({
          id: 'shot-2-1',
          scene_id: 'scene-2',
          shot_number: 1,
          video_status: 'completed',
          video_url: 'https://cdn.example.com/two-one.mp4',
        }),
        shot({
          id: 'shot-1-2',
          scene_id: 'scene-1',
          shot_number: 2,
          image_status: 'completed',
          image_url: 'https://cdn.example.com/one-two.png',
        }),
        shot({
          id: 'shot-1-1',
          scene_id: 'scene-1',
          shot_number: 1,
          video_status: 'completed',
          video_url: 'https://cdn.example.com/one-one.mp4',
        }),
        shot({ id: 'shot-pending', scene_id: 'scene-1', shot_number: 3 }),
      ],
    });

    expect(timeline.totalShotCount).toBe(4);
    expect(timeline.availableMediaCount).toBe(3);
    expect(timeline.durationMs).toBe(14_000);
    expect(timeline.items.map((item) => item.id)).toEqual(['shot-1-1', 'shot-1-2', 'shot-2-1']);
    expect(timeline.items.map((item) => [item.startMs, item.durationMs, item.label])).toEqual([
      [0, 5000, 'S1.1'],
      [5000, 4000, 'S1.2'],
      [9000, 5000, 'S2.1'],
    ]);
  });

  it('creates a shared-zoom layout with visible segments and adaptive ticks', () => {
    const timeline = buildStoryboardAssemblyTimeline({
      scenes: [scene()],
      shots: [
        shot({ id: 'shot-1', shot_number: 1, video_status: 'completed', video_url: '/tmp/one.mp4' }),
        shot({ id: 'shot-2', shot_number: 2, image_status: 'completed', image_url: '/tmp/two.png' }),
      ],
    });
    const layout = createStoryboardAssemblyTimelineLayout({
      timeline,
      pixelsPerSecond: 40,
      viewportWidth: 240,
      scrollLeft: 100,
      fps: 30,
    });

    expect(layout.contentWidth).toBe(360);
    expect(layout.ticks.some((tick) => tick.label === '00:05')).toBe(true);
    expect(layout.segments).toMatchObject([
      { id: 'shot-1', left: 0, width: 200, isVisible: true },
      { id: 'shot-2', left: 200, width: 160, isVisible: true },
    ]);
  });
});
