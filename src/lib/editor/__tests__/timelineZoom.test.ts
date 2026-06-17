import { describe, expect, it } from 'vitest';

import {
  chooseTimelineTickScale,
  fitProject,
  fitSelection,
  generateTimelineTicks,
  timeToX,
  xToTimeMs,
  zoomAroundTime,
} from '../timelineZoom';

describe('timeline zoom helpers', () => {
  it('converts between time and horizontal position using pixels per second', () => {
    expect(timeToX(30_000, 2)).toBe(60);
    expect(xToTimeMs(60, 2)).toBe(30_000);
  });

  it('chooses minute ticks for long overview zoom', () => {
    const scale = chooseTimelineTickScale({ pixelsPerSecond: 0.25, fps: 30, durationMs: 90 * 60_000 });
    expect(scale.mode).toBe('overview');
    expect(scale.majorStepMs).toBe(60_000);
    expect(scale.minorStepMs).toBe(30_000);
  });

  it('chooses second and frame ticks as the user zooms in', () => {
    expect(chooseTimelineTickScale({ pixelsPerSecond: 8, fps: 30, durationMs: 5 * 60_000 })).toMatchObject({
      mode: 'seconds',
      majorStepMs: 10_000,
    });
    expect(chooseTimelineTickScale({ pixelsPerSecond: 80, fps: 30, durationMs: 30_000 })).toMatchObject({
      mode: 'seconds',
      majorStepMs: 1_000,
    });
    expect(chooseTimelineTickScale({ pixelsPerSecond: 1200, fps: 30, durationMs: 5_000 })).toMatchObject({
      mode: 'frames',
      minorStepMs: 1000 / 30,
    });
  });

  it('generates visible ticks for the current viewport range', () => {
    const ticks = generateTimelineTicks({
      durationMs: 120_000,
      fps: 30,
      pixelsPerSecond: 2,
      scrollLeft: 30,
      viewportWidth: 120,
    });
    expect(ticks[0].timeMs).toBeGreaterThanOrEqual(0);
    expect(ticks.some((tick) => tick.label === '01:00')).toBe(true);
    expect(ticks.every((tick) => tick.x >= -1 && tick.x <= 121)).toBe(true);
  });

  it('fits a full project or selected range into a viewport', () => {
    expect(fitProject(90 * 60_000, 900)).toBeCloseTo(1 / 6, 4);
    expect(fitSelection(60_000, 90_000, 900)).toBe(30);
  });

  it('keeps the same anchor time under the cursor when zooming', () => {
    const result = zoomAroundTime({
      currentPixelsPerSecond: 10,
      nextPixelsPerSecond: 40,
      anchorTimeMs: 30_000,
      viewportAnchorX: 250,
    });
    expect(result.scrollLeft).toBe(950);
  });
});
