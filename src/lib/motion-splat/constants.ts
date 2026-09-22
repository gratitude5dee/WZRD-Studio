import type { MotionSplatCamera, MotionSplatGrid, MotionSplatQuality } from '@/types/motionSplat';

/** Splat grid presets (16:9). Use `resolveGrid` to adapt them to other aspects. */
export const MOTION_SPLAT_GRID_PRESETS: Record<Exclude<MotionSplatQuality, 'auto'>, MotionSplatGrid> = {
  low: { cols: 192, rows: 108 },
  medium: { cols: 256, rows: 144 },
  high: { cols: 320, rows: 180 },
};

export const DEFAULT_KEYFRAME_COUNT = 24;
export const MIN_KEYFRAME_COUNT = 2;
export const MAX_KEYFRAME_COUNT = 60;

/** Keyframes never sample closer than this to the end of the clip (seeking to the very end is unreliable). */
export const KEYFRAME_END_MARGIN_SECONDS = 0.05;

/** Virtual camera that bounds RGB-D reconstructions: a 50° lens with a 1..3 unit deep frustum box. */
export const DEFAULT_CAMERA: MotionSplatCamera = { fovDeg: 50, near: 1, far: 3 };

/** Relative depth jump (|Δz| / z) above which a pixel is treated as a depth edge. */
export const EDGE_DEPTH_THRESHOLD = 0.08;
/** Opacity applied to depth-edge splats so silhouettes do not streak. */
export const EDGE_ALPHA = 0.35;
/** Isotropic splat footprint as a fraction of the pixel footprint at that depth. */
export const FOOTPRINT_SCALE = 0.9;
/** Depth-axis scale relative to the in-plane footprint. */
export const FOOTPRINT_ANISOTROPY = 0.5;

// Spark packed-splat encoding constants (mirrors @sparkjsdev/spark defines).
export const LN_SCALE_MIN = -12;
export const LN_SCALE_MAX = 9;
export const LN_SCALE_ZERO = -30;
export const SCALE_ZERO = Math.exp(LN_SCALE_ZERO);

/** Default keyframe cap for TripoSplat-style keyframe tracks after Morton alignment. */
export const DEFAULT_MAX_KEYFRAME_SPLATS = 131_072;

export const MOTION_SPLAT_EDGE_FUNCTION = 'motion-splat';
export const MOTION_SPLAT_STORAGE_BUCKET = 'workflow-media';
export const MOTION_SPLAT_STORAGE_PREFIX = 'motion-splat';

export const DEPTH_MODEL_ID = 'fal-ai/depth-anything-video';
export const TRIPOSPLAT_MODEL_ID = 'tripo3d/triposplat';
export const DEFAULT_VIDEO_MODEL_ID = 'fal-ai/kling-video/o3/standard/image-to-video';

/** Credits charged per call (mirrors MOTION_SPLAT_COSTS in supabase/functions/_shared/motion-splat.ts). */
export const DEPTH_CREDIT_COST = 10;
export const TRIPOSPLAT_CREDIT_COST = 12;

/**
 * The image-to-video models the studio offers, with the credits the edge
 * function actually reserves. Mirrors MOTION_SPLAT_VIDEO_MODELS in
 * supabase/functions/_shared/motion-splat.ts, which rejects anything absent
 * here; a parity test asserts the two tables stay identical.
 */
export const MOTION_SPLAT_VIDEO_MODELS: Record<string, number> = {
  'fal-ai/kling-video/o3/standard/image-to-video': 24,
  'fal-ai/kling-video/o3/pro/image-to-video': 32,
  'fal-ai/kling-video/v3/pro/image-to-video': 30,
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 22,
  'fal-ai/kling-video/o1/image-to-video': 28,
  'fal-ai/bytedance/seedance/v1/lite/image-to-video': 20,
  'fal-ai/bytedance/seedance/v1/pro/image-to-video': 32,
  'fal-ai/magi/image-to-video': 22,
};

/** Credits for an offered model, falling back to the default model's price. */
export function videoModelCost(modelId: string | undefined): number {
  const cost = modelId ? MOTION_SPLAT_VIDEO_MODELS[modelId] : undefined;
  return typeof cost === 'number' ? cost : MOTION_SPLAT_VIDEO_MODELS[DEFAULT_VIDEO_MODEL_ID];
}

export const SPLAT_INTRO_SEEN_KEY = 'wzrd-splat-intro-seen';
export const DEFAULT_INTRO_MANIFEST_URL = '/intro-splat/manifest.json';
