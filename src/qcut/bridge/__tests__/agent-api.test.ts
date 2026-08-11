import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WZRD-EDIT: cover validated engine forwarding and actual-engine reporting.
vi.mock("@qcut-app/stores/project-store", () => ({
	useProjectStore: {
		getState: () => ({
			activeProject: { id: "project-1" },
		}),
	},
}));
vi.mock("@qcut-app/stores/export-store", () => ({
	useExportStore: {
		getState: () => ({
			setPanelView: vi.fn(),
		}),
	},
}));
vi.mock("@qcut-app/stores/media/media-store", () => ({
	useMediaStore: {
		getState: () => ({ mediaItems: [] }),
	},
}));
vi.mock("@qcut-app/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => ({
			tracks: [],
			selectedElements: [],
			getTotalDuration: () => 0,
		}),
	},
}));
vi.mock("@qcut-app/stores/editor/playback-store", () => ({
	usePlaybackStore: {
		getState: () => ({ isPlaying: false, currentTime: 0, duration: 0 }),
	},
}));
vi.mock("@qcut-app/stores/captions-store", () => ({
	useCaptionsStore: {
		getState: () => ({}),
	},
}));
vi.mock("@qcut-app/stores/ai/effects-store", () => ({
	useEffectsStore: {
		getState: () => ({ presets: [] }),
	},
}));

import { installEditorAgentApi } from "../agent-api";

type ExportSettings = {
	quality: string;
	format: string;
	filename: string;
	engineType?: string;
};

function getExecute() {
	return (window as any).wzrd.editor.commands.execute as (
		command: string,
		args?: unknown
	) => Promise<any>;
}

describe("QCut agent API export engine selection", () => {
	let exportAction: ReturnType<typeof vi.fn>;
	let uninstall: (() => void) | undefined;

	beforeEach(() => {
		exportAction = vi.fn((settings: ExportSettings) =>
			Promise.resolve({
				success: true,
				filename: settings.filename,
				format: settings.format,
				requestedEngineType: settings.engineType,
				engineType: settings.engineType,
			})
		);
		(window as any).__exportActions = { export: exportAction };
		uninstall = installEditorAgentApi({ projectId: "project-1" });
	});

	afterEach(() => {
		uninstall?.();
		delete (window as any).__exportActions;
	});

	it("defaults an omitted engine selection to auto", async () => {
		const result = await getExecute()("export", { format: "mp4" });

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				result: expect.objectContaining({
					requestedEngineType: "auto",
				}),
			})
		);
		expect(exportAction).toHaveBeenCalledWith(
			expect.objectContaining({ engineType: "auto" })
		);
	});

	it.each(["auto", "standard", "ffmpeg", "cli", "muxer"] as const)(
		"passes the %s engine selection through",
		async (engineType) => {
			const result = await getExecute()("export", { engineType });

			expect(result.ok).toBe(true);
			expect(exportAction).toHaveBeenCalledWith(
				expect.objectContaining({ engineType })
			);
		}
	);

	it("rejects an unknown engine with the accepted values", async () => {
		const result = await getExecute()("export", {
			engineType: "not-an-engine",
		});

		expect(result.ok).toBe(false);
		expect(result.error).toContain("auto");
		expect(result.error).toContain("muxer");
		expect(exportAction).not.toHaveBeenCalled();
	});

	it("returns Standard when the selected muxer was downgraded", async () => {
		exportAction.mockResolvedValueOnce({
			success: true,
			filename: "export.mp4",
			format: "mp4",
			requestedEngineType: "muxer",
			engineType: "standard",
		});

		const result = await getExecute()("export", { engineType: "muxer" });

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				result: expect.objectContaining({
					requestedEngineType: "muxer",
					engineType: "standard",
				}),
			})
		);
	});
});
