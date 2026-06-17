import { describe, expect, it } from 'vitest';

import type { ClipCandidate } from './types';
import {
  createClipperTimelineLayout,
  getClipperZoomPreset,
  resolveClipperPointerTime,
} from './timelineLayout';

const candidate = (overrides: Partial<ClipCandidate>): ClipCandidate => ({
  id: overrides.id ?? 'clip-1',
  sourceId: 'source-1',
  title: overrides.title ?? 'Clip',
  hook: overrides.hook ?? 'Hook',
  startSeconds: overrides.startSeconds ?? 60,
  endSeconds: overrides.endSeconds ?? 90,
  durationSeconds: overrides.durationSeconds ?? 30,
  score: overrides.score ?? 80,
  reason: overrides.reason ?? 'Reason',
  archetype: overrides.archetype ?? 'moment',
  platformFit: overrides.platformFit ?? ['tiktok'],
  include: overrides.include ?? true,
  source: overrides.source ?? 'manual',
  order: overrides.order ?? 1,
  warnings: overrides.warnings ?? [],
});

describe('clipper timeline layout', () => {
  it('creates a shared pixel layout for clips, playhead, and adaptive ticks', () => {
    const layout = createClipperTimelineLayout({
      candidates: [
        candidate({ id: 'a', startSeconds: 240, endSeconds: 285, durationSeconds: 45, source: 'gmi' }),
        candidate({ id: 'b', startSeconds: 600, endSeconds: 660, durationSeconds: 60, source: 'timestamp' }),
      ],
      durationSeconds: 90 * 60,
      fps: 30,
      pixelsPerSecond: 1,
      scrollLeft: 0,
      viewportWidth: 900,
      playheadSeconds: 245,
    });

    expect(layout.mode).toBe('minutes');
    expect(layout.contentWidth).toBe(5400);
    expect(layout.playheadX).toBe(245);
    expect(layout.clips[0]).toMatchObject({ id: 'a', left: 240, width: 45, source: 'gmi' });
    expect(layout.clips[1]).toMatchObject({ id: 'b', left: 600, width: 60, source: 'timestamp' });
    expect(layout.ticks.some((tick) => tick.label === '00:00')).toBe(true);
  });

  it('computes fit, second, and frame zoom presets from shared zoom helpers', () => {
    expect(getClipperZoomPreset('fit', { durationSeconds: 5400, viewportWidth: 900 })).toBeCloseTo(1 / 6, 4);
    expect(getClipperZoomPreset('sec', { durationSeconds: 5400, viewportWidth: 900 })).toBe(80);
    expect(getClipperZoomPreset('frame', { durationSeconds: 5400, viewportWidth: 900 })).toBe(720);
  });

  it('snaps low-zoom pointer time to nearby clip edges', () => {
    const seconds = resolveClipperPointerTime({
      localX: 104,
      scrollLeft: 0,
      pixelsPerSecond: 1,
      durationSeconds: 600,
      fps: 30,
      candidates: [candidate({ startSeconds: 100, endSeconds: 160, durationSeconds: 60 })],
    });

    expect(seconds).toBe(100);
  });

  it('snaps high-zoom pointer time to frame boundaries unless disabled', () => {
    const snapped = resolveClipperPointerTime({
      localX: 242.75,
      scrollLeft: 0,
      pixelsPerSecond: 720,
      durationSeconds: 600,
      fps: 24,
      candidates: [],
    });
    const unsnapped = resolveClipperPointerTime({
      localX: 242.75,
      scrollLeft: 0,
      pixelsPerSecond: 720,
      durationSeconds: 600,
      fps: 24,
      candidates: [],
      disableSnapping: true,
    });

    expect(snapped).toBeCloseTo(8 / 24, 3);
    expect(unsnapped).toBeCloseTo(0.337, 3);
  });
});
