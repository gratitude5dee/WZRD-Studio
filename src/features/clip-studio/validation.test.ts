import { describe, expect, it } from 'vitest';

import { createTimestampClipCandidates, normalizeClipCandidates, parseTimestamp, parseTimestampRanges } from './validation';
import type { VideoSource } from './types';

const source: VideoSource = {
  id: 'source-1',
  type: 'local',
  name: 'source.mp4',
  importedAt: '2026-05-25T00:00:00.000Z',
  durationSeconds: 600,
  status: 'ready',
};

describe('Clip Studio candidate validation', () => {
  it('parses numeric, mm:ss, and hh:mm:ss timestamps', () => {
    expect(parseTimestamp('12.5')).toBe(12.5);
    expect(parseTimestamp('2:03')).toBe(123);
    expect(parseTimestamp('1:02:03')).toBe(3723);
  });

  it('enforces viral duration limits and removes exact duplicates', () => {
    const result = normalizeClipCandidates(
      [
        { title: 'Too long', startSeconds: 10, endSeconds: 140, score: 88 },
        { title: 'Too short', startSeconds: 200, endSeconds: 210, score: 70 },
        { title: 'Duplicate', startSeconds: 200, endSeconds: 210, score: 60 },
      ],
      source,
    );

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      title: 'Too long',
      startSeconds: 10,
      endSeconds: 70,
      durationSeconds: 60,
    });
    expect(result.candidates[0].warnings.join(' ')).toMatch(/trimmed/i);
    expect(result.candidates[1].warnings.join(' ')).toMatch(/shorter than 15/i);
    expect(result.warnings.join(' ')).toMatch(/Removed duplicate/i);
  });

  it('warns on overlaps without deleting editorially distinct clips', () => {
    const result = normalizeClipCandidates(
      [
        { title: 'Hook', startSeconds: 30, endSeconds: 70 },
        { title: 'Payoff', startSeconds: 60, endSeconds: 95 },
      ],
      source,
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.warnings.join(' ')).toMatch(/Overlaps/);
    expect(result.candidates[1].warnings.join(' ')).toMatch(/Overlaps/);
  });

  it('normalizes candidate evidence fields from GMI output', () => {
    const result = normalizeClipCandidates(
      [
        {
          title: 'Replay spike',
          startSeconds: 42,
          endSeconds: 82,
          signalBadges: ['viewmap_peak', 'transcript_hook'],
          viewmapScore: 106,
          viewmapPeakRank: 1.2,
          evidenceSummary: 'Replay spike plus quotable line.',
          confidence: 88,
        },
      ],
      source,
    );

    expect(result.candidates[0]).toMatchObject({
      signalBadges: ['viewmap_peak', 'transcript_hook'],
      viewmapScore: 100,
      viewmapPeakRank: 1,
      evidenceSummary: 'Replay spike plus quotable line.',
      confidence: 88,
    });
  });

  it('preserves caption-style candidate titles with hashtags', () => {
    const captionTitle = 'Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou';
    const result = normalizeClipCandidates(
      [
        {
          title: captionTitle,
          startSeconds: 42,
          endSeconds: 82,
          score: 94,
        },
      ],
      source,
    );

    expect(result.candidates[0]?.title).toBe(captionTitle);
  });

  it('parses timestamp ranges from editor text and reports unusable lines', () => {
    const result = parseTimestampRanges(
      [
        '4:05 - 4:20',
        '[4:40-6:10] Crowd reaction',
        '10:30 - 11:30',
        '25:00 - 26:30',
        '27:27 - 28:28',
        '28:48 - 30:16',
        'bad timestamp line',
        '5:00 - 4:00',
        '1:31:00 - 1:32:00',
      ].join('\n'),
      { durationSeconds: 5400 },
    );

    expect(result.ranges).toHaveLength(6);
    expect(result.ranges[0]).toMatchObject({ startSeconds: 245, endSeconds: 260, label: 'Timestamp clip 1' });
    expect(result.ranges[1]).toMatchObject({ startSeconds: 280, endSeconds: 370, label: 'Crowd reaction' });
    expect(result.warnings.join(' ')).toMatch(/Line 7/);
    expect(result.warnings.join(' ')).toMatch(/Line 8/);
    expect(result.warnings.join(' ')).toMatch(/Line 9/);
  });

  it('creates included timestamp candidates without GMI analysis', () => {
    const parsed = parseTimestampRanges('Hook 0:12 - 0:30\n0:45 - 1:05', source);
    const candidates = createTimestampClipCandidates(parsed.ranges, source, {
      platformPreset: 'shorts',
      existingCount: 2,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      sourceId: source.id,
      title: 'Hook',
      startSeconds: 12,
      endSeconds: 30,
      include: true,
      source: 'timestamp',
      order: 3,
    });
    expect(candidates[1]).toMatchObject({
      title: 'Timestamp clip 2',
      source: 'timestamp',
      order: 4,
    });
  });

  it('applies 15-60 second length warnings to timestamp candidates', () => {
    const parsed = parseTimestampRanges('Long clip 0:00 - 1:30\nTiny clip 2:00 - 2:08', source);
    const candidates = createTimestampClipCandidates(parsed.ranges, source, {
      platformPreset: 'tiktok',
    });

    expect(candidates[0]).toMatchObject({
      title: 'Long clip',
      startSeconds: 0,
      endSeconds: 60,
      durationSeconds: 60,
    });
    expect(candidates[0].warnings.join(' ')).toMatch(/60 seconds/i);
    expect(candidates[1].warnings.join(' ')).toMatch(/shorter than 15/i);
  });
});
