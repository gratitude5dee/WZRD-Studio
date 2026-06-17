import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { asString, resolveFfprobePath } from "./clip-studio-ffmpeg.js";

const execFileAsync = promisify(execFile);

export const COMMON_MAC_FFMPEG_PATHS = [
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "$HOME/.local/bin/ffmpeg",
];

function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/)[0]?.trim() || "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function buildFfmpegCandidatePaths({ ffmpegPath, env = process.env } = {}) {
  const override = asString(ffmpegPath);
  if (override) return [override];

  const home = asString(env.HOME) ?? os.homedir();
  return unique([
    ...COMMON_MAC_FFMPEG_PATHS.map((candidate) => candidate.replace("$HOME", home)),
    "ffmpeg",
  ]);
}

function isMissingBinaryError(error) {
  return error?.code === "ENOENT" || /ENOENT|not found|no such file/i.test(asErrorMessage(error));
}

async function runVersion(command, deps) {
  const result = await deps.execFile(command, ["-version"], { timeout: 10000 });
  return firstLine(result?.stdout) || `${command} available`;
}

export async function resolveFfmpegToolchain(options = {}, deps = {}) {
  const runtime = {
    execFile: deps.execFile ?? execFileAsync,
  };
  const candidates = buildFfmpegCandidatePaths(options);
  const diagnostics = [];
  const explicitOverride = Boolean(asString(options.ffmpegPath));

  for (const candidate of candidates) {
    try {
      const version = await runVersion(candidate, runtime);
      const ffprobePath = resolveFfprobePath(candidate);
      try {
        await runVersion(ffprobePath, runtime);
      } catch (ffprobeError) {
        return {
          available: false,
          version,
          ffmpegPath: candidate,
          ffprobePath,
          ffprobeAvailable: false,
          diagnostics: [...diagnostics, `${ffprobePath}: ${asErrorMessage(ffprobeError)}`],
          error: `ffprobe was not found next to the resolved ffmpeg at ${candidate}. Install ffprobe or set a complete ffmpeg path override.`,
        };
      }

      return {
        available: true,
        version,
        ffmpegPath: candidate,
        ffprobePath,
        ffprobeAvailable: true,
        diagnostics,
      };
    } catch (error) {
      diagnostics.push(`${candidate}: ${asErrorMessage(error)}`);
      if (explicitOverride || !isMissingBinaryError(error)) {
        return {
          available: false,
          ffmpegPath: candidate,
          ffprobePath: resolveFfprobePath(candidate),
          ffprobeAvailable: false,
          diagnostics,
          error: explicitOverride
            ? `The configured ffmpeg path could not be used: ${asErrorMessage(error)}`
            : `ffmpeg is unavailable: ${asErrorMessage(error)}`,
        };
      }
    }
  }

  return {
    available: false,
    ffmpegPath: candidates.at(-1) ?? "ffmpeg",
    ffprobePath: "ffprobe",
    ffprobeAvailable: false,
    diagnostics,
    error: "ffmpeg was not found. Install ffmpeg or set the ffmpeg path in desktop media settings.",
  };
}

async function assertReadableFile(filePath, label, deps) {
  const resolved = asString(filePath);
  if (!resolved) throw new Error(`Missing ${label} path.`);
  try {
    await deps.access(resolved);
  } catch (error) {
    throw new Error(`${label} could not be read: ${asErrorMessage(error)}`);
  }
}

async function assertWritableDirectory(outputPath, deps) {
  const directory = path.dirname(outputPath);
  try {
    await deps.mkdir(directory, { recursive: true });
    const probePath = path.join(directory, `.wzrd-write-test-${Date.now()}-${process.pid}`);
    await deps.writeFile(probePath, "");
    await deps.unlink(probePath).catch(() => undefined);
  } catch (error) {
    throw new Error(`Export folder is not writable: ${asErrorMessage(error)}`);
  }
}

function hasEncoder(output, name) {
  return new RegExp(`(^|\\s)${name}(\\s|$)`, "m").test(String(output || ""));
}

async function assertRequiredEncoders(ffmpegPath, deps) {
  const { stdout } = await deps.execFile(ffmpegPath, ["-hide_banner", "-encoders"], { timeout: 15000, maxBuffer: 1024 * 1024 * 4 });
  if (!hasEncoder(stdout, "libx264")) {
    throw new Error("The resolved ffmpeg build does not include the libx264 encoder required for MP4 export.");
  }
  if (!hasEncoder(stdout, "aac")) {
    throw new Error("The resolved ffmpeg build does not include the AAC encoder required to preserve audio.");
  }
}

export async function preflightFfmpegExport(params = {}, deps = {}, options = {}) {
  const runtime = {
    access: deps.access ?? fs.access,
    mkdir: deps.mkdir ?? fs.mkdir,
    writeFile: deps.writeFile ?? fs.writeFile,
    unlink: deps.unlink ?? fs.unlink,
    execFile: deps.execFile ?? execFileAsync,
  };

  const sourcePath = asString(params.sourcePath);
  const outputPath = asString(params.outputPath);
  if (!outputPath) throw new Error("Missing output path.");

  await assertReadableFile(sourcePath, "Source media", runtime);
  if (asString(params.logoPath)) {
    await assertReadableFile(params.logoPath, "Brand logo", runtime);
  }
  await assertWritableDirectory(outputPath, runtime);

  const toolchain = await resolveFfmpegToolchain({ ffmpegPath: params.ffmpegPath }, { execFile: runtime.execFile });
  if (!toolchain.available) {
    throw new Error(toolchain.error ?? "ffmpeg is unavailable.");
  }
  if (options.requireEncoders !== false) {
    await assertRequiredEncoders(toolchain.ffmpegPath, runtime);
  }
  return toolchain;
}

export function toTempOutputPath(outputPath) {
  const directory = path.dirname(outputPath);
  const extension = path.extname(outputPath) || ".mp4";
  const base = path.basename(outputPath, extension).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "") || "media";
  return path.join(directory, `.${base}.${Date.now()}-${process.pid}.tmp${extension}`);
}

function stderrTail(stderr) {
  return String(stderr || "").trim().slice(-8000);
}

export function normalizeFfmpegFailure({ error, code, signal, stderr } = {}) {
  const tail = stderrTail(stderr);
  const rawMessage = error ? asErrorMessage(error) : tail;
  const evidence = tail || rawMessage;
  let message = "ffmpeg failed during local media processing.";
  let detail = tail || rawMessage;

  if (error?.code === "ENOENT" || /spawn .*ENOENT|ffmpeg.*not found/i.test(rawMessage)) {
    message = "ffmpeg was not found. Install ffmpeg or set the ffmpeg path in desktop media settings.";
  } else if (signal || Number(code) < 0) {
    message = "ffmpeg was interrupted or stopped before local media processing completed.";
  } else if (/ffprobe/i.test(rawMessage) && /not found|ENOENT|unavailable/i.test(rawMessage)) {
    message = "ffprobe was not found next to ffmpeg. Install ffprobe or set a complete ffmpeg path override.";
  } else if (/Unknown encoder 'libx264'|libx264/i.test(evidence)) {
    message = "The selected ffmpeg build does not include libx264, which is required for MP4 export.";
  } else if (/Unknown encoder 'aac'|AAC encoder/i.test(evidence)) {
    message = "The selected ffmpeg build does not include AAC audio encoding.";
  } else if (/Permission denied|Operation not permitted|not writable/i.test(evidence)) {
    message = "The export folder is not writable. Choose another folder or update permissions.";
  } else if (/No such file or directory|could not be read|Invalid data found/i.test(evidence)) {
    message = "A source, logo, or output file path could not be read. Check that the files still exist.";
  } else if (/Error initializing complex filters|Error reinitializing filters|Failed to configure output pad|Error while filtering/i.test(evidence)) {
    message = "The local ffmpeg filter graph failed. Check unsupported effects, overlays, or source media compatibility.";
  }

  return {
    message,
    detail: detail || message,
    exitCode: typeof code === "number" ? code : undefined,
    signal: signal || undefined,
    stderrTail: tail || undefined,
  };
}
