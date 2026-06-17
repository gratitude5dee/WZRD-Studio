import {
  chooseTimelineTickScale,
  fitProject,
  fitSelection,
  generateTimelineTicks,
  timeToX,
  xToTimeMs,
  type TimelineTick,
  type TimelineZoomMode,
} from '@/lib/editor/timelineZoom';

export const EDITOR_TIMELINE_DEFAULT_PIXELS_PER_SECOND = 70;
export const EDITOR_TIMELINE_MIN_PIXELS_PER_SECOND = 0.12;
export const EDITOR_TIMELINE_MAX_PIXELS_PER_SECOND = 1200;

export interface EditorTimelineMetricsInput {
  durationMs: number;
  fps: number;
  pixelsPerSecond: number;
  scrollLeft: number;
  viewportWidth: number;
}

export interface EditorTimelineTick extends TimelineTick {
  contentX: number;
}

export interface EditorTimelineMetrics {
  pixelsPerSecond: number;
  pixelsPerMs: number;
  timelineWidth: number;
  mode: TimelineZoomMode;
  ticks: EditorTimelineTick[];
}

export function clampEditorTimelinePixelsPerSecond(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return EDITOR_TIMELINE_DEFAULT_PIXELS_PER_SECOND;
  return Math.min(EDITOR_TIMELINE_MAX_PIXELS_PER_SECOND, Math.max(EDITOR_TIMELINE_MIN_PIXELS_PER_SECOND, value));
}

export function editorPixelsPerMs(pixelsPerSecond: number): number {
  return clampEditorTimelinePixelsPerSecond(pixelsPerSecond) / 1000;
}

export function editorTimeToX(ms: number, pixelsPerSecond: number): number {
  return timeToX(ms, clampEditorTimelinePixelsPerSecond(pixelsPerSecond));
}

export function editorXToTimeMs(x: number, pixelsPerSecond: number): number {
  return xToTimeMs(x, clampEditorTimelinePixelsPerSecond(pixelsPerSecond));
}

export function fitEditorProject(durationMs: number, viewportWidth: number): number {
  return clampEditorTimelinePixelsPerSecond(fitProject(durationMs, viewportWidth));
}

export function fitEditorSelection(startMs: number, endMs: number, viewportWidth: number): number {
  return clampEditorTimelinePixelsPerSecond(fitSelection(startMs, endMs, viewportWidth));
}

export function buildEditorTimelineMetrics(input: EditorTimelineMetricsInput): EditorTimelineMetrics {
  const pixelsPerSecond = clampEditorTimelinePixelsPerSecond(input.pixelsPerSecond);
  const viewportWidth = Math.max(1, input.viewportWidth);
  const durationMs = Math.max(0, input.durationMs);
  const timelineWidth = Math.max(viewportWidth, editorTimeToX(durationMs, pixelsPerSecond));
  const scale = chooseTimelineTickScale({
    durationMs,
    fps: input.fps,
    pixelsPerSecond,
  });
  const ticks = generateTimelineTicks({
    durationMs,
    fps: input.fps,
    pixelsPerSecond,
    scrollLeft: Math.max(0, input.scrollLeft),
    viewportWidth,
  }).map((tick) => ({
    ...tick,
    contentX: tick.x + Math.max(0, input.scrollLeft),
  }));

  return {
    pixelsPerSecond,
    pixelsPerMs: pixelsPerSecond / 1000,
    timelineWidth,
    mode: scale.mode,
    ticks,
  };
}
