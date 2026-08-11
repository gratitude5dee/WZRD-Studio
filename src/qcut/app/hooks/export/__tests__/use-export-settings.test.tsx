import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usable: true,
  electron: false,
}));

vi.mock("@qcut-app/stores/export-store", () => ({
  useExportStore: () => ({
    isDialogOpen: false,
    panelView: "export",
    settings: {
      format: "mp4",
      quality: "720p",
      filename: "export.mp4",
    },
    updateSettings: vi.fn(),
  }),
}));

vi.mock("@qcut-app/stores/timeline/timeline-store", () => ({
  useTimelineStore: () => ({
    getTotalDuration: () => 0,
    tracks: [],
  }),
}));

vi.mock("@qcut-app/hooks/useElectron", () => ({
  useElectron: () => ({
    isElectron: () => mocks.electron,
  }),
}));

vi.mock("@qcut/platform-core", () => ({
  platform: () => ({ isElectron: mocks.electron }),
}));

vi.mock("@qcut-app/lib/debug/debug-config", () => ({
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
}));

vi.mock("@qcut-app/lib/export/export-engine-factory", () => ({
  ExportEngineFactory: {
    getInstance: () => ({
      isMuxerUsable: vi.fn().mockResolvedValue(mocks.usable),
    }),
    isFFmpegAvailable: vi.fn().mockResolvedValue(false),
  },
  ExportEngineType: {
    STANDARD: "standard",
    OPTIMIZED: "optimized",
    WEBCODECS: "webcodecs",
    MUXER: "muxer",
    FFMPEG: "ffmpeg",
    CLI: "cli",
    REMOTION: "remotion",
  },
}));

vi.mock("@qcut-app/types/export", async () => {
  const actual = await vi.importActual<typeof import("@qcut-app/types/export")>(
    "@qcut-app/types/export",
  );
  return {
    ...actual,
    getSupportedFormats: () => ["webm", "mp4"],
  };
});

import { useExportSettings } from "../use-export-settings";

describe("useExportSettings muxer verdict", () => {
  beforeEach(() => {
    mocks.usable = true;
    mocks.electron = false;
    (globalThis as any).VideoEncoder = class {};
    (globalThis as any).VideoFrame = class {};
  });

  it("falls back to Standard and hides muxer when the probe fails", async () => {
    mocks.usable = false;
    const { result } = renderHook(() => useExportSettings());

    await waitFor(() => expect(result.current.muxerAvailable).toBe(false));
    expect(result.current.engineType).toBe("standard");
  });

  it("keeps muxer defaulted and visible when the probe succeeds", async () => {
    const { result } = renderHook(() => useExportSettings());

    await waitFor(() => expect(result.current.muxerAvailable).toBe(true));
    expect(result.current.engineType).toBe("muxer");
  });

  it("preserves an explicit engine selection after the async verdict", async () => {
    mocks.usable = false;
    const { result } = renderHook(() => useExportSettings());

    act(() => {
      result.current.setEngineType("standard");
    });

    await waitFor(() => expect(result.current.muxerAvailable).toBe(false));
    expect(result.current.engineType).toBe("standard");
  });
});
