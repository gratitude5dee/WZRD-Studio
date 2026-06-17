import { describe, expect, it } from 'vitest';

import {
  VERTICAL_9_16_FILTER,
  buildCutClipArgs,
  buildExportVerticalClipArgs,
  buildFfprobeMetadataArgs,
  buildThumbnailArgs,
} from './ffmpegCommands';

describe('Clip Studio ffmpeg command builders', () => {
  it('builds a copy cut command that preserves audio and video streams', () => {
    expect(
      buildCutClipArgs({
        inputPath: '/tmp/source.mp4',
        outputPath: '/tmp/out.mp4',
        startSeconds: 12.3456,
        durationSeconds: 30,
      }),
    ).toEqual([
      '-y',
      '-ss',
      '12.346',
      '-i',
      '/tmp/source.mp4',
      '-t',
      '30.000',
      '-map',
      '0',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      '/tmp/out.mp4',
    ]);
  });

  it('builds a 9:16 export command with audio and no-black-bars scale/crop', () => {
    const args = buildExportVerticalClipArgs({
      inputPath: '/tmp/source.mp4',
      outputPath: '/tmp/vertical.mp4',
      startSeconds: 0,
      durationSeconds: 60,
    });

    expect(args).toContain('-vf');
    expect(args).toContain(VERTICAL_9_16_FILTER);
    expect(args).toContain('0:a?');
    expect(args).toContain('aac');
    expect(args).toContain('/tmp/vertical.mp4');
  });

  it('builds branded vertical export args with logo overlay filters', () => {
    const args = buildExportVerticalClipArgs({
      inputPath: '/tmp/source.mp4',
      outputPath: '/tmp/branded.mp4',
      startSeconds: 0,
      durationSeconds: 45,
      logoPath: '/tmp/logo.png',
      logoOpacity: 0.5,
      logoIntroSeconds: 3,
    });

    expect(args).toContain('-filter_complex');
    expect(args).toContain('/tmp/logo.png');
    expect(args).toContain('0:a?');
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).toContain(VERTICAL_9_16_FILTER);
    expect(filter).toContain('fade=t=in:st=0.000');
    expect(filter).toContain('colorchannelmixer=aa=0.500');
    expect(filter).toContain("enable='gte(t,3.000)'");
  });

  it('builds ffprobe metadata and thumbnail commands', () => {
    expect(buildFfprobeMetadataArgs('/tmp/source.mp4')).toContain('-show_streams');
    expect(buildThumbnailArgs('/tmp/source.mp4', '/tmp/thumb.jpg', 5)).toEqual([
      '-y',
      '-ss',
      '5.000',
      '-i',
      '/tmp/source.mp4',
      '-frames:v',
      '1',
      '-q:v',
      '2',
      '/tmp/thumb.jpg',
    ]);
  });
});
