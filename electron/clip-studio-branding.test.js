import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildBrandingLogoDestination,
  copyLogoIntoBrandingDirectory,
  isSupportedLogoPath,
} from "./clip-studio-branding.js";

describe("Electron Clipper branding helpers", () => {
  it("copies selected logos into the Clipper branding directory with a safe stable name", () => {
    expect(buildBrandingLogoDestination({
      sourcePath: "/Users/me/Downloads/Tiësto Logo!!.PNG",
      brandingDir: "/Users/me/Library/Application Support/WZRD/clipper/branding",
    })).toBe(path.join("/Users/me/Library/Application Support/WZRD/clipper/branding", "Ti-sto-Logo.PNG"));
  });

  it("accepts only supported local logo image extensions", () => {
    expect(isSupportedLogoPath("/tmp/logo.png")).toBe(true);
    expect(isSupportedLogoPath("/tmp/logo.jpg")).toBe(true);
    expect(isSupportedLogoPath("/tmp/logo.jpeg")).toBe(true);
    expect(isSupportedLogoPath("/tmp/logo.webp")).toBe(true);
    expect(isSupportedLogoPath("/tmp/logo.svg")).toBe(false);
    expect(isSupportedLogoPath("/tmp/logo.mp4")).toBe(false);
  });

  it("copies selected logos into branding storage and returns persisted file metadata", async () => {
    const calls = [];
    const fsImpl = {
      mkdir: async (dir, options) => calls.push(["mkdir", dir, options]),
      copyFile: async (source, output) => calls.push(["copyFile", source, output]),
      stat: async () => ({ size: 128 }),
    };

    const result = await copyLogoIntoBrandingDirectory({
      sourcePath: "/Users/me/Desktop/logo.webp",
      brandingDir: "/Users/me/Library/Application Support/WZRD/clipper/branding",
      fsImpl,
    });

    expect(result).toEqual({
      name: "logo.webp",
      path: path.join("/Users/me/Library/Application Support/WZRD/clipper/branding", "logo.webp"),
      size: 128,
    });
    expect(calls).toContainEqual(["copyFile", "/Users/me/Desktop/logo.webp", result.path]);
  });
});
