import type { ClipCandidate } from './types';

export const DEFAULT_UNIQUE_OVERLAP_TOLERANCE_SECONDS = 2;

export interface RemovedOverlappingClip {
  removedId: string;
  removedTitle: string;
  keptId: string;
  keptTitle: string;
  overlapSeconds: number;
}

export interface UniqueClipCandidateResult {
  candidates: ClipCandidate[];
  warnings: string[];
  removed: RemovedOverlappingClip[];
}

interface IndexedCandidate {
  candidate: ClipCandidate;
  index: number;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function clipCandidateOverlapSeconds(a: Pick<ClipCandidate, 'startSeconds' | 'endSeconds'>, b: Pick<ClipCandidate, 'startSeconds' | 'endSeconds'>): number {
  return roundSeconds(Math.max(0, Math.min(a.endSeconds, b.endSeconds) - Math.max(a.startSeconds, b.startSeconds)));
}

function evidenceCount(candidate: ClipCandidate): number {
  return new Set(candidate.signalBadges ?? []).size;
}

function evidenceTextLength(candidate: ClipCandidate): number {
  return candidate.evidenceSummary?.trim().length ?? 0;
}

function compareStrength(a: IndexedCandidate, b: IndexedCandidate): number {
  const scoreDelta = b.candidate.score - a.candidate.score;
  if (scoreDelta !== 0) return scoreDelta;

  const confidenceDelta = (b.candidate.confidence ?? -1) - (a.candidate.confidence ?? -1);
  if (confidenceDelta !== 0) return confidenceDelta;

  const viewmapScoreDelta = (b.candidate.viewmapScore ?? -1) - (a.candidate.viewmapScore ?? -1);
  if (viewmapScoreDelta !== 0) return viewmapScoreDelta;

  const aPeakRank = a.candidate.viewmapPeakRank ?? Number.POSITIVE_INFINITY;
  const bPeakRank = b.candidate.viewmapPeakRank ?? Number.POSITIVE_INFINITY;
  if (aPeakRank !== bPeakRank) return aPeakRank - bPeakRank;

  const evidenceDelta = evidenceCount(b.candidate) - evidenceCount(a.candidate);
  if (evidenceDelta !== 0) return evidenceDelta;

  const evidenceTextDelta = evidenceTextLength(b.candidate) - evidenceTextLength(a.candidate);
  if (evidenceTextDelta !== 0) return evidenceTextDelta;

  return a.index - b.index;
}

function stripOverlapWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => !/^Overlaps with\b/i.test(warning) && !/^Removed overlapping variants\b/i.test(warning));
}

function mergeEvidence(winner: ClipCandidate, removed: ClipCandidate[]): ClipCandidate {
  if (removed.length === 0) {
    return {
      ...winner,
      warnings: stripOverlapWarnings(winner.warnings),
    };
  }

  const signalBadges = [
    ...(winner.signalBadges ?? []),
    ...removed.flatMap((candidate) => candidate.signalBadges ?? []),
  ];
  const evidenceSummaries = [
    winner.evidenceSummary,
    ...removed.map((candidate) => candidate.evidenceSummary),
  ]
    .map((summary) => summary?.trim())
    .filter((summary): summary is string => Boolean(summary));
  const bestViewmapScore = [winner.viewmapScore, ...removed.map((candidate) => candidate.viewmapScore)]
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
    .reduce<number | undefined>((best, score) => best === undefined ? score : Math.max(best, score), undefined);
  const bestPeakRank = [winner.viewmapPeakRank, ...removed.map((candidate) => candidate.viewmapPeakRank)]
    .filter((rank): rank is number => typeof rank === 'number' && Number.isFinite(rank))
    .reduce<number | undefined>((best, rank) => best === undefined ? rank : Math.min(best, rank), undefined);
  const bestConfidence = [winner.confidence, ...removed.map((candidate) => candidate.confidence)]
    .filter((confidence): confidence is number => typeof confidence === 'number' && Number.isFinite(confidence))
    .reduce<number | undefined>((best, confidence) => best === undefined ? confidence : Math.max(best, confidence), undefined);
  const removedTitles = removed.map((candidate) => `"${candidate.title}"`).join(', ');

  return {
    ...winner,
    signalBadges: signalBadges.length > 0 ? [...new Set(signalBadges)] : winner.signalBadges,
    evidenceSummary: evidenceSummaries.length > 0 ? [...new Set(evidenceSummaries)].join(' ') : winner.evidenceSummary,
    viewmapScore: bestViewmapScore ?? winner.viewmapScore,
    viewmapPeakRank: bestPeakRank ?? winner.viewmapPeakRank,
    confidence: bestConfidence ?? winner.confidence,
    warnings: [
      ...stripOverlapWarnings(winner.warnings),
      `Removed overlapping variants from this moment: ${removedTitles}.`,
    ],
  };
}

function clusterCandidates(indexed: IndexedCandidate[], toleranceSeconds: number): IndexedCandidate[][] {
  const adjacency = new Map<number, Set<number>>();
  indexed.forEach((entry) => adjacency.set(entry.index, new Set()));

  for (let i = 0; i < indexed.length; i += 1) {
    for (let j = i + 1; j < indexed.length; j += 1) {
      const first = indexed[i];
      const second = indexed[j];
      const overlapSeconds = clipCandidateOverlapSeconds(first.candidate, second.candidate);
      if (overlapSeconds > toleranceSeconds) {
        adjacency.get(first.index)?.add(second.index);
        adjacency.get(second.index)?.add(first.index);
      }
    }
  }

  const byIndex = new Map(indexed.map((entry) => [entry.index, entry]));
  const visited = new Set<number>();
  const clusters: IndexedCandidate[][] = [];

  indexed.forEach((entry) => {
    if (visited.has(entry.index)) return;
    const cluster: IndexedCandidate[] = [];
    const stack = [entry.index];
    visited.add(entry.index);

    while (stack.length > 0) {
      const index = stack.pop();
      if (index === undefined) continue;
      const candidate = byIndex.get(index);
      if (candidate) cluster.push(candidate);
      adjacency.get(index)?.forEach((neighbor) => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        stack.push(neighbor);
      });
    }

    clusters.push(cluster);
  });

  return clusters;
}

export function enforceUniqueClipCandidates(
  candidates: ClipCandidate[],
  options: { overlapToleranceSeconds?: number } = {},
): UniqueClipCandidateResult {
  const toleranceSeconds = options.overlapToleranceSeconds ?? DEFAULT_UNIQUE_OVERLAP_TOLERANCE_SECONDS;
  const indexed = candidates.map((candidate, index) => ({ candidate, index }));
  const removed: RemovedOverlappingClip[] = [];
  const warnings: string[] = [];
  const winners = new Map<string, ClipCandidate>();

  clusterCandidates(indexed, toleranceSeconds).forEach((cluster) => {
    const [winner, ...rest] = cluster.slice().sort(compareStrength);
    if (!winner) return;

    const removedCandidates = rest.map((entry) => entry.candidate);
    const mergedWinner = mergeEvidence(winner.candidate, removedCandidates);
    winners.set(winner.candidate.id, mergedWinner);

    removedCandidates.forEach((candidate) => {
      const overlapSeconds = clipCandidateOverlapSeconds(winner.candidate, candidate);
      removed.push({
        removedId: candidate.id,
        removedTitle: candidate.title,
        keptId: winner.candidate.id,
        keptTitle: winner.candidate.title,
        overlapSeconds,
      });
    });
  });

  if (removed.length > 0) {
    warnings.push(`Removed ${removed.length} overlapping candidate variant${removed.length === 1 ? '' : 's'}; kept the highest-scoring unique moments.`);
  }

  return {
    candidates: candidates
      .map((candidate) => winners.get(candidate.id))
      .filter((candidate): candidate is ClipCandidate => Boolean(candidate)),
    warnings,
    removed,
  };
}
