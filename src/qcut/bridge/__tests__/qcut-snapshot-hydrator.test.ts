import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	tracks: [] as Array<{ elements: unknown[] }>,
	mediaItems: [] as Array<{ id: string }>,
	snapshotRow: null as unknown,
	snapshotError: null as unknown,
	addMediaItem: vi.fn(),
	saveProjectTimeline: vi.fn(),
	loadProjectTimeline: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
	supabase: {
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: async () => ({
						data: state.snapshotRow
							? { qcut_project_json: state.snapshotRow }
							: null,
						error: state.snapshotError,
					}),
				}),
			}),
		}),
	},
}));

vi.mock("@qcut-app/lib/storage/storage-service", () => ({
	storageService: {
		saveProjectTimeline: (...args: unknown[]) =>
			state.saveProjectTimeline(...args),
	},
}));

vi.mock("@qcut-app/stores/media/media-store", () => ({
	useMediaStore: {
		getState: () => ({
			mediaItems: state.mediaItems,
			addMediaItem: (...args: unknown[]) => state.addMediaItem(...args),
		}),
	},
}));

vi.mock("@qcut-app/stores/project-store", () => ({
	useProjectStore: {
		getState: () => ({
			activeProject: { id: "wzrd:proj-1", currentSceneId: "scene-1" },
		}),
	},
}));

vi.mock("@qcut-app/stores/timeline/scene-store", () => ({
	useSceneStore: {
		getState: () => ({ currentScene: { id: "scene-1" } }),
	},
}));

vi.mock("@qcut-app/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => ({
			tracks: state.tracks,
			loadProjectTimeline: (...args: unknown[]) =>
				state.loadProjectTimeline(...args),
		}),
	},
}));

import { maybeHydrateFromSnapshot } from "../qcut-snapshot-hydrator";

const snapshotWithContent = {
	version: 1,
	timeline: {
		tracks: [
			{
				id: "t1",
				type: "media",
				elements: [{ id: "e1", type: "media", mediaId: "m1" }],
			},
		],
	},
	media: {
		mediaItems: [
			{
				id: "m1",
				name: "clip.mp4",
				type: "video",
				url: "https://cdn.example.com/clip.mp4",
				duration: 4,
				file: { name: "clip.mp4", type: "video/mp4" },
			},
			{
				id: "m2",
				name: "local-only.mp4",
				type: "video",
				url: "blob:https://app/abc",
				file: { name: "local-only.mp4", type: "video/mp4" },
			},
		],
	},
};

describe("maybeHydrateFromSnapshot", () => {
	beforeEach(() => {
		state.tracks = [];
		state.mediaItems = [];
		state.snapshotRow = null;
		state.snapshotError = null;
		state.addMediaItem.mockReset();
		state.saveProjectTimeline.mockReset();
		state.loadProjectTimeline.mockReset();
	});

	it("hydrates media and timeline from a v1 snapshot", async () => {
		state.snapshotRow = snapshotWithContent;

		const result = await maybeHydrateFromSnapshot({
			wzrdProjectId: "proj-1",
			qcutProjectId: "wzrd:proj-1",
		});

		expect(result.hydrated).toBe(true);
		// Only the remote-URL item is restored; the blob-only one is skipped.
		expect(state.addMediaItem).toHaveBeenCalledTimes(1);
		const [projectId, item] = state.addMediaItem.mock.calls[0] as [
			string,
			{ id: string; url: string },
		];
		expect(projectId).toBe("wzrd:proj-1");
		expect(item.id).toBe("m1");
		expect(item.url).toBe("https://cdn.example.com/clip.mp4");
		expect(state.saveProjectTimeline).toHaveBeenCalledWith({
			projectId: "wzrd:proj-1",
			tracks: snapshotWithContent.timeline.tracks,
			sceneId: "scene-1",
		});
		expect(state.loadProjectTimeline).toHaveBeenCalledWith({
			projectId: "wzrd:proj-1",
			sceneId: "scene-1",
		});
	});

	it("does not overwrite a timeline that already has content", async () => {
		state.snapshotRow = snapshotWithContent;
		state.tracks = [{ elements: [{ id: "existing" }] }];

		const result = await maybeHydrateFromSnapshot({
			wzrdProjectId: "proj-1",
			qcutProjectId: "wzrd:proj-1",
		});

		expect(result.hydrated).toBe(false);
		expect(state.saveProjectTimeline).not.toHaveBeenCalled();
		expect(state.addMediaItem).not.toHaveBeenCalled();
	});

	it("skips when there is no snapshot or the snapshot is empty", async () => {
		expect(
			(
				await maybeHydrateFromSnapshot({
					wzrdProjectId: "proj-1",
					qcutProjectId: "wzrd:proj-1",
				})
			).hydrated
		).toBe(false);

		state.snapshotRow = { version: 1, timeline: { tracks: [] } };
		expect(
			(
				await maybeHydrateFromSnapshot({
					wzrdProjectId: "proj-1",
					qcutProjectId: "wzrd:proj-1",
				})
			).hydrated
		).toBe(false);

		state.snapshotRow = {
			version: 2,
			timeline: snapshotWithContent.timeline,
		};
		expect(
			(
				await maybeHydrateFromSnapshot({
					wzrdProjectId: "proj-1",
					qcutProjectId: "wzrd:proj-1",
				})
			).hydrated
		).toBe(false);

		expect(state.saveProjectTimeline).not.toHaveBeenCalled();
	});

	it("does not add media items that already exist in the store", async () => {
		state.snapshotRow = snapshotWithContent;
		state.mediaItems = [{ id: "m1" }];

		const result = await maybeHydrateFromSnapshot({
			wzrdProjectId: "proj-1",
			qcutProjectId: "wzrd:proj-1",
		});

		expect(result.hydrated).toBe(true);
		expect(state.addMediaItem).not.toHaveBeenCalled();
	});

	it("returns hydrated=false on fetch errors instead of throwing", async () => {
		state.snapshotError = new Error("network");

		const result = await maybeHydrateFromSnapshot({
			wzrdProjectId: "proj-1",
			qcutProjectId: "wzrd:proj-1",
		});

		expect(result.hydrated).toBe(false);
		expect(state.saveProjectTimeline).not.toHaveBeenCalled();
	});
});
