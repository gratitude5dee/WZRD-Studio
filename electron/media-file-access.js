import path from "node:path";

function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveRoots(roots) {
  return roots
    .map((root) => {
      try {
        return typeof root === "function" ? root() : root;
      } catch {
        return undefined;
      }
    })
    .map(asString)
    .filter(Boolean)
    .map((root) => path.resolve(root));
}

export function isPathInside(rootDir, filePath) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(filePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

export function createMediaFileAccess({ roots = [] } = {}) {
  const allowedMediaPaths = new Set();

  return {
    allowMediaPath(filePath) {
      const resolved = asString(filePath);
      if (!resolved) return;
      allowedMediaPaths.add(path.resolve(resolved));
    },
    isAllowedMediaPath(filePath) {
      const resolved = asString(filePath);
      if (!resolved) return false;
      const absolutePath = path.resolve(resolved);
      return allowedMediaPaths.has(absolutePath) || resolveRoots(roots).some((root) => isPathInside(root, absolutePath));
    },
    getAllowedMediaPaths() {
      return [...allowedMediaPaths];
    },
  };
}

export function safeFileStem(value, fallback = "media") {
  const stem = String(value || fallback)
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || fallback;
}

export function extensionFromContentType(contentType) {
  const value = String(contentType || "").toLowerCase();
  if (value.includes("video/mp4")) return ".mp4";
  if (value.includes("quicktime")) return ".mov";
  if (value.includes("webm")) return ".webm";
  if (value.includes("mpegurl")) return ".m3u8";
  if (value.includes("jpeg")) return ".jpg";
  if (value.includes("png")) return ".png";
  if (value.includes("webp")) return ".webp";
  if (value.includes("audio/mp4")) return ".m4a";
  if (value.includes("mpeg")) return ".mp3";
  if (value.includes("wav")) return ".wav";
  return "";
}

export function extensionForRemoteMedia(url, contentType) {
  const resolvedUrl = url instanceof URL ? url : new URL(String(url));
  const pathnameExtension = path.extname(resolvedUrl.pathname).toLowerCase();
  if (/^\.(mp4|m4v|mov|webm|mkv|avi|jpg|jpeg|png|webp|m4a|mp3|wav|aac)$/i.test(pathnameExtension)) {
    return pathnameExtension;
  }
  return extensionFromContentType(contentType) || ".bin";
}
