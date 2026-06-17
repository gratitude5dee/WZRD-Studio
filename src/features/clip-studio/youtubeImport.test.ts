import { describe, expect, it } from 'vitest';

import {
  createDownloadedYoutubeSource,
  createUnsupportedYoutubeSource,
  formatTranscriptForEditor,
  isLikelyYoutubeUrl,
  parseVttTranscript,
} from './youtubeImport';

describe('Clip Studio YouTube import abstraction', () => {
  it('accepts youtube.com and youtu.be URLs and rejects invalid input', () => {
    expect(isLikelyYoutubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isLikelyYoutubeUrl('https://youtu.be/abc')).toBe(true);
    expect(isLikelyYoutubeUrl('not a url')).toBe(false);
    expect(isLikelyYoutubeUrl('https://example.com/watch?v=abc')).toBe(false);
  });

  it('creates a metadata-only source with setup messaging when no downloader exists', () => {
    const result = createUnsupportedYoutubeSource('https://youtu.be/abc');

    expect(result.canAnalyzeMetadataOnly).toBe(true);
    expect(result.source).toMatchObject({
      type: 'youtube',
      url: 'https://youtu.be/abc',
      status: 'unsupported',
    });
    expect(result.source.warning).toMatch(/yt-dlp|downloader/i);
    expect(result.message).toMatch(/does not download/i);
  });

  it('creates a ready local source from a desktop YouTube download result', () => {
    const source = createDownloadedYoutubeSource({
      id: 'download-1',
      url: 'https://youtu.be/abc',
      title: 'Creator video',
      uploader: 'WZRD',
      localPath: '/tmp/creator-video.mp4',
      durationSeconds: 123.4,
      width: 1920,
      height: 1080,
      fps: 30,
      subtitlePath: '/tmp/creator-video.en.vtt',
      viewmapStatus: 'found',
      viewmap: [{ startSeconds: 50, endSeconds: 55, value: 10, normalizedScore: 100 }],
    });

    expect(source).toMatchObject({
      type: 'youtube',
      name: 'Creator video',
      creator: 'WZRD',
      localPath: '/tmp/creator-video.mp4',
      url: 'https://youtu.be/abc',
      status: 'ready',
      durationSeconds: 123.4,
      viewmapStatus: 'found',
      viewmap: [{ startSeconds: 50, endSeconds: 55, value: 10, normalizedScore: 100 }],
    });
  });

  it('parses VTT captions into transcript segments formatted for the editor', () => {
    const transcript = parseVttTranscript(`WEBVTT

00:00:01.000 --> 00:00:04.500
The opening hook lands fast.

00:01:10.000 --> 00:01:20.000
Then the payoff becomes obvious.
`);

    expect(transcript.segments).toEqual([
      {
        id: 'vtt-0',
        startSeconds: 1,
        endSeconds: 4.5,
        text: 'The opening hook lands fast.',
      },
      {
        id: 'vtt-1',
        startSeconds: 70,
        endSeconds: 80,
        text: 'Then the payoff becomes obvious.',
      },
    ]);
    expect(formatTranscriptForEditor(transcript)).toContain('[0:01-0:04.5] The opening hook lands fast.');
  });
});
