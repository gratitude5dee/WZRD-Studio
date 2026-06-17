import { describe, expect, it } from 'vitest';

import { createAutoSegments } from './segmentation';
import type { VideoSource } from './types';

function source(durationSeconds: number): VideoSource {
  return {
    id: 'source-1',
    type: 'local',
    name: 'source.mp4',
    importedAt: '2026-05-25T00:00:00.000Z',
    durationSeconds,
    status: 'ready',
  };
}

describe('Clip Studio auto segmentation', () => {
  it('creates 10 auto clips for a 10 minute video with 60-second max segments', () => {
    const segments = createAutoSegments(source(10 * 60));

    expect(segments).toHaveLength(10);
    expect(segments.at(-1)).toMatchObject({
      startSeconds: 540,
      endSeconds: 600,
      durationSeconds: 60,
    });
  });

  it('creates 90 auto clips for a 90 minute video', () => {
    const segments = createAutoSegments(source(90 * 60));

    expect(segments).toHaveLength(90);
    expect(segments[0]).toMatchObject({ startSeconds: 0, endSeconds: 60 });
    expect(segments.at(-1)).toMatchObject({ startSeconds: 5340, endSeconds: 5400, durationSeconds: 60 });
  });
});
