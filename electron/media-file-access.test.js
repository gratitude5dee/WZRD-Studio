import { describe, expect, it } from "vitest";

import {
  createMediaFileAccess,
  extensionForRemoteMedia,
  isPathInside,
  safeFileStem,
} from "./media-file-access.js";

describe("shared Electron media file access", () => {
  it("allowlists explicit files and configured media roots", () => {
    const access = createMediaFileAccess({
      roots: ["/Users/me/Library/Application Support/WZRD/clipper", () => "/Users/me/Library/Application Support/WZRD/media-cache"],
    });

    access.allowMediaPath("/Users/me/Desktop/imported.mp4");

    expect(access.isAllowedMediaPath("/Users/me/Desktop/imported.mp4")).toBe(true);
    expect(access.isAllowedMediaPath("/Users/me/Library/Application Support/WZRD/clipper/imports/source.mp4")).toBe(true);
    expect(access.isAllowedMediaPath("/Users/me/Library/Application Support/WZRD/media-cache/remote.mp4")).toBe(true);
    expect(access.isAllowedMediaPath("/Users/me/Downloads/private.mp4")).toBe(false);
  });

  it("keeps path root checks strict", () => {
    expect(isPathInside("/tmp/media", "/tmp/media/source.mp4")).toBe(true);
    expect(isPathInside("/tmp/media", "/tmp/media-sibling/source.mp4")).toBe(false);
  });

  it("creates safe cache names and media extensions from URLs/content types", () => {
    expect(safeFileStem("My Video: Drop!.mp4")).toBe("My-Video-Drop");
    expect(extensionForRemoteMedia(new URL("https://example.com/video"), "video/mp4")).toBe(".mp4");
    expect(extensionForRemoteMedia(new URL("https://example.com/audio"), "audio/mp4")).toBe(".m4a");
    expect(extensionForRemoteMedia(new URL("https://example.com/photo.webp?x=1"), "")).toBe(".webp");
  });
});
