import type { ClipCandidate, ClipStudioPlatformPreset, VideoSource } from './types';
import { createClipStudioId } from './segmentation';

export const VIRAL_MIN_SECONDS = 15;
export const VIRAL_MAX_SECONDS = 60;

export interface CandidateNormalizationResult {
  candidates: ClipCandidate[];
  warnings: string[];
  errors: string[];
}

export interface TimestampRangeInput {
  lineNumber: number;
  rawLine: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

export interface TimestampRangeParseResult {
  ranges: TimestampRangeInput[];
  warnings: string[];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseTimestamp(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function parseTimestamp(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  const parts = trimmed.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return Number.NaN;
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return Number.NaN;
}

function readString(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readPlatformFit(value: unknown): ClipStudioPlatformPreset[] {
  const allowed = new Set<ClipStudioPlatformPreset>(['tiktok', 'reels', 'shorts', 'multi']);
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const normalized = values
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry): entry is ClipStudioPlatformPreset => allowed.has(entry as ClipStudioPlatformPreset));
  return normalized.length > 0 ? [...new Set(normalized)] : ['shorts'];
}

function readStringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return values
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function viralLengthWarningText(type: 'too-long' | 'too-short'): string {
  return type === 'too-long'
    ? `Clip exceeded ${VIRAL_MAX_SECONDS} seconds and was trimmed to the maximum TikTok duration.`
    : `Clip is shorter than ${VIRAL_MIN_SECONDS} seconds; review before exporting.`;
}

export function normalizeClipLengthRange(
  startSeconds: number,
  endSeconds: number,
  options: { warnings?: string[]; minSeconds?: number; maxSeconds?: number } = {},
): { startSeconds: number; endSeconds: number; durationSeconds: number; warnings: string[] } {
  const minSeconds = options.minSeconds ?? VIRAL_MIN_SECONDS;
  const maxSeconds = options.maxSeconds ?? VIRAL_MAX_SECONDS;
  const warnings = [...(options.warnings ?? [])];
  const start = roundSeconds(Math.max(0, startSeconds));
  let end = roundSeconds(Math.max(start, endSeconds));
  let duration = roundSeconds(end - start);

  if (duration > maxSeconds) {
    end = roundSeconds(start + maxSeconds);
    duration = roundSeconds(end - start);
    warnings.push(viralLengthWarningText('too-long'));
  }
  if (duration < minSeconds) {
    warnings.push(viralLengthWarningText('too-short'));
  }

  return { startSeconds: start, endSeconds: end, durationSeconds: duration, warnings };
}

function cleanRangeLabel(value: string): string {
  return value
    .replace(/^[\s:;,-]+|[\s:;,-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTimestampRanges(
  text: string,
  source?: Pick<VideoSource, 'durationSeconds'> | { durationSeconds?: number },
): TimestampRangeParseResult {
  const warnings: string[] = [];
  const ranges: TimestampRangeInput[] = [];
  const durationCap = Number(source?.durationSeconds);
  const hasDurationCap = Number.isFinite(durationCap) && durationCap > 0;
  const timestampToken = String.raw`[0-9]+(?::[0-9]{1,2}){0,2}(?:\.[0-9]+)?`;
  const rangePattern = new RegExp(String.raw`\[?\s*(${timestampToken})\s*(?:-|–|—|to)\s*(${timestampToken})\s*\]?`, 'i');
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((line, index) => {
    const rawLine = line.trim();
    if (!rawLine) return;

    const match = rawLine.match(rangePattern);
    if (!match || match.index === undefined) {
      warnings.push(`Line ${index + 1} did not contain a valid timestamp range.`);
      return;
    }

    const startSeconds = parseTimestamp(match[1]);
    const endSeconds = parseTimestamp(match[2]);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
      warnings.push(`Line ${index + 1} has an invalid timestamp.`);
      return;
    }
    if (endSeconds <= startSeconds) {
      warnings.push(`Line ${index + 1} ends before it starts.`);
      return;
    }
    if (hasDurationCap && (startSeconds >= durationCap || endSeconds > durationCap)) {
      warnings.push(`Line ${index + 1} is outside the source duration.`);
      return;
    }

    const start = roundSeconds(startSeconds);
    const end = roundSeconds(endSeconds);
    const duplicateKey = `${start}:${end}`;
    if (seen.has(duplicateKey)) {
      warnings.push(`Line ${index + 1} duplicates an existing timestamp range.`);
      return;
    }
    seen.add(duplicateKey);

    const before = cleanRangeLabel(rawLine.slice(0, match.index));
    const after = cleanRangeLabel(rawLine.slice(match.index + match[0].length));
    const label = after || before || `Timestamp clip ${ranges.length + 1}`;

    ranges.push({
      lineNumber: index + 1,
      rawLine,
      label,
      startSeconds: start,
      endSeconds: end,
      durationSeconds: roundSeconds(end - start),
    });
  });

  return { ranges, warnings };
}

export function createTimestampClipCandidates(
  ranges: TimestampRangeInput[],
  source: VideoSource,
  options: { platformPreset?: ClipStudioPlatformPreset; existingCount?: number } = {},
): ClipCandidate[] {
  const platformPreset = options.platformPreset ?? 'shorts';
  const existingCount = options.existingCount ?? 0;

  return ranges.map((range, index) => {
    const normalized = normalizeClipLengthRange(range.startSeconds, range.endSeconds);
    return {
      id: createClipStudioId('timestamp'),
      sourceId: source.id,
      title: range.label,
      hook: range.label,
      startSeconds: normalized.startSeconds,
      endSeconds: normalized.endSeconds,
      durationSeconds: normalized.durationSeconds,
      score: 65,
      reason: 'Created from user-provided timestamp data. No cloud analysis was used.',
      archetype: 'timestamp-cut',
      platformFit: [platformPreset],
      include: true,
      source: 'timestamp' as const,
      order: existingCount + index + 1,
      transcriptExcerpt: '',
      warnings: normalized.warnings,
    };
  });
}

export function normalizeClipCandidates(
  rawCandidates: unknown,
  source: VideoSource,
  options: { minSeconds?: number; maxSeconds?: number } = {},
): CandidateNormalizationResult {
  const minSeconds = options.minSeconds ?? VIRAL_MIN_SECONDS;
  const maxSeconds = options.maxSeconds ?? VIRAL_MAX_SECONDS;
  const warnings: string[] = [];
  const errors: string[] = [];
  const sourceDuration = Number(source.durationSeconds);
  const durationCap = Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : Number.POSITIVE_INFINITY;

  if (!Array.isArray(rawCandidates)) {
    return { candidates: [], warnings, errors: ['GMI response did not include a clipCandidates array.'] };
  }

  const dedupe = new Set<string>();
  const candidates: ClipCandidate[] = [];

  rawCandidates.forEach((entry, index) => {
    const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null;
    if (!record) {
      errors.push(`Candidate ${index + 1} is not an object.`);
      return;
    }

    const start = readNumber(record, ['startSeconds', 'start', 'startTime', 'start_time', 'in']);
    const rawEnd = readNumber(record, ['endSeconds', 'end', 'endTime', 'end_time', 'out']);
    const rawDuration = readNumber(record, ['durationSeconds', 'duration', 'duration_seconds']);

    if (start === undefined || start < 0) {
      errors.push(`Candidate ${index + 1} is missing a valid start time.`);
      return;
    }

    let end = rawEnd ?? (rawDuration !== undefined ? start + rawDuration : undefined);
    if (end === undefined || end <= start) {
      errors.push(`Candidate ${index + 1} is missing a valid end time.`);
      return;
    }

    const candidateWarnings: string[] = [];
    const clampedStart = clamp(start, 0, durationCap);
    if (clampedStart !== start) {
      candidateWarnings.push('Start time was clamped to the source duration.');
    }

    end = clamp(end, clampedStart, durationCap);
    let duration = end - clampedStart;
    if (duration > maxSeconds) {
      end = clampedStart + maxSeconds;
      duration = maxSeconds;
      candidateWarnings.push(viralLengthWarningText('too-long'));
    }
    if (duration < minSeconds) {
      candidateWarnings.push(viralLengthWarningText('too-short'));
    }

    const startSeconds = roundSeconds(clampedStart);
    const endSeconds = roundSeconds(end);
    const durationSeconds = roundSeconds(endSeconds - startSeconds);
    const duplicateKey = `${startSeconds}:${endSeconds}`;
    if (dedupe.has(duplicateKey)) {
      warnings.push(`Removed duplicate candidate at ${startSeconds}s-${endSeconds}s.`);
      return;
    }
    dedupe.add(duplicateKey);

    const score = clamp(readNumber(record, ['score', 'viralScore', 'confidence']) ?? 70, 0, 100);
    const confidence = readNumber(record, ['confidence', 'confidenceScore']);
    const viewmapScore = readNumber(record, ['viewmapScore', 'viewmap_score', 'replayScore']);
    const viewmapPeakRank = readNumber(record, ['viewmapPeakRank', 'viewmap_peak_rank', 'peakRank']);

    candidates.push({
      id: readString(record, ['id'], createClipStudioId('viral')),
      sourceId: source.id,
      title: readString(record, ['title', 'clipTitle'], `Viral clip ${candidates.length + 1}`),
      hook: readString(record, ['hook', 'hookOverlay', 'hookOverlaySuggestion'], 'Strong hook moment'),
      startSeconds,
      endSeconds,
      durationSeconds,
      score,
      reason: readString(record, ['reason', 'whyItWorks', 'rationale'], 'GMI identified this range as a high-retention clip candidate.'),
      archetype: readString(record, ['archetype', 'clipArchetype'], 'viral-moment'),
      platformFit: readPlatformFit(record.platformFit ?? record.platforms ?? record.platform),
      include: record.include === false ? false : true,
      source: 'gmi',
      order: candidates.length + 1,
      transcriptExcerpt: readString(record, ['transcriptExcerpt', 'quote', 'caption'], ''),
      signalBadges: readStringList(record.signalBadges ?? record.evidenceLabels ?? record.signals),
      viewmapScore: viewmapScore === undefined ? undefined : clamp(viewmapScore, 0, 100),
      viewmapPeakRank: viewmapPeakRank === undefined ? undefined : Math.max(1, Math.round(viewmapPeakRank)),
      evidenceSummary: readString(record, ['evidenceSummary', 'signalSummary', 'whyThisMomentSpikes'], ''),
      confidence: confidence === undefined ? undefined : clamp(confidence, 0, 100),
      warnings: candidateWarnings,
    });
  });

  candidates
    .slice()
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .forEach((candidate, index, sorted) => {
      const previous = sorted[index - 1];
      if (previous && candidate.startSeconds < previous.endSeconds) {
        const warning = `Overlaps with "${previous.title}" by ${roundSeconds(previous.endSeconds - candidate.startSeconds)} seconds.`;
        candidate.warnings.push(warning);
        warnings.push(`${candidate.title}: ${warning}`);
      }
    });

  return { candidates, warnings, errors };
}
