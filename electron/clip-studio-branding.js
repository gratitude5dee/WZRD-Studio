import fs from "node:fs/promises";
import path from "node:path";

import { safeFileStem } from "./media-file-access.js";

const SUPPORTED_LOGO_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isSupportedLogoPath(filePath) {
  const resolved = asString(filePath);
  if (!resolved) return false;
  return SUPPORTED_LOGO_EXTENSIONS.has(path.extname(resolved).toLowerCase());
}

export function buildBrandingLogoDestination({ sourcePath, brandingDir }) {
  const resolvedSource = asString(sourcePath);
  const resolvedBrandingDir = asString(brandingDir);
  if (!resolvedSource) throw new Error("Missing logo file path.");
  if (!resolvedBrandingDir) throw new Error("Missing Clipper branding directory.");
  if (!isSupportedLogoPath(resolvedSource)) {
    throw new Error("Clipper logo must be a PNG, JPG, JPEG, or WEBP image.");
  }

  const extension = path.extname(resolvedSource);
  const fileName = `${safeFileStem(path.basename(resolvedSource), "clipper-logo")}${extension}`;
  return path.join(resolvedBrandingDir, fileName);
}

export async function copyLogoIntoBrandingDirectory({ sourcePath, brandingDir, fsImpl = fs }) {
  const outputPath = buildBrandingLogoDestination({ sourcePath, brandingDir });
  await fsImpl.mkdir(path.dirname(outputPath), { recursive: true });

  const resolvedSource = path.resolve(sourcePath);
  const resolvedOutput = path.resolve(outputPath);
  if (resolvedSource !== resolvedOutput) {
    await fsImpl.copyFile(resolvedSource, resolvedOutput);
  }

  const stat = await fsImpl.stat(resolvedOutput).catch(() => null);
  return {
    name: path.basename(resolvedOutput),
    path: resolvedOutput,
    size: stat?.size,
  };
}
