// ---------------------------------------------------------------------------
// VideoSplatPlayer — drives a VideoSplatRenderer from an RGB video and a depth
// video kept in lock-step. Time is the video clock: play, pause, seek, loop and
// playback rate all map straight onto the media elements, and every presented
// frame is uploaded as a texture pair.
// ---------------------------------------------------------------------------

import type { DepthEncoding, MotionSplatCamera, MotionSplatGrid } from '@/types/motionSplat';
import { loadVideoElement } from '../videoFrames';
import { VideoSplatRenderer, type VideoSplatRendererOptions } from './VideoSplatRenderer';

export interface VideoSplatPlayerOptions extends Omit<VideoSplatRendererOptions, 'grid' | 'camera' | 'encoding' | 'aspect'> {
  videoUrl: string;
  depthVideoUrl: string;
  grid: MotionSplatGrid;
  camera: MotionSplatCamera;
  encoding: DepthEncoding;
  loop?: boolean;
  playbackRate?: number;
  onTime?: (time: number, duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

const SYNC_TOLERANCE_SECONDS = 0.045;

export class VideoSplatPlayer {
  readonly renderer: VideoSplatRenderer;
  private rgb: HTMLVideoElement | null = null;
  private depth: HTMLVideoElement | null = null;
  private frameHandle = 0;
  private disposed = false;
  private playing = false;
  private readonly options: VideoSplatPlayerOptions;
  private lastUploadedTime = -1;
  private pendingSeek: number | null = null;
  private seeking = false;

  duration = 0;
  width = 0;
  height = 0;

  constructor(options: VideoSplatPlayerOptions) {
    this.options = options;
    this.renderer = new VideoSplatRenderer({
      canvas: options.canvas,
      grid: options.grid,
      camera: options.camera,
      encoding: options.encoding,
      edgeThreshold: options.edgeThreshold,
      edgeAlpha: options.edgeAlpha,
      footprintScale: options.footprintScale,
      background: options.background,
      boxEdgeAlpha: options.boxEdgeAlpha,
      boxFaceAlpha: options.boxFaceAlpha,
      showBox: options.showBox,
    });
  }

  /** Load both videos and upload the first frame. */
  async load(): Promise<void> {
    const [rgb, depth] = await Promise.all([
      loadVideoElement(this.options.videoUrl, { signal: this.options.signal }),
      loadVideoElement(this.options.depthVideoUrl, { signal: this.options.signal }),
    ]);
    if (this.disposed) {
      rgb.src = '';
      depth.src = '';
      return;
    }
    this.rgb = rgb;
    this.depth = depth;
    this.duration = Math.min(rgb.duration || 0, depth.duration || rgb.duration || 0);
    this.width = rgb.videoWidth;
    this.height = rgb.videoHeight;
    rgb.loop = this.options.loop ?? true;
    depth.loop = rgb.loop;
    rgb.playbackRate = this.options.playbackRate ?? 1;
    depth.playbackRate = rgb.playbackRate;
    rgb.addEventListener('ended', () => {
      if (!rgb.loop) {
        this.playing = false;
        this.options.onEnded?.();
      }
    });
    rgb.addEventListener('error', () => this.options.onError?.(new Error('RGB video failed')));
    depth.addEventListener('error', () => this.options.onError?.(new Error('Depth video failed')));
    await this.seek(0);
  }

  get currentTime(): number {
    return this.rgb?.currentTime ?? 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setLoop(loop: boolean): void {
    if (this.rgb) this.rgb.loop = loop;
    if (this.depth) this.depth.loop = loop;
  }

  setPlaybackRate(rate: number): void {
    const safe = Math.min(4, Math.max(0.1, rate));
    if (this.rgb) this.rgb.playbackRate = safe;
    if (this.depth) this.depth.playbackRate = safe;
  }

  async play(): Promise<void> {
    if (!this.rgb || !this.depth || this.disposed) return;
    this.depth.currentTime = this.rgb.currentTime;
    try {
      await Promise.all([this.rgb.play(), this.depth.play()]);
      this.playing = true;
      this.startLoop();
    } catch (error) {
      this.playing = false;
      this.options.onError?.(error instanceof Error ? error : new Error('Playback was blocked'));
    }
  }

  pause(): void {
    this.playing = false;
    this.rgb?.pause();
    this.depth?.pause();
    this.stopLoop();
    this.uploadIfReady();
    this.renderer.render();
  }

  /** Seek both videos; coalesces rapid scrubs. */
  async seek(time: number): Promise<void> {
    if (!this.rgb || !this.depth) return;
    const target = Math.max(0, Math.min(time, Math.max(0, this.duration - 0.001)));
    if (this.seeking) {
      this.pendingSeek = target;
      return;
    }
    this.seeking = true;
    try {
      let next: number | null = target;
      while (next !== null && !this.disposed) {
        const t = next;
        next = null;
        await Promise.all([seekElement(this.rgb, t), seekElement(this.depth, t)]);
        this.uploadIfReady(true);
        this.renderer.render();
        this.options.onTime?.(this.rgb.currentTime, this.duration);
        if (this.pendingSeek !== null) {
          next = this.pendingSeek;
          this.pendingSeek = null;
        }
      }
    } finally {
      this.seeking = false;
    }
  }

  /** Render one frame with the current textures (e.g. after a camera change). */
  render(): void {
    this.renderer.render();
  }

  private uploadIfReady(force = false): void {
    if (!this.rgb || !this.depth || this.rgb.readyState < 2 || this.depth.readyState < 2) return;
    const t = this.rgb.currentTime;
    if (!force && Math.abs(t - this.lastUploadedTime) < 1e-4) return;
    this.renderer.uploadFrames(this.rgb, this.depth);
    this.lastUploadedTime = t;
  }

  private startLoop(): void {
    this.stopLoop();
    const tick = () => {
      if (this.disposed || !this.playing || !this.rgb || !this.depth) return;
      // Keep the depth clip locked to the colour clip.
      if (Math.abs(this.depth.currentTime - this.rgb.currentTime) > SYNC_TOLERANCE_SECONDS) {
        this.depth.currentTime = this.rgb.currentTime;
      }
      this.uploadIfReady();
      this.renderer.render();
      this.options.onTime?.(this.rgb.currentTime, this.duration);
      this.frameHandle = requestAnimationFrame(tick);
    };
    this.frameHandle = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    for (const video of [this.rgb, this.depth]) {
      if (!video) continue;
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    this.rgb = null;
    this.depth = null;
    this.renderer.dispose();
  }
}

function seekElement(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 1e-4 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.currentTime = time;
    setTimeout(done, 2_000);
  });
}
