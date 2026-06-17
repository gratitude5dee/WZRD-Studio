export type SourcifyPlatform = "youtube" | "tiktok" | "instagram" | "twitch";

export type SourcifyActorKey =
  | "youtube-fast"
  | "youtube-shorts"
  | "youtube-downloader"
  | "tiktok-fast"
  | "instagram-fast"
  | "instagram-reels"
  | "twitch-video";

export interface SourcifySettings {
  maxItems: number;
  maxTotalChargeUsd: number;
  waitForFinishSecs: number;
  includeDownloadableOnly: boolean;
}

export interface SourcifyActorPlan {
  id: string;
  targetId?: string;
  key: SourcifyActorKey;
  label: string;
  platform: SourcifyPlatform;
  actorId?: string;
  confidence: number;
  query: string;
  input: Record<string, unknown>;
  configured: boolean;
  reason: string;
  notes?: string[];
}

export type SourcifyPlanner = "codex" | "deterministic" | "fallback";

export interface SourcifyTargetPlan {
  id: string;
  label: string;
  query: string;
  rationale: string;
  actors: SourcifyActorPlan[];
}

export interface SourcifyPlan {
  id: string;
  topic: string;
  planner?: SourcifyPlanner;
  assistantMessage?: string;
  metaprompt: string;
  actors: SourcifyActorPlan[];
  targets?: SourcifyTargetPlan[];
  settings: SourcifySettings;
  createdAt: string;
}

export interface SourcifyResult {
  id: string;
  platform: SourcifyPlatform | "unknown";
  actorKey?: SourcifyActorKey;
  category: "video" | "short" | "reel" | "clip" | "profile" | "metadata";
  title: string;
  creator?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
  downloadable: boolean;
  finalized?: boolean;
  // Provenance
  runId?: string;
  datasetId?: string;
  actorId?: string;
  topic?: string;
  scrapedAt?: string;
  raw: Record<string, unknown>;
}

export interface SourcifyRunResponse {
  runId?: string;
  datasetId?: string;
  status?: string;
  results: SourcifyResult[];
  usageTotalUsd?: number | null;
}

export const DEFAULT_SOURCIFY_SETTINGS: SourcifySettings = {
  maxItems: 50,
  maxTotalChargeUsd: 5,
  waitForFinishSecs: 30,
  includeDownloadableOnly: false,
};

const ACTOR_LABELS: Record<SourcifyActorKey, { label: string; platform: SourcifyPlatform }> = {
  "youtube-fast": { label: "YouTube Fast", platform: "youtube" },
  "youtube-shorts": { label: "YouTube Shorts", platform: "youtube" },
  "youtube-downloader": { label: "YouTube Downloader", platform: "youtube" },
  "tiktok-fast": { label: "TikTok Fast", platform: "tiktok" },
  "instagram-fast": { label: "Instagram / Reels", platform: "instagram" },
  "instagram-reels": { label: "Instagram Reels Downloader", platform: "instagram" },
  "twitch-video": { label: "Twitch Video", platform: "twitch" },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(normalized) ? normalized : undefined;
  }
  return undefined;
}

function slugifyTopic(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80);
}

function looksLikeUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function urlHost(value?: string): string {
  if (!value) return "";
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

function isYoutubeUrl(value?: string): boolean {
  const host = urlHost(value);
  return host.includes("youtube") || host.includes("youtu.be");
}

function isInstagramUrl(value?: string): boolean {
  return urlHost(value).includes("instagram");
}

function isTikTokUrl(value?: string): boolean {
  return urlHost(value).includes("tiktok");
}

function isTwitchUrl(value?: string): boolean {
  return urlHost(value).includes("twitch");
}

function handleOrTag(topic: string): string {
  return slugifyTopic(topic.replace(/^@/, "")) || "creator";
}

function buildTikTokInput(topic: string, maxItems: number, includeDownloadableOnly: boolean) {
  const trimmed = topic.trim();
  const base = {
    resultsPerPage: maxItems,
    profileScrapeSections: ["videos"],
    profileSorting: "latest",
    excludePinnedPosts: false,
    maxFollowersPerProfile: 0,
    maxFollowingPerProfile: 0,
    maxProfilesPerQuery: 10,
    videoSearchSorting: "MOST_RELEVANT",
    videoSearchDateFilter: "ALL_TIME",
    scrapeRelatedVideos: false,
    shouldDownloadVideos: includeDownloadableOnly,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadAvatars: false,
    shouldDownloadMusicCovers: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    commentsPerPost: 0,
    topLevelCommentsPerPost: 0,
    maxRepliesPerComment: 0,
    proxyCountryCode: "None",
  };

  if (isTikTokUrl(trimmed)) {
    if (/\/@[^/]+\/video\//i.test(trimmed)) {
      return { ...base, postURLs: [trimmed] };
    }
    const profile = trimmed.match(/tiktok\.com\/@([^/?#]+)/i)?.[1];
    return profile ? { ...base, profiles: [profile] } : { ...base, startUrls: [trimmed] };
  }

  if (trimmed.startsWith("#")) {
    return { ...base, hashtags: [handleOrTag(trimmed)] };
  }

  if (trimmed.startsWith("@")) {
    return { ...base, profiles: [handleOrTag(trimmed)] };
  }

  return { ...base, search: [trimmed], searchQueries: [trimmed] };
}

function platformFromUrl(url?: string): SourcifyResult["platform"] {
  const host = urlHost(url);
  if (host.includes("youtube") || host.includes("youtu.be")) return "youtube";
  if (host.includes("tiktok")) return "tiktok";
  if (host.includes("instagram")) return "instagram";
  if (host.includes("twitch")) return "twitch";
  return "unknown";
}

function platformFromActor(actorKey?: SourcifyActorKey): SourcifyResult["platform"] {
  return actorKey ? ACTOR_LABELS[actorKey]?.platform ?? "unknown" : "unknown";
}

function readFirstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const direct = asString(row[key]);
    if (direct) return direct;
  }
  return undefined;
}

function readNestedUrl(value: unknown): string | undefined {
  if (typeof value === "string") return asString(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = readNestedUrl(item);
      if (nested) return nested;
    }
    return undefined;
  }
  const record = asRecord(value);
  const direct = readFirstString(record, ["url", "link", "src", "downloadUrl", "download_url"]);
  if (direct) return direct;
  for (const nestedValue of Object.values(record)) {
    const nested = readNestedUrl(nestedValue);
    if (nested) return nested;
  }
  return undefined;
}

function readThumbnail(row: Record<string, unknown>): string | undefined {
  return (
    readFirstString(row, [
      "thumbnailUrl",
      "thumbnail_url",
      "displayUrl",
      "display_url",
      "imageUrl",
      "image_url",
      "coverUrl",
      "cover_url",
    ]) ??
    readNestedUrl(row["thumbnail"]) ??
    readNestedUrl(row["thumbnails"]) ??
    readNestedUrl(row["images"]) ??
    // Some actors (notably YouTube) nest thumbnail URLs under objects like snippet.thumbnails.high.url.
    // As a last resort, scan the entire row for nested url/src/link/downloadUrl fields.
    readNestedUrl(row)
  );
}

export function inferSourcifyThumbnailUrl(row: Record<string, unknown>): string | undefined {
  return readThumbnail(row);
}

export function inferSourcifySourceUrl(row: Record<string, unknown>): string | undefined {
  return readFirstString(row, [
    "sourceUrl",
    "source_url",
    "url",
    "link",
    "permalink",
    "video_url",
    "videoUrl",
    "origin_url",
  ]);
}

export function inferSourcifyMediaUrl(row: Record<string, unknown>): string | undefined {
  const direct = readFirstString(row, [
    "mediaUrl",
    "media_url",
    "videoUrl",
    "video_url",
    "downloadUrl",
    "download_url",
    "playUrl",
    "play_url",
    "mp4Url",
    "mp4_url",
    "cached_url",
  ]);
  if (direct) return direct;

  const nested =
    readNestedUrl(row["video"]) ??
    readNestedUrl(row["media"]) ??
    readNestedUrl(row["videoFile"]) ??
    readNestedUrl(row["video_files"]) ??
    readNestedUrl(row["streamingData"]);

  if (nested && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(nested)) return nested;
  return nested;
}

export function hydrateSourcifyResult(result: SourcifyResult): SourcifyResult {
  const raw = asRecord(result.raw);
  const hydratedSourceUrl = result.sourceUrl ?? inferSourcifySourceUrl(raw);
  const hydratedMediaUrl = result.mediaUrl ?? inferSourcifyMediaUrl(raw);
  const hydratedThumbnailUrl = result.thumbnailUrl ?? inferSourcifyThumbnailUrl(raw);
  const hydratedPlatform = result.platform === "unknown" ? platformFromUrl(hydratedSourceUrl ?? hydratedMediaUrl) : result.platform;
  const resolvedPlatform = hydratedPlatform === "unknown" ? platformFromActor(result.actorKey) : hydratedPlatform;
  const downloadable = Boolean(hydratedMediaUrl);

  return {
    ...result,
    platform: resolvedPlatform,
    sourceUrl: hydratedSourceUrl ?? result.sourceUrl,
    mediaUrl: hydratedMediaUrl ?? result.mediaUrl,
    thumbnailUrl: hydratedThumbnailUrl ?? result.thumbnailUrl,
    downloadable,
  };
}

function inferCategory(row: Record<string, unknown>, actorKey?: SourcifyActorKey): SourcifyResult["category"] {
  const url = readFirstString(row, ["url", "sourceUrl", "source_url", "video_url", "videoUrl"]) ?? "";
  const type = String(row.type ?? row.kind ?? row.category ?? "").toLowerCase();
  if (actorKey === "youtube-shorts" || url.includes("/shorts/") || type.includes("short")) return "short";
  if ((actorKey === "instagram-fast" || actorKey === "instagram-reels") && (url.includes("/reel/") || type.includes("reel"))) return "reel";
  if (actorKey === "twitch-video" || type.includes("clip")) return "clip";
  if (type.includes("profile") || row.username || row.userName) return "profile";
  if (inferSourcifyMediaUrl(row)) return "video";
  return "metadata";
}

function stableResultId(row: Record<string, unknown>, actorKey?: SourcifyActorKey, index = 0): string {
  const candidate =
    readFirstString(row, ["id", "videoId", "video_id", "shortCode", "shortcode", "url", "sourceUrl"]) ??
    `${actorKey ?? "result"}-${index}`;
  return `${actorKey ?? "source"}-${candidate}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}

export function normalizeSourcifyResult(
  item: unknown,
  actorKey?: SourcifyActorKey,
  index = 0,
): SourcifyResult {
  const row = asRecord(item);
  const sourceUrl = readFirstString(row, [
    "sourceUrl",
    "source_url",
    "url",
    "link",
    "permalink",
    "video_url",
    "videoUrl",
    "origin_url",
    "pageUrl",
    "page_url",
    "videoPageUrl",
    "video_page_url",
    "inputUrl",
    "input_url",
    "originalUrl",
    "original_url",
  ]);
  const mediaUrl = inferSourcifyMediaUrl(row);
  const platform = platformFromUrl(sourceUrl ?? mediaUrl) || platformFromActor(actorKey);
  const title =
    readFirstString(row, ["title", "caption", "description", "text", "videoTitle", "video_title"]) ??
    `${ACTOR_LABELS[actorKey ?? "youtube-fast"]?.label ?? "Source"} result ${index + 1}`;
  const creator =
    readFirstString(row, [
      "creator",
      "author",
      "authorName",
      "author_name",
      "channelName",
      "channel_name",
      "username",
      "ownerUsername",
      "broadcaster_name",
    ]) ?? undefined;

  return {
    id: stableResultId(row, actorKey, index),
    platform: platform === "unknown" ? platformFromActor(actorKey) : platform,
    actorKey,
    category: inferCategory(row, actorKey),
    title,
    creator,
    sourceUrl,
    mediaUrl,
    thumbnailUrl: readThumbnail(row),
    durationSeconds: asNumber(row.durationSeconds ?? row.duration_seconds ?? row.duration),
    publishedAt: readFirstString(row, ["publishedAt", "published_at", "publishDate", "created_at", "createdAt"]),
    metrics: {
      views: asNumber(row.views ?? row.viewCount ?? row.view_count),
      likes: asNumber(row.likes ?? row.likeCount ?? row.like_count),
      comments: asNumber(row.comments ?? row.commentCount ?? row.comment_count),
      shares: asNumber(row.shares ?? row.shareCount ?? row.share_count),
    },
    downloadable: Boolean(mediaUrl),
    runId: asString(row.runId ?? row.run_id),
    datasetId: asString(row.datasetId ?? row.dataset_id),
    actorId: asString(row.actorId ?? row.actor_id),
    topic: asString(row.topic),
    scrapedAt: asString(row.scrapedAt ?? row.scraped_at),
    raw: row,
  };
}

export function buildLocalSourcifyPlan(
  topic: string,
  settings: Partial<SourcifySettings> = {},
): SourcifyPlan {
  const resolvedSettings = { ...DEFAULT_SOURCIFY_SETTINGS, ...settings };
  const trimmedTopic = topic.trim();
  const tag = slugifyTopic(trimmedTopic) || "creator";
  const targetId = `target-${tag}`;
  const urlInput = looksLikeUrl(trimmedTopic) ? trimmedTopic : undefined;
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmedTopic)}`;
  const shortsSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${trimmedTopic} shorts`)}`;
  const instagramUrl = urlInput?.includes("instagram.com")
    ? urlInput
    : `https://www.instagram.com/explore/tags/${tag}/`;
  const youtubeUrl = isYoutubeUrl(urlInput) ? urlInput : undefined;
  const instagramReelUrl = isInstagramUrl(urlInput) && /\/reel\//i.test(urlInput ?? "") ? urlInput : undefined;

  const actors = ([
    {
      key: "youtube-fast",
      label: ACTOR_LABELS["youtube-fast"].label,
      platform: "youtube",
      actorId: "gXSReGYeawn5nwDhI",
      confidence: 0.92,
      query: trimmedTopic,
      configured: true,
      reason: "Best default for YouTube channels, search results, playlists, and long-form video metadata.",
      input: {
        startUrls: [youtubeUrl ?? searchUrl],
        gl: "us",
        hl: "en",
        uploadDate: "all",
        duration: "all",
        features: "all",
        sort: "r",
        maxItems: resolvedSettings.maxItems,
      },
    },
    {
      key: "youtube-shorts",
      label: ACTOR_LABELS["youtube-shorts"].label,
      platform: "youtube",
      actorId: "gXSReGYeawn5nwDhI",
      confidence: 0.84,
      query: `${trimmedTopic} shorts`,
      configured: true,
      reason: "Uses the YouTube actor with Shorts-oriented query settings for short-form source discovery.",
      input: {
        startUrls: [youtubeUrl?.includes("/shorts/") ? youtubeUrl : shortsSearchUrl],
        includeShorts: true,
        gl: "us",
        hl: "en",
        uploadDate: "all",
        duration: "s",
        features: "all",
        sort: "r",
        maxItems: resolvedSettings.maxItems,
      },
    },
    {
      key: "youtube-downloader",
      label: ACTOR_LABELS["youtube-downloader"].label,
      platform: "youtube",
      actorId: "y1IMcEPawMQPafm02",
      confidence: youtubeUrl ? 0.88 : 0.35,
      query: trimmedTopic,
      configured: Boolean(youtubeUrl),
      reason: youtubeUrl
        ? "Direct YouTube video downloader for saving source MP4s when a video or Shorts URL is provided."
        : "Paste a YouTube video or Shorts URL to enable direct YouTube downloading.",
      notes: youtubeUrl ? undefined : ["This actor is not selected for keyword-only searches."],
      input: {
        startUrls: [youtubeUrl ?? searchUrl],
        quality: "720",
        includeFailedVideos: false,
        proxy: {
          useApifyProxy: true,
        },
      },
    },
    {
      key: "instagram-fast",
      label: ACTOR_LABELS["instagram-fast"].label,
      platform: "instagram",
      actorId: "VLKR1emKm1YGLmiuZ",
      confidence: 0.78,
      query: trimmedTopic,
      configured: true,
      reason: "Good for public Instagram profiles, hashtags, Reels, and engagement metadata.",
      input: {
        startUrls: [instagramUrl],
        getStories: false,
        maxItems: resolvedSettings.maxItems,
      },
    },
    {
      key: "instagram-reels",
      label: ACTOR_LABELS["instagram-reels"].label,
      platform: "instagram",
      actorId: "Fj1zYgto86GELL443",
      confidence: instagramReelUrl ? 0.86 : 0.34,
      query: trimmedTopic,
      configured: Boolean(instagramReelUrl),
      reason: instagramReelUrl
        ? "Direct Instagram Reels downloader for preserving high-quality Reel media and metadata."
        : "Paste an Instagram Reel URL to enable direct Reel downloading.",
      notes: instagramReelUrl ? undefined : ["The fast Instagram scraper remains selected for profiles, hashtags, and discovery."],
      input: {
        links: [instagramReelUrl ?? instagramUrl],
        proxyConfiguration: {
          useApifyProxy: false,
          apifyProxyGroups: ["RESIDENTIAL"],
        },
      },
    },
    {
      key: "tiktok-fast",
      label: ACTOR_LABELS["tiktok-fast"].label,
      platform: "tiktok",
      actorId: "GdWCkxBtKWOsKjdch",
      confidence: 0.62,
      query: trimmedTopic,
      configured: true,
      reason: "Runs the TikTok scraper for hashtags, profiles, keyword searches, and public video URLs.",
      input: buildTikTokInput(trimmedTopic, resolvedSettings.maxItems, resolvedSettings.includeDownloadableOnly),
    },
    {
      key: "twitch-video",
      label: ACTOR_LABELS["twitch-video"].label,
      platform: "twitch",
      actorId: "bqneowjFSQBmAkILW",
      confidence: isTwitchUrl(urlInput) ? 0.62 : 0.45,
      query: trimmedTopic,
      configured: true,
      reason: "Included from the pasted Apify context; may return metadata unless the actor supports runtime downloads.",
      notes: ["Twitch download availability depends on the actor output and creator/content permissions."],
      input: {
        listingNotice: "No runtime input is required yet. See the README and product page for the current extension workflow.",
      },
    },
  ] satisfies Array<Omit<SourcifyActorPlan, "id" | "targetId">>).map((actor) => ({
    ...actor,
    id: `${targetId}:${actor.key}`,
    targetId,
  }));

  const targets: SourcifyTargetPlan[] = [
    {
      id: targetId,
      label: trimmedTopic,
      query: trimmedTopic,
      rationale: "Deterministic fallback target built directly from the Sourcify prompt.",
      actors,
    },
  ];

  return {
    id: `sourcify-${Date.now()}`,
    topic: trimmedTopic,
    planner: "deterministic",
    assistantMessage: "I built a deterministic source plan from your prompt.",
    settings: resolvedSettings,
    actors,
    targets,
    createdAt: new Date().toISOString(),
    metaprompt: [
      "Given a user topic/person/keyword, select the smallest useful set of Apify actors.",
      "Prefer actors that can return direct downloadable media URLs, then metadata-rich scrapers.",
      `Topic: ${trimmedTopic}`,
    ].join("\n"),
  };
}

export function groupSourcifyResults(results: SourcifyResult[]) {
  return results.reduce<Record<SourcifyResult["category"], SourcifyResult[]>>(
    (groups, result) => {
      groups[result.category].push(result);
      return groups;
    },
    {
      video: [],
      short: [],
      reel: [],
      clip: [],
      profile: [],
      metadata: [],
    },
  );
}
