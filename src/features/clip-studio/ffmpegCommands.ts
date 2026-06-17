export const VERTICAL_9_16_FILTER = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';

export interface ClipCommandOptions {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface VerticalClipCommandOptions extends ClipCommandOptions {
  captionsPath?: string;
  logoPath?: string;
  logoOpacity?: number;
  logoIntroSeconds?: number;
}

export function formatSecondsForFfmpeg(seconds: number): string {
  return Math.max(0, seconds).toFixed(3);
}

function baseTimedArgs(options: ClipCommandOptions): string[] {
  return [
    '-y',
    '-ss',
    formatSecondsForFfmpeg(options.startSeconds),
    '-i',
    options.inputPath,
    '-t',
    formatSecondsForFfmpeg(options.durationSeconds),
  ];
}

function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fixed(value: number): string {
  return value.toFixed(3);
}

function buildBaseVideoFilter(captionsPath?: string): string {
  return captionsPath
    ? `${VERTICAL_9_16_FILTER},subtitles='${escapeFilterPath(captionsPath)}'`
    : VERTICAL_9_16_FILTER;
}

function buildLogoFilter(options: VerticalClipCommandOptions): string {
  const duration = Math.max(0.5, Number(options.durationSeconds) || 0.5);
  const introSeconds = clamp(Number(options.logoIntroSeconds) || 3, 0.5, Math.max(0.5, duration));
  const logoOpacity = clamp(Number(options.logoOpacity) || 0.5, 0, 1);
  const introFadeOutStart = Math.max(0, introSeconds - 0.5);
  const watermarkFadeOutStart = Math.max(introSeconds, duration - 0.5);
  const baseFilter = buildBaseVideoFilter(options.captionsPath);

  return [
    `[0:v]${baseFilter},setsar=1[base]`,
    '[1:v]format=rgba,split=2[logo_intro_src][logo_watermark_src]',
    `[logo_intro_src]scale=w=min(720\\,iw):h=-1,fade=t=in:st=0.000:d=0.500:alpha=1,fade=t=out:st=${fixed(introFadeOutStart)}:d=0.500:alpha=1[intro_logo]`,
    `[logo_watermark_src]scale=w=min(360\\,iw):h=-1,colorchannelmixer=aa=${fixed(logoOpacity)},fade=t=out:st=${fixed(watermarkFadeOutStart)}:d=0.500:alpha=1[watermark_logo]`,
    `[base][intro_logo]overlay=x=(W-w)/2:y=(H-h)/2:enable='lt(t,${fixed(introSeconds)})'[introed]`,
    `[introed][watermark_logo]overlay=x=(W-w)/2:y=H-h-96:enable='gte(t,${fixed(introSeconds)})'[v]`,
  ].join(';');
}

export function buildCutClipArgs(options: ClipCommandOptions): string[] {
  return [
    ...baseTimedArgs(options),
    '-map',
    '0',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    options.outputPath,
  ];
}

export function buildExportVerticalClipArgs(options: VerticalClipCommandOptions): string[] {
  if (options.logoPath) {
    return [
      '-y',
      '-ss',
      formatSecondsForFfmpeg(options.startSeconds),
      '-i',
      options.inputPath,
      '-loop',
      '1',
      '-i',
      options.logoPath,
      '-t',
      formatSecondsForFfmpeg(options.durationSeconds),
      '-filter_complex',
      buildLogoFilter(options),
      '-map',
      '[v]',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      options.outputPath,
    ];
  }

  const filter = buildBaseVideoFilter(options.captionsPath);

  return [
    ...baseTimedArgs(options),
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    options.outputPath,
  ];
}

export function buildThumbnailArgs(inputPath: string, outputPath: string, atSeconds: number): string[] {
  return [
    '-y',
    '-ss',
    formatSecondsForFfmpeg(atSeconds),
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    outputPath,
  ];
}

export function buildFfprobeMetadataArgs(inputPath: string): string[] {
  return [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ];
}
