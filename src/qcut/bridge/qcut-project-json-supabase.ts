import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { buildQcutSnapshotV1 } from "./qcut-snapshot";
import {
	getWzrdProjectContext,
	isSnapshotHydrationDone,
	isSnapshotHydrationPending,
	markSnapshotHydrationDone,
	updateLastKnownUpdatedAt,
} from "./wzrd-project-context";

const supabase = typedSupabase as any;

function snapshotHasTimelineElements(snapshot: unknown): boolean {
	const tracks = (
		snapshot as { timeline?: { tracks?: unknown } } | null | undefined
	)?.timeline?.tracks;
	if (!Array.isArray(tracks)) return false;
	return tracks.some(
		(track) =>
			Array.isArray((track as { elements?: unknown[] })?.elements) &&
			(track as { elements: unknown[] }).elements.length > 0
	);
}

/**
 * Persist the current QCut state snapshot into `projects.qcut_project_json`.
 *
 * This is intentionally best-effort (errors are logged) because writes are
 * triggered by debounced subscriptions.
 */
export async function writeQcutSnapshotToSupabase(qcutProjectId: string): Promise<void> {
	const ctx = getWzrdProjectContext(qcutProjectId);
	if (!ctx) {
		// Not a WZRD-backed project (or bridge hasn't initialized yet).
		return;
	}

	if (isSnapshotHydrationPending(qcutProjectId)) {
		// The editor hasn't read the remote snapshot back yet; writing now would
		// overwrite it with the still-empty local state.
		return;
	}

	const snapshot = await buildQcutSnapshotV1(qcutProjectId);

	// Ensure snapshot is keyed to the owning WZRD project.
	const wzrdProjectId = ctx.wzrdProjectId;

	// Use an optimistic concurrency guard based on projects.updated_at.
	// If we detect a conflict, refetch and retry once.
	let expectedUpdatedAt = ctx.lastKnownUpdatedAt ?? null;

	const attemptUpdate = async (updatedAtToMatch: string | null) => {
		let query = supabase
			.from("projects")
			.update({ qcut_project_json: snapshot })
			.eq("id", wzrdProjectId)
			.select("updated_at")
			.limit(1);

		if (updatedAtToMatch) {
			query = query.eq("updated_at", updatedAtToMatch);
		}

		return await query;
	};

	const snapshotHasElements = snapshotHasTimelineElements(snapshot);

	try {
		// Until the remote snapshot has been read back this session, never
		// replace stored timeline content with an empty snapshot — an empty
		// write during load would destroy the user's work. After hydration
		// (or once a non-empty snapshot has been written this session, which
		// makes the local state the authoritative lineage), empty writes are
		// legitimate: the user cleared the timeline. If the verification read
		// itself fails we keep refusing — an unverifiable empty write is not
		// worth risking the stored timeline over; the debounced autosave will
		// retry on the next change.
		if (!isSnapshotHydrationDone(qcutProjectId) && !snapshotHasElements) {
			const existing = await supabase
				.from("projects")
				.select("qcut_project_json")
				.eq("id", wzrdProjectId)
				.maybeSingle();
			if (existing.error) throw existing.error;
			if (snapshotHasTimelineElements(existing.data?.qcut_project_json)) {
				return;
			}
			// Remote is empty too, so this empty write can't destroy anything;
			// nothing remains for the guard to protect this session.
			markSnapshotHydrationDone(qcutProjectId);
		}

		let { data, error } = await attemptUpdate(expectedUpdatedAt);
		if (error) {
			throw error;
		}

		// If the update matched 0 rows, we likely lost the updated_at race.
		if (!data || data.length === 0) {
			const refetch = await supabase
				.from("projects")
				.select("updated_at")
				.eq("id", wzrdProjectId)
				.single();
			if (refetch.error) {
				throw refetch.error;
			}

			expectedUpdatedAt = refetch.data?.updated_at ?? null;
			({ data, error } = await attemptUpdate(expectedUpdatedAt));
			if (error) throw error;
		}

		const updatedAt = data?.[0]?.updated_at;
		if (typeof updatedAt === "string") {
			updateLastKnownUpdatedAt(qcutProjectId, updatedAt);
		}

		if (snapshotHasElements) {
			// A non-empty snapshot has been persisted, so the local state is now
			// the stored lineage; a later empty write is an intentional clear
			// even if the initial hydration read never succeeded.
			markSnapshotHydrationDone(qcutProjectId);
		}
	} catch (err) {
		// Best-effort logging (avoid crashing the editor)
		console.warn("[WZRD/QCut] Failed to persist qcut_project_json", err);
	}
}
