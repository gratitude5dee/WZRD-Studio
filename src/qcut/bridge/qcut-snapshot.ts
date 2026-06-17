import { useProjectStore } from "@qcut-app/stores/project-store";

// Note: these are dynamic-imported to avoid creating new circular deps at module load.

export type QcutSnapshotV1 = {
	version: 1;
	savedAt: string;
	qcutProjectId: string;
	project: unknown;
	timeline: unknown;
	media: unknown;
};

function stripFileObjects(value: unknown): unknown {
	if (!value) return value;

	// Drop File / Blob instances (Supabase JSON can't store them).
	if (typeof File !== "undefined" && value instanceof File) {
		return {
			__type: "File",
			name: value.name,
			size: value.size,
			type: value.type,
			lastModified: value.lastModified,
		};
	}
	if (typeof Blob !== "undefined" && value instanceof Blob) {
		return { __type: "Blob", size: value.size, type: value.type };
	}

	if (Array.isArray(value)) {
		return value.map(stripFileObjects);
	}

	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			// Avoid persisting huge blob URLs.
			if (k.toLowerCase().includes("blob") && typeof v === "string" && v.startsWith("blob:")) {
				continue;
			}
			out[k] = stripFileObjects(v);
		}
		return out;
	}

	return value;
}

export async function buildQcutSnapshotV1(qcutProjectId: string): Promise<QcutSnapshotV1> {
	const project = useProjectStore.getState().activeProject;

	const { useTimelineStore } = await import("@qcut-app/stores/timeline/timeline-store");
	const { useMediaStore } = await import("@qcut-app/stores/media/media-store");

	const timelineState = useTimelineStore.getState();
	const mediaState = useMediaStore.getState();

	return {
		version: 1,
		savedAt: new Date().toISOString(),
		qcutProjectId,
		project: stripFileObjects(project),
		timeline: stripFileObjects({
			tracks: timelineState.tracks,
			rippleEditingEnabled: timelineState.rippleEditingEnabled,
			snappingEnabled: timelineState.snappingEnabled,
			showEffectsTrack: timelineState.showEffectsTrack,
		}),
		media: stripFileObjects({
			mediaItems: mediaState.mediaItems.map((item) => {
				// keep a minimal stable representation
				const { file, ...rest } = item as any;
				return {
					...rest,
					file:
						file && typeof file === "object"
							? {
								name: file.name,
								size: file.size,
								type: file.type,
								lastModified: file.lastModified,
							}
							: null,
				};
			}),
		}),
	};
}
