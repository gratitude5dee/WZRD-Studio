import path from "node:path";

import { asString, formatSecondsForFfmpeg } from "./clip-studio-ffmpeg.js";

const VIDEO_EXTENSION_PATTERN = /\.(mp4|m4v|mov|webm|mkv)$/i;
const BEST_1080P_MP4_VIDEO_M4A_AUDIO_FORMAT = "bv*[height=1080][ext=mp4]+ba[ext=m4a]/b[height=1080][ext=mp4]";

export function isSupportedYoutubeUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl));
    return /(^|\.)youtube\.com$/i.test(url.hostname) || /(^|\.)youtu\.be$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function resolveYoutubeDownloaderPath(override) {
  return asString(override) ?? "yt-dlp";
}

export function buildYoutubeInfoArgs(url) {
  if (!isSupportedYoutubeUrl(url)) {
    throw new Error("Only youtube.com and youtu.be URLs are supported.");
  }
  return ["--dump-single-json", "--no-playlist", url];
}

export function buildYoutubeOutputTemplate(importDirectory) {
  return path.join(importDirectory, "%(title).200B-%(id)s.%(ext)s");
}

export function buildYoutubeDownloadArgs({ url, outputTemplate, ffmpegPath }) {
  if (!isSupportedYoutubeUrl(url)) {
    throw new Error("Only youtube.com and youtu.be URLs are supported.");
  }
  if (!asString(outputTemplate)) {
    throw new Error("Missing YouTube output template.");
  }

  const args = [
    "--no-playlist",
    "--newline",
    "--progress",
    "--restrict-filenames",
    "-f",
    BEST_1080P_MP4_VIDEO_M4A_AUDIO_FORMAT,
    "--merge-output-format",
    "mp4",
    "--remux-video",
    "mp4",
    "--print",
    "after_move:filepath",
    "-o",
    outputTemplate,
  ];

  const resolvedFfmpeg = asString(ffmpegPath);
  if (resolvedFfmpeg) {
    args.push("--ffmpeg-location", resolvedFfmpeg);
  }

  args.push(url);
  return args;
}

export function buildYoutubeSubtitleArgs({ url, outputTemplate }) {
  if (!isSupportedYoutubeUrl(url)) {
    throw new Error("Only youtube.com and youtu.be URLs are supported.");
  }
  if (!asString(outputTemplate)) {
    throw new Error("Missing YouTube output template.");
  }
  return [
    "--no-playlist",
    "--skip-download",
    "--write-auto-subs",
    "--write-subs",
    "--sub-langs",
    "en.*",
    "--sub-format",
    "vtt",
    "-o",
    outputTemplate,
    url,
  ];
}

export function parseYoutubeDownloadProgress(text) {
  const value = String(text);
  const percentMatch = value.match(/\[download\]\s+(\d+(?:\.\d+)?)%/i);
  if (percentMatch) {
    return {
      stage: "downloading",
      percent: Math.max(0, Math.min(94, Math.round(Number(percentMatch[1])))),
      message: value.trim(),
    };
  }

  if (/\[(Merger|VideoRemuxer|MoveFiles|Fixup)\]/i.test(value)) {
    return { stage: "processing", percent: 95, message: value.trim() };
  }

  if (/\[download\]\s+Destination:/i.test(value)) {
    return { stage: "starting", percent: 0, message: value.trim() };
  }

  return null;
}

function cleanPath(value) {
  return String(value || "").trim().replace(/^"|"$/g, "");
}

export function parseYoutubeDownloadedPath(output) {
  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    const printPath = cleanPath(line);
    if (!printPath.startsWith("[") && VIDEO_EXTENSION_PATTERN.test(printPath)) {
      return printPath;
    }

    const moved = line.match(/\[MoveFiles\]\s+Moving file ".+?" to "(.+?)"/i);
    if (moved) return cleanPath(moved[1]);

    const merged = line.match(/\[Merger\]\s+Merging formats into "(.+?)"/i);
    if (merged) return cleanPath(merged[1]);

    const remuxed = line.match(/\[VideoRemuxer\]\s+Remuxing video from ".+?" to "(.+?)"/i);
    if (remuxed) return cleanPath(remuxed[1]);

    const destination = line.match(/\[download\]\s+Destination:\s+(.+)$/i);
    if (destination) return cleanPath(destination[1]);

    const alreadyDownloaded = line.match(/\[download\]\s+(.+?)\s+has already been downloaded/i);
    if (alreadyDownloaded) return cleanPath(alreadyDownloaded[1]);
  }

  return null;
}

export function findCaptionPathForVideo(videoPath, fileNames) {
  const directory = path.dirname(videoPath);
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const match = fileNames.find((fileName) => {
    const name = path.basename(fileName);
    return name.toLowerCase().endsWith(".vtt") && (name === `${baseName}.vtt` || name.startsWith(`${baseName}.`));
  });
  return match ? path.join(directory, path.basename(match)) : undefined;
}

export function buildExtractRepresentativeFrameArgs({ sourcePath, outputPath, atSeconds }) {
  if (!asString(sourcePath)) throw new Error("Missing source video path.");
  if (!asString(outputPath)) throw new Error("Missing output path.");
  if (!Number.isFinite(Number(atSeconds)) || Number(atSeconds) < 0) {
    throw new Error("Invalid frame timestamp.");
  }
  return [
    "-y",
    "-ss",
    formatSecondsForFfmpeg(atSeconds),
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-2",
    "-q:v",
    "3",
    outputPath,
  ];
}

function readFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeViewmapPoint(entry, durationSeconds) {
  if (!entry || typeof entry !== "object") return null;
  const startSeconds = readFiniteNumber(entry.start_time)
    ?? readFiniteNumber(entry.startTime)
    ?? readFiniteNumber(entry.start)
    ?? readFiniteNumber(entry.startSeconds)
    ?? readFiniteNumber(entry.time);
  const endSeconds = readFiniteNumber(entry.end_time)
    ?? readFiniteNumber(entry.endTime)
    ?? readFiniteNumber(entry.end)
    ?? readFiniteNumber(entry.endSeconds);
  const value = readFiniteNumber(entry.value)
    ?? readFiniteNumber(entry.intensity)
    ?? readFiniteNumber(entry.score)
    ?? readFiniteNumber(entry.heatMarkerIntensityScoreNormalized)
    ?? readFiniteNumber(entry.heatMarkerIntensityScore);

  if (startSeconds === undefined || value === undefined || startSeconds < 0) {
    return null;
  }

  const safeDuration = readFiniteNumber(durationSeconds);
  const fallbackEnd = safeDuration ? Math.min(safeDuration, startSeconds + 5) : startSeconds + 5;
  const normalizedEnd = endSeconds !== undefined && endSeconds > startSeconds ? endSeconds : fallbackEnd;
  return {
    startSeconds,
    endSeconds: normalizedEnd,
    value,
    normalizedScore: value,
  };
}

function collectViewmapArrays(value, arrays = [], depth = 0, hint = "") {
  if (!value || depth > 5) return arrays;
  if (Array.isArray(value)) {
    const looksLikeViewmap = value.some((entry) => normalizeViewmapPoint(entry));
    if (looksLikeViewmap) arrays.push(value);
    return arrays;
  }
  if (typeof value !== "object") return arrays;

  for (const [key, child] of Object.entries(value)) {
    collectViewmapArrays(child, arrays, depth + 1, `${hint} ${key}`.toLowerCase());
  }

  return arrays;
}

export function parseYoutubeViewmap(payload) {
  const durationSeconds = readFiniteNumber(payload?.duration);
  const arrays = [
    payload?.heatmap,
    payload?.viewmap,
    payload?.most_replayed,
    payload?.mostReplayed,
  ].filter(Array.isArray);

  collectViewmapArrays(payload, arrays);
  const points = [];
  const seen = new Set();

  for (const array of arrays) {
    for (const entry of array) {
      const point = normalizeViewmapPoint(entry, durationSeconds);
      if (!point) continue;
      const key = `${point.startSeconds}:${point.endSeconds}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(point);
    }
  }

  if (points.length === 0) return [];

  points.sort((a, b) => a.startSeconds - b.startSeconds);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return points.map((point) => ({
    ...point,
    normalizedScore: span <= 0 ? 100 : Math.round(((point.value - min) / span) * 1000) / 10,
  }));
}

export function parseYoutubeInfoJson(stdout) {
  const payload = JSON.parse(String(stdout));
  const viewmap = parseYoutubeViewmap(payload);
  return {
    id: asString(payload.id),
    title: asString(payload.title) ?? asString(payload.fulltitle) ?? "YouTube video",
    uploader: asString(payload.uploader) ?? asString(payload.channel),
    durationSeconds: Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : undefined,
    webpageUrl: asString(payload.webpage_url) ?? asString(payload.original_url),
    viewmap,
    viewmapStatus: viewmap.length > 0 ? "found" : "unavailable",
    viewmapWarning: viewmap.length > 0 ? undefined : "YouTube most-replayed viewmap was unavailable in yt-dlp metadata.",
  };
}
