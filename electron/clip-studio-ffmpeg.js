import path from "node:path";

export const VERTICAL_9_16_FILTER = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";

export function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function resolveFfmpegPath(override) {
  return asString(override) ?? "ffmpeg";
}

export function resolveFfprobePath(override) {
  const ffmpegPath = asString(override);
  if (!ffmpegPath || ffmpegPath === "ffmpeg") {
    return "ffprobe";
  }
  return path.join(path.dirname(ffmpegPath), "ffprobe");
}

export function formatSecondsForFfmpeg(seconds) {
  return Math.max(0, Number(seconds) || 0).toFixed(3);
}

function escapeFilterPath(rawPath) {
  return String(rawPath).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fixed(value) {
  return Number(value).toFixed(3);
}

function buildBaseVideoFilter(captionsPath) {
  return captionsPath
    ? `${VERTICAL_9_16_FILTER},subtitles='${escapeFilterPath(captionsPath)}'`
    : VERTICAL_9_16_FILTER;
}

function buildLogoFilter(params) {
  const duration = Math.max(0.5, Number(params.durationSeconds) || 0.5);
  const introSeconds = clamp(Number(params.logoIntroSeconds) || 3, 0.5, Math.max(0.5, duration));
  const logoOpacity = clamp(Number(params.logoOpacity) || 0.5, 0, 1);
  const introFadeOutStart = Math.max(0, introSeconds - 0.5);
  const watermarkFadeOutStart = Math.max(introSeconds, duration - 0.5);
  const baseFilter = buildBaseVideoFilter(params.captionsPath);

  return [
    `[0:v]${baseFilter},setsar=1[base]`,
    "[1:v]format=rgba,split=2[logo_intro_src][logo_watermark_src]",
    `[logo_intro_src]scale=w=min(720\\,iw):h=-1,fade=t=in:st=0.000:d=0.500:alpha=1,fade=t=out:st=${fixed(introFadeOutStart)}:d=0.500:alpha=1[intro_logo]`,
    `[logo_watermark_src]scale=w=min(360\\,iw):h=-1,colorchannelmixer=aa=${fixed(logoOpacity)},fade=t=out:st=${fixed(watermarkFadeOutStart)}:d=0.500:alpha=1[watermark_logo]`,
    `[base][intro_logo]overlay=x=(W-w)/2:y=(H-h)/2:enable='lt(t,${fixed(introSeconds)})'[introed]`,
    `[introed][watermark_logo]overlay=x=(W-w)/2:y=H-h-96:enable='gte(t,${fixed(introSeconds)})'[v]`,
  ].join(";");
}

export function buildCutClipArgs(params) {
  return [
    "-y",
    "-ss",
    formatSecondsForFfmpeg(params.startSeconds),
    "-i",
    params.sourcePath,
    "-t",
    formatSecondsForFfmpeg(params.durationSeconds),
    "-map",
    "0",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    params.outputPath,
  ];
}

export function buildExportVerticalClipArgs(params) {
  if (asString(params.logoPath)) {
    return [
      "-y",
      "-ss",
      formatSecondsForFfmpeg(params.startSeconds),
      "-i",
      params.sourcePath,
      "-loop",
      "1",
      "-i",
      params.logoPath,
      "-t",
      formatSecondsForFfmpeg(params.durationSeconds),
      "-filter_complex",
      buildLogoFilter(params),
      "-map",
      "[v]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      params.outputPath,
    ];
  }

  const filter = buildBaseVideoFilter(params.captionsPath);
  return [
    "-y",
    "-ss",
    formatSecondsForFfmpeg(params.startSeconds),
    "-i",
    params.sourcePath,
    "-t",
    formatSecondsForFfmpeg(params.durationSeconds),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    params.outputPath,
  ];
}

export function buildThumbnailArgs(params) {
  return [
    "-y",
    "-ss",
    formatSecondsForFfmpeg(params.atSeconds),
    "-i",
    params.sourcePath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    params.outputPath,
  ];
}

export function buildFfprobeMetadataArgs(inputPath) {
  return ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath];
}

export function parseFps(value) {
  if (typeof value !== "string" || !value.includes("/")) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  const [num, den] = value.split("/").map(Number);
  return Number.isFinite(num) && Number.isFinite(den) && den > 0 ? num / den : undefined;
}

export function parseFfprobeMetadata(stdout) {
  const payload = JSON.parse(stdout);
  const streams = Array.isArray(payload.streams) ? payload.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video") ?? {};
  const format = payload.format ?? {};
  const duration = Number(video.duration ?? format.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("ffprobe could not determine video duration.");
  }
  return {
    durationSeconds: duration,
    width: asNumber(video.width),
    height: asNumber(video.height),
    fps: parseFps(video.avg_frame_rate ?? video.r_frame_rate),
    codec: asString(video.codec_name),
    bitrate: Number.isFinite(Number(format.bit_rate)) ? Number(format.bit_rate) : undefined,
    formatName: asString(format.format_name),
  };
}

export function parseFfmpegProgressTime(stderrChunk) {
  const matches = [...String(stderrChunk).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const last = matches.at(-1);
  if (!last) return undefined;
  return Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
}

export function validateClipParams(params) {
  if (!asString(params?.sourcePath)) throw new Error("Missing source video path.");
  if (!asString(params?.outputPath)) throw new Error("Missing output path.");
  if (!Number.isFinite(Number(params.startSeconds)) || Number(params.startSeconds) < 0) {
    throw new Error("Invalid clip start time.");
  }
  if (!Number.isFinite(Number(params.durationSeconds)) || Number(params.durationSeconds) <= 0) {
    throw new Error("Invalid clip duration.");
  }
}
