import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { debugError, debugLog } from "@qcut-app/lib/debug/debug-config";
import { storageService } from "@qcut-app/lib/storage/storage-service";
import { useMediaStore } from "@qcut-app/stores/media/media-store";
import { useProjectStore } from "@qcut-app/stores/project-store";
import { useSceneStore } from "@qcut-app/stores/timeline/scene-store";
import { useTimelineStore } from "@qcut-app/stores/timeline/timeline-store";
import type { TimelineTrack } from "@qcut-app/types/timeline";
import { markSnapshotHydrationDone } from "./wzrd-project-context";

const supabase = typedSupabase as any;

type SnapshotMediaItem = {
	id?: unknown;
	name?: unknown;
	type?: unknown;
	url?: unknown;
	thumbnailUrl?: unknown;
	originalUrl?: unknown;
	duration?: unknown;
	width?: unknown;
	height?: unknown;
	fps?: unknown;
	metadata?: unknown;
	file?: { name?: unknown; type?: unknown } | null;
};

function isRemoteUrl(value: unknown): value is string {
	return (
		typeof value === "string" &&
		(value.startsWith("https://") || value.startsWith("http://"))
	);
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function timelineHasContent(): boolean {
	try {
		return useTimelineStore
			.getState()
			.tracks.some((track) => track.elements.length > 0);
	} catch {
		return false;
	}
}

/**
 * Restore the editor state from the `projects.qcut_project_json` snapshot.
 *
 * Only runs when the locally persisted timeline is empty (a fresh browser or
 * device), so local IndexedDB state always wins over the remote snapshot.
 * Media items are restored from their remote URLs; anything that only lived
 * in a blob URL or local file can't be rehydrated and is skipped.
 */
export async function maybeHydrateFromSnapshot({
	wzrdProjectId,
	qcutProjectId,
}: {
	wzrdProjectId: string;
	qcutProjectId: string;
}): Promise<{ hydrated: boolean; stale?: boolean }> {
	const isStale = () =>
		useProjectStore.getState().activeProject?.id !== qcutProjectId;

	const addedMediaIds: string[] = [];
	const rollbackAddedMedia = async () => {
		const store = useMediaStore.getState();
		for (const addedId of addedMediaIds) {
			try {
				await store.removeMediaItem(qcutProjectId, addedId);
			} catch (rollbackError) {
				debugError(
					"[WZRD/QCut] Failed to roll back hydrated media item",
					rollbackError
				);
			}
		}
	};

	try {
		if (timelineHasContent()) {
			markSnapshotHydrationDone(qcutProjectId);
			return { hydrated: false };
		}

		const { data, error } = await supabase
			.from("projects")
			.select("qcut_project_json")
			.eq("id", wzrdProjectId)
			.maybeSingle();
		if (error) throw error;

		// The user may have switched projects while the snapshot was fetched;
		// every return past this point must report staleness so the caller
		// doesn't run the legacy import against the wrong project's stores.
		if (isStale()) {
			return { hydrated: false, stale: true };
		}

		const snapshot = data?.qcut_project_json as
			| {
					version?: unknown;
					timeline?: { tracks?: unknown };
					media?: { mediaItems?: unknown };
			  }
			| null
			| undefined;
		if (!snapshot || snapshot.version !== 1) {
			markSnapshotHydrationDone(qcutProjectId);
			return { hydrated: false };
		}

		const tracks = snapshot.timeline?.tracks;
		if (!Array.isArray(tracks)) {
			markSnapshotHydrationDone(qcutProjectId);
			return { hydrated: false };
		}
		const hasElements = tracks.some(
			(track) =>
				Array.isArray((track as { elements?: unknown[] })?.elements) &&
				((track as { elements: unknown[] }).elements.length ?? 0) > 0
		);
		if (!hasElements) {
			markSnapshotHydrationDone(qcutProjectId);
			return { hydrated: false };
		}

		debugLog("[WZRD/QCut] Hydrating editor state from snapshot", {
			wzrdProjectId,
			qcutProjectId,
			trackCount: tracks.length,
		});

		// Restore media items that still have a reachable remote URL.
		const mediaStore = useMediaStore.getState();
		const existingIds = new Set(mediaStore.mediaItems.map((m) => m.id));
		const snapshotItems = snapshot.media?.mediaItems;
		if (Array.isArray(snapshotItems)) {
			for (const raw of snapshotItems as SnapshotMediaItem[]) {
				if (isStale()) {
					await rollbackAddedMedia();
					return { hydrated: false, stale: true };
				}
				const id = typeof raw?.id === "string" ? raw.id : undefined;
				if (!id || existingIds.has(id)) continue;

				const url = isRemoteUrl(raw.url)
					? raw.url
					: isRemoteUrl(raw.originalUrl)
						? raw.originalUrl
						: undefined;
				if (!url) continue;

				const type =
					raw.type === "video" || raw.type === "audio" || raw.type === "image"
						? raw.type
						: "video";
				const fileName =
					typeof raw.file?.name === "string" ? raw.file.name : "asset";
				const fileType =
					typeof raw.file?.type === "string" ? raw.file.type : undefined;

				await mediaStore.addMediaItem(qcutProjectId, {
					id,
					name: typeof raw.name === "string" ? raw.name : fileName,
					type,
					// Placeholder file (size 0) — playback uses `url`.
					file: new File([], fileName, { type: fileType }),
					url,
					thumbnailUrl: isRemoteUrl(raw.thumbnailUrl)
						? raw.thumbnailUrl
						: undefined,
					originalUrl: isRemoteUrl(raw.originalUrl)
						? raw.originalUrl
						: undefined,
					duration: asNumber(raw.duration),
					width: asNumber(raw.width),
					height: asNumber(raw.height),
					fps: asNumber(raw.fps),
					metadata:
						raw.metadata && typeof raw.metadata === "object"
							? (raw.metadata as Record<string, unknown>)
							: { source: "qcut-snapshot" },
				});
				existingIds.add(id);
				addedMediaIds.push(id);
			}
		}

		// Persist the snapshot tracks locally, then load through the store so
		// normalization and main-track guarantees apply.
		if (isStale()) {
			await rollbackAddedMedia();
			return { hydrated: false, stale: true };
		}
		const activeProject = useProjectStore.getState().activeProject;
		const sceneId =
			useSceneStore.getState().currentScene?.id ??
			activeProject?.currentSceneId;
		await storageService.saveProjectTimeline({
			projectId: qcutProjectId,
			tracks: tracks as TimelineTrack[],
			sceneId,
		});
		await useTimelineStore.getState().loadProjectTimeline({
			projectId: qcutProjectId,
			sceneId,
		});

		markSnapshotHydrationDone(qcutProjectId);
		return { hydrated: true };
	} catch (error) {
		debugError("[WZRD/QCut] Snapshot hydration failed", error);
		// A throw mid-hydration can land here after the user switched projects;
		// report staleness so the caller doesn't import this project's legacy
		// timeline into the newly active one, and undo any media already added.
		if (isStale()) {
			await rollbackAddedMedia();
			return { hydrated: false, stale: true };
		}
		return { hydrated: false };
	}
}
