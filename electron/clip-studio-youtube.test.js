import { describe, expect, it } from "vitest";

import {
  buildExtractRepresentativeFrameArgs,
  buildYoutubeDownloadArgs,
  buildYoutubeInfoArgs,
  buildYoutubeSubtitleArgs,
  findCaptionPathForVideo,
  isSupportedYoutubeUrl,
  parseYoutubeInfoJson,
  parseYoutubeDownloadedPath,
  parseYoutubeDownloadProgress,
  parseYoutubeViewmap,
  resolveYoutubeDownloaderPath,
} from "./clip-studio-youtube.js";

describe("Electron Clipper YouTube helpers", () => {
  it("accepts only YouTube watch URLs and shorts from supported hosts", () => {
    expect(isSupportedYoutubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isSupportedYoutubeUrl("https://m.youtube.com/shorts/abc")).toBe(true);
    expect(isSupportedYoutubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isSupportedYoutubeUrl("https://youtube.com.evil/watch?v=abc")).toBe(false);
    expect(isSupportedYoutubeUrl("https://vimeo.com/abc")).toBe(false);
  });

  it("builds yt-dlp info and download args with playlist disabled and mp4 output", () => {
    expect(buildYoutubeInfoArgs("https://youtu.be/abc")).toEqual([
      "--dump-single-json",
      "--no-playlist",
      "https://youtu.be/abc",
    ]);

    const args = buildYoutubeDownloadArgs({
      url: "https://youtu.be/abc",
      outputTemplate: "/Users/me/Library/Application Support/WZRD/clipper/imports/%(title).200B-%(id)s.%(ext)s",
      ffmpegPath: "/opt/homebrew/bin/ffmpeg",
    });

    expect(args).toContain("--no-playlist");
    expect(args).toEqual(
      expect.arrayContaining([
        "-f",
        "bv*[height=1080][ext=mp4]+ba[ext=m4a]/b[height=1080][ext=mp4]",
      ]),
    );
    expect(args).toContain("--merge-output-format");
    expect(args).toContain("mp4");
    expect(args).toContain("--remux-video");
    expect(args).not.toContain("--write-subs");
    expect(args).not.toContain("--write-auto-subs");
    expect(args).toContain("--ffmpeg-location");
    expect(args).toContain("/opt/homebrew/bin/ffmpeg");
    expect(args).toContain("--print");
    expect(args).toContain("after_move:filepath");
  });

  it("builds subtitle args as a separate best-effort skip-download command", () => {
    const args = buildYoutubeSubtitleArgs({
      url: "https://youtu.be/abc",
      outputTemplate: "/tmp/%(title).200B-%(id)s.%(ext)s",
    });

    expect(args).toContain("--skip-download");
    expect(args).toContain("--write-auto-subs");
    expect(args).toContain("--write-subs");
    expect(args).toContain("--sub-format");
    expect(args).toContain("vtt");
  });

  it("parses yt-dlp progress and final moved output path", () => {
    expect(parseYoutubeDownloadProgress("[download]  42.7% of 20.12MiB at 1.00MiB/s ETA 00:11")).toMatchObject({
      percent: 43,
      stage: "downloading",
    });
    expect(parseYoutubeDownloadProgress("[Merger] Merging formats into \"/tmp/final.mp4\"")).toMatchObject({
      percent: 95,
      stage: "processing",
    });
    expect(
      parseYoutubeDownloadedPath('[MoveFiles] Moving file "/tmp/temp.webm" to "/tmp/final.mp4"\n/tmp/final.mp4'),
    ).toBe("/tmp/final.mp4");
  });

  it("resolves downloader path, caption sibling, and frame extraction args", () => {
    expect(resolveYoutubeDownloaderPath(" ")).toBe("yt-dlp");
    expect(resolveYoutubeDownloaderPath("/opt/homebrew/bin/yt-dlp")).toBe("/opt/homebrew/bin/yt-dlp");
    expect(findCaptionPathForVideo("/tmp/video.mp4", ["video.en.vtt", "video.jpg"])).toBe("/tmp/video.en.vtt");
    expect(
      buildExtractRepresentativeFrameArgs({
        sourcePath: "/tmp/video.mp4",
        outputPath: "/tmp/frame.jpg",
        atSeconds: 12.5,
      }),
    ).toEqual(["-y", "-ss", "12.500", "-i", "/tmp/video.mp4", "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", "/tmp/frame.jpg"]);
  });

  it("extracts and normalizes yt-dlp heatmap viewmap points", () => {
    const points = parseYoutubeViewmap({
      duration: 120,
      heatmap: [
        { start_time: 0, end_time: 5, value: 0.1 },
        { start_time: 5, end_time: 10, value: 0.8 },
        { start_time: 10, end_time: 15, value: 0.4 },
      ],
    });

    expect(points).toEqual([
      { startSeconds: 0, endSeconds: 5, value: 0.1, normalizedScore: 0 },
      { startSeconds: 5, endSeconds: 10, value: 0.8, normalizedScore: 100 },
      { startSeconds: 10, endSeconds: 15, value: 0.4, normalizedScore: 42.9 },
    ]);
  });

  it("finds nested most-replayed marker arrays and ignores malformed points", () => {
    const points = parseYoutubeViewmap({
      duration: 60,
      engagementPanels: {
        mostReplayed: {
          markers: [
            { startTime: 15, endTime: 20, heatMarkerIntensityScoreNormalized: 0.9 },
            { startTime: "bad", endTime: 25, value: 0.1 },
          ],
        },
      },
    });

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ startSeconds: 15, endSeconds: 20, normalizedScore: 100 });
  });

  it("returns viewmap status from yt-dlp info parsing", () => {
    expect(parseYoutubeInfoJson(JSON.stringify({ id: "abc", title: "Demo", duration: 60, heatmap: [] }))).toMatchObject({
      id: "abc",
      title: "Demo",
      viewmapStatus: "unavailable",
      viewmapWarning: expect.stringMatching(/unavailable/i),
    });

    expect(parseYoutubeInfoJson(JSON.stringify({
      id: "abc",
      title: "Demo",
      duration: 60,
      heatmap: [{ start_time: 20, end_time: 25, value: 12 }],
    }))).toMatchObject({
      viewmapStatus: "found",
      viewmap: [{ startSeconds: 20, endSeconds: 25, value: 12, normalizedScore: 100 }],
    });
  });
});
