import fs from "node:fs/promises";
import path from "node:path";

export const WZRD_PROTOCOL = "wzrd";
export const WZRD_APP_HOST = "app";
export const WZRD_MEDIA_HOST = "media";
export const WZRD_APP_ORIGIN = `${WZRD_PROTOCOL}://${WZRD_APP_HOST}`;
const CLIPPER_MEDIA_EXTENSION_PATTERN = /\.(mp4|m4v|mov|webm|mkv|avi|jpg|jpeg|png|webp|m4a|mp3|wav|aac)$/i;

async function defaultFileStat(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return { exists: true, isFile: stat.isFile() };
  } catch {
    return { exists: false, isFile: false };
  }
}

function normalizeRoot(rootDir) {
  return path.resolve(rootDir);
}

function isInsideRoot(rootDir, filePath) {
  const root = normalizeRoot(rootDir);
  const resolved = path.resolve(filePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function decodeProtocolPath(pathname) {
  try {
    return decodeURIComponent(pathname || "/");
  } catch {
    return null;
  }
}

function containsTraversal(rawUrl) {
  try {
    return /(^|[/\\])\.\.([/\\?#]|$)/.test(decodeURIComponent(rawUrl));
  } catch {
    return true;
  }
}

function hasFileExtension(relativePath) {
  return path.posix.extname(relativePath.replaceAll("\\", "/")) !== "";
}

export async function resolveAppProtocolRequest(rawUrl, distDir, fileStat = defaultFileStat) {
  if (containsTraversal(rawUrl)) {
    return { ok: false, status: 400, error: "Unsafe app path" };
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, error: "Invalid app URL" };
  }

  if (url.protocol !== `${WZRD_PROTOCOL}:` || url.hostname !== WZRD_APP_HOST) {
    return { ok: false, status: 404, error: "Unknown app host" };
  }

  const decodedPath = decodeProtocolPath(url.pathname);
  if (!decodedPath) {
    return { ok: false, status: 400, error: "Invalid encoded path" };
  }

  const root = normalizeRoot(distDir);
  const trimmed = decodedPath.replace(/^\/+/, "");
  const relativePath = trimmed === "" ? "index.html" : path.posix.normalize(trimmed.replaceAll("\\", "/"));

  if (relativePath.startsWith("../") || relativePath === ".." || path.isAbsolute(relativePath)) {
    return { ok: false, status: 400, error: "Unsafe app path" };
  }

  const candidatePath = path.resolve(root, relativePath);
  if (!isInsideRoot(root, candidatePath)) {
    return { ok: false, status: 400, error: "Unsafe app path" };
  }

  const candidateStat = await fileStat(candidatePath);
  if (candidateStat.exists && candidateStat.isFile) {
    return { ok: true, status: 200, filePath: candidatePath };
  }

  if (hasFileExtension(relativePath)) {
    return { ok: false, status: 404, error: "Asset not found" };
  }

  const indexPath = path.resolve(root, "index.html");
  const indexStat = await fileStat(indexPath);
  if (!indexStat.exists || !indexStat.isFile) {
    return { ok: false, status: 404, error: "Renderer entry not found" };
  }

  return { ok: true, status: 200, filePath: indexPath };
}

export function buildClipperMediaUrl(filePath) {
  return `${WZRD_PROTOCOL}://${WZRD_MEDIA_HOST}/?file=${encodeURIComponent(path.resolve(String(filePath || "")))}`;
}

export async function resolveClipperMediaProtocolRequest(rawUrl, options = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, error: "Invalid media URL" };
  }

  if (url.protocol !== `${WZRD_PROTOCOL}:` || url.hostname !== WZRD_MEDIA_HOST) {
    return { ok: false, status: 404, error: "Unknown media host" };
  }

  const rawFilePath = url.searchParams.get("file");
  if (!rawFilePath) {
    return { ok: false, status: 400, error: "Missing media file" };
  }

  const filePath = path.resolve(rawFilePath);
  const isAllowedPath = options.isAllowedPath ?? (() => false);
  if (!isAllowedPath(filePath)) {
    return { ok: false, status: 403, error: "Media file is not available to Clipper" };
  }

  if (!CLIPPER_MEDIA_EXTENSION_PATTERN.test(filePath)) {
    return { ok: false, status: 415, error: "Unsupported Clipper media type" };
  }

  const fileStat = options.fileStat ?? defaultFileStat;
  const stat = await fileStat(filePath);
  if (!stat.exists || !stat.isFile) {
    return { ok: false, status: 404, error: "Media file not found" };
  }

  return { ok: true, status: 200, filePath };
}

export function getAppUrl(pathname = "/") {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${WZRD_APP_ORIGIN}${normalized}`;
}
