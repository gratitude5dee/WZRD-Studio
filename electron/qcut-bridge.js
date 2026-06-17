import { ipcMain, shell, app, dialog } from "electron";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";

import * as nodePty from "node-pty";

import { resolveFfmpegToolchain, normalizeFfmpegFailure } from "./media-ffmpeg-runtime.js";
import { setupQcutMcpServer } from "./qcut-mcp-server.js";

function asString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function safeBasename(value, fallback) {
  const raw = asString(value) ?? fallback;
  return path.basename(raw);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function createSessionId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTempRoot() {
  // Note: app.getPath('temp') exists on all platforms.
  return path.join(app.getPath("temp"), "wzrd-qcut");
}

function createSessionPaths(sessionId) {
  const root = createTempRoot();
  const sessionDir = path.join(root, "export", sessionId);
  return {
    sessionDir,
    framesDir: path.join(sessionDir, "frames"),
    outputDir: path.join(sessionDir, "output"),
    stickersDir: path.join(sessionDir, "stickers"),
    tempMediaDir: path.join(sessionDir, "temp-media"),
  };
}

const sessions = new Map();

// ---------------------------------------------------------------------------
// Phase 4: PTY / Project Folder / Skills
// ---------------------------------------------------------------------------

const ptySessions = new Map(); // sessionId -> { pty, sender }

function sanitizeFolderName(value) {
  const raw = asString(value);
  if (!raw) return "project";
  return raw
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 120);
}

function getProjectRootPath(projectId) {
  const root = path.join(app.getPath("userData"), "qcut-projects");
  const folder = sanitizeFolderName(projectId);
  return path.join(root, folder);
}

function resolveSafeProjectPath(projectId, subPath = "") {
  const root = getProjectRootPath(projectId);
  const normalizedSubPath = String(subPath || "")
    .replace(/^\/+/, "")
    .replace(/\\\\/g, "/");
  const candidate = path.resolve(root, normalizedSubPath);
  const resolvedRoot = path.resolve(root);
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Invalid subPath");
  }
  return { root, absolutePath: candidate, normalizedSubPath };
}

function classifyMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const video = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
  const audio = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);
  const image = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
  if (video.has(ext)) return "video";
  if (audio.has(ext)) return "audio";
  if (image.has(ext)) return "image";
  return "unknown";
}

async function listDirectoryEntries({ projectId, subPath = "" }) {
  const { absolutePath, normalizedSubPath } = resolveSafeProjectPath(projectId, subPath);

  let dirents = [];
  try {
    dirents = await fs.readdir(absolutePath, { withFileTypes: true });
  } catch {
    // Directory may not exist yet.
    return [];
  }

  const entries = [];
  for (const dirent of dirents) {
    const name = dirent.name;
    const fullPath = path.join(absolutePath, name);
    const stat = await fs.stat(fullPath);
    const rel = normalizedSubPath ? `${normalizedSubPath}/${name}` : name;
    entries.push({
      name,
      path: fullPath,
      relativePath: rel,
      type: dirent.isDirectory() ? "unknown" : classifyMediaType(fullPath),
      size: stat.size,
      modifiedAt: stat.mtimeMs,
      isDirectory: dirent.isDirectory(),
    });
  }

  // Folders first, then by name.
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

async function scanDirectoryForMedia({ projectId, subPath = "", options = {} }) {
  const startedAt = Date.now();
  const { absolutePath, normalizedSubPath } = resolveSafeProjectPath(projectId, subPath);
  const recursive = Boolean(options?.recursive);
  const mediaOnly = Boolean(options?.mediaOnly);

  const files = [];
  const folders = new Set();
  let totalSize = 0;

  const visit = async (dirPath, relBase) => {
    let dirents = [];
    try {
      dirents = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirent of dirents) {
      const name = dirent.name;
      const fullPath = path.join(dirPath, name);
      const rel = relBase ? `${relBase}/${name}` : name;

      if (dirent.isDirectory()) {
        folders.add(rel);
        if (recursive) {
          await visit(fullPath, rel);
        }
        continue;
      }

      const type = classifyMediaType(fullPath);
      if (mediaOnly && type === "unknown") continue;

      const stat = await fs.stat(fullPath);
      totalSize += stat.size;
      files.push({
        name,
        path: fullPath,
        relativePath: rel,
        type,
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        isDirectory: false,
      });
    }
  };

  await visit(absolutePath, normalizedSubPath);

  return {
    files,
    folders: Array.from(folders).sort(),
    totalSize,
    scanTime: Date.now() - startedAt,
  };
}

async function ensureProjectFolderStructure({ projectId }) {
  const root = getProjectRootPath(projectId);
  await ensureDir(root);
  await ensureDir(path.join(root, "media"));
  await ensureDir(path.join(root, "skills"));
  await ensureDir(path.join(root, "exports"));
}

async function copyDirectoryRecursive(srcDir, destDir) {
  await ensureDir(destDir);
  const dirents = await fs.readdir(srcDir, { withFileTypes: true });
  for (const dirent of dirents) {
    const srcPath = path.join(srcDir, dirent.name);
    const destPath = path.join(destDir, dirent.name);
    if (dirent.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function parseSkillMetadata({ content, fallbackName }) {
  // Very small YAML-frontmatter parser to avoid pulling in deps.
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    const meta = {};
    for (const line of yaml.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        meta[key] = val;
      }
    }
    return {
      name: meta.name || fallbackName,
      description: meta.description || "",
      dependencies: meta.dependencies,
    };
  }

  // Try to infer from markdown heading + first paragraph.
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const lines = content.split("\n").map((l) => l.trim());
  const firstParagraph = lines.find(
    (l) => l && !l.startsWith("#") && !l.startsWith("```")
  );
  return {
    name: heading || fallbackName,
    description: firstParagraph || "",
    dependencies: undefined,
  };
}

function ensureSkillFrontmatter({ content, name, description, dependencies }) {
  const hasFrontmatter = /^---\n[\s\S]*?\n---/m.test(content);
  if (hasFrontmatter) return content;
  const fm = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    ...(dependencies ? [`dependencies: ${dependencies}`] : []),
    "---",
    "",
  ].join("\n");
  return fm + content.trimStart();
}

function getBundledSkillsRoot() {
  // Packaged app: app.getAppPath() points to app.asar. The agent-skills folder is
  // included in electron-builder 'files' patterns.
  return path.join(app.getAppPath(), "agent-skills");
}

async function listBundledSkillFolders() {
  const root = getBundledSkillsRoot();
  try {
    const dirents = await fs.readdir(root, { withFileTypes: true });
    return dirents.filter((d) => d.isDirectory()).map((d) => path.join(root, d.name));
  } catch {
    return [];
  }
}

async function ensureBundledSkillsInstalled({ projectId }) {
  const projectSkillsDir = path.join(getProjectRootPath(projectId), "skills");
  await ensureDir(projectSkillsDir);

  const markerPath = path.join(projectSkillsDir, ".wzrd-bundled-skills.v1");
  let markerExists = false;
  try {
    await fs.stat(markerPath);
    markerExists = true;
  } catch {
    markerExists = false;
  }

  const bundledFolders = await listBundledSkillFolders();
  let copied = 0;
  const warnings = [];

  for (const folderPath of bundledFolders) {
    const folderName = path.basename(folderPath);
    const dest = path.join(projectSkillsDir, folderName);

    // Don't overwrite existing skills.
    try {
      await fs.stat(dest);
      continue;
    } catch {
      // ok
    }

    try {
      await copyDirectoryRecursive(folderPath, dest);
      // Normalize main file name to Skill.md
      const possibleMain = [path.join(dest, "Skill.md"), path.join(dest, "skill.md")];
      let mainPath = null;
      for (const p of possibleMain) {
        try {
          await fs.stat(p);
          mainPath = p;
          break;
        } catch {
          // ignore
        }
      }
      if (!mainPath) {
        warnings.push(`Bundled skill '${folderName}' is missing Skill.md`);
        continue;
      }
      const content = await fs.readFile(mainPath, "utf8");
      const meta = parseSkillMetadata({ content, fallbackName: folderName });
      const normalized = ensureSkillFrontmatter({
        content,
        name: meta.name,
        description: meta.description,
        dependencies: meta.dependencies,
      });
      const targetMain = path.join(dest, "Skill.md");
      await fs.writeFile(targetMain, normalized, "utf8");
      if (path.basename(mainPath) !== "Skill.md") {
        try {
          await fs.rm(mainPath);
        } catch {
          // ignore
        }
      }
      copied++;
    } catch (e) {
      warnings.push(
        `Failed to install bundled skill '${folderName}': ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  if (!markerExists) {
    try {
      await fs.writeFile(markerPath, String(Date.now()), "utf8");
    } catch {
      // ignore
    }
  }

  return { copied, warnings };
}

function getClaudeSkillsRoot() {
  return path.join(os.homedir(), ".claude", "skills");
}

async function scanAvailableSkillFolders() {
  const results = [];
  const globalRoot = getClaudeSkillsRoot();
  try {
    const dirents = await fs.readdir(globalRoot, { withFileTypes: true });
    for (const d of dirents) {
      if (!d.isDirectory()) continue;
      const folderPath = path.join(globalRoot, d.name);
      const mainCandidates = [path.join(folderPath, "Skill.md"), path.join(folderPath, "skill.md")];
      let mainPath = null;
      for (const p of mainCandidates) {
        try {
          await fs.stat(p);
          mainPath = p;
          break;
        } catch {
          // ignore
        }
      }
      if (!mainPath) continue;
      const content = await fs.readFile(mainPath, "utf8");
      const meta = parseSkillMetadata({ content, fallbackName: d.name });
      results.push({ path: folderPath, name: meta.name, description: meta.description, bundled: false });
    }
  } catch {
    // ignore
  }

  const bundledRoot = getBundledSkillsRoot();
  try {
    const dirents = await fs.readdir(bundledRoot, { withFileTypes: true });
    for (const d of dirents) {
      if (!d.isDirectory()) continue;
      const folderPath = path.join(bundledRoot, d.name);
      const mainCandidates = [path.join(folderPath, "Skill.md"), path.join(folderPath, "skill.md")];
      let mainPath = null;
      for (const p of mainCandidates) {
        try {
          await fs.stat(p);
          mainPath = p;
          break;
        } catch {
          // ignore
        }
      }
      if (!mainPath) continue;
      const content = await fs.readFile(mainPath, "utf8");
      const meta = parseSkillMetadata({ content, fallbackName: d.name });
      results.push({ path: folderPath, name: meta.name, description: meta.description, bundled: true });
    }
  } catch {
    // ignore
  }

  // De-dupe by path
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.path)) return false;
    seen.add(r.path);
    return true;
  });
}


async function getToolchain() {
  const toolchain = await resolveFfmpegToolchain();
  if (!toolchain.available) {
    throw new Error(toolchain.error ?? "ffmpeg is unavailable");
  }
  return toolchain;
}

// ---------------------------------------------------------------------------
// Minimal FFmpeg args builder (ported from QCUT_SRC electron/ffmpeg-args-builder.ts)
// ---------------------------------------------------------------------------

const QUALITY_SETTINGS = {
  high: { crf: "18", preset: "slow" },
  medium: { crf: "23", preset: "fast" },
  low: { crf: "28", preset: "veryfast" },
};

function normalizeConcatPath(filePath) {
  return String(filePath).replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function buildAudioFilters(audioFiles, audioStartIndex) {
  if (!audioFiles?.length) {
    return { mapAudio: null, filterSteps: [] };
  }

  const singleAudio = audioFiles.length === 1 ? audioFiles[0] : null;
  if (singleAudio && (singleAudio.startTime ?? 0) <= 0 && (singleAudio.volume ?? 1) === 1) {
    return { mapAudio: `${audioStartIndex}:a`, filterSteps: [] };
  }

  const filterSteps = [];
  const mixedLabels = [];

  for (const [index, audioFile] of audioFiles.entries()) {
    const delayMs = Math.round((audioFile.startTime ?? 0) * 1000);
    const volume = audioFile.volume ?? 1;
    const outputLabel = `a_${index}`;
    const transforms = [];

    if (delayMs > 0) transforms.push(`adelay=${delayMs}|${delayMs}`);
    if (volume !== 1) transforms.push(`volume=${volume}`);

    const transformChain = transforms.length > 0 ? transforms.join(",") : "anull";
    const inputIndex = audioStartIndex + index;
    filterSteps.push(`[${inputIndex}:a]${transformChain}[${outputLabel}]`);
    mixedLabels.push(`[${outputLabel}]`);
  }

  if (mixedLabels.length === 1) {
    return { mapAudio: mixedLabels[0], filterSteps };
  }

  filterSteps.push(`${mixedLabels.join("")}amix=inputs=${mixedLabels.length}:duration=longest[a_mix]`);
  return { mapAudio: "[a_mix]", filterSteps };
}

function resolveQuality(quality) {
  return QUALITY_SETTINGS[quality] || QUALITY_SETTINGS.medium;
}

function buildCompositeEncodeArgs(options) {
  const {
    inputDir,
    outputFile,
    width,
    height,
    fps,
    duration,
    audioFiles = [],
    filterChain,
    textFilterChain,
    stickerFilterChain,
    stickerSources = [],
    imageFilterChain,
    imageSources = [],
    useVideoInput = false,
    videoInputPath,
    videoSources = [],
    trimStart,
  } = options;

  const { crf, preset } = resolveQuality(options.quality);
  const args = ["-y"];

  if (useVideoInput && videoInputPath) {
    if (!fsSync.existsSync(videoInputPath)) {
      throw new Error(`Video source not found: ${videoInputPath}`);
    }

    if ((trimStart ?? 0) > 0) {
      args.push("-ss", String(trimStart));
    }
    args.push("-i", videoInputPath);
  } else if (videoSources.length > 0) {
    if (videoSources.length === 1) {
      const videoSource = videoSources[0];
      if (!fsSync.existsSync(videoSource.path)) {
        throw new Error(`Video source not found: ${videoSource.path}`);
      }
      if ((videoSource.trimStart ?? 0) > 0) {
        args.push("-ss", String(videoSource.trimStart));
      }
      args.push("-i", videoSource.path);
    } else {
      const hasTrimmedSources = videoSources.some((video) => (video.trimStart ?? 0) > 0 || (video.trimEnd ?? 0) > 0);
      if (hasTrimmedSources) {
        throw new Error(
          "Multi-video composite with per-video trimming is not supported in WZRD Phase 3. Use a single base video."
        );
      }

      const concatFileContent = videoSources
        .map((video) => {
          if (!fsSync.existsSync(video.path)) {
            throw new Error(`Video source not found: ${video.path}`);
          }
          return `file '${normalizeConcatPath(video.path)}'`;
        })
        .join("\n");

      const concatFilePath = path.join(inputDir, "concat-composite-list.txt");
      fsSync.writeFileSync(concatFilePath, concatFileContent);
      args.push("-f", "concat", "-safe", "0", "-i", concatFilePath);
    }
  } else if (imageSources.length > 0) {
    // Image-only timeline: synthesize base layer.
    args.push("-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:d=${duration}:r=${fps}`);
  } else {
    throw new Error("Composite mode requires a video input or image sources.");
  }

  if (duration > 0) args.push("-t", String(duration));

  const validImages = [];
  for (const imageSource of imageSources) {
    if (!fsSync.existsSync(imageSource.path)) {
      continue;
    }
    validImages.push(imageSource);
    args.push("-loop", "1", "-t", String(imageSource.duration), "-i", imageSource.path);
  }

  const validStickers = [];
  for (const stickerSource of stickerSources) {
    if (!fsSync.existsSync(stickerSource.path)) {
      continue;
    }
    validStickers.push(stickerSource);
    args.push("-loop", "1", "-t", String(stickerSource.endTime), "-i", stickerSource.path);
  }

  for (const audioFile of audioFiles) {
    if (!fsSync.existsSync(audioFile.path)) {
      throw new Error(`Audio file not found: ${audioFile.path}`);
    }
    args.push("-i", audioFile.path);
  }

  // Build filter graph
  const filterSteps = [];

  // Base video label is always [0:v]
  let videoLabel = "[0:v]";
  const baseTransforms = [];
  baseTransforms.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
  baseTransforms.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`);
  baseTransforms.push(`fps=${fps}`);
  baseTransforms.push("format=yuv420p");
  filterSteps.push(`${videoLabel}${baseTransforms.join(",")}[v0]`);
  videoLabel = "[v0]";

  // Apply element filters (effects)
  if (filterChain) {
    filterSteps.push(`${videoLabel}${filterChain}[v1]`);
    videoLabel = "[v1]";
  }

  // Text overlays
  if (textFilterChain) {
    filterSteps.push(`${videoLabel}${textFilterChain}[v_text]`);
    videoLabel = "[v_text]";
  }

  // Image overlays (prebuilt filter chain expects correct input indices)
  if (imageFilterChain && validImages.length > 0) {
    filterSteps.push(`${videoLabel}${imageFilterChain}[v_img]`);
    videoLabel = "[v_img]";
  }

  // Sticker overlays
  if (stickerFilterChain && validStickers.length > 0) {
    filterSteps.push(`${videoLabel}${stickerFilterChain}[v_sticker]`);
    videoLabel = "[v_sticker]";
  }

  // Audio mixing
  const audioStartIndex = 1 + validImages.length + validStickers.length; // video is 0, then images, then stickers
  const { mapAudio, filterSteps: audioSteps } = buildAudioFilters(audioFiles, audioStartIndex);
  filterSteps.push(...audioSteps);

  if (filterSteps.length > 0) {
    args.push("-filter_complex", filterSteps.join(";"));
  }

  args.push("-map", videoLabel);
  if (mapAudio) {
    args.push("-map", mapAudio);
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    crf,
    "-pix_fmt",
    "yuv420p"
  );

  if (mapAudio) {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  args.push(outputFile);
  return args;
}

function buildDirectCopyArgs({ inputDir, outputFile, videoSources = [], audioFiles = [] }) {
  if (!videoSources?.length) {
    throw new Error("Direct copy requires videoSources");
  }

  const concatFileContent = videoSources
    .map((video) => {
      if (!fsSync.existsSync(video.path)) {
        throw new Error(`Video source not found: ${video.path}`);
      }
      return `file '${normalizeConcatPath(video.path)}'`;
    })
    .join("\n");

  const concatFilePath = path.join(inputDir, "concat-direct-copy-list.txt");
  fsSync.writeFileSync(concatFilePath, concatFileContent);

  const args = ["-y", "-f", "concat", "-safe", "0", "-i", concatFilePath, "-c", "copy"];

  // If audio overlays exist, fall back to composite mode (direct copy can't mix audio).
  if (audioFiles.length > 0) {
    throw new Error("Direct copy with audio overlays is not supported.");
  }

  args.push(outputFile);
  return args;
}

function buildFFmpegArgs(options) {
  const quality = (options.quality ?? "medium").toString();
  const normalized = {
    ...options,
    quality: quality === "high" || quality === "low" ? quality : "medium",
  };

  if (normalized.useDirectCopy) {
    return buildDirectCopyArgs(normalized);
  }

  return buildCompositeEncodeArgs(normalized);
}

async function spawnFfmpeg({ ffmpegPath, args, cwd }) {
  return await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      cwd,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject({ error, stdout, stderr });
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject({ code, signal, stdout, stderr });
      }
    });
  });
}

async function getSessionOrThrow(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Unknown export session: ${sessionId}`);
  }
  return session;
}

export function setupQcutBridge() {
  // Local MCP server + agent-command bridge
  setupQcutMcpServer({ ipcMain, app });

  // Files
  ipcMain.handle("wzrd:qcut:files:get-file-info", async (_event, filePath) => {
    const resolved = asString(filePath);
    if (!resolved) return null;
    const stat = await fs.stat(resolved);
    return {
      name: path.basename(resolved),
      path: resolved,
      size: stat.size,
      isDirectory: stat.isDirectory(),
      modifiedAt: stat.mtimeMs,
      createdAt: stat.ctimeMs,
    };
  });

  // Audio temp
  ipcMain.handle("wzrd:qcut:audio:save-temp", async (_event, { audioData, filename } = {}) => {
    const bytes = audioData instanceof Uint8Array ? audioData : null;
    if (!bytes) throw new Error("Missing audioData (Uint8Array)");

    const root = createTempRoot();
    const dir = path.join(root, "audio-temp");
    await ensureDir(dir);
    const safeName = safeBasename(filename, `audio-${Date.now()}.wav`);
    const outPath = path.join(dir, `${Date.now()}-${safeName}`);
    await fs.writeFile(outPath, Buffer.from(bytes));
    return outPath;
  });

  // Video temp
  ipcMain.handle("wzrd:qcut:video:save-temp", async (_event, { videoData, filename, sessionId } = {}) => {
    const bytes = videoData instanceof Uint8Array ? videoData : null;
    if (!bytes) throw new Error("Missing videoData (Uint8Array)");

    const sid = asString(sessionId) ?? createSessionId();
    const { tempMediaDir } = createSessionPaths(sid);
    await ensureDir(tempMediaDir);

    const safeName = safeBasename(filename, `video-${Date.now()}.mp4`);
    const outPath = path.join(tempMediaDir, `${Date.now()}-${safeName}`);
    await fs.writeFile(outPath, Buffer.from(bytes));
    return outPath;
  });

  ipcMain.handle("wzrd:qcut:video:verify-file", async (_event, filePath) => {
    const resolved = asString(filePath);
    if (!resolved) return false;
    try {
      const stat = await fs.stat(resolved);
      return stat.isFile();
    } catch {
      return false;
    }
  });

  // FFmpeg namespace
  ipcMain.handle("wzrd:qcut:ffmpeg:get-path", async () => {
    const toolchain = await getToolchain();
    return toolchain.ffmpegPath;
  });

  ipcMain.handle("wzrd:qcut:ffmpeg:check-health", async () => {
    const toolchain = await resolveFfmpegToolchain();
    return {
      ffmpegOk: Boolean(toolchain.available),
      ffprobeOk: Boolean(toolchain.ffprobeAvailable),
      ffmpegVersion: toolchain.version ?? "",
      ffprobeVersion: "",
      ffmpegPath: toolchain.ffmpegPath,
      ffprobePath: toolchain.ffprobePath,
      errors: toolchain.available ? [] : toolchain.diagnostics ?? [toolchain.error ?? "ffmpeg unavailable"],
    };
  });

  ipcMain.handle("wzrd:qcut:ffmpeg:create-export-session", async () => {
    const sessionId = createSessionId();
    const paths = createSessionPaths(sessionId);
    await ensureDir(paths.framesDir);
    await ensureDir(paths.outputDir);
    await ensureDir(paths.stickersDir);
    await ensureDir(paths.tempMediaDir);

    sessions.set(sessionId, paths);
    return { sessionId, framesDir: paths.framesDir };
  });

  ipcMain.handle("wzrd:qcut:ffmpeg:save-frame", async (_event, { sessionId, frameNumber, imageData } = {}) => {
    const sid = asString(sessionId);
    if (!sid) throw new Error("Missing sessionId");
    const session = await getSessionOrThrow(sid);

    const bytes = imageData instanceof Uint8Array ? imageData : null;
    if (!bytes) throw new Error("Missing imageData (Uint8Array)");

    const frameIndex = typeof frameNumber === "number" ? frameNumber : 0;
    const filename = `frame-${String(frameIndex).padStart(4, "0")}.png`;
    const outPath = path.join(session.framesDir, filename);
    await fs.writeFile(outPath, Buffer.from(bytes));

    return { success: true };
  });

  ipcMain.handle("wzrd:qcut:ffmpeg:save-sticker-for-export", async (_event, { sessionId, stickerId, imageData, format } = {}) => {
    const sid = asString(sessionId);
    if (!sid) throw new Error("Missing sessionId");
    const session = await getSessionOrThrow(sid);

    const bytes = imageData instanceof Uint8Array ? imageData : null;
    if (!bytes) throw new Error("Missing imageData (Uint8Array)");

    const ext = asString(format) ?? "png";
    const safeId = String(stickerId ?? "sticker").replace(/[^a-zA-Z0-9._-]/g, "-");
    const outPath = path.join(session.stickersDir, `${safeId}.${ext}`);
    await fs.writeFile(outPath, Buffer.from(bytes));

    return { success: true, path: outPath };
  });

  ipcMain.handle("wzrd:qcut:ffmpeg:open-frames-folder", async (_event, sessionId) => {
    const sid = asString(sessionId);
    if (!sid) throw new Error("Missing sessionId");
    const session = await getSessionOrThrow(sid);
    const errorMessage = await shell.openPath(session.framesDir);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  });

  ipcMain.handle("wzrd:qcut:ffmpeg:read-output-file", async (_event, filePath) => {
    const resolved = asString(filePath);
    if (!resolved) return null;
    const buffer = await fs.readFile(resolved);
    return buffer;
  });

  ipcMain.handle("wzrd:qcut:ffmpeg:cleanup-export-session", async (_event, sessionId) => {
    const sid = asString(sessionId);
    if (!sid) return false;
    const session = sessions.get(sid);
    sessions.delete(sid);
    if (!session) return false;

    // Best-effort cleanup.
    try {
      await fs.rm(session.sessionDir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    return true;
  });

  ipcMain.handle("wzrd:qcut:ffmpeg:export-video-cli", async (_event, options = {}) => {
    const sessionId = asString(options.sessionId);
    if (!sessionId) {
      return { success: false, error: "Missing sessionId" };
    }

    try {
      const session = await getSessionOrThrow(sessionId);
      const toolchain = await getToolchain();

      const outputFile = path.join(session.outputDir, "output.mp4");

      const args = buildFFmpegArgs({
        ...options,
        inputDir: session.framesDir,
        outputFile,
      });

      await spawnFfmpeg({ ffmpegPath: toolchain.ffmpegPath, args, cwd: session.sessionDir });

      return { success: true, outputFile };
    } catch (error) {
      const normalized = normalizeFfmpegFailure({ error });
      return { success: false, error: normalized.message, outputFile: undefined, detail: normalized.detail };
    }
  });

  ipcMain.handle("wzrd:qcut:ffmpeg:extract-audio", async (_event, { videoPath, format } = {}) => {
    const input = asString(videoPath);
    if (!input) throw new Error("Missing videoPath");

    const toolchain = await getToolchain();
    const ext = (asString(format) ?? "wav").replace(/[^a-z0-9]/gi, "");
    const root = createTempRoot();
    const dir = path.join(root, "extract-audio");
    await ensureDir(dir);

    const outPath = path.join(dir, `${Date.now()}-audio.${ext || "wav"}`);
    const args = [
      "-y",
      "-i",
      input,
      "-vn",
      ...(ext === "mp3" ? ["-c:a", "libmp3lame", "-q:a", "2"] : ["-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1"]),
      outPath,
    ];

    await spawnFfmpeg({ ffmpegPath: toolchain.ffmpegPath, args, cwd: dir });
    const stat = await fs.stat(outPath);
    return { audioPath: outPath, fileSize: stat.size };
  });

  // ---------------------------------------------------------------------------
  // Phase 4: PTY Terminal
  // ---------------------------------------------------------------------------

  ipcMain.handle("wzrd:qcut:pty:spawn", async (event, options = {}) => {
    const shellPath = asString(options.shell) || process.env.SHELL || "/bin/zsh";
    const command = asString(options.command);
    const cwd = asString(options.cwd) || app.getPath("home");
    const cols = typeof options.cols === "number" ? options.cols : 80;
    const rows = typeof options.rows === "number" ? options.rows : 24;
    const env = { ...process.env, ...(options.env || {}) };

    const args = command ? ["-lc", command] : [];
    const sessionId = randomUUID();

    try {
      const pty = nodePty.spawn(shellPath, args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env,
      });

      const sender = event.sender;
      ptySessions.set(sessionId, { pty, senderId: sender.id, sender });

      pty.onData((data) => {
        const session = ptySessions.get(sessionId);
        if (!session) return;
        if (session.sender?.isDestroyed?.()) return;
        session.sender.send("wzrd:qcut:pty:data", { sessionId, data });
      });

      pty.onExit(({ exitCode }) => {
        const session = ptySessions.get(sessionId);
        ptySessions.delete(sessionId);
        if (!session) return;
        if (session.sender?.isDestroyed?.()) return;
        session.sender.send("wzrd:qcut:pty:exit", {
          sessionId,
          exitCode: typeof exitCode === "number" ? exitCode : 0,
        });
      });

      return { success: true, sessionId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("wzrd:qcut:pty:write", async (event, { sessionId, data } = {}) => {
    const sid = asString(sessionId);
    if (!sid) return;
    const session = ptySessions.get(sid);
    if (!session) return;
    // Security: only allow controlling PTYs spawned by this renderer.
    if (session.senderId !== event.sender.id) return;
    session.pty.write(String(data ?? ""));
  });

  ipcMain.handle("wzrd:qcut:pty:resize", async (event, { sessionId, cols, rows } = {}) => {
    const sid = asString(sessionId);
    if (!sid) return;
    const session = ptySessions.get(sid);
    if (!session) return;
    if (session.senderId !== event.sender.id) return;
    const c = typeof cols === "number" ? cols : 80;
    const r = typeof rows === "number" ? rows : 24;
    try {
      session.pty.resize(c, r);
    } catch {
      // ignore
    }
  });

  ipcMain.handle("wzrd:qcut:pty:kill", async (event, { sessionId } = {}) => {
    const sid = asString(sessionId);
    if (!sid) return;
    const session = ptySessions.get(sid);
    if (!session) return;
    if (session.senderId !== event.sender.id) return;
    try {
      session.pty.kill();
    } catch {
      // ignore
    } finally {
      ptySessions.delete(sid);
    }
  });

  ipcMain.handle("wzrd:qcut:pty:kill-all", async (event) => {
    for (const [sid, session] of ptySessions.entries()) {
      if (session.senderId !== event.sender.id) continue;
      try {
        session.pty.kill();
      } catch {
        // ignore
      } finally {
        ptySessions.delete(sid);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Phase 4: Project Folder
  // ---------------------------------------------------------------------------

  ipcMain.handle("wzrd:qcut:project-folder:get-root", async (_event, { projectId } = {}) => {
    const pid = asString(projectId);
    if (!pid) throw new Error("Missing projectId");
    await ensureProjectFolderStructure({ projectId: pid });
    return getProjectRootPath(pid);
  });

  ipcMain.handle("wzrd:qcut:project-folder:ensure-structure", async (_event, { projectId } = {}) => {
    const pid = asString(projectId);
    if (!pid) throw new Error("Missing projectId");
    await ensureProjectFolderStructure({ projectId: pid });
  });

  ipcMain.handle("wzrd:qcut:project-folder:list", async (_event, { projectId, subPath } = {}) => {
    const pid = asString(projectId);
    if (!pid) throw new Error("Missing projectId");
    await ensureProjectFolderStructure({ projectId: pid });
    return await listDirectoryEntries({ projectId: pid, subPath: asString(subPath) ?? "" });
  });

  ipcMain.handle("wzrd:qcut:project-folder:scan", async (_event, { projectId, subPath, options } = {}) => {
    const pid = asString(projectId);
    if (!pid) throw new Error("Missing projectId");
    await ensureProjectFolderStructure({ projectId: pid });
    return await scanDirectoryForMedia({
      projectId: pid,
      subPath: asString(subPath) ?? "",
      options: options || {},
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 4: Skills
  // ---------------------------------------------------------------------------

  ipcMain.handle("wzrd:qcut:skills:get-path", async (_event, { projectId } = {}) => {
    const pid = asString(projectId);
    if (!pid) throw new Error("Missing projectId");
    await ensureProjectFolderStructure({ projectId: pid });
    return path.join(getProjectRootPath(pid), "skills");
  });

  ipcMain.handle("wzrd:qcut:skills:list", async (_event, { projectId } = {}) => {
    const pid = asString(projectId);
    if (!pid) throw new Error("Missing projectId");
    await ensureProjectFolderStructure({ projectId: pid });
    const installed = await ensureBundledSkillsInstalled({ projectId: pid });
    const projectSkillsDir = path.join(getProjectRootPath(pid), "skills");
    const dirents = await fs.readdir(projectSkillsDir, { withFileTypes: true });
    const items = [];
    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;
      const folderName = dirent.name;
      const folderPath = path.join(projectSkillsDir, folderName);
      const mainCandidates = [path.join(folderPath, "Skill.md"), path.join(folderPath, "skill.md")];
      let mainPath = null;
      for (const candidate of mainCandidates) {
        try {
          await fs.stat(candidate);
          mainPath = candidate;
          break;
        } catch {
          // ignore
        }
      }
      if (!mainPath) continue;
      const content = await fs.readFile(mainPath, "utf8");
      const meta = parseSkillMetadata({ content, fallbackName: folderName });
      const normalized = ensureSkillFrontmatter({
        content,
        name: meta.name,
        description: meta.description,
        dependencies: meta.dependencies,
      });
      const normalizedMain = path.join(folderPath, "Skill.md");
      if (mainPath !== normalizedMain) {
        await fs.writeFile(normalizedMain, normalized, "utf8");
      }
      const mainStat = await fs.stat(normalizedMain);
      const additional = [];
      try {
        const files = await fs.readdir(folderPath, { withFileTypes: true });
        for (const f of files) {
          if (!f.isFile()) continue;
          if (f.name.toLowerCase() === "skill.md") continue;
          additional.push(f.name);
        }
      } catch {
        // ignore
      }
      items.push({
        id: folderName,
        name: meta.name,
        description: meta.description,
        dependencies: meta.dependencies,
        folderName,
        mainFile: "Skill.md",
        additionalFiles: additional,
        content: normalized,
        createdAt: mainStat.ctimeMs,
        updatedAt: mainStat.mtimeMs,
      });
    }
    // If bundled skill install had warnings, surface them as pseudo-skills? We'll just log.
    if (installed.warnings?.length) {
      console.warn("[WZRD/QCut] Bundled skills warnings", installed.warnings);
    }
    return items;
  });

  ipcMain.handle("wzrd:qcut:skills:scan-global", async () => {
    return await scanAvailableSkillFolders();
  });

  ipcMain.handle("wzrd:qcut:skills:browse", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select a skill folder",
      properties: ["openDirectory"],
    });
    if (result.canceled) return null;
    return result.filePaths?.[0] ?? null;
  });

  ipcMain.handle("wzrd:qcut:skills:import", async (_event, { projectId, sourcePath } = {}) => {
    const pid = asString(projectId);
    const src = asString(sourcePath);
    if (!pid) throw new Error("Missing projectId");
    if (!src) throw new Error("Missing sourcePath");
    await ensureProjectFolderStructure({ projectId: pid });
    const projectSkillsDir = path.join(getProjectRootPath(pid), "skills");
    await ensureDir(projectSkillsDir);

    const baseFolderName = sanitizeFolderName(path.basename(src));
    let folderName = baseFolderName || `skill-${Date.now()}`;
    let dest = path.join(projectSkillsDir, folderName);
    for (let i = 1; i < 50; i++) {
      try {
        await fs.stat(dest);
        folderName = `${baseFolderName}-${i}`;
        dest = path.join(projectSkillsDir, folderName);
      } catch {
        break;
      }
    }

    await copyDirectoryRecursive(src, dest);

    // Normalize main file
    const mainCandidates = [path.join(dest, "Skill.md"), path.join(dest, "skill.md")];
    let mainPath = null;
    for (const candidate of mainCandidates) {
      try {
        await fs.stat(candidate);
        mainPath = candidate;
        break;
      } catch {
        // ignore
      }
    }
    if (!mainPath) return null;
    const content = await fs.readFile(mainPath, "utf8");
    const meta = parseSkillMetadata({ content, fallbackName: folderName });
    const normalized = ensureSkillFrontmatter({
      content,
      name: meta.name,
      description: meta.description,
      dependencies: meta.dependencies,
    });
    await fs.writeFile(path.join(dest, "Skill.md"), normalized, "utf8");
    if (path.basename(mainPath) !== "Skill.md") {
      try {
        await fs.rm(mainPath);
      } catch {
        // ignore
      }
    }

    const mainStat = await fs.stat(path.join(dest, "Skill.md"));
    const additional = [];
    try {
      const files = await fs.readdir(dest, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile()) continue;
        if (f.name.toLowerCase() === "skill.md") continue;
        additional.push(f.name);
      }
    } catch {
      // ignore
    }

    return {
      id: folderName,
      name: meta.name,
      description: meta.description,
      dependencies: meta.dependencies,
      folderName,
      mainFile: "Skill.md",
      additionalFiles: additional,
      content: normalized,
      createdAt: mainStat.ctimeMs,
      updatedAt: mainStat.mtimeMs,
    };
  });

  ipcMain.handle("wzrd:qcut:skills:delete", async (_event, { projectId, skillId } = {}) => {
    const pid = asString(projectId);
    const sid = asString(skillId);
    if (!pid) throw new Error("Missing projectId");
    if (!sid) throw new Error("Missing skillId");
    if (sid.includes("..") || sid.includes("/") || sid.includes("\\")) {
      throw new Error("Invalid skillId");
    }
    const folderPath = path.join(getProjectRootPath(pid), "skills", sid);
    try {
      await fs.rm(folderPath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("wzrd:qcut:skills:get-content", async (_event, { projectId, skillId, filename } = {}) => {
    const pid = asString(projectId);
    const sid = asString(skillId);
    const file = asString(filename) || "";
    if (!pid) throw new Error("Missing projectId");
    if (!sid) throw new Error("Missing skillId");
    if (!file) throw new Error("Missing filename");
    if ([sid, file].some((v) => v.includes("..") || v.includes("/") || v.includes("\\"))) {
      throw new Error("Invalid path");
    }
    const filePath = path.join(getProjectRootPath(pid), "skills", sid, file);
    try {
      return await fs.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  });

  ipcMain.handle("wzrd:qcut:skills:sync-for-claude", async (_event, { projectId } = {}) => {
    const pid = asString(projectId);
    if (!pid) throw new Error("Missing projectId");
    const projectSkillsDir = path.join(getProjectRootPath(pid), "skills");
    await ensureDir(projectSkillsDir);

    const destRoot = getClaudeSkillsRoot();
    await ensureDir(destRoot);
    const prefix = `wzrd-qcut-${sanitizeFolderName(pid)}-`;
    const warnings = [];
    let copied = 0;
    let skipped = 0;
    let removed = 0;

    const desired = new Set();
    const projectDirents = await fs.readdir(projectSkillsDir, { withFileTypes: true });
    for (const d of projectDirents) {
      if (!d.isDirectory()) continue;
      const folderName = d.name;
      const src = path.join(projectSkillsDir, folderName);
      const destName = `${prefix}${folderName}`;
      desired.add(destName);
      const dest = path.join(destRoot, destName);
      try {
        await fs.stat(dest);
        skipped++;
        continue;
      } catch {
        // ok
      }
      try {
        await copyDirectoryRecursive(src, dest);
        copied++;
      } catch (e) {
        warnings.push(`Failed to sync skill '${folderName}': ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Remove stale synced skills
    try {
      const dirents = await fs.readdir(destRoot, { withFileTypes: true });
      for (const d of dirents) {
        if (!d.isDirectory()) continue;
        if (!d.name.startsWith(prefix)) continue;
        if (desired.has(d.name)) continue;
        try {
          await fs.rm(path.join(destRoot, d.name), { recursive: true, force: true });
          removed++;
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    return { synced: true, copied, skipped, removed, warnings };
  });
}
