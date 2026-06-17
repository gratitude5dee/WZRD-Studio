import type { ShotDetails } from '@/types/storyboardTypes';
import {
  sourcePathFromLocalUrl,
  type LocalTimelineRenderPlan,
  type LocalTimelineExportQuality,
} from './timelineRenderPlan';

export interface StoryboardAssemblyItem {
  id: string;
  sceneId: string;
  sceneNumber?: number;
  shotNumber: number;
  type: 'video' | 'image';
  url: string;
  localPath: string;
  name: string;
  durationMs?: number;
  audioLocalPath?: string;
}

export interface BuildStoryboardAssemblyInput {
  projectId: string;
  items: StoryboardAssemblyItem[];
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
  quality?: LocalTimelineExportQuality;
  defaultShotDurationMs?: number;
}

export interface PreferredShotMedia {
  shotId: string;
  sceneId: string;
  shotNumber: number;
  type: 'video' | 'image';
  url: string;
  name: string;
  audioUrl?: string | null;
}

function sortedItems(items: StoryboardAssemblyItem[]) {
  return [...items].sort((a, b) => {
    const sceneDelta = (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0);
    return sceneDelta || a.shotNumber - b.shotNumber;
  });
}

export function preferredMediaForShot(shot: ShotDetails, sceneNumber?: number): PreferredShotMedia | null {
  if (shot.video_status === 'completed' && shot.video_url) {
    return {
      shotId: shot.id,
      sceneId: shot.scene_id,
      shotNumber: shot.shot_number,
      type: 'video',
      url: shot.video_url,
      name: `Scene ${sceneNumber ?? 'x'} Shot ${shot.shot_number} video`,
      audioUrl: shot.audio_status === 'completed' ? shot.audio_url : null,
    };
  }

  const imageUrl = shot.upscaled_image_url || shot.image_url;
  if (shot.image_status === 'completed' && imageUrl) {
    return {
      shotId: shot.id,
      sceneId: shot.scene_id,
      shotNumber: shot.shot_number,
      type: 'image',
      url: imageUrl,
      name: `Scene ${sceneNumber ?? 'x'} Shot ${shot.shot_number} image`,
      audioUrl: shot.audio_status === 'completed' ? shot.audio_url : null,
    };
  }

  return null;
}

export function isRemoteMediaUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export function buildStoryboardAssemblyRenderPlan(input: BuildStoryboardAssemblyInput): LocalTimelineRenderPlan {
  if (!input.outputPath.trim()) {
    throw new Error('Choose a local output folder before exporting the storyboard assembly.');
  }

  const defaultDurationMs = Math.max(1000, Math.round(input.defaultShotDurationMs ?? 5000));
  let cursorMs = 0;
  const visualTracks = [];
  const audioTracks = [];

  for (const item of sortedItems(input.items)) {
    const durationMs = Math.max(1000, Math.round(item.durationMs ?? defaultDurationMs));
    const sourcePath = sourcePathFromLocalUrl(item.localPath, item.name);
    visualTracks.push({
      id: item.id,
      type: item.type,
      name: item.name,
      sourcePath,
      startMs: cursorMs,
      durationMs,
      trimStartMs: 0,
      layer: 0,
      transform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
      },
      opacity: 1,
    });

    if (item.audioLocalPath) {
      audioTracks.push({
        id: `${item.id}-audio`,
        name: `${item.name} audio`,
        sourcePath: sourcePathFromLocalUrl(item.audioLocalPath, `${item.name} audio`),
        startMs: cursorMs,
        durationMs,
        trimStartMs: 0,
        volume: 1,
        muted: false,
        fadeInMs: 0,
        fadeOutMs: 0,
      });
    }

    cursorMs += durationMs;
  }

  if (visualTracks.length === 0) {
    throw new Error('Generate or cache at least one shot image or video before local timeline export.');
  }

  return {
    projectId: input.projectId,
    composition: {
      width: input.width ?? 1920,
      height: input.height ?? 1080,
      fps: input.fps ?? 30,
      durationMs: cursorMs,
      backgroundColor: '#000000',
    },
    visualTracks,
    audioTracks,
    exportSettings: {
      format: 'mp4',
      quality: input.quality ?? 'high',
      outputPath: input.outputPath,
      includeAudio: audioTracks.length > 0,
      fastStart: true,
    },
  };
}
