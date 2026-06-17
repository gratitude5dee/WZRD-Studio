import { formatTimecode } from './time';

export type TimelineZoomMode = 'overview' | 'minutes' | 'seconds' | 'frames';

export interface TimelineTickScaleInput {
  pixelsPerSecond: number;
  fps: number;
  durationMs: number;
}

export interface TimelineTickScale {
  mode: TimelineZoomMode;
  majorStepMs: number;
  minorStepMs: number;
  labelEveryMajor: number;
}

export interface TimelineTick {
  timeMs: number;
  x: number;
  kind: 'major' | 'minor' | 'frame';
  label?: string;
}

export interface GenerateTimelineTicksInput extends TimelineTickScaleInput {
  scrollLeft: number;
  viewportWidth: number;
}

export interface ZoomAroundTimeInput {
  currentPixelsPerSecond: number;
  nextPixelsPerSecond: number;
  anchorTimeMs: number;
  viewportAnchorX: number;
}

const safePositive = (value: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

export function timeToX(ms: number, pixelsPerSecond: number): number {
  return (Math.max(0, ms) / 1000) * safePositive(pixelsPerSecond, 1);
}

export function xToTimeMs(x: number, pixelsPerSecond: number): number {
  return Math.max(0, Math.round((Math.max(0, x) / safePositive(pixelsPerSecond, 1)) * 1000));
}

export function chooseTimelineTickScale({ pixelsPerSecond, fps }: TimelineTickScaleInput): TimelineTickScale {
  const pps = safePositive(pixelsPerSecond, 1);
  const frameMs = 1000 / safePositive(fps, 30);

  if (pps >= 600) {
    return { mode: 'frames', majorStepMs: 1000, minorStepMs: frameMs, labelEveryMajor: 1 };
  }
  if (pps >= 40) {
    return { mode: 'seconds', majorStepMs: 1000, minorStepMs: 500, labelEveryMajor: 1 };
  }
  if (pps >= 2) {
    return { mode: 'seconds', majorStepMs: 10_000, minorStepMs: 5_000, labelEveryMajor: 1 };
  }
  if (pps >= 0.5) {
    return { mode: 'minutes', majorStepMs: 30_000, minorStepMs: 10_000, labelEveryMajor: 2 };
  }
  return { mode: 'overview', majorStepMs: 60_000, minorStepMs: 30_000, labelEveryMajor: 1 };
}

function alignDown(value: number, step: number): number {
  return Math.max(0, Math.floor(value / step) * step);
}

function tickLabel(timeMs: number, scale: TimelineTickScale, fps: number) {
  if (scale.mode === 'frames') return formatTimecode(timeMs, fps, timeMs % 1000 === 0 ? 'clock' : 'frames');
  const totalSeconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function generateTimelineTicks(input: GenerateTimelineTicksInput): TimelineTick[] {
  const durationMs = Math.max(0, input.durationMs);
  const pps = safePositive(input.pixelsPerSecond, 1);
  const scale = chooseTimelineTickScale(input);
  const startMs = xToTimeMs(input.scrollLeft, pps);
  const endMs = Math.min(durationMs, xToTimeMs(input.scrollLeft + input.viewportWidth, pps));
  const step = scale.minorStepMs;
  const ticks: TimelineTick[] = [];

  for (let timeMs = alignDown(startMs, step); timeMs <= endMs + step; timeMs += step) {
    if (timeMs < 0 || timeMs > durationMs) continue;
    const major = Math.abs(timeMs % scale.majorStepMs) < 0.001;
    const x = timeToX(timeMs, pps) - input.scrollLeft;
    if (x < -1 || x > input.viewportWidth + 1) continue;
    ticks.push({
      timeMs,
      x,
      kind: scale.mode === 'frames' && !major ? 'frame' : major ? 'major' : 'minor',
      label: major ? tickLabel(timeMs, scale, input.fps) : undefined,
    });
  }

  return ticks;
}

export function fitProject(durationMs: number, viewportWidth: number): number {
  const seconds = Math.max(1, durationMs / 1000);
  return safePositive(viewportWidth, 1) / seconds;
}

export function fitSelection(startMs: number, endMs: number, viewportWidth: number): number {
  return fitProject(Math.max(1000, endMs - startMs), viewportWidth);
}

export function zoomAroundTime(input: ZoomAroundTimeInput) {
  const nextPixelsPerSecond = safePositive(input.nextPixelsPerSecond, input.currentPixelsPerSecond);
  const anchorX = timeToX(input.anchorTimeMs, nextPixelsPerSecond);
  return {
    pixelsPerSecond: nextPixelsPerSecond,
    scrollLeft: Math.max(0, anchorX - Math.max(0, input.viewportAnchorX)),
  };
}
