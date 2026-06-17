import { describe, expect, it } from 'vitest';

import {
  frameToMs,
  formatTimecode,
  msToFrame,
  msToSeconds,
  secondsToMs,
  snapMsToFrame,
} from '../time';

describe('editor time helpers', () => {
  it('converts between milliseconds, seconds, and frames without changing the canonical ms unit', () => {
    expect(msToSeconds(1234)).toBeCloseTo(1.234, 6);
    expect(secondsToMs(1.234)).toBe(1234);
    expect(msToFrame(1000, 30)).toBe(30);
    expect(frameToMs(30, 30)).toBe(1000);
  });

  it('snaps millisecond values to the nearest frame boundary', () => {
    expect(snapMsToFrame(1016, 30)).toBe(1000);
    expect(snapMsToFrame(1034, 30)).toBe(1033);
    expect(snapMsToFrame(1049, 24)).toBe(1042);
  });

  it('formats minute, second, and frame precision timecodes', () => {
    expect(formatTimecode(61_023)).toBe('01:01.02');
    expect(formatTimecode(3_661_234)).toBe('01:01:01.23');
    expect(formatTimecode(1_000, 30, 'frames')).toBe('00:01:00');
  });
});
