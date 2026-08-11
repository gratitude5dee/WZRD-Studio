import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WZRD-EDIT: cover validated engine forwarding and actual-engine reporting.
const mockExportState = vi.hoisted(() => ({
	progress: { isExporting: false, progress: 0 },
	error: null as string | null,
	history: [],
	requestedEngineType: undefined as string | undefined,
	actualEngineType: undefined as string | undefined,
}));

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
			...mockExportState,
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
		Object.assign(mockExportState, {
			progress: { isExporting: false, progress: 0 },
			error: null,
			history: [],
			requestedEngineType: undefined,
			actualEngineType: undefined,
		});
		exportAction = vi.fn(async (settings: ExportSettings) => {
			mockExportState.requestedEngineType = settings.engineType;
			mockExportState.actualEngineType =
				settings.engineType === "muxer" ? "standard" : settings.engineType;
			return {
				success: true,
				filename: settings.filename,
				format: settings.format,
				requestedEngineType: settings.engineType,
				engineType: mockExportState.actualEngineType,
			};
		});
		(window as any).__exportActions = { export: exportAction };
		uninstall = installEditorAgentApi({ projectId: "project-1" });
	});

	afterEach(() => {
		uninstall?.();
		delete (window as any).__exportActions;
	});

	it("defaults an omitted engine selection to auto without blocking", async () => {
		const result = await getExecute()("export", { format: "mp4" });

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				result: expect.objectContaining({
					started: true,
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

	it("reports a muxer downgrade through export status", async () => {
		const result = await getExecute()("export", { engineType: "muxer" });
		const status = await getExecute()("getExportStatus");

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				result: expect.objectContaining({
					started: true,
					requestedEngineType: "muxer",
				}),
			})
		);
		expect(status).toEqual(
			expect.objectContaining({
				ok: true,
				result: expect.objectContaining({
					requestedEngineType: "muxer",
					actualEngineType: "standard",
				}),
			})
		);
	});
});
