import type { ClipCandidate, VideoSource } from './types';

export const AUTO_SEGMENT_SECONDS = 60;

export function createClipStudioId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createAutoSegments(source: VideoSource, segmentSeconds = AUTO_SEGMENT_SECONDS): ClipCandidate[] {
  const duration = Number(source.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Video duration is required before Auto Clip can split the source.');
  }
  if (!Number.isFinite(segmentSeconds) || segmentSeconds <= 0) {
    throw new Error('Segment duration must be a positive number.');
  }

  const segments: ClipCandidate[] = [];
  for (let start = 0, order = 1; start < duration; start += segmentSeconds, order += 1) {
    const end = Math.min(duration, start + segmentSeconds);
    const segmentDuration = end - start;
    segments.push({
      id: createClipStudioId('auto'),
      sourceId: source.id,
      title: `This ${Math.round(segmentDuration)}-second moment is ready to clip`,
      hook: `Continuous ${Math.round(segmentDuration)} second segment`,
      startSeconds: Number(start.toFixed(3)),
      endSeconds: Number(end.toFixed(3)),
      durationSeconds: Number(segmentDuration.toFixed(3)),
      score: 50,
      reason: `Auto Clip splits the source into continuous ${AUTO_SEGMENT_SECONDS}-second max segments without AI analysis.`,
      archetype: 'continuous-segment',
      platformFit: ['shorts', 'reels', 'tiktok'],
      include: true,
      source: 'auto',
      order,
      warnings: segmentDuration < segmentSeconds ? [`Final segment is shorter than ${segmentSeconds} seconds.`] : [],
    });
  }

  return segments;
}
