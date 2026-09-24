// ---------------------------------------------------------------------------
// Browser-side keyframe extraction from <video> elements.
//
// Seeking a paused video and immediately drawing it is NOT reliable: Chromium
// can report `seeked` before the new frame is presented and `drawImage` then
// repeats the previous frame. The recipe below (wait for buffering, seek, wait
// for a presented frame, wait two animation frames) was verified against
// Chromium; a duplicate-frame guard replays the seek via play()/pause() once.
// ---------------------------------------------------------------------------

import type { DepthEncoding, MotionSplatCamera, MotionSplatGrid } from '@/types/motionSplat';
import { buildRgbdFrame, type BuildRgbdFrameOptions, type RgbdFrame } from './unproject';

export interface FrameSamplerProgress {
  /** 0..1 */
  value: number;
  label: string;
}

export interface LoadVideoOptions {
  crossOrigin?: '' | 'anonymous' | 'use-credentials';
  signal?: AbortSignal;
  /** Milliseconds to wait for metadata before failing. */
  timeoutMs?: number;
}

function once<T extends Event>(target: EventTarget, type: string, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onEvent = (event: Event) => {
      cleanup();
      resolve(event as T);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const cleanup = () => {
      target.removeEventListener(type, onEvent);
      signal?.removeEventListener('abort', onAbort);
    };
    target.addEventListener(type, onEvent, { once: true });
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Create a detached, muted video element and wait for its metadata. */
export async function loadVideoElement(url: string, options: LoadVideoOptions = {}): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = options.crossOrigin ?? 'anonymous';
  video.src = url;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const errorPromise = once(video, 'error', options.signal).then(() => {
    throw new Error(`Could not load video: ${url}`);
  });
  const timeoutPromise = delay(timeoutMs).then(() => {
    throw new Error(`Timed out loading video metadata: ${url}`);
  });
  if (video.readyState < 1) {
    await Promise.race([once(video, 'loadedmetadata', options.signal), errorPromise, timeoutPromise]);
  }
  return video;
}

async function waitUntilBuffered(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  if (video.readyState >= 4) return;
  await Promise.race([once(video, 'canplaythrough', signal), once(video, 'canplay', signal).then(() => delay(150))]);
}

async function waitForPresentedFrame(video: HTMLVideoElement): Promise<void> {
  const withCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  };
  if (typeof withCallback.requestVideoFrameCallback === 'function') {
    await Promise.race([new Promise<void>((resolve) => withCallback.requestVideoFrameCallback!(() => resolve())), delay(150)]);
  }
  await nextFrames(2);
}

export async function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  const target = Math.max(0, Math.min(time, Math.max(0, (video.duration || time) - 0.001)));
  if (Math.abs(video.currentTime - target) > 1e-4 || video.readyState < 2) {
    const seeked = once(video, 'seeked', signal);
    video.currentTime = target;
    await Promise.race([seeked, delay(5_000).then(() => {
      throw new Error(`Timed out seeking video to ${target.toFixed(3)}s`);
    })]);
  }
  await waitForPresentedFrame(video);
}

/** Cheap content hash used to detect a repeated frame after a seek. */
export function hashPixels(pixels: ArrayLike<number>): number {
  let h = 2166136261;
  const step = Math.max(1, Math.floor(pixels.length / 4096)) * 4 + 1;
  for (let i = 0; i < pixels.length; i += step) {
    h ^= pixels[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function replaySeek(video: HTMLVideoElement, time: number): Promise<void> {
  // Fallback: play forward until the presented frame reaches `time`, then pause.
  const withCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  };
  try {
    video.currentTime = Math.max(0, time - 0.05);
    await video.play();
    if (typeof withCallback.requestVideoFrameCallback === 'function') {
      await Promise.race([
        new Promise<void>((resolve) => {
          const cb = (_now: number, meta: { mediaTime: number }) => {
            if (meta.mediaTime >= time - 0.02) resolve();
            else withCallback.requestVideoFrameCallback!(cb);
          };
          withCallback.requestVideoFrameCallback!(cb);
        }),
        delay(1_500),
      ]);
    } else {
      await delay(120);
    }
  } finally {
    video.pause();
  }
}

export interface SampleVideoFramesOptions {
  grid: MotionSplatGrid;
  signal?: AbortSignal;
  onProgress?: (progress: FrameSamplerProgress) => void;
  label?: string;
}

/**
 * Draw the video at each requested time into a `cols × rows` canvas and return
 * the RGBA pixels per sample. Frames are guaranteed distinct where the source
 * has motion; a repeated frame triggers one play/pause replay.
 */
export async function sampleVideoFrames(
  video: HTMLVideoElement,
  times: ArrayLike<number>,
  options: SampleVideoFramesOptions,
): Promise<Uint8ClampedArray[]> {
  const { cols, rows } = options.grid;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');

  await waitUntilBuffered(video, options.signal);
  const samples: Uint8ClampedArray[] = [];
  let previousHash = -1;
  let previousTime = -1;
  for (let k = 0; k < times.length; k++) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const t = times[k];
    await seekVideo(video, t, options.signal);
    ctx.drawImage(video, 0, 0, cols, rows);
    let pixels = ctx.getImageData(0, 0, cols, rows).data;
    let hash = hashPixels(pixels);
    if (k > 0 && hash === previousHash && t - previousTime > 1 / 30) {
      await replaySeek(video, t);
      ctx.drawImage(video, 0, 0, cols, rows);
      pixels = ctx.getImageData(0, 0, cols, rows).data;
      hash = hashPixels(pixels);
    }
    previousHash = hash;
    previousTime = t;
    samples.push(pixels);
    options.onProgress?.({ value: (k + 1) / times.length, label: options.label ?? 'Sampling frames' });
  }
  return samples;
}

export interface ExtractRgbdKeyframesOptions extends BuildRgbdFrameOptions {
  videoUrl: string;
  depthVideoUrl: string;
  times: ArrayLike<number>;
  grid: MotionSplatGrid;
  camera: MotionSplatCamera;
  encoding: DepthEncoding;
  signal?: AbortSignal;
  onProgress?: (progress: FrameSamplerProgress) => void;
}

export interface ExtractedRgbdKeyframes {
  frames: RgbdFrame[];
  duration: number;
  width: number;
  height: number;
}

/** Full RGB-D keyframe pipeline: load both videos, sample them, unproject each pair. */
export async function extractRgbdKeyframes(options: ExtractRgbdKeyframesOptions): Promise<ExtractedRgbdKeyframes> {
  const [rgbVideo, depthVideo] = await Promise.all([
    loadVideoElement(options.videoUrl, { signal: options.signal }),
    loadVideoElement(options.depthVideoUrl, { signal: options.signal }),
  ]);
  try {
    const report = (phase: number, value: number, label: string) =>
      options.onProgress?.({ value: phase * 0.5 + value * 0.5, label });
    const rgb = await sampleVideoFrames(rgbVideo, options.times, {
      grid: options.grid,
      signal: options.signal,
      label: 'Sampling colour frames',
      onProgress: (p) => report(0, p.value, p.label),
    });
    const depth = await sampleVideoFrames(depthVideo, options.times, {
      grid: options.grid,
      signal: options.signal,
      label: 'Sampling depth frames',
      onProgress: (p) => report(1, p.value, p.label),
    });
    const frames = rgb.map((pixels, k) =>
      buildRgbdFrame(pixels, depth[k], options.grid, options.camera, options.encoding, {
        edgeThreshold: options.edgeThreshold,
        edgeAlpha: options.edgeAlpha,
      }),
    );
    return {
      frames,
      duration: Math.min(rgbVideo.duration || 0, depthVideo.duration || rgbVideo.duration || 0),
      width: rgbVideo.videoWidth,
      height: rgbVideo.videoHeight,
    };
  } finally {
    for (const video of [rgbVideo, depthVideo]) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }
}

/** Capture PNG blobs of a video at the given times (keyframes for TripoSplat). */
export async function captureVideoStills(
  video: HTMLVideoElement,
  times: ArrayLike<number>,
  options: { maxWidth?: number; signal?: AbortSignal; onProgress?: (p: FrameSamplerProgress) => void } = {},
): Promise<Blob[]> {
  const maxWidth = options.maxWidth ?? 1024;
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  await waitUntilBuffered(video, options.signal);
  const blobs: Blob[] = [];
  for (let k = 0; k < times.length; k++) {
    await seekVideo(video, times[k], options.signal);
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas capture failed'))), 'image/png'),
    );
    blobs.push(blob);
    options.onProgress?.({ value: (k + 1) / times.length, label: 'Capturing keyframes' });
  }
  return blobs;
}
