import { app, BrowserWindow, Menu, ipcMain, net, protocol, session, shell, dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  asString,
  buildCutClipArgs,
  buildExportVerticalClipArgs,
  buildFfprobeMetadataArgs,
  buildThumbnailArgs,
  parseFfmpegProgressTime,
  parseFfprobeMetadata,
  validateClipParams,
} from "./clip-studio-ffmpeg.js";
import {
  normalizeFfmpegFailure,
  preflightFfmpegExport,
  resolveFfmpegToolchain,
  toTempOutputPath,
} from "./media-ffmpeg-runtime.js";
import { setupQcutBridge } from "./qcut-bridge.js";
import {
  createMediaFileAccess,
  extensionForRemoteMedia,
  isPathInside,
  safeFileStem,
} from "./media-file-access.js";
import {
  buildExtractWaveformPcmArgs,
  buildRenderPreviewProxyArgs,
  buildRenderTimelineArgs,
  buildStudioAudioFilterArgs,
  buildStudioAudioMergeArgs,
  buildStudioAudioSeparateArgs,
  buildStudioBlendArgs,
  buildStudioConcatArgs,
  buildStudioExtractFramesArgs,
  buildStudioFrameGridArgs,
  buildStudioImageTransformArgs,
  buildStudioInterleaveArgs,
  buildStudioMergeAudioVideoArgs,
  buildStudioSplitArgs,
  buildStudioVideoFilterArgs,
  buildStudioWatermarkArgs,
  collectTimelineSourcePaths,
  getTimelineDurationSeconds,
  validateTimelineRenderPlan,
} from "./media-ffmpeg-commands.js";
import {
  buildExtractRepresentativeFrameArgs,
  buildYoutubeDownloadArgs,
  buildYoutubeInfoArgs,
  buildYoutubeOutputTemplate,
  buildYoutubeSubtitleArgs,
  findCaptionPathForVideo,
  isSupportedYoutubeUrl,
  parseYoutubeDownloadedPath,
  parseYoutubeDownloadProgress,
  parseYoutubeInfoJson,
  resolveYoutubeDownloaderPath,
} from "./clip-studio-youtube.js";
import { copyLogoIntoBrandingDirectory } from "./clip-studio-branding.js";
import { resolveDeepLinkToAppUrlWithDiagnostics } from "./deep-links.js";
import {
  buildClipperMediaUrl,
  getAppUrl,
  resolveAppProtocolRequest,
  resolveClipperMediaProtocolRequest,
  WZRD_MEDIA_HOST,
  WZRD_PROTOCOL,
} from "./protocol.js";
import { createMainWindowOptions } from "./window-options.js";

protocol.registerSchemesAsPrivileged([
  {
    scheme: WZRD_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
let mainWindow = null;
let pendingDeepLink = null;
const execFileAsync = promisify(execFile);

if (process.env.WZRD_DESKTOP_USER_DATA_DIR) {
  app.setPath("userData", process.env.WZRD_DESKTOP_USER_DATA_DIR);
}

const mediaFileAccess = createMediaFileAccess({
  roots: [getClipperDataDirectory, getMediaCacheDirectory],
});

function getAppRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, "..");
}

function getDistDir() {
  return path.join(getAppRoot(), "dist");
}

function getPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function getIconPath() {
  return path.join(getAppRoot(), "build", "icon.icns");
}

function redactedUrlForLog(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const params = [];
    for (const key of url.searchParams.keys()) {
      params.push(`${key}=${["authResult", "authCookie"].includes(key) ? "[redacted]" : "[present]"}`);
    }
    return `${url.protocol}//${url.host}${url.pathname}${params.length ? `?${params.join("&")}` : ""}${url.hash}`;
  } catch {
    return "invalid-url";
  }
}

function logDesktopEvent(event, details = {}) {
  const payload = {
    details,
    event,
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  console.info(`[desktop] ${line}`);

  if (!app.isReady()) {
    return;
  }

  const logFile = path.join(app.getPath("logs"), "desktop.log");
  void fs.appendFile(logFile, `${line}\n`).catch((error) => {
    console.warn("[desktop] failed to write desktop log", error);
  });
}

function isAllowedExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ["https:", "http:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function sendFfmpegProgress(operationId, progress) {
  if (!operationId || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("wzrd:clip-studio:ffmpeg-progress", {
    operationId,
    ...progress,
  });
}

function sendMediaProgress(operationId, progress) {
  if (!operationId || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("wzrd:media:progress", {
    operationId,
    ...progress,
  });
}

function sendYoutubeDownloadProgress(operationId, progress) {
  if (!operationId || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("wzrd:clip-studio:youtube-download-progress", {
    operationId,
    ...progress,
  });
}

function getClipperImportDirectory() {
  return path.join(app.getPath("userData"), "clipper", "imports");
}

function getClipperDataDirectory() {
  return path.join(app.getPath("userData"), "clipper");
}

function getClipperBrandingDirectory() {
  return path.join(getClipperDataDirectory(), "branding");
}

function getMediaCacheDirectory() {
  return path.join(app.getPath("userData"), "media-cache");
}

function getClipperFrameDirectory(operationId) {
  return path.join(app.getPath("userData"), "clipper", "frames", operationId);
}

function allowClipperMediaPath(filePath) {
  mediaFileAccess.allowMediaPath(filePath);
}

function isAllowedClipperMediaPath(filePath) {
  return mediaFileAccess.isAllowedMediaPath(filePath);
}

async function cacheRemoteMedia(params = {}) {
  const rawUrl = asString(params.url);
  const operationId = asString(params.operationId) ?? `cache-media-${Date.now()}`;
  if (!rawUrl) throw new Error("Missing remote media URL.");

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Remote media URL is invalid.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https media URLs can be cached for local export.");
  }

  sendMediaProgress(operationId, {
    stage: "starting",
    percent: 0,
    clipTitle: "cacheRemoteMedia",
    message: "Caching remote media locally",
  });

  const response = await net.fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Remote media download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const extension = extensionForRemoteMedia(url, contentType);
  const hash = createHash("sha256").update(url.toString()).digest("hex").slice(0, 16);
  const fileName = `${safeFileStem(params.name ?? path.basename(url.pathname) ?? "media")}-${hash}${extension}`;
  const cacheDir = getMediaCacheDirectory();
  const localPath = path.join(cacheDir, fileName);
  await fs.mkdir(cacheDir, { recursive: true });

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(localPath, buffer);
  allowClipperMediaPath(localPath);
  sendMediaProgress(operationId, {
    stage: "completed",
    percent: 100,
    clipTitle: "cacheRemoteMedia",
    outputName: fileName,
    message: "Remote media cached locally",
  });

  return {
    name: fileName,
    path: localPath,
    size: buffer.length,
    mimeType: contentType || undefined,
    mediaUrl: buildClipperMediaUrl(localPath),
  };
}

async function findNewestDownloadedMedia(importDirectory) {
  const entries = await fs.readdir(importDirectory, { withFileTypes: true }).catch(() => []);
  const stats = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.(mp4|m4v|mov|webm|mkv)$/i.test(entry.name))
      .map(async (entry) => {
        const filePath = path.join(importDirectory, entry.name);
        const stat = await fs.stat(filePath).catch(() => null);
        return stat ? { filePath, mtimeMs: stat.mtimeMs } : null;
      }),
  );
  return stats
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.filePath;
}

async function readCaptionTextForVideo(videoPath) {
  const entries = await fs.readdir(path.dirname(videoPath)).catch(() => []);
  const captionPath = findCaptionPathForVideo(videoPath, entries);
  if (!captionPath) return {};
  const subtitleText = await fs.readFile(captionPath, "utf8").catch(() => undefined);
  return { subtitlePath: captionPath, subtitleText };
}

async function downloadYoutubeSubtitlesBestEffort({ downloaderPath, url, outputTemplate, operationId }) {
  try {
    sendYoutubeDownloadProgress(operationId, { stage: "processing", percent: 96, message: "Checking YouTube captions" });
    await execFileAsync(
      downloaderPath,
      buildYoutubeSubtitleArgs({ url, outputTemplate }),
      { timeout: 60000, maxBuffer: 1024 * 1024 * 10 },
    );
  } catch (error) {
    logDesktopEvent("clipper-youtube-subtitles-unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function fileToJpegDataUrl(filePath) {
  const buffer = await fs.readFile(filePath);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function ensureOutputDirectory(outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
}

async function resolveRequiredFfmpegToolchain(ffmpegPath) {
  const toolchain = await resolveFfmpegToolchain({ ffmpegPath });
  if (!toolchain.available) {
    throw new Error(toolchain.error ?? "ffmpeg is unavailable.");
  }
  return toolchain;
}

async function runFfmpegWithProgress(params, buildArgs, options = {}) {
  const operationId = asString(params.operationId) ?? `ffmpeg-${Date.now()}`;
  const clipTitle = asString(params.clipTitle);
  const sourceName = asString(params.sourcePath) ? path.basename(params.sourcePath) : undefined;
  const outputName = asString(params.outputPath) ? path.basename(params.outputPath) : undefined;
  const duration = Number(params.durationSeconds) || 0;
  let tempOutputPath;
  let toolchain;

  try {
    toolchain = await preflightFfmpegExport(params, {}, { requireEncoders: options.requireEncoders !== false });
    tempOutputPath = toTempOutputPath(params.outputPath);
    await ensureOutputDirectory(tempOutputPath);
  } catch (error) {
    const failure = normalizeFfmpegFailure({ error });
    sendFfmpegProgress(operationId, {
      stage: "failed",
      percent: 0,
      clipTitle,
      sourceName,
      outputName,
      message: failure.message,
      detail: failure.detail,
      stderrTail: failure.stderrTail,
    });
    throw new Error(failure.message);
  }

  const runParams = { ...params, outputPath: tempOutputPath };
  const args = buildArgs(runParams);
  sendFfmpegProgress(operationId, {
    stage: "starting",
    percent: 0,
    clipTitle,
    sourceName,
    outputName,
    message: "Starting ffmpeg export",
  });

  return new Promise((resolve, reject) => {
    const child = spawn(toolchain.ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    let settled = false;

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr = `${stderr}${text}`.slice(-8000);
      const timeSeconds = parseFfmpegProgressTime(text);
      if (timeSeconds !== undefined && duration > 0) {
        sendFfmpegProgress(operationId, {
          stage: "running",
          percent: Math.max(0, Math.min(99, Math.round((timeSeconds / duration) * 100))),
          timeSeconds,
          clipTitle,
          sourceName,
          outputName,
          message: "Exporting clip",
        });
      }
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      const failure = normalizeFfmpegFailure({ error, stderr });
      void fs.unlink(tempOutputPath).catch(() => undefined);
      sendFfmpegProgress(operationId, {
        stage: "failed",
        percent: 0,
        clipTitle,
        sourceName,
        outputName,
        message: failure.message,
        detail: failure.detail,
        stderrTail: failure.stderrTail,
      });
      reject(new Error(failure.message));
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      void (async () => {
        if (code === 0) {
          await fs.rename(tempOutputPath, params.outputPath);
          allowClipperMediaPath(params.outputPath);
          sendFfmpegProgress(operationId, {
            stage: "completed",
            percent: 100,
            clipTitle,
            sourceName,
            outputName,
            message: "Export completed",
          });
          resolve({ outputPath: params.outputPath });
          return;
        }

        await fs.unlink(tempOutputPath).catch(() => undefined);
        const failure = normalizeFfmpegFailure({ code, signal, stderr });
        sendFfmpegProgress(operationId, {
          stage: "failed",
          percent: 0,
          clipTitle,
          sourceName,
          outputName,
          message: failure.message,
          detail: failure.detail,
          exitCode: failure.exitCode,
          signal: failure.signal,
          stderrTail: failure.stderrTail,
        });
        reject(new Error(failure.message));
      })().catch((error) => {
        const failure = normalizeFfmpegFailure({ error, stderr });
        sendFfmpegProgress(operationId, {
          stage: "failed",
          percent: 0,
          clipTitle,
          sourceName,
          outputName,
          message: failure.message,
          detail: failure.detail,
          stderrTail: failure.stderrTail,
        });
        reject(new Error(failure.message));
      });
    });
  });
}

async function preflightTimelineRender(params = {}) {
  const timeline = {
    ...(params.timeline ?? {}),
    exportSettings: {
      ...(params.timeline?.exportSettings ?? {}),
      outputPath: params.outputPath,
      format: params.timeline?.exportSettings?.format ?? "mp4",
    },
  };
  validateTimelineRenderPlan(timeline);

  const sourcePaths = collectTimelineSourcePaths(timeline);
  if (sourcePaths.length === 0) {
    throw new Error("Add at least one local media source before rendering the timeline.");
  }

  const toolchain = await preflightFfmpegExport(
    {
      sourcePath: sourcePaths[0],
      outputPath: params.outputPath,
      ffmpegPath: params.ffmpegPath,
    },
    {},
    { requireEncoders: true },
  );

  for (const sourcePath of sourcePaths.slice(1)) {
    try {
      await fs.access(sourcePath);
    } catch (error) {
      throw new Error(`Timeline source could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { timeline, toolchain };
}

async function runTimelineRenderWithProgress(params = {}) {
  const operationId = asString(params.operationId) ?? `timeline-render-${Date.now()}`;
  const outputPath = asString(params.outputPath);
  if (!outputPath) throw new Error("Missing timeline output path.");

  const outputName = path.basename(outputPath);
  let tempOutputPath;
  let toolchain;
  let timeline;

  try {
    const result = await preflightTimelineRender(params);
    toolchain = result.toolchain;
    timeline = result.timeline;
    tempOutputPath = toTempOutputPath(outputPath);
    await ensureOutputDirectory(tempOutputPath);
  } catch (error) {
    const failure = normalizeFfmpegFailure({ error });
    sendMediaProgress(operationId, {
      stage: "failed",
      percent: 0,
      outputName,
      message: failure.message,
      detail: failure.detail,
      stderrTail: failure.stderrTail,
    });
    throw new Error(failure.message);
  }

  const runTimeline = {
    ...timeline,
    exportSettings: {
      ...timeline.exportSettings,
      outputPath: tempOutputPath,
    },
  };
  const args = buildRenderTimelineArgs({ timeline: runTimeline, outputPath: tempOutputPath });
  const duration = getTimelineDurationSeconds(runTimeline);

  sendMediaProgress(operationId, {
    stage: "starting",
    percent: 0,
    outputName,
    message: "Starting local timeline render",
  });

  return new Promise((resolve, reject) => {
    const child = spawn(toolchain.ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    let settled = false;

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr = `${stderr}${text}`.slice(-8000);
      const timeSeconds = parseFfmpegProgressTime(text);
      if (timeSeconds !== undefined && duration > 0) {
        sendMediaProgress(operationId, {
          stage: "running",
          percent: Math.max(0, Math.min(99, Math.round((timeSeconds / duration) * 100))),
          timeSeconds,
          outputName,
          message: "Rendering timeline locally",
        });
      }
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      const failure = normalizeFfmpegFailure({ error, stderr });
      void fs.unlink(tempOutputPath).catch(() => undefined);
      sendMediaProgress(operationId, {
        stage: "failed",
        percent: 0,
        outputName,
        message: failure.message,
        detail: failure.detail,
        stderrTail: failure.stderrTail,
      });
      reject(new Error(failure.message));
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      void (async () => {
        if (code === 0) {
          await fs.rename(tempOutputPath, outputPath);
          allowClipperMediaPath(outputPath);
          sendMediaProgress(operationId, {
            stage: "completed",
            percent: 100,
            outputName,
            message: "Timeline render completed",
          });
          resolve({ outputPath });
          return;
        }

        await fs.unlink(tempOutputPath).catch(() => undefined);
        const failure = normalizeFfmpegFailure({ code, signal, stderr });
        sendMediaProgress(operationId, {
          stage: "failed",
          percent: 0,
          outputName,
          message: failure.message,
          detail: failure.detail,
          exitCode: failure.exitCode,
          signal: failure.signal,
          stderrTail: failure.stderrTail,
        });
        reject(new Error(failure.message));
      })().catch((error) => {
        const failure = normalizeFfmpegFailure({ error, stderr });
        sendMediaProgress(operationId, {
          stage: "failed",
          percent: 0,
          outputName,
          message: failure.message,
          detail: failure.detail,
          stderrTail: failure.stderrTail,
        });
        reject(new Error(failure.message));
      });
    });
  });
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function localPathFromPossiblyFileUrl(value) {
  const raw = asString(value);
  if (!raw) return undefined;
  if (raw.startsWith("file://")) {
    return decodeURIComponent(new URL(raw).pathname);
  }
  return raw;
}

function localPathsFromUnknown(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => localPathsFromUnknown(item));
  }
  if (value && typeof value === "object") {
    return localPathsFromUnknown(
      value.path ??
        value.localPath ??
        value.outputPath ??
        value.localOutputPath ??
        value.sourcePath ??
        value.url,
    );
  }
  const localPath = localPathFromPossiblyFileUrl(value);
  return localPath ? [localPath] : [];
}

function getValuesForKeys(payload = {}, keys = []) {
  const params = payload.params ?? {};
  const inputs = payload.inputs ?? {};
  return keys.flatMap((key) => [
    params[key],
    inputs[key],
  ]);
}

function getStudioActionSourcePaths(payload = {}, keys = ["clips", "video", "visual", "sourcePath", "inputPath", "filePath", "url"]) {
  const explicit = getValuesForKeys(payload, keys).flatMap(localPathsFromUnknown);
  if (explicit.length > 0) return explicit;
  const fallback = getStudioActionSourcePath(payload);
  return fallback ? [fallback] : [];
}

function getStudioActionPathForKeys(payload = {}, keys = []) {
  return getValuesForKeys(payload, keys).flatMap(localPathsFromUnknown).find(Boolean);
}

function getStudioActionSourcePath(payload = {}) {
  const params = payload.params ?? {};
  const inputs = payload.inputs ?? {};
  return localPathFromPossiblyFileUrl(
    firstString(
      params.sourcePath,
      params.inputPath,
      params.videoPath,
      params.audioPath,
      params.filePath,
      params.url,
      inputs.sourcePath,
      inputs.inputPath,
      inputs.video,
      inputs.audio,
      inputs.image,
      inputs.file,
      inputs.url,
    ),
  );
}

function studioActionOutputPath(outputFolder, actionId, extension) {
  const safeAction = String(actionId || "studio-action").replace(/[^a-zA-Z0-9._-]/g, "-");
  return path.join(outputFolder, `${safeAction}-${Date.now()}-${process.pid}.${extension}`);
}

function buildStudioScaleArgs({ sourcePath, outputPath, params = {} }) {
  const width = Math.max(1, Math.round(Number(params.width) || 1920));
  const height = Math.max(1, Math.round(Number(params.height) || 1080));
  const preserve = params.preserveAspectRatio !== false;
  const filter = preserve
    ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
    : `scale=${width}:${height}`;
  return [
    "-y",
    "-i",
    sourcePath,
    "-vf",
    filter,
    "-map",
    "0:v:0",
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
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

function buildStudioReverseArgs({ sourcePath, outputPath }) {
  return [
    "-y",
    "-i",
    sourcePath,
    "-vf",
    "reverse",
    "-af",
    "areverse",
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
    outputPath,
  ];
}

function videoSpeedFilters(speed, keepAudio = true) {
  const safeSpeed = Math.max(0.1, Math.min(8, Number(speed) || 1));
  const videoFilter = `setpts=${(1 / safeSpeed).toFixed(3)}*PTS`;
  if (!keepAudio) {
    return { videoFilter, audioFilter: undefined, includeAudio: false };
  }
  return { videoFilter, audioFilter: buildAtempoChain(safeSpeed), includeAudio: true };
}

function buildAtempoChain(speed) {
  let remaining = Math.max(0.5, Math.min(100, Number(speed) || 1));
  const filters = [];
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(3)}`);
  return filters.join(",");
}

function videoColorGradeFilter(params = {}) {
  const brightness = Math.max(-100, Math.min(100, Number(params.brightness ?? 0))) / 100;
  const contrast = 1 + Math.max(-100, Math.min(100, Number(params.contrast ?? 0))) / 100;
  const saturation = 1 + Math.max(-100, Math.min(100, Number(params.saturation ?? 0))) / 100;
  return `eq=brightness=${brightness.toFixed(3)}:contrast=${contrast.toFixed(3)}:saturation=${saturation.toFixed(3)}`;
}

function videoColorFilter(params = {}) {
  const filter = asString(params.filter) ?? "cinematic";
  if (filter === "grayscale") return "format=gray";
  if (filter === "sepia") return "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131";
  if (filter === "vignette") return "vignette";
  return "eq=contrast=1.080:saturation=1.150";
}

function videoEffectFilter(params = {}) {
  const effect = asString(params.effect) ?? "film-grain";
  if (effect === "vignette") return "vignette";
  if (effect === "chromatic") return "rgbashift=rh=4:bh=-4";
  return "noise=alls=12:allf=t+u,eq=contrast=1.060:saturation=1.120";
}

async function runStudioFfmpegActionWithProgress({
  operationId,
  actionId,
  sourcePath,
  sourcePaths,
  outputPath,
  params,
  ffmpegPath,
  buildArgs,
  requireEncoders = true,
}) {
  const sources = Array.isArray(sourcePaths) && sourcePaths.length > 0
    ? sourcePaths
    : sourcePath
      ? [sourcePath]
      : [];
  if (sources.length === 0) {
    throw new Error(`${actionId} requires at least one local source path.`);
  }
  const toolchain = await preflightFfmpegExport(
    { sourcePath: sources[0], outputPath, ffmpegPath },
    {},
    { requireEncoders },
  );
  for (const extraSourcePath of sources.slice(1)) {
    await fs.access(extraSourcePath);
  }
  const tempOutputPath = toTempOutputPath(outputPath);
  await ensureOutputDirectory(tempOutputPath);
  const args = buildArgs({ sourcePath: sources[0], sourcePaths: sources, outputPath: tempOutputPath, params });
  const sourceName = sources.length === 1 ? path.basename(sources[0]) : `${sources.length} sources`;
  const outputName = path.basename(outputPath);

  sendMediaProgress(operationId, {
    stage: "starting",
    percent: 0,
    clipTitle: actionId,
    sourceName,
    outputName,
    message: `Starting local ${actionId}`,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(toolchain.ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    let settled = false;

    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-8000);
      sendMediaProgress(operationId, {
        stage: "running",
        percent: 50,
        clipTitle: actionId,
        sourceName,
        outputName,
        message: `Running local ${actionId}`,
      });
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      const failure = normalizeFfmpegFailure({ error, stderr });
      void fs.unlink(tempOutputPath).catch(() => undefined);
      sendMediaProgress(operationId, {
        stage: "failed",
        percent: 0,
        clipTitle: actionId,
        sourceName,
        outputName,
        message: failure.message,
        detail: failure.detail,
        stderrTail: failure.stderrTail,
      });
      reject(new Error(failure.message));
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      void (async () => {
        if (code === 0) {
          await fs.rename(tempOutputPath, outputPath);
          allowClipperMediaPath(outputPath);
          sendMediaProgress(operationId, {
            stage: "completed",
            percent: 100,
            clipTitle: actionId,
            sourceName,
            outputName,
            message: `Completed local ${actionId}`,
          });
          resolve({ outputPath });
          return;
        }

        await fs.unlink(tempOutputPath).catch(() => undefined);
        const failure = normalizeFfmpegFailure({ code, signal, stderr });
        sendMediaProgress(operationId, {
          stage: "failed",
          percent: 0,
          clipTitle: actionId,
          sourceName,
          outputName,
          message: failure.message,
          detail: failure.detail,
          exitCode: failure.exitCode,
          signal: failure.signal,
          stderrTail: failure.stderrTail,
        });
        reject(new Error(failure.message));
      })().catch(reject);
    });
  });
}

function peaksFromFloat32Pcm(buffer, resolution) {
  const sampleCount = Math.floor(buffer.length / 4);
  const bucketCount = Math.max(1, Math.round(Number(resolution) || 1024));
  if (sampleCount === 0) {
    return [];
  }
  const bucketSize = Math.max(1, Math.ceil(sampleCount / bucketCount));
  const peaks = [];
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = bucket * bucketSize;
    if (start >= sampleCount) break;
    const end = Math.min(sampleCount, start + bucketSize);
    let peak = 0;
    for (let sample = start; sample < end; sample += 1) {
      const value = Math.abs(buffer.readFloatLE(sample * 4));
      if (Number.isFinite(value) && value > peak) peak = value;
    }
    peaks.push(Math.min(1, Number(peak.toFixed(4))));
  }
  return peaks;
}

async function extractWaveformPeaks(params = {}) {
  const operationId = asString(params.operationId) ?? `waveform-${Date.now()}`;
  const sourcePath = asString(params.sourcePath);
  const outputPath = asString(params.outputPath);
  const resolution = Math.max(64, Math.min(16384, Math.round(Number(params.resolution) || 1024)));
  const sampleRate = Math.max(100, Math.min(48000, Math.round(Number(params.sampleRate) || 8000)));
  if (!sourcePath) throw new Error("Waveform extraction requires a local source path.");

  const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
  await fs.access(sourcePath);
  if (outputPath) {
    await ensureOutputDirectory(outputPath);
  }

  const sourceName = path.basename(sourcePath);
  sendMediaProgress(operationId, {
    stage: "starting",
    percent: 0,
    clipTitle: "audio.waveform",
    sourceName,
    message: "Extracting waveform peaks locally",
  });

  return new Promise((resolve, reject) => {
    const child = spawn(
      toolchain.ffmpegPath,
      buildExtractWaveformPcmArgs({ sourcePath, sampleRate }),
      { windowsHide: true },
    );
    const chunks = [];
    let byteLength = 0;
    let stderr = "";
    let settled = false;
    const maxBytes = 64 * 1024 * 1024;

    child.stdout.on("data", (chunk) => {
      byteLength += chunk.length;
      if (byteLength <= maxBytes) {
        chunks.push(chunk);
      }
      sendMediaProgress(operationId, {
        stage: "running",
        percent: 50,
        clipTitle: "audio.waveform",
        sourceName,
        message: "Reading waveform samples",
      });
    });

    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-8000);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      const failure = normalizeFfmpegFailure({ error, stderr });
      sendMediaProgress(operationId, {
        stage: "failed",
        percent: 0,
        clipTitle: "audio.waveform",
        sourceName,
        message: failure.message,
        detail: failure.detail,
        stderrTail: failure.stderrTail,
      });
      reject(new Error(failure.message));
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      void (async () => {
        if (byteLength > maxBytes) {
          throw new Error("Waveform extraction exceeded the local sample buffer limit. Create a shorter proxy or lower the resolution.");
        }
        if (code !== 0) {
          const failure = normalizeFfmpegFailure({ code, signal, stderr });
          throw new Error(failure.message);
        }

        const peaks = peaksFromFloat32Pcm(Buffer.concat(chunks), resolution);
        const result = {
          sourcePath,
          outputPath,
          resolution,
          sampleRate,
          peaks,
        };
        if (outputPath) {
          await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
          allowClipperMediaPath(outputPath);
        }
        sendMediaProgress(operationId, {
          stage: "completed",
          percent: 100,
          clipTitle: "audio.waveform",
          sourceName,
          message: "Waveform peaks extracted",
        });
        resolve(result);
      })().catch((error) => {
        const failure = normalizeFfmpegFailure({ error, stderr });
        sendMediaProgress(operationId, {
          stage: "failed",
          percent: 0,
          clipTitle: "audio.waveform",
          sourceName,
          message: failure.message,
          detail: failure.detail,
          stderrTail: failure.stderrTail,
        });
        reject(new Error(failure.message));
      });
    });
  });
}

async function runStudioMediaAction(params = {}) {
  const operationId = asString(params.operationId) ?? `studio-media-${Date.now()}`;
  const actionId = asString(params.actionId);
  const outputFolder = asString(params.outputFolder);
  if (!actionId) throw new Error("Missing Studio media action id.");
  if (!outputFolder) throw new Error("Choose an output folder before running a local Studio media action.");

  const sourcePath = getStudioActionSourcePath(params);
  if (actionId === "video.metadata") {
    if (!sourcePath) throw new Error("Video metadata requires a local source path.");
    const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
    const { stdout } = await execFileAsync(
      toolchain.ffprobePath,
      buildFfprobeMetadataArgs(sourcePath),
      { timeout: 30000 },
    );
    const metadata = parseFfprobeMetadata(stdout);
    sendMediaProgress(operationId, { stage: "completed", percent: 100, clipTitle: actionId, message: "Metadata read locally" });
    return { metadata, outputs: [{ type: "json", data: metadata, name: "metadata" }] };
  }

  if (actionId === "audio.waveform") {
    const waveformSource = sourcePath ?? getStudioActionPathForKeys(params, ["audio", "audioPath", "sourcePath", "filePath", "url"]);
    if (!waveformSource) throw new Error("Waveform extraction requires a local audio or video source path.");
    const outputPath = studioActionOutputPath(outputFolder, actionId, "json");
    const result = await extractWaveformPeaks({
      operationId,
      sourcePath: waveformSource,
      outputPath,
      resolution: params.params?.resolution,
      ffmpegPath: params.ffmpegPath,
    });
    return {
      outputPath,
      outputs: [{ type: "json", path: outputPath, data: result, name: path.basename(outputPath) }],
    };
  }

  if (!sourcePath) {
    const multiSourceActions = new Set([
      "video.concat",
      "video.compose",
      "video.blend",
      "video.interleave",
      "video.merge-audio-video",
      "audio.merge",
    ]);
    if (!multiSourceActions.has(actionId) && !actionId.startsWith("image.")) {
      throw new Error(`${actionId} requires a local source path. Download or import media before running local FFmpeg.`);
    }
  }

  if (actionId === "video.trim") {
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const startSeconds = Number(params.params?.startMs ?? 0) / 1000;
    const durationSeconds = Number(params.params?.durationMs ?? 5000) / 1000;
    const result = await runFfmpegWithProgress(
      {
        operationId,
        sourcePath,
        outputPath,
        startSeconds,
        durationSeconds,
        clipTitle: actionId,
        ffmpegPath: params.ffmpegPath,
      },
      buildCutClipArgs,
      { requireEncoders: false },
    );
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.concat" || actionId === "video.compose" || actionId === "video.stitch") {
    const sourcePaths = getStudioActionSourcePaths(params, ["clips", "visual", "video", "videos", "sourcePaths"]);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePaths,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: buildStudioConcatArgs,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.merge-audio-video") {
    const videoPath = getStudioActionPathForKeys(params, ["video", "videoPath", "sourcePath", "inputPath", "url"]);
    const audioPath = getStudioActionPathForKeys(params, ["audio", "audioPath"]);
    if (!videoPath || !audioPath) {
      throw new Error("Merge Audio and Video needs both a local video input and a local audio input.");
    }
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePaths: [videoPath, audioPath],
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ outputPath: targetOutputPath }) => buildStudioMergeAudioVideoArgs({ videoPath, audioPath, outputPath: targetOutputPath }),
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.extract-frame") {
    const outputPath = studioActionOutputPath(outputFolder, actionId, "jpg");
    const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
    await ensureOutputDirectory(outputPath);
    await execFileAsync(
      toolchain.ffmpegPath,
      buildThumbnailArgs({ sourcePath, outputPath, atSeconds: Number(params.params?.atMs ?? 0) / 1000 }),
      { timeout: 60000 },
    );
    allowClipperMediaPath(outputPath);
    sendMediaProgress(operationId, { stage: "completed", percent: 100, clipTitle: actionId, message: "Frame extracted locally" });
    return { outputPath, outputs: [{ type: "image", path: outputPath, name: path.basename(outputPath) }] };
  }

  if (actionId === "video.extract-frames") {
    if (!sourcePath) throw new Error("Extract Video Frames requires a local video source path.");
    const outputPath = path.join(outputFolder, `video-extract-frames-${Date.now()}-${process.pid}`);
    const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
    await fs.mkdir(outputPath, { recursive: true });
    sendMediaProgress(operationId, { stage: "starting", percent: 0, clipTitle: actionId, message: "Extracting frames locally" });
    await execFileAsync(
      toolchain.ffmpegPath,
      buildStudioExtractFramesArgs({ sourcePath, outputFolder: outputPath, params: params.params }),
      { timeout: 120000 },
    );
    allowClipperMediaPath(outputPath);
    sendMediaProgress(operationId, { stage: "completed", percent: 100, clipTitle: actionId, message: "Frames extracted locally" });
    return {
      outputPath,
      outputs: [{ type: "image", path: outputPath, name: path.basename(outputPath) }],
    };
  }

  if (actionId === "video.frame-grid") {
    if (!sourcePath) throw new Error("Video to Frame Grid requires a local video source path.");
    const outputPath = studioActionOutputPath(outputFolder, actionId, "jpg");
    const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
    await ensureOutputDirectory(outputPath);
    sendMediaProgress(operationId, { stage: "starting", percent: 0, clipTitle: actionId, message: "Building local frame grid" });
    await execFileAsync(
      toolchain.ffmpegPath,
      buildStudioFrameGridArgs({ sourcePath, outputPath, params: params.params }),
      { timeout: 120000 },
    );
    allowClipperMediaPath(outputPath);
    sendMediaProgress(operationId, { stage: "completed", percent: 100, clipTitle: actionId, message: "Frame grid generated locally" });
    return { outputPath, outputs: [{ type: "image", path: outputPath, name: path.basename(outputPath) }] };
  }

  if (actionId === "video.split") {
    if (!sourcePath) throw new Error("Split Video requires a local video source path.");
    const outputPath = path.join(outputFolder, `video-split-${Date.now()}-${process.pid}`);
    const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
    await fs.mkdir(outputPath, { recursive: true });
    await fs.access(sourcePath);
    sendMediaProgress(operationId, { stage: "starting", percent: 0, clipTitle: actionId, message: "Splitting video locally" });
    await execFileAsync(
      toolchain.ffmpegPath,
      buildStudioSplitArgs({ sourcePath, outputFolder: outputPath, params: params.params }),
      { timeout: 180000 },
    );
    allowClipperMediaPath(outputPath);
    sendMediaProgress(operationId, { stage: "completed", percent: 100, clipTitle: actionId, message: "Video split completed locally" });
    return { outputPath, outputs: [{ type: "video", path: outputPath, name: path.basename(outputPath) }] };
  }

  if (actionId === "video.scale") {
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: buildStudioScaleArgs,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.blend") {
    const sourcePaths = getStudioActionSourcePaths(params, ["videoA", "videoB", "video", "videos", "sourcePaths"]);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePaths,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: buildStudioBlendArgs,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.interleave") {
    const sourcePaths = getStudioActionSourcePaths(params, ["video", "videos", "sourcePaths"]);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePaths,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: buildStudioInterleaveArgs,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.speed" || actionId === "video.slow") {
    const defaultSpeed = actionId === "video.slow" ? 0.5 : 2;
    const { videoFilter, audioFilter, includeAudio } = videoSpeedFilters(params.params?.speed ?? defaultSpeed, params.params?.keepAudio !== false);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath }) => buildStudioVideoFilterArgs({
        sourcePath: inputPath,
        outputPath: targetOutputPath,
        videoFilter,
        audioFilter,
        includeAudio,
      }),
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.boomerang") {
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath }) => buildStudioVideoFilterArgs({
        sourcePath: inputPath,
        outputPath: targetOutputPath,
        filterComplex: "[0:v]split[v0][v1];[v1]reverse[vr];[v0][vr]concat=n=2:v=1:a=0[vout]",
        mapVideo: "[vout]",
        includeAudio: false,
      }),
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.color-grade" || actionId === "video.color-filter" || actionId === "video.effect" || actionId === "video.long-exposure") {
    const videoFilter = actionId === "video.color-grade"
      ? videoColorGradeFilter(params.params)
      : actionId === "video.color-filter"
        ? videoColorFilter(params.params)
        : actionId === "video.long-exposure"
          ? `tmix=frames=${Math.round(Math.max(2, Math.min(120, Number(params.params?.blendFrames ?? 12))))}`
          : videoEffectFilter(params.params);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath }) => buildStudioVideoFilterArgs({
        sourcePath: inputPath,
        outputPath: targetOutputPath,
        videoFilter,
      }),
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.watermark") {
    const watermarkPath = getStudioActionPathForKeys(params, ["watermark", "watermarkPath", "image", "imagePath"]);
    const text = asString(params.params?.text);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePaths: watermarkPath ? [sourcePath, watermarkPath] : [sourcePath],
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath, params: actionParams }) => {
        if (watermarkPath) {
          return buildStudioWatermarkArgs({
            sourcePath: inputPath,
            watermarkPath,
            outputPath: targetOutputPath,
            params: actionParams,
          });
        }
        if (!text) {
          throw new Error("Watermark needs either a local watermark image or watermark text.");
        }
        const opacity = Math.max(0, Math.min(1, Number(actionParams.opacity ?? 0.75)));
        const escaped = text.replace(/[\\':]/g, "\\$&");
        return buildStudioVideoFilterArgs({
          sourcePath: inputPath,
          outputPath: targetOutputPath,
          videoFilter: `drawtext=text='${escaped}':x=(w-text_w)/2:y=h-th-48:fontcolor=white@${opacity.toFixed(3)}:fontsize=48:box=1:boxcolor=black@0.35`,
        });
      },
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "video.reverse") {
    const outputPath = studioActionOutputPath(outputFolder, actionId, "mp4");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: buildStudioReverseArgs,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "video", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "audio.separate") {
    const audioPath = sourcePath ?? getStudioActionPathForKeys(params, ["audio", "video", "audioPath", "sourcePath", "filePath", "url"]);
    if (!audioPath) throw new Error("Audio Separation requires a local audio or video source path.");
    const outputPath = studioActionOutputPath(outputFolder, actionId, "m4a");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath: audioPath,
      outputPath,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath }) => buildStudioAudioSeparateArgs({
        sourcePath: inputPath,
        outputPath: targetOutputPath,
      }),
      requireEncoders: false,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "audio", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "audio.merge") {
    const sourcePaths = getStudioActionSourcePaths(params, ["audio", "audios", "sourcePaths"]);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "m4a");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePaths,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: buildStudioAudioMergeArgs,
      requireEncoders: false,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "audio", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "audio.manipulate") {
    const audioPath = sourcePath ?? getStudioActionPathForKeys(params, ["audio", "audioPath", "sourcePath", "filePath", "url"]);
    if (!audioPath) throw new Error("Audio Manipulation requires a local audio source path.");
    const volume = Number(params.params?.volume ?? 1);
    const tempo = Number(params.params?.tempo ?? 1);
    const safeVolume = Number.isFinite(volume) ? Math.max(0, Math.min(3, volume)) : 1;
    const safeTempo = Number.isFinite(tempo) ? Math.max(0.5, Math.min(2, tempo)) : 1;
    const outputPath = studioActionOutputPath(outputFolder, actionId, "m4a");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath: audioPath,
      outputPath,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath }) => buildStudioAudioFilterArgs({
        sourcePath: inputPath,
        outputPath: targetOutputPath,
        filter: `volume=${safeVolume}:precision=fixed,atempo=${safeTempo}`,
      }),
      requireEncoders: false,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "audio", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "audio.loudness-normalize") {
    const audioPath = sourcePath ?? getStudioActionPathForKeys(params, ["audio", "audioPath", "sourcePath", "filePath", "url"]);
    if (!audioPath) throw new Error("Loudness Normalize requires a local audio source path.");
    const integratedLufs = Number(params.params?.integratedLufs ?? -16);
    const truePeak = Number(params.params?.truePeak ?? -1.5);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "m4a");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath: audioPath,
      outputPath,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath }) => buildStudioAudioFilterArgs({
        sourcePath: inputPath,
        outputPath: targetOutputPath,
        filter: `loudnorm=I=${Number.isFinite(integratedLufs) ? integratedLufs : -16}:TP=${Number.isFinite(truePeak) ? truePeak : -1.5}:LRA=11`,
      }),
      requireEncoders: false,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "audio", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId === "audio.compressor") {
    const audioPath = sourcePath ?? getStudioActionPathForKeys(params, ["audio", "audioPath", "sourcePath", "filePath", "url"]);
    if (!audioPath) throw new Error("Audio Compressor requires a local audio source path.");
    const threshold = Number(params.params?.threshold ?? -18);
    const ratio = Number(params.params?.ratio ?? 4);
    const attackMs = Number(params.params?.attackMs ?? 20);
    const releaseMs = Number(params.params?.releaseMs ?? 250);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "m4a");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath: audioPath,
      outputPath,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath }) => buildStudioAudioFilterArgs({
        sourcePath: inputPath,
        outputPath: targetOutputPath,
        filter: `acompressor=threshold=${Number.isFinite(threshold) ? threshold : -18}dB:ratio=${Number.isFinite(ratio) ? ratio : 4}:attack=${Number.isFinite(attackMs) ? attackMs : 20}:release=${Number.isFinite(releaseMs) ? releaseMs : 250}`,
      }),
      requireEncoders: false,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "audio", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  if (actionId.startsWith("image.")) {
    const imagePath = sourcePath ?? getStudioActionPathForKeys(params, ["image", "imagePath", "sourcePath", "filePath", "url"]);
    if (!imagePath) throw new Error(`${actionId} requires a local image source path.`);
    const outputPath = studioActionOutputPath(outputFolder, actionId, "png");
    const result = await runStudioFfmpegActionWithProgress({
      operationId,
      actionId,
      sourcePath: imagePath,
      outputPath,
      params: params.params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath, params: actionParams }) => buildStudioImageTransformArgs({
        sourcePath: inputPath,
        outputPath: targetOutputPath,
        actionId,
        params: actionParams,
      }),
      requireEncoders: false,
    });
    return { outputPath: result.outputPath, outputs: [{ type: "image", path: result.outputPath, name: path.basename(result.outputPath) }] };
  }

  throw new Error(`${actionId} is registered as a local FFmpeg action, but its desktop runner is not implemented yet.`);
}

function isAppNavigation(rawUrl) {
  if (isDev && rawUrl.startsWith(process.env.ELECTRON_RENDERER_URL)) {
    return true;
  }

  try {
    const url = new URL(rawUrl);
    return url.protocol === `${WZRD_PROTOCOL}:` && url.hostname === "app";
  } catch {
    return false;
  }
}

function findDeepLink(argv) {
  return argv.find((arg) => /^wzrd:\/\//i.test(arg));
}

function routeDeepLink(rawUrl) {
  const { appUrl, diagnostics } = resolveDeepLinkToAppUrlWithDiagnostics(rawUrl);
  logDesktopEvent("deep-link", diagnostics);
  if (!mainWindow) {
    pendingDeepLink = appUrl;
    return;
  }

  mainWindow.loadURL(appUrl).catch((error) => {
    logDesktopEvent("deep-link-load-failed", {
      error: error instanceof Error ? error.message : String(error),
      url: redactedUrlForLog(appUrl),
    });
  });
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function installApplicationMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [process.platform === "darwin" ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function installProtocolHandler() {
  protocol.handle(WZRD_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname === WZRD_MEDIA_HOST) {
        const result = await resolveClipperMediaProtocolRequest(request.url, {
          isAllowedPath: isAllowedClipperMediaPath,
        });
        if (!result.ok) {
          return new Response(result.error ?? "Media not found", { status: result.status });
        }

        return net.fetch(pathToFileURL(result.filePath).toString());
      }
    } catch {
      return new Response("Invalid protocol URL", { status: 400 });
    }

    const result = await resolveAppProtocolRequest(request.url, getDistDir());
    if (!result.ok) {
      return new Response(result.error ?? "Not found", { status: result.status });
    }

    return net.fetch(pathToFileURL(result.filePath).toString());
  });
}

function installIpcHandlers() {
  // Phase 3: QCut bridge IPC (namespaced under wzrd:qcut:*)
  setupQcutBridge();

  ipcMain.handle("wzrd:open-external", async (_event, rawUrl) => {
    if (typeof rawUrl !== "string" || !isAllowedExternalUrl(rawUrl)) {
      return false;
    }

    await shell.openExternal(rawUrl);
    return true;
  });

  ipcMain.handle("wzrd:clip-studio:select-video-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select source video",
      properties: ["openFile"],
      filters: [
        { name: "Video", extensions: ["mp4", "mov", "m4v", "webm", "mkv", "avi"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;
    const stat = await fs.stat(filePath).catch(() => null);
    allowClipperMediaPath(filePath);
    return { name: path.basename(filePath), path: filePath, size: stat?.size };
  });

  ipcMain.handle("wzrd:clip-studio:select-logo-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select Clipper logo",
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;
    const copied = await copyLogoIntoBrandingDirectory({
      sourcePath: filePath,
      brandingDir: getClipperBrandingDirectory(),
    });
    allowClipperMediaPath(copied.path);
    return copied;
  });

  ipcMain.handle("wzrd:clip-studio:select-image-files", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select heatmap screenshots",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths.map((filePath) => ({ name: path.basename(filePath), path: filePath }));
  });

  ipcMain.handle("wzrd:clip-studio:select-export-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select export folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("wzrd:clip-studio:reveal-in-finder", async (_event, filePath) => {
    if (!asString(filePath)) return false;
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle("wzrd:clip-studio:resolve-media-file-url", async (_event, params = {}) => {
    const filePath = asString(params.filePath);
    if (!filePath) throw new Error("Missing media file path.");
    const mediaUrl = buildClipperMediaUrl(filePath);
    const result = await resolveClipperMediaProtocolRequest(mediaUrl, {
      isAllowedPath: isAllowedClipperMediaPath,
    });
    if (!result.ok) {
      throw new Error(result.error ?? "Media file is not available to Clipper.");
    }
    return mediaUrl;
  });

  ipcMain.handle("wzrd:media:cache-remote", async (_event, params = {}) => {
    return cacheRemoteMedia(params);
  });

  ipcMain.handle("wzrd:clip-studio:validate-ffmpeg", async (_event, params = {}) => {
    return resolveFfmpegToolchain({ ffmpegPath: params.ffmpegPath });
  });

  ipcMain.handle("wzrd:clip-studio:get-video-metadata", async (_event, params) => {
    const filePath = asString(params?.filePath);
    if (!filePath) throw new Error("Missing video file path.");
    const toolchain = await resolveRequiredFfmpegToolchain(params?.ffmpegPath);
    const { stdout } = await execFileAsync(
      toolchain.ffprobePath,
      buildFfprobeMetadataArgs(filePath),
      { timeout: 30000 },
    );
    return parseFfprobeMetadata(stdout);
  });

  ipcMain.handle("wzrd:clip-studio:cut-clip", async (_event, params) => {
    validateClipParams(params);
    return runFfmpegWithProgress(params, buildCutClipArgs, { requireEncoders: false });
  });

  ipcMain.handle("wzrd:clip-studio:export-vertical-clip", async (_event, params) => {
    validateClipParams(params);
    return runFfmpegWithProgress(params, buildExportVerticalClipArgs);
  });

  ipcMain.handle("wzrd:clip-studio:generate-thumbnail", async (_event, params) => {
    if (!asString(params?.sourcePath)) throw new Error("Missing source video path.");
    if (!asString(params?.outputPath)) throw new Error("Missing thumbnail path.");
    if (!Number.isFinite(Number(params.atSeconds)) || Number(params.atSeconds) < 0) {
      throw new Error("Invalid thumbnail timestamp.");
    }
    const operationId = asString(params.operationId) ?? `thumb-${Date.now()}`;
    const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
    await ensureOutputDirectory(params.outputPath);
    sendFfmpegProgress(operationId, { stage: "starting", percent: 0, message: "Generating thumbnail" });
    await execFileAsync(toolchain.ffmpegPath, buildThumbnailArgs(params), { timeout: 60000 });
    allowClipperMediaPath(params.outputPath);
    sendFfmpegProgress(operationId, { stage: "completed", percent: 100, message: "Thumbnail generated" });
    return { outputPath: params.outputPath };
  });

  ipcMain.handle("wzrd:media:validate-toolchain", async (_event, params = {}) => {
    return resolveFfmpegToolchain({ ffmpegPath: params.ffmpegPath });
  });

  ipcMain.handle("wzrd:media:probe", async (_event, params = {}) => {
    const filePath = asString(params.filePath);
    if (!filePath) throw new Error("Missing media file path.");
    const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
    const { stdout } = await execFileAsync(
      toolchain.ffprobePath,
      buildFfprobeMetadataArgs(filePath),
      { timeout: 30000 },
    );
    return parseFfprobeMetadata(stdout);
  });

  ipcMain.handle("wzrd:media:cut", async (_event, params = {}) => {
    const startSeconds = Number(params.startMs) / 1000;
    const durationSeconds = Number(params.durationMs) / 1000;
    return runFfmpegWithProgress(
      {
        ...params,
        startSeconds,
        durationSeconds,
        clipTitle: params.clipTitle ?? params.actionLabel ?? "Media cut",
      },
      buildCutClipArgs,
      { requireEncoders: false },
    );
  });

  ipcMain.handle("wzrd:media:extract-thumbnail", async (_event, params = {}) => {
    const sourcePath = asString(params.sourcePath);
    const outputPath = asString(params.outputPath);
    if (!sourcePath) throw new Error("Missing source media path.");
    if (!outputPath) throw new Error("Missing thumbnail path.");
    const atMs = Number(params.atMs);
    if (!Number.isFinite(atMs) || atMs < 0) {
      throw new Error("Invalid thumbnail timestamp.");
    }
    const operationId = asString(params.operationId) ?? `media-thumb-${Date.now()}`;
    const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
    await ensureOutputDirectory(outputPath);
    sendMediaProgress(operationId, { stage: "starting", percent: 0, message: "Generating local thumbnail" });
    await execFileAsync(
      toolchain.ffmpegPath,
      buildThumbnailArgs({ sourcePath, outputPath, atSeconds: atMs / 1000 }),
      { timeout: 60000 },
    );
    allowClipperMediaPath(outputPath);
    sendMediaProgress(operationId, { stage: "completed", percent: 100, message: "Thumbnail generated" });
    return { outputPath };
  });

  ipcMain.handle("wzrd:media:extract-waveform-peaks", async (_event, params = {}) => {
    return extractWaveformPeaks(params);
  });

  ipcMain.handle("wzrd:media:render-preview-proxy", async (_event, params = {}) => {
    const sourcePath = asString(params.sourcePath);
    const outputPath = asString(params.outputPath);
    if (!sourcePath) throw new Error("Preview proxy requires a local source path.");
    if (!outputPath) throw new Error("Preview proxy requires an output path.");
    const operationId = asString(params.operationId) ?? `preview-proxy-${Date.now()}`;
    return runStudioFfmpegActionWithProgress({
      operationId,
      actionId: "render-preview-proxy",
      sourcePath,
      outputPath,
      params,
      ffmpegPath: params.ffmpegPath,
      buildArgs: ({ sourcePath: inputPath, outputPath: targetOutputPath, params: proxyParams }) => buildRenderPreviewProxyArgs({
        sourcePath: inputPath,
        outputPath: targetOutputPath,
        maxWidth: proxyParams.maxWidth,
        maxHeight: proxyParams.maxHeight,
      }),
    });
  });

  ipcMain.handle("wzrd:media:render-timeline", async (_event, params = {}) => {
    return runTimelineRenderWithProgress(params);
  });

  ipcMain.handle("wzrd:media:run-studio-action", async (_event, params = {}) => {
    return runStudioMediaAction(params);
  });

  ipcMain.handle("wzrd:clip-studio:validate-youtube-downloader", async (_event, params = {}) => {
    const downloaderPath = resolveYoutubeDownloaderPath(params.downloaderPath);
    try {
      const { stdout } = await execFileAsync(downloaderPath, ["--version"], { timeout: 10000 });
      return { available: true, version: String(stdout || "").trim().split(/\r?\n/)[0] || "yt-dlp available" };
    } catch (error) {
      return {
        available: false,
        error:
          error instanceof Error
            ? `yt-dlp is unavailable: ${error.message}`
            : "yt-dlp is unavailable. Install yt-dlp or set the downloader path in Clipper settings.",
      };
    }
  });

  ipcMain.handle("wzrd:clip-studio:download-youtube-video", async (_event, params = {}) => {
    const url = asString(params.url);
    if (!url || !isSupportedYoutubeUrl(url)) {
      throw new Error("Enter a valid youtube.com or youtu.be URL.");
    }

    const operationId = asString(params.operationId) ?? `youtube-${Date.now()}`;
    const downloaderPath = resolveYoutubeDownloaderPath(params.downloaderPath);
    let ffmpegToolchain;
    try {
      ffmpegToolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ffmpeg is required for YouTube downloads.";
      sendYoutubeDownloadProgress(operationId, { stage: "failed", percent: 0, message });
      throw new Error(message);
    }
    const importDirectory = getClipperImportDirectory();
    await fs.mkdir(importDirectory, { recursive: true });

    sendYoutubeDownloadProgress(operationId, { stage: "starting", percent: 0, message: "Reading YouTube metadata" });

    const { stdout: infoStdout } = await execFileAsync(
      downloaderPath,
      buildYoutubeInfoArgs(url),
      { timeout: 60000, maxBuffer: 1024 * 1024 * 20 },
    );
    const info = parseYoutubeInfoJson(infoStdout);
    const outputTemplate = buildYoutubeOutputTemplate(importDirectory);
    const args = buildYoutubeDownloadArgs({
      url,
      outputTemplate,
      ffmpegPath: ffmpegToolchain.ffmpegPath,
    });

    sendYoutubeDownloadProgress(operationId, { stage: "downloading", percent: 1, message: "Downloading YouTube video" });

    return new Promise((resolve, reject) => {
      const child = spawn(downloaderPath, args, { windowsHide: true });
      let output = "";

      const handleChunk = (chunk) => {
        const text = String(chunk);
        output = `${output}${text}`.slice(-20000);
        for (const line of text.split(/\r?\n/)) {
          const progress = parseYoutubeDownloadProgress(line);
          if (progress) {
            sendYoutubeDownloadProgress(operationId, progress);
          }
        }
      };

      child.stdout.on("data", handleChunk);
      child.stderr.on("data", handleChunk);

      child.on("error", (error) => {
        sendYoutubeDownloadProgress(operationId, { stage: "failed", percent: 0, message: error.message });
        reject(new Error(`yt-dlp failed to start: ${error.message}`));
      });

      child.on("close", (code) => {
        void (async () => {
          if (code !== 0) {
            const message = output.trim() || `yt-dlp exited with code ${code}`;
            sendYoutubeDownloadProgress(operationId, { stage: "failed", percent: 0, message });
            reject(new Error(message));
            return;
          }

          const parsedPath = parseYoutubeDownloadedPath(output);
          const localPath = parsedPath
            ? path.resolve(importDirectory, parsedPath)
            : await findNewestDownloadedMedia(importDirectory);
          if (!localPath) {
            sendYoutubeDownloadProgress(operationId, { stage: "failed", percent: 0, message: "Downloaded file could not be found." });
            reject(new Error("Downloaded file could not be found."));
            return;
          }
          allowClipperMediaPath(localPath);

          await downloadYoutubeSubtitlesBestEffort({ downloaderPath, url, outputTemplate, operationId });
          const stat = await fs.stat(localPath).catch(() => null);
          const captions = await readCaptionTextForVideo(localPath);
          sendYoutubeDownloadProgress(operationId, { stage: "completed", percent: 100, message: "YouTube download completed" });
          resolve({
            id: info.id,
            url: info.webpageUrl ?? url,
            title: info.title,
            uploader: info.uploader,
            localPath,
            durationSeconds: info.durationSeconds,
            viewmap: info.viewmap,
            viewmapStatus: info.viewmapStatus,
            viewmapWarning: info.viewmapWarning,
            size: stat?.size,
            ...captions,
          });
        })();
      });
    });
  });

  ipcMain.handle("wzrd:clip-studio:extract-representative-frames", async (_event, params = {}) => {
    const sourcePath = asString(params.sourcePath);
    if (!sourcePath) throw new Error("Missing source video path.");
    const duration = Number(params.durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Video duration is required before extracting frames.");
    }
    const operationId = asString(params.operationId) ?? `frames-${Date.now()}`;
    const frameDirectory = getClipperFrameDirectory(operationId);
    await fs.mkdir(frameDirectory, { recursive: true });
    const toolchain = await resolveRequiredFfmpegToolchain(params.ffmpegPath);

    const timestamps = Array.isArray(params.timestamps) && params.timestamps.length > 0
      ? params.timestamps.map(Number).filter((value) => Number.isFinite(value) && value >= 0)
      : [0.15, 0.35, 0.55, 0.75].map((ratio) => Math.max(0.5, Math.min(duration - 0.5, duration * ratio)));

    const frames = [];
    for (const timestamp of timestamps.slice(0, 6)) {
      const outputPath = path.join(frameDirectory, `frame-${Math.round(timestamp * 1000)}.jpg`);
      try {
        await execFileAsync(
          toolchain.ffmpegPath,
          buildExtractRepresentativeFrameArgs({ sourcePath, outputPath, atSeconds: timestamp }),
          { timeout: 60000 },
        );
        frames.push({
          id: `frame-${timestamp}`,
          name: `${path.basename(sourcePath)} @ ${timestamp.toFixed(2)}s`,
          timestampSeconds: timestamp,
          dataUrl: await fileToJpegDataUrl(outputPath),
        });
      } catch (error) {
        logDesktopEvent("clipper-frame-extract-failed", {
          error: error instanceof Error ? error.message : String(error),
          timestamp,
        });
      }
    }

    return frames;
  });
}

function installPermissionHandler() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    const isTrusted = isAppNavigation(url);
    callback(isTrusted && permission === "media");
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow(
    createMainWindowOptions({
      preloadPath: getPreloadPath(),
      iconPath: getIconPath(),
    }),
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAppNavigation(url)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logDesktopEvent("did-fail-load", {
      errorCode,
      errorDescription,
      isMainFrame,
      url: redactedUrlForLog(validatedURL),
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logDesktopEvent("render-process-gone", details);
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const startUrl = pendingDeepLink ?? (isDev ? process.env.ELECTRON_RENDERER_URL : getAppUrl("/"));
  pendingDeepLink = null;
  await mainWindow.loadURL(startUrl);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = findDeepLink(argv);
    if (deepLink) routeDeepLink(deepLink);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    routeDeepLink(url);
  });

  app.whenReady().then(async () => {
    app.setName("WZRD Studio");
    app.setAsDefaultProtocolClient("wzrd");
    installApplicationMenu();
    installProtocolHandler();
    installIpcHandlers();
    installPermissionHandler();

    const startupDeepLink = findDeepLink(process.argv);
    if (startupDeepLink) {
      const { appUrl, diagnostics } = resolveDeepLinkToAppUrlWithDiagnostics(startupDeepLink);
      pendingDeepLink = appUrl;
      logDesktopEvent("startup-deep-link", diagnostics);
    }

    await createMainWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
