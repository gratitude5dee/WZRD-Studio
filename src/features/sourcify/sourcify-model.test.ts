import { describe, expect, it } from "vitest";

import {
  buildLocalSourcifyPlan,
  groupSourcifyResults,
  inferSourcifyMediaUrl,
  normalizeSourcifyResult,
} from "./sourcify-model";

describe("sourcify model helpers", () => {
  it("plans the pasted Apify actor set for keyword discovery", () => {
    const plan = buildLocalSourcifyPlan("Taylor Swift reels", { maxItems: 25 });

    expect(plan.topic).toBe("Taylor Swift reels");
    expect(plan.planner).toBe("deterministic");
    expect(plan.settings.maxItems).toBe(25);
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets?.[0]).toMatchObject({
      label: "Taylor Swift reels",
      query: "Taylor Swift reels",
    });
    expect(plan.actors.map((actor) => actor.key)).toEqual([
      "youtube-fast",
      "youtube-shorts",
      "youtube-downloader",
      "instagram-fast",
      "instagram-reels",
      "tiktok-fast",
      "twitch-video",
    ]);
    expect(plan.actors.every((actor) => actor.id.startsWith("target-taylorswiftreels:"))).toBe(true);
    expect(plan.targets?.[0]?.actors.map((actor) => actor.id)).toEqual(plan.actors.map((actor) => actor.id));
    expect(plan.actors.find((actor) => actor.key === "youtube-fast")?.configured).toBe(true);
    expect(plan.actors.find((actor) => actor.key === "instagram-fast")?.input).toMatchObject({
      maxItems: 25,
    });
    expect(plan.actors.find((actor) => actor.key === "tiktok-fast")).toMatchObject({
      actorId: "GdWCkxBtKWOsKjdch",
      configured: true,
    });
    expect(plan.actors.find((actor) => actor.key === "youtube-downloader")?.configured).toBe(false);
    expect(plan.actors.find((actor) => actor.key === "instagram-reels")?.configured).toBe(false);
  });

  it("enables direct downloader actors when matching URLs are provided", () => {
    const youtubePlan = buildLocalSourcifyPlan("https://www.youtube.com/shorts/bOUOSn9MULw");
    expect(youtubePlan.actors.find((actor) => actor.key === "youtube-downloader")).toMatchObject({
      targetId: "target-httpswwwyoutubecomshortsbouosn9mulw",
      configured: true,
      input: {
        startUrls: ["https://www.youtube.com/shorts/bOUOSn9MULw"],
      },
    });

    const reelPlan = buildLocalSourcifyPlan("https://www.instagram.com/reel/DCxTlFwSJ_Y/");
    expect(reelPlan.actors.find((actor) => actor.key === "instagram-reels")).toMatchObject({
      targetId: "target-httpswwwinstagramcomreeldcxtlfwsjy",
      configured: true,
      input: {
        links: ["https://www.instagram.com/reel/DCxTlFwSJ_Y/"],
      },
    });
  });

  it("constructs platform-specific TikTok inputs for hashtags and profiles", () => {
    expect(buildLocalSourcifyPlan("#fyp", { maxItems: 12 }).actors.find((actor) => actor.key === "tiktok-fast")?.input).toMatchObject({
      hashtags: ["fyp"],
      resultsPerPage: 12,
    });

    expect(buildLocalSourcifyPlan("@wzrd", { includeDownloadableOnly: true }).actors.find((actor) => actor.key === "tiktok-fast")?.input).toMatchObject({
      profiles: ["wzrd"],
      shouldDownloadVideos: true,
    });
  });

  it("normalizes video dataset rows into downloadable Sourcify results", () => {
    const result = normalizeSourcifyResult(
      {
        id: "abc123",
        title: "A short clip",
        authorName: "Creator",
        url: "https://www.youtube.com/shorts/abc123",
        videoUrl: "https://cdn.example.com/abc123.mp4",
        thumbnailUrl: "https://cdn.example.com/abc123.jpg",
        views: "12,300",
        likes: 900,
        commentCount: "44",
        shareCount: "8",
      },
      "youtube-shorts",
    );

    expect(result).toMatchObject({
      platform: "youtube",
      category: "short",
      title: "A short clip",
      creator: "Creator",
      downloadable: true,
      mediaUrl: "https://cdn.example.com/abc123.mp4",
      metrics: {
        views: 12300,
        likes: 900,
        comments: 44,
        shares: 8,
      },
    });
  });

  it("finds nested media URLs and groups categorized results", () => {
    expect(
      inferSourcifyMediaUrl({
        video_files: [{ link: "https://cdn.example.com/source.webm" }],
      }),
    ).toBe("https://cdn.example.com/source.webm");

    const grouped = groupSourcifyResults([
      normalizeSourcifyResult({ title: "Reel", url: "https://instagram.com/reel/1" }, "instagram-fast"),
      normalizeSourcifyResult({ title: "Metadata" }, "tiktok-fast"),
    ]);

    expect(grouped.reel).toHaveLength(1);
    expect(grouped.metadata).toHaveLength(1);
  });
});
