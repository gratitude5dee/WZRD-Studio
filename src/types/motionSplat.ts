// ---------------------------------------------------------------------------
// Motion Splat — type definitions for the time-aware Gaussian splat studio.
//
// A "motion splat" is a Gaussian splat that changes over time. It is described
// by a versioned JSON manifest that points at the media the browser needs to
// rebuild the splat (an RGB video plus a depth video, a set of per-keyframe
// splat files, or a full per-frame splat sequence) together with the virtual
// camera whose frustum bounds the reconstruction.
// ---------------------------------------------------------------------------

export const MOTION_SPLAT_MANIFEST_VERSION = 1 as const;

/** Which reconstruction backend produced the track. */
export type MotionSplatProvider = 'depth-anything-video' | 'triposplat' | 'diff4splat';

export type SplatFileFormat = 'ply' | 'spz' | 'splat';

/**
 * How the grayscale depth video encodes depth.
 * - `inverse-gray8`: brightness is normalised inverse depth (bright = near),
 *   the convention Depth Anything uses for its visualisations.
 * - `linear-gray8`: brightness is normalised linear depth with bright = near.
 */
export type DepthEncoding = 'inverse-gray8' | 'linear-gray8';

/** Virtual pinhole camera at the origin looking down -Z; near/far bound the frustum box. */
export interface MotionSplatCamera {
  fovDeg: number;
  near: number;
  far: number;
}

export interface MotionSplatGrid {
  cols: number;
  rows: number;
}

export interface MotionSplatSource {
  /** The image the user uploaded, when the video was generated from one. */
  imageUrl?: string;
  /** The RGB video the 4D splat was reconstructed from. */
  videoUrl: string;
  prompt?: string;
  videoModel?: string;
}

/** RGB video + depth video; the browser unprojects sampled keyframes into splats. */
export interface RgbdTrack {
  kind: 'rgbd';
  depthVideoUrl: string;
  depthEncoding: DepthEncoding;
  /** Splat grid per keyframe (one Gaussian per cell). */
  grid: MotionSplatGrid;
  /** Number of evenly spaced keyframes sampled across the duration. */
  keyframeCount: number;
  depthModel?: string;
}

export interface SplatKeyframe {
  /** Seconds from the start of the clip. */
  time: number;
  url: string;
  format: SplatFileFormat;
  /** The video frame this 3D splat was generated from. */
  sourceImageUrl?: string;
}

/** A handful of full 3D splats (e.g. TripoSplat per keyframe) morphed over time. */
export interface SplatKeyframesTrack {
  kind: 'splat-keyframes';
  keyframes: SplatKeyframe[];
  /** Upper bound on splats kept per keyframe after alignment. */
  maxSplats?: number;
}

export interface SplatSequenceFrame {
  time: number;
  url: string;
  format: SplatFileFormat;
}

/** One splat per frame (e.g. Diff4Splat output); the viewer crossfades neighbours. */
export interface SplatSequenceTrack {
  kind: 'splat-sequence';
  frames: SplatSequenceFrame[];
}

export type MotionSplatTrack = RgbdTrack | SplatKeyframesTrack | SplatSequenceTrack;

export type MotionSplatTrackKind = MotionSplatTrack['kind'];

export interface MotionSplatCredits {
  video?: number;
  splat?: number;
}

export interface MotionSplatManifest {
  version: typeof MOTION_SPLAT_MANIFEST_VERSION;
  id: string;
  title: string;
  /** ISO timestamp. */
  createdAt: string;
  provider: MotionSplatProvider;
  source: MotionSplatSource;
  /** Clip duration in seconds. */
  duration: number;
  fps: number;
  /** Source video dimensions. */
  width: number;
  height: number;
  camera: MotionSplatCamera;
  track: MotionSplatTrack;
  posterUrl?: string;
  credits?: MotionSplatCredits;
}

// ---- Viewer -----------------------------------------------------------------

export type MotionSplatQuality = 'auto' | 'low' | 'medium' | 'high';

/**
 * `interactive`: orbit + transport controls owned by the user.
 * `cinematic`: autoplays time with a slow camera move (landing intro).
 */
export type MotionSplatViewerMode = 'interactive' | 'cinematic';

export type MotionSplatViewerStatus =
  | 'idle'
  | 'loading'
  | 'decoding'
  | 'ready'
  | 'unsupported'
  | 'error';

export interface MotionSplatViewerProgress {
  /** 0..1 */
  value: number;
  label: string;
}

// ---- Pipeline ---------------------------------------------------------------

export type MotionSplatPipelineStep =
  | 'idle'
  | 'uploading'
  | 'generating-video'
  | 'building-splat'
  | 'ready'
  | 'error';

/** Which reconstruction the user asked for. */
export type MotionSplatBuildMode = 'rgbd' | 'splat-keyframes';

export interface MotionSplatJobSummary {
  id: string;
  title: string;
  createdAt: string;
  manifestUrl: string;
  posterUrl?: string;
  provider: MotionSplatProvider;
  trackKind: MotionSplatTrackKind;
  duration: number;
}
