import type { AudioTrack, Clip, CompositionSettings, Keyframe } from '@/store/videoEditorStore';

export type LocalTimelineExportFormat = 'mp4' | 'webm';
export type LocalTimelineExportQuality = 'low' | 'medium' | 'high' | '4k';

export interface LocalTimelineVisualTrack {
  id: string;
  type: 'video' | 'image' | 'text' | 'element';
  name: string;
  sourcePath?: string;
  text?: string;
  style?: Clip['style'];
  element?: Clip['element'];
  startMs: number;
  durationMs: number;
  trimStartMs?: number;
  trimEndMs?: number;
  layer: number;
  playbackRate: number;
  transform: Clip['transforms'];
  opacity: number;
  effects?: Clip['effects'];
  masks?: Clip['masks'];
  keyframes?: Keyframe[];
}

export interface LocalTimelineAudioTrack {
  id: string;
  name: string;
  sourcePath: string;
  startMs: number;
  durationMs: number;
  trimStartMs?: number;
  trimEndMs?: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  keyframes?: Keyframe[];
}

export interface LocalTimelineRenderPlan {
  projectId?: string;
  composition: {
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    backgroundColor: string;
  };
  visualTracks: LocalTimelineVisualTrack[];
  audioTracks: LocalTimelineAudioTrack[];
  exportSettings: {
    format: LocalTimelineExportFormat;
    quality: LocalTimelineExportQuality;
    outputPath: string;
    includeAudio: boolean;
    fastStart: boolean;
  };
}

export interface BuildLocalTimelineRenderPlanInput {
  projectId?: string | null;
  clips: Clip[];
  audioTracks: AudioTrack[];
  keyframes?: Keyframe[];
  composition: CompositionSettings;
  outputPath: string;
  format: LocalTimelineExportFormat;
  quality: LocalTimelineExportQuality;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizePlaybackRate(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0) return 1;
  return Math.max(0.01, value);
}

function endMs(item: Pick<Clip | AudioTrack, 'startTime' | 'duration' | 'endTime'>): number {
  if (isFiniteNumber(item.endTime)) return item.endTime;
  return Math.max(0, item.startTime ?? 0) + Math.max(0, item.duration ?? 0);
}

function keyframesForTarget(
  keyframes: Keyframe[] | undefined,
  targetId: string,
  targetType: Keyframe['targetType'],
  startMs: number,
  durationMs: number,
): Keyframe[] | undefined {
  const endMs = startMs + durationMs;
  const targeted = (keyframes ?? [])
    .filter((keyframe) => keyframe.targetId === targetId)
    .filter((keyframe) => !keyframe.targetType || keyframe.targetType === targetType)
    .filter((keyframe) => keyframe.time >= startMs && keyframe.time <= endMs)
    .sort((left, right) => left.time - right.time)
    .map((keyframe) => ({
      ...keyframe,
      properties: { ...(keyframe.properties ?? {}) },
    }));

  return targeted.length > 0 ? targeted : undefined;
}

export function sourcePathFromLocalUrl(url: string, label = 'media'): string {
  const value = url.trim();
  if (!value) throw new Error(`${label} is missing a local source path.`);
  if (value.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(value).pathname);
    } catch {
      throw new Error(`${label} has an invalid file URL.`);
    }
  }
  if (value.startsWith('/')) return value;
  if (/^[A-Za-z]:[\\/]/.test(value)) return value;
  throw new Error(`${label} must be downloaded or cached locally before local FFmpeg export.`);
}

const LOCAL_FFMPEG_SUPPORTED_EFFECTS = new Set([
  'blur',
  'brightness',
  'contrast',
  'saturation',
  'exposure',
  'sharpen',
  'grayscale',
  'sepia',
  'invert',
  'vignette',
  'grain',
  'noise',
]);

function normalizeEffectId(effect: NonNullable<Clip['effects']>[number]) {
  return (effect.id || effect.name || '').trim().toLowerCase();
}

function normalizeSupportedEffects(effects: Clip['effects']) {
  if (!effects?.length) return undefined;
  return effects.map((effect) => {
    const effectId = normalizeEffectId(effect);
    if (!LOCAL_FFMPEG_SUPPORTED_EFFECTS.has(effectId)) {
      throw new Error(`Effect "${effect.name || effect.id}" is not supported by local FFmpeg export yet.`);
    }

    return {
      ...effect,
      id: effect.id || effectId,
      params: { ...(effect.params ?? {}) },
    };
  });
}

function normalizeSupportedMasks(masks: Clip['masks']) {
  if (!masks?.length) return undefined;
  return masks.map((mask) => {
    if (mask.type !== 'rectangle' && mask.type !== 'ellipse') {
      throw new Error(`Mask "${mask.id}" uses ${mask.type}, which is not supported by local FFmpeg export yet.`);
    }

    return {
      ...mask,
      feather: Math.max(0, mask.feather ?? 0),
      opacity: Math.max(0, Math.min(1, mask.opacity ?? 1)),
      inverted: Boolean(mask.inverted),
    };
  });
}

function validateSupportedClip(clip: Clip) {
  normalizeSupportedEffects(clip.effects);
  normalizeSupportedMasks(clip.masks);
  if (clip.transition && clip.transition.type !== 'none') {
    throw new Error(`Clip "${clip.name}" uses a transition that is not supported by the first local FFmpeg render pass.`);
  }
}

export function buildLocalTimelineRenderPlan(input: BuildLocalTimelineRenderPlanInput): LocalTimelineRenderPlan {
  if (!input.outputPath.trim()) throw new Error('Choose a local output path before exporting.');

  const visualTracks = input.clips
    .filter((clip) => Math.max(0, clip.duration ?? 0) > 0)
    .sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0) || (a.startTime ?? 0) - (b.startTime ?? 0))
    .map((clip): LocalTimelineVisualTrack => {
      validateSupportedClip(clip);
      const visualType = clip.type === 'text' ? 'text' : clip.type === 'element' ? 'element' : clip.type === 'image' ? 'image' : 'video';
      const startMs = Math.max(0, Math.round(clip.startTime ?? 0));
      const durationMs = Math.max(1, Math.round(clip.duration ?? 0));
      return {
        id: clip.id,
        type: visualType,
        name: clip.name,
        ...(visualType === 'text'
          ? {
              text: clip.text ?? clip.name,
              style: clip.style,
            }
          : visualType === 'element'
            ? {
                element: clip.element ?? {
                  elementType: 'shape',
                  shape: 'rectangle',
                  color: '#FFFFFF',
                },
              }
            : {
                sourcePath: sourcePathFromLocalUrl(clip.sourcePath ?? clip.url, `Clip "${clip.name}"`),
              }),
        startMs,
        durationMs,
        trimStartMs: isFiniteNumber(clip.trimStart) ? Math.max(0, Math.round(clip.trimStart)) : undefined,
        trimEndMs: isFiniteNumber(clip.trimEnd) ? Math.max(0, Math.round(clip.trimEnd)) : undefined,
        layer: clip.layer ?? 0,
        playbackRate: normalizePlaybackRate(clip.playbackRate),
        transform: clip.transforms,
        opacity: Math.max(0, Math.min(1, clip.transforms?.opacity ?? 1)),
        effects: normalizeSupportedEffects(clip.effects),
        masks: normalizeSupportedMasks(clip.masks),
        keyframes: keyframesForTarget(input.keyframes, clip.id, 'clip', startMs, durationMs),
      };
    });

  const audioTracks = input.audioTracks
    .filter((track) => Math.max(0, track.duration ?? 0) > 0 && track.url)
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    .map((track): LocalTimelineAudioTrack => {
      const startMs = Math.max(0, Math.round(track.startTime ?? 0));
      const durationMs = Math.max(1, Math.round(track.duration ?? 0));
      return {
        id: track.id,
        name: track.name,
        sourcePath: sourcePathFromLocalUrl(track.sourcePath ?? track.url, `Audio "${track.name}"`),
        startMs,
        durationMs,
        trimStartMs: isFiniteNumber(track.trimStart) ? Math.max(0, Math.round(track.trimStart)) : undefined,
        trimEndMs: isFiniteNumber(track.trimEnd) ? Math.max(0, Math.round(track.trimEnd)) : undefined,
        playbackRate: normalizePlaybackRate(track.playbackRate),
        volume: Math.max(0, track.volume ?? 1),
        muted: Boolean(track.isMuted),
        fadeInMs: isFiniteNumber(track.fadeInDuration) ? Math.max(0, Math.round(track.fadeInDuration)) : undefined,
        fadeOutMs: isFiniteNumber(track.fadeOutDuration) ? Math.max(0, Math.round(track.fadeOutDuration)) : undefined,
        keyframes: keyframesForTarget(input.keyframes, track.id, 'audio', startMs, durationMs),
      };
    });

  if (visualTracks.length === 0) {
    throw new Error('Add at least one locally available visual clip before exporting.');
  }

  const timelineDurationMs = Math.max(
    input.composition.duration,
    ...input.clips.map(endMs),
    ...input.audioTracks.map(endMs),
    1000,
  );

  return {
    projectId: input.projectId ?? undefined,
    composition: {
      width: input.composition.width,
      height: input.composition.height,
      fps: input.composition.fps,
      durationMs: Math.round(timelineDurationMs),
      backgroundColor: input.composition.backgroundColor || '#000000',
    },
    visualTracks,
    audioTracks,
    exportSettings: {
      format: input.format,
      quality: input.quality,
      outputPath: input.outputPath,
      includeAudio: audioTracks.length > 0,
      fastStart: true,
    },
  };
}
