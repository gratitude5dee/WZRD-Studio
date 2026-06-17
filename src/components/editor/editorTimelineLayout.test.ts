import { describe, expect, it } from 'vitest';

import {
  buildEditorTimelineMetrics,
  clampEditorTimelinePixelsPerSecond,
  editorPixelsPerMs,
  editorTimeToX,
  editorXToTimeMs,
  fitEditorProject,
  fitEditorSelection,
} from './editorTimelineLayout';

describe('editor timeline layout', () => {
  it('uses shared milliseconds-to-pixels conversion instead of fixed pixels-per-ms scale', () => {
    expect(editorTimeToX(10_000, 40)).toBe(400);
    expect(editorXToTimeMs(400, 40)).toBe(10_000);
    expect(editorPixelsPerMs(40)).toBe(0.04);
  });

  it('clamps zoom to a usable range and fits project or selection into the viewport', () => {
    expect(clampEditorTimelinePixelsPerSecond(0.001)).toBe(0.12);
    expect(clampEditorTimelinePixelsPerSecond(5000)).toBe(1200);
    expect(fitEditorProject(90 * 60_000, 900)).toBeCloseTo(1 / 6, 4);
    expect(fitEditorSelection(60_000, 90_000, 900)).toBe(30);
  });

  it('builds visible adaptive ticks with content-relative positions', () => {
    const metrics = buildEditorTimelineMetrics({
      durationMs: 120_000,
      fps: 30,
      pixelsPerSecond: 2,
      scrollLeft: 30,
      viewportWidth: 120,
    });

    expect(metrics.mode).toBe('seconds');
    expect(metrics.timelineWidth).toBe(240);
    expect(metrics.ticks.some((tick) => tick.label === '01:00')).toBe(true);
    expect(metrics.ticks.every((tick) => tick.contentX >= metrics.ticks[0].contentX)).toBe(true);
  });
});
