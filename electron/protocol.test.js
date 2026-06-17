import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildClipperMediaUrl,
  resolveAppProtocolRequest,
  resolveClipperMediaProtocolRequest,
} from "./protocol.js";

const distDir = path.resolve("/tmp/wzrd-dist");

function fileMap(entries) {
  const files = new Set(entries.map((entry) => path.resolve(distDir, entry)));
  return async (filePath) => ({
    exists: files.has(path.resolve(filePath)),
    isFile: files.has(path.resolve(filePath)),
  });
}

describe("resolveAppProtocolRequest", () => {
  it("serves index.html for the app root", async () => {
    const result = await resolveAppProtocolRequest("wzrd://app/", distDir, fileMap(["index.html"]));

    expect(result).toEqual({
      ok: true,
      status: 200,
      filePath: path.resolve(distDir, "index.html"),
    });
  });

  it("falls back to index.html for BrowserRouter deep links", async () => {
    const result = await resolveAppProtocolRequest(
      "wzrd://app/projects/project-123/studio",
      distDir,
      fileMap(["index.html"]),
    );

    expect(result.filePath).toBe(path.resolve(distDir, "index.html"));
    expect(result.status).toBe(200);
  });

  it("serves bundled public and build assets directly", async () => {
    const result = await resolveAppProtocolRequest(
      "wzrd://app/lovable-uploads/wzrdtechlogo.png",
      distDir,
      fileMap(["index.html", "lovable-uploads/wzrdtechlogo.png"]),
    );

    expect(result.filePath).toBe(path.resolve(distDir, "lovable-uploads/wzrdtechlogo.png"));
  });

  it("returns 404 for missing file-like asset requests", async () => {
    const result = await resolveAppProtocolRequest(
      "wzrd://app/assets/missing.js",
      distDir,
      fileMap(["index.html"]),
    );

    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("rejects path traversal attempts before filesystem lookup", async () => {
    const result = await resolveAppProtocolRequest(
      "wzrd://app/%2e%2e/package.json",
      distDir,
      async () => {
        throw new Error("filesystem should not be queried for unsafe paths");
      },
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});

describe("resolveClipperMediaProtocolRequest", () => {
  it("serves allowed local video files through the media host", async () => {
    const filePath = "/Users/me/Videos/source clip.mp4";
    const result = await resolveClipperMediaProtocolRequest(
      buildClipperMediaUrl(filePath),
      {
        isAllowedPath: (candidate) => candidate === filePath,
        fileStat: async () => ({ exists: true, isFile: true }),
      },
    );

    expect(result).toEqual({ ok: true, status: 200, filePath });
  });

  it("rejects local files that were not selected or downloaded by the app", async () => {
    const result = await resolveClipperMediaProtocolRequest(
      buildClipperMediaUrl("/Users/me/.ssh/id_rsa"),
      {
        isAllowedPath: () => false,
        fileStat: async () => {
          throw new Error("filesystem should not be queried for disallowed paths");
        },
      },
    );

    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects unsupported local media extensions", async () => {
    const result = await resolveClipperMediaProtocolRequest(
      buildClipperMediaUrl("/Users/me/Documents/source.txt"),
      {
        isAllowedPath: () => true,
        fileStat: async () => ({ exists: true, isFile: true }),
      },
    );

    expect(result).toMatchObject({ ok: false, status: 415 });
  });
});
