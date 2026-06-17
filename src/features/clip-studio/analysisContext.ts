import type {
  AnalysisContextPackage,
  AnalysisSignalStatus,
  AnalysisTranscriptWindow,
  ClipCandidateSeed,
  ClipCandidateSeedSource,
  HeatmapImageInput,
  RepresentativeFrameInput,
  Transcript,
  TranscriptSegment,
  UserTimestampInput,
  VideoSource,
  YouTubeViewmapPeak,
  YouTubeViewmapPoint,
} from './types';

const MIN_SEED_SECONDS = 15;
const MAX_SEED_SECONDS = 60;
const DEFAULT_PRE_ROLL_SECONDS = 6;
const DEFAULT_POST_ROLL_SECONDS = 34;
const HOOK_PATTERN =
  /\b(wait|watch|look|secret|mistake|problem|truth|never|always|because|but|then|actually|finally|shocked|wild|crazy|revealed|exposed|failed|won|lost|why|how)\b|[?!]/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sourceDuration(source?: Pick<VideoSource, 'durationSeconds'>): number {
  const duration = Number(source?.durationSeconds);
  return Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
}

export function normalizeYouTubeViewmap(
  viewmap: YouTubeViewmapPoint[] = [],
  source?: Pick<VideoSource, 'durationSeconds'>,
): YouTubeViewmapPoint[] {
  const durationCap = sourceDuration(source);
  const valid = viewmap
    .map((point) => {
      const startSeconds = Number(point.startSeconds);
      const endSeconds = Number(point.endSeconds);
      const value = Number(point.value);
      const normalizedScore = Number(point.normalizedScore);
      if (!Number.isFinite(startSeconds) || !Number.isFinite(value) || startSeconds < 0) return null;
      const start = clamp(startSeconds, 0, durationCap);
      const fallbackEnd = Number.isFinite(durationCap) ? Math.min(durationCap, start + 5) : start + 5;
      const end = Number.isFinite(endSeconds) && endSeconds > start ? clamp(endSeconds, start, durationCap) : fallbackEnd;
      return {
        startSeconds: roundSeconds(start),
        endSeconds: roundSeconds(end),
        value,
        normalizedScore: Number.isFinite(normalizedScore) ? clamp(normalizedScore, 0, 100) : value,
      };
    })
    .filter((point): point is YouTubeViewmapPoint => Boolean(point))
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (valid.length === 0) return [];

  const needsNormalization = valid.some((point) => point.normalizedScore < 0 || point.normalizedScore > 100)
    || valid.every((point) => point.normalizedScore === point.value);
  if (!needsNormalization) return valid;

  const values = valid.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return valid.map((point) => ({
    ...point,
    normalizedScore: span <= 0 ? 100 : Math.round(((point.value - min) / span) * 1000) / 10,
  }));
}

export function detectYouTubeViewmapPeaks(
  viewmap: YouTubeViewmapPoint[] = [],
  source?: Pick<VideoSource, 'durationSeconds'>,
  maxPeaks = 8,
): YouTubeViewmapPeak[] {
  const points = normalizeYouTubeViewmap(viewmap, source);
  if (points.length === 0) return [];

  const localPeaks: YouTubeViewmapPeak[] = points
    .map((point, index): YouTubeViewmapPeak | null => {
      const previous = points[index - 1]?.normalizedScore ?? -1;
      const next = points[index + 1]?.normalizedScore ?? -1;
      const isPeak = point.normalizedScore >= previous && point.normalizedScore >= next && point.normalizedScore >= 55;
      if (!isPeak) return null;
      return {
        id: `viewmap-peak-${index}`,
        rank: 0,
        peakSeconds: roundSeconds((point.startSeconds + point.endSeconds) / 2),
        windowStartSeconds: point.startSeconds,
        windowEndSeconds: point.endSeconds,
        score: Math.round(point.normalizedScore),
        source: 'structured' as const,
      };
    })
    .filter((peak): peak is YouTubeViewmapPeak => Boolean(peak));

  const plateaus: YouTubeViewmapPeak[] = [];
  let plateauStart = -1;
  points.forEach((point, index) => {
    const hot = point.normalizedScore >= 75;
    if (hot && plateauStart < 0) plateauStart = index;
    const endsPlateau = plateauStart >= 0 && (!hot || index === points.length - 1);
    if (!endsPlateau) return;
    const endIndex = hot && index === points.length - 1 ? index : index - 1;
    if (endIndex > plateauStart) {
      const window = points.slice(plateauStart, endIndex + 1);
      const strongest = window.reduce((best, candidate) =>
        candidate.normalizedScore > best.normalizedScore ? candidate : best,
      );
      plateaus.push({
        id: `viewmap-plateau-${plateauStart}`,
        rank: 0,
        peakSeconds: roundSeconds((strongest.startSeconds + strongest.endSeconds) / 2),
        windowStartSeconds: window[0].startSeconds,
        windowEndSeconds: window[window.length - 1].endSeconds,
        score: Math.round(strongest.normalizedScore),
        source: 'plateau',
      });
    }
    plateauStart = -1;
  });

  const deduped: YouTubeViewmapPeak[] = [];
  [...localPeaks, ...plateaus]
    .sort((a, b) => b.score - a.score)
    .forEach((peak) => {
      const duplicate = deduped.some((entry) => entry.source === peak.source && Math.abs(entry.peakSeconds - peak.peakSeconds) < 8);
      if (!duplicate) deduped.push(peak);
    });

  return deduped.slice(0, maxPeaks).map((peak, index) => ({ ...peak, rank: index + 1 }));
}

function transcriptAround(transcript: Transcript | undefined, startSeconds: number, endSeconds: number): TranscriptSegment[] {
  return (transcript?.segments ?? []).filter((segment) =>
    segment.endSeconds >= startSeconds - 1 && segment.startSeconds <= endSeconds + 1,
  );
}

function excerptFromSegments(segments: TranscriptSegment[], maxChars = 420): string {
  return segments
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function expandWindow(
  anchorSeconds: number,
  source: VideoSource,
  transcript: Transcript | undefined,
  options: { preRoll?: number; postRoll?: number } = {},
): { startSeconds: number; endSeconds: number; transcriptExcerpt: string } {
  const durationCap = sourceDuration(source);
  const preRoll = options.preRoll ?? DEFAULT_PRE_ROLL_SECONDS;
  const postRoll = options.postRoll ?? DEFAULT_POST_ROLL_SECONDS;
  let startSeconds = clamp(anchorSeconds - preRoll, 0, durationCap);
  let endSeconds = clamp(anchorSeconds + postRoll, startSeconds, durationCap);

  const nearby = transcriptAround(transcript, startSeconds, endSeconds);
  if (nearby.length > 0) {
    startSeconds = clamp(Math.min(startSeconds, nearby[0].startSeconds), 0, durationCap);
    endSeconds = clamp(Math.max(endSeconds, nearby[nearby.length - 1].endSeconds), startSeconds, durationCap);
  }

  if (endSeconds - startSeconds < MIN_SEED_SECONDS) {
    endSeconds = clamp(startSeconds + MIN_SEED_SECONDS, startSeconds, durationCap);
  }
  if (endSeconds - startSeconds > MAX_SEED_SECONDS) {
    endSeconds = clamp(startSeconds + MAX_SEED_SECONDS, startSeconds, durationCap);
  }

  return {
    startSeconds: roundSeconds(startSeconds),
    endSeconds: roundSeconds(endSeconds),
    transcriptExcerpt: excerptFromSegments(transcriptAround(transcript, startSeconds, endSeconds)),
  };
}

function makeSeed(
  id: string,
  source: ClipCandidateSeedSource,
  anchorSeconds: number,
  score: number,
  evidenceSummary: string,
  videoSource: VideoSource,
  transcript: Transcript | undefined,
  extra: Partial<ClipCandidateSeed> = {},
): ClipCandidateSeed {
  const expanded = expandWindow(anchorSeconds, videoSource, transcript);
  return {
    id,
    source,
    anchorSeconds: roundSeconds(anchorSeconds),
    startSeconds: expanded.startSeconds,
    endSeconds: expanded.endSeconds,
    score: clamp(Math.round(score), 0, 100),
    evidenceLabels: [source],
    evidenceSummary,
    transcriptExcerpt: expanded.transcriptExcerpt,
    ...extra,
  };
}

function transcriptHookSeeds(source: VideoSource, transcript?: Transcript): ClipCandidateSeed[] {
  const segments = transcript?.segments ?? [];
  return segments
    .filter((segment) => HOOK_PATTERN.test(segment.text))
    .slice(0, 12)
    .map((segment, index) => makeSeed(
      `transcript-hook-${index}`,
      'transcript_hook',
      segment.startSeconds,
      62,
      `Transcript hook: "${segment.text.slice(0, 120)}"`,
      source,
      transcript,
    ));
}

function overlapRatio(a: ClipCandidateSeed, b: ClipCandidateSeed): number {
  const overlap = Math.max(0, Math.min(a.endSeconds, b.endSeconds) - Math.max(a.startSeconds, b.startSeconds));
  const smaller = Math.min(a.endSeconds - a.startSeconds, b.endSeconds - b.startSeconds);
  return smaller <= 0 ? 0 : overlap / smaller;
}

function dedupeSeeds(seeds: ClipCandidateSeed[], hasScreenshotFallback: boolean): ClipCandidateSeed[] {
  const deduped: ClipCandidateSeed[] = [];
  seeds
    .sort((a, b) => b.score - a.score)
    .forEach((seed) => {
      const existing = deduped.find((entry) => overlapRatio(entry, seed) >= 0.65);
      if (!existing) {
        deduped.push(seed);
        return;
      }
      existing.score = Math.max(existing.score, seed.score);
      existing.evidenceLabels = [...new Set([...existing.evidenceLabels, ...seed.evidenceLabels])];
      existing.evidenceSummary = `${existing.evidenceSummary}; ${seed.evidenceSummary}`;
      if (!existing.transcriptExcerpt && seed.transcriptExcerpt) {
        existing.transcriptExcerpt = seed.transcriptExcerpt;
      }
      existing.viewmapPeakRank ??= seed.viewmapPeakRank;
      existing.viewmapScore ??= seed.viewmapScore;
    });

  return deduped.slice(0, 16).map((seed, index) => ({
    ...seed,
    id: `seed-${index + 1}`,
    evidenceLabels: hasScreenshotFallback
      ? [...new Set([...seed.evidenceLabels, 'screenshot_heatmap' as const])]
      : seed.evidenceLabels,
  }));
}

function buildTranscriptWindows(
  transcript: Transcript | undefined,
  seeds: ClipCandidateSeed[],
  peaks: YouTubeViewmapPeak[],
): AnalysisTranscriptWindow[] {
  const anchors = [
    ...seeds.map((seed) => ({ seconds: seed.anchorSeconds, reason: seed.source })),
    ...peaks.map((peak) => ({ seconds: peak.peakSeconds, reason: `viewmap peak ${peak.rank}` })),
  ];
  const windows: AnalysisTranscriptWindow[] = [];
  const seen = new Set<string>();

  anchors.slice(0, 20).forEach((anchor, index) => {
    const startSeconds = Math.max(0, anchor.seconds - 12);
    const endSeconds = anchor.seconds + 42;
    const segments = transcriptAround(transcript, startSeconds, endSeconds);
    if (segments.length === 0) return;
    const start = roundSeconds(segments[0].startSeconds);
    const end = roundSeconds(segments[segments.length - 1].endSeconds);
    const key = `${start}:${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    windows.push({
      id: `transcript-window-${index + 1}`,
      startSeconds: start,
      endSeconds: end,
      text: excerptFromSegments(segments, 900),
      reason: anchor.reason,
    });
  });

  return windows;
}

export function selectFrameTimestampsForAnalysis(input: {
  source: VideoSource;
  viewmapPeaks?: YouTubeViewmapPeak[];
  userTimestamps?: UserTimestampInput[];
  maxFrames?: number;
}): number[] {
  const duration = sourceDuration(input.source);
  const fromPeaks = (input.viewmapPeaks ?? []).map((peak) => peak.peakSeconds);
  const fromTimestamps = (input.userTimestamps ?? []).map((stamp) => stamp.seconds);
  const ratios = Number.isFinite(duration) ? [0.15, 0.35, 0.55, 0.75].map((ratio) => duration * ratio) : [];
  const timestamps = [...fromPeaks, ...fromTimestamps, ...ratios]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => clamp(value, 0.5, Number.isFinite(duration) ? Math.max(0.5, duration - 0.5) : value));
  const deduped = timestamps.filter((value, index, values) =>
    values.findIndex((candidate) => Math.abs(candidate - value) < 1) === index,
  );
  return deduped.slice(0, input.maxFrames ?? 6).map(roundSeconds);
}

export function buildAnalysisContextPackage(input: {
  source: VideoSource;
  transcript?: Transcript;
  heatmapImages?: HeatmapImageInput[];
  frameImages?: RepresentativeFrameInput[];
  userTimestamps?: UserTimestampInput[];
  notes?: string;
}): AnalysisContextPackage {
  const source = input.source;
  const transcript = input.transcript;
  const viewmap = normalizeYouTubeViewmap(source.viewmap ?? [], source);
  const viewmapPeaks = detectYouTubeViewmapPeaks(viewmap, source);
  const hasScreenshotFallback = (input.heatmapImages?.length ?? 0) > 0 && viewmapPeaks.length === 0;

  const seeds: ClipCandidateSeed[] = [
    ...viewmapPeaks.map((peak) => makeSeed(
      `viewmap-${peak.rank}`,
      'viewmap_peak',
      peak.peakSeconds,
      82 + Math.min(14, peak.score / 8),
      `YouTube most-replayed peak #${peak.rank} scored ${peak.score}/100 around ${Math.round(peak.peakSeconds)}s.`,
      source,
      transcript,
      { viewmapPeakRank: peak.rank, viewmapScore: peak.score },
    )),
    ...(input.userTimestamps ?? []).map((stamp, index) => makeSeed(
      `manual-${index + 1}`,
      'manual_timestamp',
      stamp.seconds,
      74,
      `User timestamp "${stamp.label}" marks ${Math.round(stamp.seconds)}s.`,
      source,
      transcript,
    )),
    ...transcriptHookSeeds(source, transcript),
    ...(input.frameImages ?? []).slice(0, 6).map((frame, index) => makeSeed(
      `visual-${index + 1}`,
      'visual_frame',
      frame.timestampSeconds,
      58,
      `Representative frame captured at ${Math.round(frame.timestampSeconds)}s: ${frame.name}.`,
      source,
      transcript,
    )),
  ];

  const candidateSeeds = dedupeSeeds(seeds, hasScreenshotFallback);
  const transcriptWindows = buildTranscriptWindows(transcript, candidateSeeds, viewmapPeaks);
  const warnings: string[] = [];

  if (source.type === 'youtube' && viewmap.length === 0) {
    warnings.push(source.viewmapWarning ?? 'YouTube viewmap unavailable; analysis used transcript, frames, timestamps, screenshots, and notes.');
  }
  if (!transcript || transcript.segments.length === 0) {
    warnings.push('Transcript unavailable; candidate seeds rely more heavily on viewmap, frames, screenshots, timestamps, and notes.');
  }
  if (candidateSeeds.length === 0) {
    warnings.push('No deterministic viral seeds were found; Gemini will rank the available context directly.');
  }

  const signals: AnalysisSignalStatus[] = [
    viewmap.length > 0
      ? { id: 'viewmap', label: 'YouTube viewmap', status: 'ready', detail: `Viewmap found with ${viewmapPeaks.length} replay peak${viewmapPeaks.length === 1 ? '' : 's'}.`, count: viewmapPeaks.length }
      : {
          id: 'viewmap',
          label: 'YouTube viewmap',
          status: source.type === 'youtube' ? 'missing' : 'warning',
          detail: source.type === 'youtube' ? 'Viewmap unavailable from YouTube metadata.' : 'Structured viewmap applies to YouTube imports.',
          count: 0,
        },
    (input.heatmapImages?.length ?? 0) > 0
      ? { id: 'screenshots', label: 'Most replayed screenshot fallback', status: 'fallback', detail: `${input.heatmapImages?.length ?? 0} screenshot${input.heatmapImages?.length === 1 ? '' : 's'} attached as model context.`, count: input.heatmapImages?.length ?? 0 }
      : { id: 'screenshots', label: 'Most replayed screenshot fallback', status: 'missing', detail: 'No screenshot fallback attached.', count: 0 },
    transcript && transcript.segments.length > 0
      ? { id: 'transcript', label: 'Transcript windows', status: 'ready', detail: `${transcriptWindows.length} targeted transcript window${transcriptWindows.length === 1 ? '' : 's'} selected.`, count: transcriptWindows.length }
      : { id: 'transcript', label: 'Transcript windows', status: 'missing', detail: 'Transcript/frame-only analysis will be less precise.', count: 0 },
    (input.userTimestamps?.length ?? 0) > 0
      ? { id: 'timestamps', label: 'Manual timestamps', status: 'ready', detail: `${input.userTimestamps?.length ?? 0} user timestamp${input.userTimestamps?.length === 1 ? '' : 's'} included.`, count: input.userTimestamps?.length ?? 0 }
      : { id: 'timestamps', label: 'Manual timestamps', status: 'missing', detail: 'No manual timestamp anchors.', count: 0 },
    (input.frameImages?.length ?? 0) > 0
      ? { id: 'frames', label: 'Representative frames', status: 'ready', detail: `${input.frameImages?.length ?? 0} frame${input.frameImages?.length === 1 ? '' : 's'} captured locally.`, count: input.frameImages?.length ?? 0 }
      : { id: 'frames', label: 'Representative frames', status: 'missing', detail: 'No local frames captured for this run.', count: 0 },
    input.notes?.trim()
      ? { id: 'notes', label: 'Editorial notes', status: 'ready', detail: 'User notes included.', count: 1 }
      : { id: 'notes', label: 'Editorial notes', status: 'missing', detail: 'No extra editorial notes.', count: 0 },
  ];

  return {
    generatedAt: new Date().toISOString(),
    summary: `${candidateSeeds.length} deterministic seed${candidateSeeds.length === 1 ? '' : 's'} from ${signals.filter((signal) => signal.status === 'ready' || signal.status === 'fallback').length} active signal lane${signals.filter((signal) => signal.status === 'ready' || signal.status === 'fallback').length === 1 ? '' : 's'}.`,
    signals,
    warnings,
    viewmapPeaks,
    candidateSeeds,
    transcriptWindows,
  };
}
