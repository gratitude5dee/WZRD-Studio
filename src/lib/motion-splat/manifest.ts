import { z } from 'zod';

import type {
  MotionSplatCamera,
  MotionSplatManifest,
  MotionSplatProvider,
  MotionSplatSource,
  RgbdTrack,
  SplatKeyframe,
  SplatKeyframesTrack,
  SplatSequenceTrack,
} from '@/types/motionSplat';
import { MOTION_SPLAT_MANIFEST_VERSION } from '@/types/motionSplat';
import { DEFAULT_CAMERA, DEFAULT_KEYFRAME_COUNT, MAX_KEYFRAME_COUNT, MIN_KEYFRAME_COUNT } from './constants';
import { keyframeTimes } from './timeline';

const nonEmpty = z.string().min(1);
const positive = z.number().finite().positive();
const nonNegative = z.number().finite().nonnegative();

const cameraSchema = z
  .object({
    fovDeg: z.number().finite().gt(1).lt(179),
    near: positive,
    far: positive,
  })
  .refine((c) => c.far > c.near, { message: 'camera.far must be greater than camera.near' });

const gridSchema = z.object({
  cols: z.number().int().min(8).max(1024),
  rows: z.number().int().min(8).max(1024),
});

const splatFormat = z.enum(['ply', 'spz', 'splat']);

const rgbdTrackSchema = z.object({
  kind: z.literal('rgbd'),
  depthVideoUrl: nonEmpty,
  depthEncoding: z.enum(['inverse-gray8', 'linear-gray8']),
  grid: gridSchema,
  keyframeCount: z.number().int().min(MIN_KEYFRAME_COUNT).max(MAX_KEYFRAME_COUNT),
  depthModel: z.string().optional(),
});

const splatKeyframeSchema = z.object({
  time: nonNegative,
  url: nonEmpty,
  format: splatFormat,
  sourceImageUrl: z.string().optional(),
});

const splatKeyframesTrackSchema = z.object({
  kind: z.literal('splat-keyframes'),
  keyframes: z.array(splatKeyframeSchema).min(1),
  maxSplats: z.number().int().positive().optional(),
});

const splatSequenceTrackSchema = z.object({
  kind: z.literal('splat-sequence'),
  frames: z.array(z.object({ time: nonNegative, url: nonEmpty, format: splatFormat })).min(1),
});

export const motionSplatManifestSchema = z.object({
  version: z.literal(MOTION_SPLAT_MANIFEST_VERSION),
  id: nonEmpty,
  title: z.string(),
  createdAt: z.string(),
  provider: z.enum(['depth-anything-video', 'triposplat', 'diff4splat']),
  source: z.object({
    imageUrl: z.string().optional(),
    videoUrl: nonEmpty,
    prompt: z.string().optional(),
    videoModel: z.string().optional(),
  }),
  duration: positive,
  fps: positive,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  camera: cameraSchema,
  track: z.discriminatedUnion('kind', [rgbdTrackSchema, splatKeyframesTrackSchema, splatSequenceTrackSchema]),
  posterUrl: z.string().optional(),
  credits: z.object({ video: z.number().optional(), splat: z.number().optional() }).optional(),
});

export interface ManifestParseResult {
  success: boolean;
  manifest?: MotionSplatManifest;
  error?: string;
}

/** Validate an untrusted JSON value; throws with a readable message. */
export function parseMotionSplatManifest(input: unknown): MotionSplatManifest {
  const result = safeParseMotionSplatManifest(input);
  if (!result.success || !result.manifest) {
    throw new Error(result.error ?? 'Invalid motion splat manifest');
  }
  return result.manifest;
}

export function safeParseMotionSplatManifest(input: unknown): ManifestParseResult {
  const parsed = motionSplatManifestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    return { success: false, error: `Invalid motion splat manifest — ${path}${issue?.message ?? 'unknown error'}` };
  }
  return { success: true, manifest: parsed.data as MotionSplatManifest };
}

export function isRgbdTrack(track: MotionSplatManifest['track']): track is RgbdTrack {
  return track.kind === 'rgbd';
}

export function isSplatKeyframesTrack(track: MotionSplatManifest['track']): track is SplatKeyframesTrack {
  return track.kind === 'splat-keyframes';
}

export function isSplatSequenceTrack(track: MotionSplatManifest['track']): track is SplatSequenceTrack {
  return track.kind === 'splat-sequence';
}

/** The sample times the viewer interpolates between, for any track kind. */
export function manifestKeyframeTimes(manifest: MotionSplatManifest): Float32Array {
  const { track } = manifest;
  if (track.kind === 'rgbd') {
    return keyframeTimes(manifest.duration, track.keyframeCount);
  }
  const entries = track.kind === 'splat-keyframes' ? track.keyframes : track.frames;
  return Float32Array.from(entries.map((e) => e.time).sort((a, b) => a - b));
}

export interface CreateManifestBase {
  id?: string;
  title?: string;
  provider: MotionSplatProvider;
  source: MotionSplatSource;
  duration: number;
  fps: number;
  width: number;
  height: number;
  camera?: Partial<MotionSplatCamera>;
  posterUrl?: string;
  credits?: MotionSplatManifest['credits'];
  createdAt?: string;
}

function baseManifest(params: CreateManifestBase): Omit<MotionSplatManifest, 'track'> {
  return {
    version: MOTION_SPLAT_MANIFEST_VERSION,
    id: params.id ?? generateManifestId(),
    title: params.title ?? 'Untitled motion splat',
    createdAt: params.createdAt ?? new Date().toISOString(),
    provider: params.provider,
    source: params.source,
    duration: params.duration,
    fps: params.fps,
    width: params.width,
    height: params.height,
    camera: { ...DEFAULT_CAMERA, ...(params.camera ?? {}) },
    ...(params.posterUrl ? { posterUrl: params.posterUrl } : {}),
    ...(params.credits ? { credits: params.credits } : {}),
  };
}

export function createRgbdManifest(
  params: CreateManifestBase & {
    depthVideoUrl: string;
    depthEncoding?: RgbdTrack['depthEncoding'];
    grid: RgbdTrack['grid'];
    keyframeCount?: number;
    depthModel?: string;
  },
): MotionSplatManifest {
  return {
    ...baseManifest(params),
    track: {
      kind: 'rgbd',
      depthVideoUrl: params.depthVideoUrl,
      depthEncoding: params.depthEncoding ?? 'inverse-gray8',
      grid: params.grid,
      keyframeCount: params.keyframeCount ?? DEFAULT_KEYFRAME_COUNT,
      ...(params.depthModel ? { depthModel: params.depthModel } : {}),
    },
  };
}

export function createSplatKeyframesManifest(
  params: CreateManifestBase & { keyframes: SplatKeyframe[]; maxSplats?: number },
): MotionSplatManifest {
  return {
    ...baseManifest(params),
    track: {
      kind: 'splat-keyframes',
      keyframes: [...params.keyframes].sort((a, b) => a.time - b.time),
      ...(params.maxSplats ? { maxSplats: params.maxSplats } : {}),
    },
  };
}

export function generateManifestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Resolve relative media URLs in a manifest against the URL it was fetched from. */
export function resolveManifestUrls(manifest: MotionSplatManifest, baseUrl: string): MotionSplatManifest {
  const resolve = (url: string | undefined) => {
    if (!url) return url;
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return url;
    }
  };
  const track = manifest.track;
  let resolvedTrack: MotionSplatManifest['track'];
  if (track.kind === 'rgbd') {
    resolvedTrack = { ...track, depthVideoUrl: resolve(track.depthVideoUrl) ?? track.depthVideoUrl };
  } else if (track.kind === 'splat-keyframes') {
    resolvedTrack = {
      ...track,
      keyframes: track.keyframes.map((k) => ({
        ...k,
        url: resolve(k.url) ?? k.url,
        ...(k.sourceImageUrl ? { sourceImageUrl: resolve(k.sourceImageUrl) } : {}),
      })),
    };
  } else {
    resolvedTrack = { ...track, frames: track.frames.map((f) => ({ ...f, url: resolve(f.url) ?? f.url })) };
  }
  return {
    ...manifest,
    source: {
      ...manifest.source,
      videoUrl: resolve(manifest.source.videoUrl) ?? manifest.source.videoUrl,
      ...(manifest.source.imageUrl ? { imageUrl: resolve(manifest.source.imageUrl) } : {}),
    },
    ...(manifest.posterUrl ? { posterUrl: resolve(manifest.posterUrl) } : {}),
    track: resolvedTrack,
  };
}
