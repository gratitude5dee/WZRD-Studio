import type { ShotDetails, SceneDetails } from '@/types/storyboardTypes';
import {
  generateTimelineTicks,
  timeToX,
  type TimelineTick,
} from '@/lib/editor/timelineZoom';
import { preferredMediaForShot } from './storyboardAssembly';

export interface StoryboardAssemblyTimelineItem {
  id: string;
  sceneId: string;
  sceneNumber?: number;
  shotNumber: number;
  mediaType: 'image' | 'video';
  label: string;
  sourceUrl: string;
  startMs: number;
  durationMs: number;
  endMs: number;
}

export interface StoryboardAssemblyTimeline {
  items: StoryboardAssemblyTimelineItem[];
  durationMs: number;
  totalShotCount: number;
  availableMediaCount: number;
}

export interface StoryboardAssemblyTimelineLayout {
  contentWidth: number;
  ticks: TimelineTick[];
  segments: Array<StoryboardAssemblyTimelineItem & {
    left: number;
    width: number;
    isVisible: boolean;
  }>;
}

export function buildStoryboardAssemblyTimeline(input: {
  shots: ShotDetails[];
  scenes: Pick<SceneDetails, 'id' | 'scene_number'>[];
  defaultImageDurationMs?: number;
  defaultVideoDurationMs?: number;
}): StoryboardAssemblyTimeline {
  const sceneNumberById = new Map(input.scenes.map((scene) => [scene.id, scene.scene_number]));
  const defaultImageDurationMs = Math.max(1000, Math.round(input.defaultImageDurationMs ?? 4000));
  const defaultVideoDurationMs = Math.max(1000, Math.round(input.defaultVideoDurationMs ?? 5000));
  const sortedShots = [...input.shots].sort((a, b) => {
    const sceneDelta = (sceneNumberById.get(a.scene_id) ?? 0) - (sceneNumberById.get(b.scene_id) ?? 0);
    return sceneDelta || a.shot_number - b.shot_number;
  });
  const items: StoryboardAssemblyTimelineItem[] = [];
  let cursorMs = 0;

  for (const shot of sortedShots) {
    const media = preferredMediaForShot(shot, sceneNumberById.get(shot.scene_id));
    if (!media) continue;
    const durationMs = media.type === 'image' ? defaultImageDurationMs : defaultVideoDurationMs;
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    items.push({
      id: media.shotId,
      sceneId: media.sceneId,
      sceneNumber: sceneNumberById.get(media.sceneId),
      shotNumber: media.shotNumber,
      mediaType: media.type,
      label: `S${sceneNumberById.get(media.sceneId) ?? 'x'}.${media.shotNumber}`,
      sourceUrl: media.url,
      startMs,
      durationMs,
      endMs,
    });
    cursorMs = endMs;
  }

  return {
    items,
    durationMs: cursorMs,
    totalShotCount: input.shots.length,
    availableMediaCount: items.length,
  };
}

export function createStoryboardAssemblyTimelineLayout(input: {
  timeline: StoryboardAssemblyTimeline;
  pixelsPerSecond: number;
  viewportWidth: number;
  scrollLeft?: number;
  fps?: number;
}): StoryboardAssemblyTimelineLayout {
  const viewportWidth = Math.max(1, input.viewportWidth);
  const scrollLeft = Math.max(0, input.scrollLeft ?? 0);
  const durationMs = Math.max(1000, input.timeline.durationMs);
  const contentWidth = Math.max(viewportWidth, timeToX(durationMs, input.pixelsPerSecond));
  const viewportEnd = scrollLeft + viewportWidth;
  return {
    contentWidth,
    ticks: generateTimelineTicks({
      durationMs,
      fps: input.fps ?? 30,
      pixelsPerSecond: input.pixelsPerSecond,
      scrollLeft,
      viewportWidth,
    }),
    segments: input.timeline.items.map((item) => {
      const left = timeToX(item.startMs, input.pixelsPerSecond);
      const width = Math.max(12, timeToX(item.durationMs, input.pixelsPerSecond));
      return {
        ...item,
        left,
        width,
        isVisible: left + width >= scrollLeft && left <= viewportEnd,
      };
    }),
  };
}
