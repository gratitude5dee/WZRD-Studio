import { describe, expect, it } from 'vitest';

import {
  clampTime,
  easeInOutCubic,
  easeOutQuint,
  formatTimecode,
  keyframeTimes,
  resolveBlend,
  stepKeyframe,
  wrapTime,
} from '@/lib/motion-splat/timeline';
import { MAX_KEYFRAME_COUNT, MIN_KEYFRAME_COUNT } from '@/lib/motion-splat/constants';

describe('keyframeTimes', () => {
  it('spaces keyframes evenly and keeps a margin from the end', () => {
    const times = keyframeTimes(4, 5, 0.05);
    expect(Array.from(times).map((t) => Number(t.toFixed(4)))).toEqual([0, 0.9875, 1.975, 2.9625, 3.95]);
  });

  it('clamps the count to the supported range', () => {
    expect(keyframeTimes(10, 1).length).toBe(MIN_KEYFRAME_COUNT);
    expect(keyframeTimes(10, 999).length).toBe(MAX_KEYFRAME_COUNT);
  });

  it('never produces negative times for tiny clips', () => {
    const times = keyframeTimes(0.01, 4);
    expect(Array.from(times).every((t) => t >= 0)).toBe(true);
  });
});

describe('resolveBlend', () => {
  const times = [0, 1, 2, 4];

  it('clamps below and above the range', () => {
    expect(resolveBlend(-1, times)).toEqual({ index: 0, next: 0, mix: 0 });
    expect(resolveBlend(0, times)).toEqual({ index: 0, next: 0, mix: 0 });
    expect(resolveBlend(9, times)).toEqual({ index: 3, next: 3, mix: 0 });
  });

  it('interpolates inside a segment', () => {
    expect(resolveBlend(0.25, times)).toEqual({ index: 0, next: 1, mix: 0.25 });
    expect(resolveBlend(3, times)).toEqual({ index: 2, next: 3, mix: 0.5 });
    expect(resolveBlend(1, times)).toEqual({ index: 1, next: 2, mix: 0 });
  });

  it('handles degenerate inputs', () => {
    expect(resolveBlend(1, [])).toEqual({ index: 0, next: 0, mix: 0 });
    expect(resolveBlend(1, [3])).toEqual({ index: 0, next: 0, mix: 0 });
    expect(resolveBlend(1, [1, 1, 2]).mix).toBe(0);
  });
});

describe('wrapTime / clampTime', () => {
  it('wraps when looping and clamps otherwise', () => {
    expect(wrapTime(4.5, 4, true)).toBeCloseTo(0.5, 6);
    expect(wrapTime(-0.5, 4, true)).toBeCloseTo(3.5, 6);
    expect(wrapTime(4.5, 4, false)).toBe(4);
    expect(wrapTime(-1, 4, false)).toBe(0);
    expect(wrapTime(1, 0, true)).toBe(0);
    expect(clampTime(NaN, 4)).toBe(0);
    expect(clampTime(7, 4)).toBe(4);
  });
});

describe('formatTimecode', () => {
  it('formats minutes, seconds and frames', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00');
    expect(formatTimecode(65.5, 30)).toBe('01:05:15');
    expect(formatTimecode(3.999, 24)).toBe('00:03:23');
    expect(formatTimecode(-2, 30)).toBe('00:00:00');
  });
});

describe('easing', () => {
  it('is monotonic and bounded', () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easeInOutCubic(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeOutQuint(1)).toBe(1);
    expect(easeOutQuint(2)).toBe(1);
  });
});

describe('stepKeyframe', () => {
  const times = [0, 1, 2];
  it('moves to the neighbouring keyframe and clamps at the ends', () => {
    expect(stepKeyframe(0.5, times, 1)).toBe(1);
    expect(stepKeyframe(1, times, 1)).toBe(2);
    expect(stepKeyframe(2, times, 1)).toBe(2);
    expect(stepKeyframe(1.5, times, -1)).toBe(1);
    expect(stepKeyframe(0, times, -1)).toBe(0);
    expect(stepKeyframe(0.5, [], 1)).toBe(0.5);
  });
});
