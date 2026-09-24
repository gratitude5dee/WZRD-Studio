// ---------------------------------------------------------------------------
// GpuBackend — RGB-D tracks rendered by the dependency-free WebGL2 video-splat
// renderer. Time is the video clock, so motion plays at the clip's native
// frame rate. Used when Spark is unavailable and by the landing intro.
// ---------------------------------------------------------------------------

import type { MotionSplatManifest, MotionSplatQuality } from '@/types/motionSplat';
import { VideoSplatPlayer } from '@/lib/motion-splat/gl/VideoSplatPlayer';
import type { OrbitState } from '@/lib/motion-splat/gl/mat4';
import { manifestKeyframeTimes } from '@/lib/motion-splat/manifest';
import { frustumCorners, resolveGrid } from '@/lib/motion-splat/unproject';
import type { BackendLoadResult, BackendProgress, MotionSplatBackend } from '../types';

export interface GpuBackendOptions {
  canvas: HTMLCanvasElement;
  manifest: MotionSplatManifest;
  quality: Exclude<MotionSplatQuality, 'auto'>;
  loop: boolean;
  speed: number;
  onEnded?: () => void;
  onError?: (error: Error) => void;
}

export class GpuBackend implements MotionSplatBackend {
  readonly kind = 'gpu' as const;
  readonly ownsClock = true;
  private player: VideoSplatPlayer | null = null;
  private readonly options: GpuBackendOptions;
  private readonly corners: Float32Array;
  private lastTime = 0;

  constructor(options: GpuBackendOptions) {
    this.options = options;
    const aspect = options.manifest.width / Math.max(1, options.manifest.height);
    this.corners = frustumCorners(options.manifest.camera, aspect);
  }

  async load(onProgress: (progress: BackendProgress) => void, signal: AbortSignal): Promise<BackendLoadResult> {
    const { manifest, quality } = this.options;
    if (manifest.track.kind !== 'rgbd') {
      throw new Error('The GPU backend only supports RGB-D tracks');
    }
    const aspect = manifest.width / Math.max(1, manifest.height);
    // Match the manifest grid aspect; the quality preset only bounds the cell count.
    const preset = resolveGrid(quality, aspect);
    const grid = {
      cols: Math.min(manifest.track.grid.cols, preset.cols),
      rows: Math.min(manifest.track.grid.rows, preset.rows),
    };
    onProgress({ value: 0.05, label: 'Loading video' });
    this.player = new VideoSplatPlayer({
      canvas: this.options.canvas,
      videoUrl: manifest.source.videoUrl,
      depthVideoUrl: manifest.track.depthVideoUrl,
      grid,
      camera: manifest.camera,
      encoding: manifest.track.depthEncoding,
      loop: this.options.loop,
      playbackRate: this.options.speed,
      onEnded: this.options.onEnded,
      onError: this.options.onError,
      onTime: (time) => {
        this.lastTime = time;
      },
      // MotionSplatEngine drives the frame loop; a second one would draw twice.
      externallyDriven: true,
      signal,
    });
    await this.player.load();
    onProgress({ value: 1, label: 'Ready' });
    return {
      duration: this.player.duration || manifest.duration,
      keyframeTimes: manifestKeyframeTimes(manifest),
      splatCount: grid.cols * grid.rows,
    };
  }

  seek(time: number): Promise<void> | void {
    this.lastTime = time;
    return this.player?.seek(time);
  }

  play(): Promise<void> {
    return this.player?.play() ?? Promise.resolve();
  }

  pause(): void {
    this.player?.pause();
  }

  setLoop(loop: boolean): void {
    this.player?.setLoop(loop);
  }

  setSpeed(rate: number): void {
    this.player?.setPlaybackRate(rate);
  }

  currentTime(): number {
    return this.player?.currentTime ?? this.lastTime;
  }

  setOrbit(orbit: OrbitState): void {
    if (!this.player) return;
    const target = this.player.renderer.orbit;
    target.theta = orbit.theta;
    target.phi = orbit.phi;
    target.radius = orbit.radius;
    target.target = [...orbit.target];
  }

  setViewport(width: number, height: number, pixelRatio: number): void {
    this.player?.renderer.resize(width, height, pixelRatio);
  }

  render(): void {
    this.player?.render();
  }

  captureFrame(): string | null {
    if (!this.player) return null;
    try {
      this.player.render();
      return this.options.canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  boxCorners(): Float32Array {
    return this.corners;
  }

  dispose(): void {
    this.player?.dispose();
    this.player = null;
  }
}
