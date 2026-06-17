import { describe, expect, it } from "vitest";

import {
  VERTICAL_9_16_FILTER,
  buildCutClipArgs,
  buildExportVerticalClipArgs,
  buildFfprobeMetadataArgs,
  buildThumbnailArgs,
  parseFfmpegProgressTime,
  parseFfprobeMetadata,
  resolveFfmpegPath,
  resolveFfprobePath,
  validateClipParams,
} from "./clip-studio-ffmpeg.js";
import {
  buildFfmpegCandidatePaths,
  normalizeFfmpegFailure,
  preflightFfmpegExport,
  resolveFfmpegToolchain,
} from "./clip-studio-ffmpeg-runtime.js";

describe("Electron Clip Studio ffmpeg helpers", () => {
  it("builds desktop cut and vertical export commands with audio preserved", () => {
    expect(
      buildCutClipArgs({
        sourcePath: "/tmp/source.mp4",
        outputPath: "/tmp/out.mp4",
        startSeconds: 12.3456,
        durationSeconds: 30,
      }),
    ).toEqual([
      "-y",
      "-ss",
      "12.346",
      "-i",
      "/tmp/source.mp4",
      "-t",
      "30.000",
      "-map",
      "0",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "/tmp/out.mp4",
    ]);

    const vertical = buildExportVerticalClipArgs({
      sourcePath: "/tmp/source.mp4",
      outputPath: "/tmp/vertical.mp4",
      startSeconds: 0,
      durationSeconds: 60,
    });

    expect(vertical).toContain(VERTICAL_9_16_FILTER);
    expect(vertical).toContain("0:a?");
    expect(vertical).toContain("aac");
  });

  it("builds branded vertical exports with logo fade overlays and audio preserved", () => {
    const branded = buildExportVerticalClipArgs({
      sourcePath: "/tmp/source.mp4",
      outputPath: "/tmp/branded.mp4",
      startSeconds: 0,
      durationSeconds: 45,
      logoPath: "/tmp/logo.png",
      logoOpacity: 0.5,
      logoIntroSeconds: 3,
    });

    expect(branded).toContain("-filter_complex");
    expect(branded).toContain("/tmp/logo.png");
    expect(branded).toContain("0:a?");
    expect(branded).toContain("aac");
    const filter = branded[branded.indexOf("-filter_complex") + 1];
    expect(filter).toContain(VERTICAL_9_16_FILTER);
    expect(filter).toContain("fade=t=in:st=0.000");
    expect(filter).toContain("fade=t=out:st=2.500");
    expect(filter).toContain("colorchannelmixer=aa=0.500");
    expect(filter).toContain("overlay=x=(W-w)/2:y=H-h-96");
    expect(filter).toContain("enable='gte(t,3.000)'");
  });

  it("builds metadata and thumbnail commands used by IPC handlers", () => {
    expect(buildFfprobeMetadataArgs("/tmp/source.mp4")).toEqual([
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      "/tmp/source.mp4",
    ]);
    expect(
      buildThumbnailArgs({
        sourcePath: "/tmp/source.mp4",
        outputPath: "/tmp/thumb.jpg",
        atSeconds: 5,
      }),
    ).toContain("-frames:v");
  });

  it("parses ffprobe metadata and ffmpeg progress stderr", () => {
    const metadata = parseFfprobeMetadata(
      JSON.stringify({
        streams: [
          {
            codec_type: "video",
            duration: "38.5",
            width: 1920,
            height: 1080,
            avg_frame_rate: "60000/1001",
            codec_name: "h264",
          },
        ],
        format: { bit_rate: "9000000", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      }),
    );

    expect(metadata).toMatchObject({
      durationSeconds: 38.5,
      width: 1920,
      height: 1080,
      codec: "h264",
      bitrate: 9000000,
    });
    expect(metadata.fps).toBeCloseTo(59.94, 2);
    expect(parseFfmpegProgressTime("frame=10 time=00:01:02.50 bitrate=1kbits/s")).toBe(62.5);
  });

  it("validates paths, durations, and ffmpeg path overrides", () => {
    expect(() =>
      validateClipParams({
        sourcePath: "/tmp/source.mp4",
        outputPath: "/tmp/out.mp4",
        startSeconds: 0,
        durationSeconds: 15,
      }),
    ).not.toThrow();
    expect(() => validateClipParams({ sourcePath: "", outputPath: "/tmp/out.mp4", startSeconds: 0, durationSeconds: 15 })).toThrow(
      /source video path/i,
    );
    expect(resolveFfmpegPath("")).toBe("ffmpeg");
    expect(resolveFfprobePath("/opt/homebrew/bin/ffmpeg")).toBe("/opt/homebrew/bin/ffprobe");
  });

  it("auto-detects ffmpeg from override, common macOS paths, and PATH fallback", async () => {
    expect(buildFfmpegCandidatePaths({ ffmpegPath: "/custom/bin/ffmpeg", env: { HOME: "/Users/me" } })).toEqual([
      "/custom/bin/ffmpeg",
    ]);
    expect(buildFfmpegCandidatePaths({ env: { HOME: "/Users/me" } })).toEqual([
      "/opt/homebrew/bin/ffmpeg",
      "/usr/local/bin/ffmpeg",
      "/Users/me/.local/bin/ffmpeg",
      "ffmpeg",
    ]);

    const available = new Set(["/Users/me/.local/bin/ffmpeg", "/Users/me/.local/bin/ffprobe"]);
    const attempts = [];
    const result = await resolveFfmpegToolchain(
      { env: { HOME: "/Users/me" } },
      {
        execFile: async (command) => {
          attempts.push(command);
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
      ffmpegPath: "/Users/me/.local/bin/ffmpeg",
      ffprobePath: "/Users/me/.local/bin/ffprobe",
      ffprobeAvailable: true,
    });
    expect(attempts).toEqual([
      "/opt/homebrew/bin/ffmpeg",
      "/usr/local/bin/ffmpeg",
      "/Users/me/.local/bin/ffmpeg",
      "/Users/me/.local/bin/ffprobe",
    ]);
  });

  it("reports missing sibling ffprobe for the resolved ffmpeg", async () => {
    const result = await resolveFfmpegToolchain(
      { ffmpegPath: "/opt/homebrew/bin/ffmpeg" },
      {
        execFile: async (command) => {
          if (command.endsWith("ffprobe")) {
            const error = new Error("spawn ffprobe ENOENT");
            error.code = "ENOENT";
            throw error;
          }
          return { stdout: "ffmpeg version 7.0\n" };
        },
      },
    );

    expect(result.available).toBe(false);
    expect(result.ffmpegPath).toBe("/opt/homebrew/bin/ffmpeg");
    expect(result.ffprobePath).toBe("/opt/homebrew/bin/ffprobe");
    expect(result.error).toMatch(/ffprobe/i);
  });

  it("preflights source, logo, output folder, and required encoders", async () => {
    const execFile = async (command, args) => {
      if (args.includes("-encoders")) {
        return { stdout: " V..... libx264 H.264 encoder\n A..... aac AAC encoder\n" };
      }
      return { stdout: `${command} version 7.0\n` };
    };
    const calls = [];
    const result = await preflightFfmpegExport(
      {
        sourcePath: "/tmp/source.mp4",
        outputPath: "/tmp/export/out.mp4",
        logoPath: "/tmp/logo.png",
      },
      {
        execFile,
        access: async (filePath) => {
          calls.push(["access", filePath]);
        },
        mkdir: async (dirPath) => {
          calls.push(["mkdir", dirPath]);
        },
        writeFile: async (filePath) => {
          calls.push(["writeFile", filePath]);
        },
        unlink: async () => undefined,
      },
    );

    expect(result.ffmpegPath).toBe("/opt/homebrew/bin/ffmpeg");
    expect(calls).toContainEqual(["access", "/tmp/source.mp4"]);
    expect(calls).toContainEqual(["access", "/tmp/logo.png"]);
    expect(calls.some(([kind, filePath]) => kind === "writeFile" && String(filePath).includes(".wzrd-write-test-"))).toBe(true);

    await expect(
      preflightFfmpegExport(
        { sourcePath: "/tmp/source.mp4", outputPath: "/tmp/export/out.mp4" },
        {
          execFile: async (command, args) => {
            if (args.includes("-encoders")) return { stdout: " A..... aac AAC encoder\n" };
            return { stdout: `${command} version 7.0\n` };
          },
          access: async () => undefined,
          mkdir: async () => undefined,
          writeFile: async () => undefined,
          unlink: async () => undefined,
        },
      ),
    ).rejects.toThrow(/libx264/i);
  });

  it("normalizes ffmpeg startup, signal, and stderr failures", () => {
    const enoent = new Error("spawn ffmpeg ENOENT");
    enoent.code = "ENOENT";
    expect(normalizeFfmpegFailure({ error: enoent }).message).toMatch(/ffmpeg was not found/i);

    expect(normalizeFfmpegFailure({ code: -2, stderr: "" }).message).toMatch(/interrupted|stopped/i);
    expect(normalizeFfmpegFailure({ signal: "SIGTERM", stderr: "" }).message).toMatch(/interrupted|stopped/i);
    expect(normalizeFfmpegFailure({ code: 1, stderr: "Unknown encoder 'libx264'" }).message).toMatch(/libx264/i);
    expect(normalizeFfmpegFailure({ code: 1, stderr: "Permission denied" }).message).toMatch(/permission/i);
  });
});
