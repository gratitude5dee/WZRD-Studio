import type {
  MotionSplatManifest,
  MotionSplatQuality,
  MotionSplatViewerMode,
  MotionSplatViewerProgress,
  MotionSplatViewerStatus,
} from '@/types/motionSplat';
import type { OrbitState } from '@/lib/motion-splat/gl/mat4';

export type MotionSplatBackendKind = 'spark' | 'gpu';

export type BackendPreference = 'auto' | MotionSplatBackendKind;

export interface MotionSplatEngineOptions {
  manifest: MotionSplatManifest;
  mode?: MotionSplatViewerMode;
  quality?: MotionSplatQuality;
  backend?: BackendPreference;
  autoPlay?: boolean;
  loop?: boolean;
  speed?: number;
  /** Idle camera drift in interactive mode. */
  autoRotate?: boolean;
  /** Called once a cinematic run reaches its end. */
  onComplete?: () => void;
}

export interface MotionSplatEngineState {
  status: MotionSplatViewerStatus;
  progress: MotionSplatViewerProgress | null;
  error: string | null;
  backend: MotionSplatBackendKind | null;
  time: number;
  duration: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  keyframeTimes: Float32Array;
  splatCount: number;
}

export type MotionSplatEngineListener = (state: MotionSplatEngineState) => void;

export interface BackendLoadResult {
  duration: number;
  keyframeTimes: Float32Array;
  splatCount: number;
}

export interface BackendProgress {
  value: number;
  label: string;
}

/**
 * A rendering backend. Backends own the canvas contents; the engine owns the
 * clock, the orbit and the DOM.
 */
export interface MotionSplatBackend {
  readonly kind: MotionSplatBackendKind;
  /** True when the backend advances time itself (video clock). */
  readonly ownsClock: boolean;
  load(onProgress: (progress: BackendProgress) => void, signal: AbortSignal): Promise<BackendLoadResult>;
  /** Jump to a time in seconds. Backends with their own clock seek media. */
  seek(time: number): Promise<void> | void;
  /** Only meaningful for backends that own the clock. */
  play?(): Promise<void>;
  pause?(): void;
  setLoop?(loop: boolean): void;
  setSpeed?(rate: number): void;
  /** Current media time for backends that own the clock. */
  currentTime?(): number;
  setOrbit(orbit: OrbitState): void;
  setViewport(width: number, height: number, pixelRatio: number): void;
  /** Draw a frame. `time` is the engine time for clock-less backends. */
  render(time: number): void;
  captureFrame(): string | null;
  /** Corner positions of the bounding box for camera framing. */
  boxCorners(): Float32Array;
  dispose(): void;
}
