import { describe, expect, it } from 'vitest';

import {
  buildExistingCaptionCollisionInputs,
  buildUniqueClipCaptionTitles,
  captionTitleToSafeFilename,
  ensureTikTokCaptionTitle,
} from './captionTitles';
import type { ExportedClip } from './types';

function exportedClip(overrides: Partial<ExportedClip>): ExportedClip {
  return {
    id: 'export-1',
    sourceId: 'source-1',
    candidateId: 'candidate-1',
    sourceName: 'Tiesto set.mp4',
    title: 'Existing title #ForYou',
    hook: 'Hook',
    archetype: 'hook',
    platformFit: ['tiktok'],
    startSeconds: 0,
    endSeconds: 30,
    durationSeconds: 30,
    score: 80,
    exportPath: '/tmp/Existing title #ForYou.mp4',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Clip Studio TikTok caption titles', () => {
  it('preserves readable TikTok caption filenames with hashtags', () => {
    expect(captionTitleToSafeFilename('Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou.mp4')).toBe(
      'Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou',
    );
  });

  it('removes unsafe filename characters without slugifying the caption', () => {
    expect(captionTitleToSafeFilename('Tiesto: back/trance? roots* #Tiesto #Trance')).toBe(
      'Tiesto back trance roots #Tiesto #Trance',
    );
  });

  it('adds source-derived hashtags when a title has none', () => {
    expect(ensureTikTokCaptionTitle('The drop comes out of nowhere', {
      creator: 'Tiesto',
      name: 'Trance Roots Live.mp4',
    })).toBe('The drop comes out of nowhere #Tiesto #TranceRootsLive #ForYou');
  });

  it('dedupes current batch titles with social-friendly part suffixes', () => {
    const titles = buildUniqueClipCaptionTitles({
      source: { creator: 'Tiesto', name: 'Trance Roots Live.mp4' },
      clips: [
        { id: 'a', title: 'Trance roots are back #Tiesto #Trance #ForYou' },
        { id: 'b', title: 'Trance roots are back #Tiesto #Trance #ForYou' },
        { id: 'c', title: 'Trance roots are back #Tiesto #Trance #ForYou' },
      ],
    });

    expect(titles.map((entry) => entry.title)).toEqual([
      'Trance roots are back #Tiesto #Trance #ForYou',
      'Trance roots are back #Tiesto #Trance #ForYou #Part2',
      'Trance roots are back #Tiesto #Trance #ForYou #Part3',
    ]);
  });

  it('avoids collisions with existing library titles and destination filenames', () => {
    const existing = buildExistingCaptionCollisionInputs([
      exportedClip({
        title: 'Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou',
        exportPath: '/exports/Drop goes full trance #Tiesto #ForYou.mp4',
        thumbnailPath: '/exports/Drop goes full trance #Tiesto #ForYou.jpg',
      }),
    ]);
    const titles = buildUniqueClipCaptionTitles({
      ...existing,
      source: { creator: 'Tiesto', name: 'Trance Roots Live.mp4' },
      clips: [
        { id: 'a', title: 'Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou' },
        { id: 'b', title: 'Drop goes full trance #Tiesto #ForYou' },
      ],
    });

    expect(titles.map((entry) => entry.title)).toEqual([
      'Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou #Part2',
      'Drop goes full trance #Tiesto #ForYou #Part2',
    ]);
  });
});
