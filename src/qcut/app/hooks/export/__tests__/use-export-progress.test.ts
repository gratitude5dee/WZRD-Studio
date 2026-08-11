import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@qcut-app/stores/export-store", () => ({
  useExportStore: () => ({
    progress: { isExporting: false },
    updateProgress: vi.fn(),
    setError: vi.fn(),
    resetExport: vi.fn(),
    addToHistory: vi.fn(),
  }),
}));
vi.mock("@qcut-app/stores/timeline/timeline-store", () => ({
  useTimelineStore: () => ({ tracks: [] }),
}));
vi.mock("@qcut-app/hooks/media/use-async-media-store", () => ({
  useAsyncMediaItems: () => ({ mediaItems: [] }),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn() } }));
vi.mock("@qcut-app/hooks/useElectron", () => ({
  useElectron: () => ({ isElectron: () => false }),
}));
vi.mock("@qcut-app/lib/debug/debug-config", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
  debugWarn: vi.fn(),
}));
vi.mock("@qcut-app/lib/media/blob-manager", () => ({
  lockForExport: vi.fn(),
  unlockFromExport: vi.fn(),
}));
vi.mock("@qcut-app/lib/export/export-output", () => ({
  saveExportedVideo: vi.fn(),
}));
vi.mock("@qcut-app/lib/export/export-filename", () => ({
  resolveExportFilename: vi.fn(),
}));

import { resolveSelectedEngineType } from "../use-export-progress";

const engineTypes = {
  STANDARD: "standard" as const,
  FFMPEG: "ffmpeg" as const,
  CLI: "cli" as const,
  MUXER: "muxer" as const,
};

describe("resolveSelectedEngineType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("downgrades muxer to Standard when the runtime verdict fails", async () => {
    const factory = { isMuxerUsable: vi.fn().mockResolvedValue(false) };

    await expect(
      resolveSelectedEngineType("muxer", false, factory, engineTypes),
    ).resolves.toBe("standard");
    expect(factory.isMuxerUsable).toHaveBeenCalledOnce();
  });

  it("keeps muxer when the runtime verdict succeeds", async () => {
    const factory = { isMuxerUsable: vi.fn().mockResolvedValue(true) };

    await expect(
      resolveSelectedEngineType("muxer", false, factory, engineTypes),
    ).resolves.toBe("muxer");
  });
});
