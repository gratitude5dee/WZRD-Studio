import { describe, expect, it } from 'vitest';

import {
  buildAnalysisContextPackage,
  detectYouTubeViewmapPeaks,
  normalizeYouTubeViewmap,
  selectFrameTimestampsForAnalysis,
} from './analysisContext';
import type { Transcript, VideoSource } from './types';

const source: VideoSource = {
  id: 'source-1',
  type: 'youtube',
  name: 'Demo',
  url: 'https://youtu.be/demo',
  importedAt: '2026-06-01T00:00:00.000Z',
  durationSeconds: 180,
  status: 'ready',
};

const transcript: Transcript = {
  segments: [
    { id: 't1', startSeconds: 8, endSeconds: 14, text: 'We start with some context.' },
    { id: 't2', startSeconds: 18, endSeconds: 24, text: 'Wait until you see why this mistake changes everything.' },
    { id: 't3', startSeconds: 52, endSeconds: 60, text: 'The payoff finally lands here.' },
    { id: 't4', startSeconds: 102, endSeconds: 112, text: 'This is another strong reveal moment.' },
  ],
};

describe('Clipper analysis context', () => {
  it('normalizes raw YouTube viewmap values into 0-100 scores', () => {
    expect(normalizeYouTubeViewmap([
      { startSeconds: 0, endSeconds: 5, value: 10, normalizedScore: 10 },
      { startSeconds: 5, endSeconds: 10, value: 20, normalizedScore: 20 },
      { startSeconds: 10, endSeconds: 15, value: 15, normalizedScore: 15 },
    ], source)).toEqual([
      { startSeconds: 0, endSeconds: 5, value: 10, normalizedScore: 0 },
      { startSeconds: 5, endSeconds: 10, value: 20, normalizedScore: 100 },
      { startSeconds: 10, endSeconds: 15, value: 15, normalizedScore: 50 },
    ]);
  });

  it('detects local peaks and hot plateaus from structured viewmap points', () => {
    const peaks = detectYouTubeViewmapPeaks([
      { startSeconds: 0, endSeconds: 5, value: 1, normalizedScore: 10 },
      { startSeconds: 5, endSeconds: 10, value: 8, normalizedScore: 80 },
      { startSeconds: 10, endSeconds: 15, value: 9, normalizedScore: 90 },
      { startSeconds: 15, endSeconds: 20, value: 3, normalizedScore: 30 },
      { startSeconds: 60, endSeconds: 65, value: 10, normalizedScore: 100 },
      { startSeconds: 65, endSeconds: 70, value: 2, normalizedScore: 20 },
    ], source);

    expect(peaks[0]).toMatchObject({ rank: 1, peakSeconds: 62.5, score: 100 });
    expect(peaks.some((peak) => peak.source === 'plateau')).toBe(true);
  });

  it('builds deterministic seeds and targeted transcript windows from fused signals', () => {
    const context = buildAnalysisContextPackage({
      source: {
        ...source,
        viewmap: [
          { startSeconds: 45, endSeconds: 50, value: 2, normalizedScore: 20 },
          { startSeconds: 50, endSeconds: 55, value: 10, normalizedScore: 100 },
          { startSeconds: 55, endSeconds: 60, value: 4, normalizedScore: 40 },
        ],
        viewmapStatus: 'found',
      },
      transcript,
      userTimestamps: [{ id: 'manual-1', label: 'payoff', seconds: 105 }],
      heatmapImages: [{ id: 'image-1', name: 'most-replayed.png', dataUrl: 'data:image/png;base64,abc' }],
      frameImages: [{ id: 'frame-1', name: 'frame.jpg', timestampSeconds: 52, dataUrl: 'data:image/jpeg;base64,def' }],
      notes: 'Favor reveals.',
    });

    expect(context.signals.find((signal) => signal.id === 'viewmap')).toMatchObject({ status: 'ready', count: 1 });
    expect(context.candidateSeeds[0].evidenceLabels).toContain('viewmap_peak');
    expect(context.candidateSeeds.some((seed) => seed.evidenceLabels.includes('manual_timestamp'))).toBe(true);
    expect(context.transcriptWindows.some((window) => window.text.includes('payoff'))).toBe(true);
  });

  it('uses screenshots as fallback evidence when structured viewmap is missing', () => {
    const context = buildAnalysisContextPackage({
      source: { ...source, viewmapStatus: 'unavailable' },
      transcript,
      heatmapImages: [{ id: 'image-1', name: 'most-replayed.png', dataUrl: 'data:image/png;base64,abc' }],
    });

    expect(context.signals.find((signal) => signal.id === 'screenshots')).toMatchObject({ status: 'fallback' });
    expect(context.candidateSeeds.some((seed) => seed.evidenceLabels.includes('screenshot_heatmap'))).toBe(true);
    expect(context.warnings.join(' ')).toMatch(/viewmap unavailable/i);
  });

  it('selects frame timestamps from peaks before generic ratios', () => {
    expect(selectFrameTimestampsForAnalysis({
      source,
      viewmapPeaks: [{ id: 'peak-1', rank: 1, peakSeconds: 42, windowStartSeconds: 40, windowEndSeconds: 45, score: 99, source: 'structured' }],
      userTimestamps: [{ id: 'manual', label: 'manual', seconds: 90 }],
      maxFrames: 3,
    })).toEqual([42, 90, 27]);
  });
});
