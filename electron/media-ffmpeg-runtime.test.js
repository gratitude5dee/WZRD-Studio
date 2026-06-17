import { describe, expect, it } from "vitest";

import {
  buildFfmpegCandidatePaths,
  normalizeFfmpegFailure,
  preflightFfmpegExport,
  resolveFfmpegToolchain,
  toTempOutputPath,
} from "./media-ffmpeg-runtime.js";

describe("shared Electron media ffmpeg runtime", () => {
  it("auto-detects ffmpeg using override, macOS defaults, local bin, then PATH fallback", async () => {
    expect(buildFfmpegCandidatePaths({ ffmpegPath: "/custom/ffmpeg", env: { HOME: "/Users/me" } })).toEqual([
      "/custom/ffmpeg",
    ]);
    expect(buildFfmpegCandidatePaths({ env: { HOME: "/Users/me" } })).toEqual([
      "/opt/homebrew/bin/ffmpeg",
      "/usr/local/bin/ffmpeg",
      "/Users/me/.local/bin/ffmpeg",
      "ffmpeg",
    ]);

    const available = new Set(["/usr/local/bin/ffmpeg", "/usr/local/bin/ffprobe"]);
    const result = await resolveFfmpegToolchain(
      { env: { HOME: "/Users/me" } },
      {
        execFile: async (command) => {
          if (!available.has(command)) {
            const error = new Error(`spawn ${command} ENOENT`);
            error.code = "ENOENT";
            throw error;
          }
          return { stdout: `${command} version 7.0\n` };
        },
      },
    );

    expect(result).toMatchObject({
      available: true,
      ffmpegPath: "/usr/local/bin/ffmpeg",
      ffprobePath: "/usr/local/bin/ffprobe",
      ffprobeAvailable: true,
    });
  });

  it("preflights readable source/logo, writable output folder, ffprobe, libx264, and AAC", async () => {
    const calls = [];
    const result = await preflightFfmpegExport(
      {
        sourcePath: "/tmp/source.mp4",
        outputPath: "/tmp/out/render.mp4",
        logoPath: "/tmp/logo.png",
      },
      {
        access: async (filePath) => calls.push(["access", filePath]),
        mkdir: async (dirPath) => calls.push(["mkdir", dirPath]),
        writeFile: async (filePath) => calls.push(["writeFile", filePath]),
        unlink: async (filePath) => calls.push(["unlink", filePath]),
        execFile: async (command, args) => {
          if (args.includes("-encoders")) {
            return { stdout: " V..... libx264 H.264 encoder\n A..... aac AAC encoder\n" };
          }
          return { stdout: `${command} version 7.0\n` };
        },
      },
    );

    expect(result.available).toBe(true);
    expect(calls).toContainEqual(["access", "/tmp/source.mp4"]);
    expect(calls).toContainEqual(["access", "/tmp/logo.png"]);
    expect(calls.some(([kind, filePath]) => kind === "writeFile" && String(filePath).includes(".wzrd-write-test-"))).toBe(true);
  });

  it("normalizes common ffmpeg failures for UI reporting", () => {
    const missing = new Error("spawn ffmpeg ENOENT");
    missing.code = "ENOENT";

    expect(normalizeFfmpegFailure({ error: missing }).message).toMatch(/ffmpeg was not found/i);
    expect(normalizeFfmpegFailure({ code: 1, stderr: "Unknown encoder 'aac'" }).message).toMatch(/AAC/i);
    expect(normalizeFfmpegFailure({ code: -2 }).message).toMatch(/interrupted|stopped/i);
    expect(toTempOutputPath("/tmp/My Clip!.mp4")).toMatch(/\/tmp\/\.My-Clip\..*\.tmp\.mp4$/);
  });
});
