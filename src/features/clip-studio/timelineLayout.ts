import { snapMsToFrame } from '@/lib/editor/time';
import {
  chooseTimelineTickScale,
  fitProject,
  generateTimelineTicks,
  timeToX,
  xToTimeMs,
  type TimelineTick,
  type TimelineZoomMode,
} from '@/lib/editor/timelineZoom';

import type { ClipCandidate } from './types';

export const CLIPPER_MIN_PIXELS_PER_SECOND = 0.12;
export const CLIPPER_SECOND_PIXELS_PER_SECOND = 80;
export const CLIPPER_FRAME_PIXELS_PER_SECOND = 720;
export const CLIPPER_MAX_PIXELS_PER_SECOND = 1200;

export type ClipperZoomPreset = 'fit' | 'min' | 'sec' | 'frame';

export interface ClipperTimelineClipLayout {
  id: string;
  left: number;
  width: number;
  source: ClipCandidate['source'];
  include: boolean;
}

export interface ClipperTimelineLayout {
  contentWidth: number;
  playheadX: number;
  mode: TimelineZoomMode;
  ticks: TimelineTick[];
  clips: ClipperTimelineClipLayout[];
}

export interface ClipperTimelineLayoutInput {
  candidates: ClipCandidate[];
  durationSeconds: number;
  fps?: number;
  pixelsPerSecond: number;
  scrollLeft: number;
  viewportWidth: number;
  playheadSeconds: number;
}

export interface ClipperPointerTimeInput {
  localX: number;
  scrollLeft: number;
  pixelsPerSecond: number;
  durationSeconds: number;
  fps?: number;
  candidates: ClipCandidate[];
  disableSnapping?: boolean;
}

function finitePositive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function clampClipperPixelsPerSecond(value: number): number {
  return clamp(finitePositive(value, CLIPPER_SECOND_PIXELS_PER_SECOND), CLIPPER_MIN_PIXELS_PER_SECOND, CLIPPER_MAX_PIXELS_PER_SECOND);
}

export function getClipperZoomPreset(
  preset: ClipperZoomPreset,
  input: { durationSeconds: number; viewportWidth: number; fps?: number },
): number {
  if (preset === 'min') return CLIPPER_MIN_PIXELS_PER_SECOND;
  if (preset === 'sec') return CLIPPER_SECOND_PIXELS_PER_SECOND;
  if (preset === 'frame') return CLIPPER_FRAME_PIXELS_PER_SECOND;

  const durationMs = Math.max(1000, finitePositive(input.durationSeconds, 1) * 1000);
  return clampClipperPixelsPerSecond(fitProject(durationMs, Math.max(1, input.viewportWidth)));
}

export function createClipperTimelineLayout(input: ClipperTimelineLayoutInput): ClipperTimelineLayout {
  const durationMs = Math.max(1000, finitePositive(input.durationSeconds, 1) * 1000);
  const fps = finitePositive(input.fps, 30);
  const pixelsPerSecond = clampClipperPixelsPerSecond(input.pixelsPerSecond);
  const scrollLeft = Math.max(0, input.scrollLeft);
  const viewportWidth = Math.max(1, input.viewportWidth);
  const scale = chooseTimelineTickScale({ durationMs, fps, pixelsPerSecond });

  return {
    contentWidth: Math.max(viewportWidth, timeToX(durationMs, pixelsPerSecond)),
    playheadX: timeToX(clamp(input.playheadSeconds, 0, durationMs / 1000) * 1000, pixelsPerSecond),
    mode: scale.mode,
    ticks: generateTimelineTicks({
      durationMs,
      fps,
      pixelsPerSecond,
      scrollLeft,
      viewportWidth,
    }),
    clips: input.candidates.map((candidate) => ({
      id: candidate.id,
      left: timeToX(candidate.startSeconds * 1000, pixelsPerSecond),
      width: Math.max(8, timeToX(candidate.durationSeconds * 1000, pixelsPerSecond)),
      source: candidate.source,
      include: candidate.include,
    })),
  };
}

function nearestClipEdgeMs(rawMs: number, candidates: ClipCandidate[], thresholdMs: number): number | null {
  let nearest: { value: number; distance: number } | null = null;
  candidates.forEach((candidate) => {
    [candidate.startSeconds, candidate.endSeconds].forEach((seconds) => {
      const value = seconds * 1000;
      const distance = Math.abs(value - rawMs);
      if (distance <= thresholdMs && (!nearest || distance < nearest.distance)) {
        nearest = { value, distance };
      }
    });
  });
  return nearest?.value ?? null;
}

export function resolveClipperPointerTime(input: ClipperPointerTimeInput): number {
  const durationMs = Math.max(1000, finitePositive(input.durationSeconds, 1) * 1000);
  const fps = finitePositive(input.fps, 30);
  const pixelsPerSecond = clampClipperPixelsPerSecond(input.pixelsPerSecond);
  const rawMs = clamp(xToTimeMs(Math.max(0, input.localX) + Math.max(0, input.scrollLeft), pixelsPerSecond), 0, durationMs);

  if (input.disableSnapping) {
    return roundSeconds(rawMs / 1000);
  }

  const edgeThresholdMs = clamp((10 / pixelsPerSecond) * 1000, 60, 10_000);
  const edgeMs = nearestClipEdgeMs(rawMs, input.candidates, edgeThresholdMs);
  if (edgeMs !== null) {
    return roundSeconds(clamp(edgeMs, 0, durationMs) / 1000);
  }

  const snappedMs = pixelsPerSecond >= CLIPPER_FRAME_PIXELS_PER_SECOND
    ? snapMsToFrame(rawMs, fps)
    : Math.round(rawMs / 1000) * 1000;
  return roundSeconds(clamp(snappedMs, 0, durationMs) / 1000);
}
