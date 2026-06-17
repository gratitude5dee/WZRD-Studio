import { describe, expect, it } from 'vitest';

import { clipCandidateOverlapSeconds, enforceUniqueClipCandidates } from './candidateUniqueness';
import type { ClipCandidate } from './types';

function candidate(overrides: Partial<ClipCandidate>): ClipCandidate {
  return {
    id: overrides.id ?? 'clip-1',
    sourceId: 'source-1',
    title: overrides.title ?? 'Clip',
    hook: 'Hook',
    startSeconds: overrides.startSeconds ?? 0,
    endSeconds: overrides.endSeconds ?? 30,
    durationSeconds: overrides.durationSeconds ?? ((overrides.endSeconds ?? 30) - (overrides.startSeconds ?? 0)),
    score: overrides.score ?? 70,
    reason: 'Reason',
    archetype: 'viral-moment',
    platformFit: ['tiktok'],
    include: overrides.include ?? true,
    source: overrides.source ?? 'gmi',
    order: overrides.order ?? 1,
    transcriptExcerpt: '',
    signalBadges: overrides.signalBadges,
    viewmapScore: overrides.viewmapScore,
    viewmapPeakRank: overrides.viewmapPeakRank,
    evidenceSummary: overrides.evidenceSummary,
    confidence: overrides.confidence,
    warnings: overrides.warnings ?? [],
  };
}

describe('Clip Studio candidate uniqueness', () => {
  it('computes overlap seconds between two ranges', () => {
    expect(clipCandidateOverlapSeconds(
      candidate({ startSeconds: 10, endSeconds: 20 }),
      candidate({ startSeconds: 18, endSeconds: 30 }),
    )).toBe(2);
  });

  it('does not prune candidates at the two-second overlap tolerance', () => {
    const result = enforceUniqueClipCandidates([
      candidate({ id: 'a', startSeconds: 10, endSeconds: 20 }),
      candidate({ id: 'b', startSeconds: 18, endSeconds: 40 }),
    ]);

    expect(result.candidates.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(result.removed).toEqual([]);
  });

  it('prunes candidates that overlap by more than two seconds', () => {
    const result = enforceUniqueClipCandidates([
      candidate({ id: 'a', title: 'Weaker', startSeconds: 10, endSeconds: 40, score: 80 }),
      candidate({ id: 'b', title: 'Stronger', startSeconds: 37.5, endSeconds: 60, score: 90 }),
    ]);

    expect(result.candidates.map((entry) => entry.id)).toEqual(['b']);
    expect(result.removed).toMatchObject([{ removedId: 'a', keptId: 'b', overlapSeconds: 2.5 }]);
    expect(result.warnings.join(' ')).toMatch(/Removed 1 overlapping candidate variant/);
  });

  it('clusters overlapping candidates transitively', () => {
    const result = enforceUniqueClipCandidates([
      candidate({ id: 'a', startSeconds: 0, endSeconds: 10, score: 80 }),
      candidate({ id: 'b', startSeconds: 7.5, endSeconds: 18, score: 82 }),
      candidate({ id: 'c', startSeconds: 15, endSeconds: 26, score: 90 }),
    ]);

    expect(result.candidates.map((entry) => entry.id)).toEqual(['c']);
    expect(result.removed.map((entry) => entry.removedId).sort()).toEqual(['a', 'b']);
  });

  it('uses score, confidence, viewmap rank, evidence, then original order as strength tie-breakers', () => {
    const result = enforceUniqueClipCandidates([
      candidate({ id: 'a', title: 'Earlier', startSeconds: 10, endSeconds: 40, score: 90, confidence: 80, viewmapPeakRank: 2, signalBadges: ['transcript_hook'] }),
      candidate({ id: 'b', title: 'Best viewmap', startSeconds: 12, endSeconds: 42, score: 90, confidence: 80, viewmapPeakRank: 1, signalBadges: ['viewmap_peak'] }),
      candidate({ id: 'c', title: 'Lower confidence', startSeconds: 14, endSeconds: 44, score: 90, confidence: 70, viewmapPeakRank: 1 }),
    ]);

    expect(result.candidates.map((entry) => entry.id)).toEqual(['b']);
  });

  it('merges evidence from removed variants into the kept candidate', () => {
    const result = enforceUniqueClipCandidates([
      candidate({
        id: 'a',
        title: 'Replay peak',
        startSeconds: 10,
        endSeconds: 40,
        score: 95,
        signalBadges: ['viewmap_peak'],
        viewmapScore: 88,
        viewmapPeakRank: 2,
        evidenceSummary: 'Structured viewmap peak.',
      }),
      candidate({
        id: 'b',
        title: 'Transcript hook',
        startSeconds: 12,
        endSeconds: 42,
        score: 90,
        signalBadges: ['transcript_hook'],
        viewmapScore: 96,
        viewmapPeakRank: 1,
        evidenceSummary: 'Transcript hook supports this moment.',
      }),
    ]);

    expect(result.candidates[0]).toMatchObject({
      id: 'a',
      signalBadges: ['viewmap_peak', 'transcript_hook'],
      viewmapScore: 96,
      viewmapPeakRank: 1,
    });
    expect(result.candidates[0]?.evidenceSummary).toContain('Structured viewmap peak.');
    expect(result.candidates[0]?.evidenceSummary).toContain('Transcript hook supports this moment.');
    expect(result.candidates[0]?.warnings.join(' ')).toContain('Removed overlapping variants');
  });
});
