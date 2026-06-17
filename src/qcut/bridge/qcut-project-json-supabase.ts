import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { buildQcutSnapshotV1 } from "./qcut-snapshot";
import {
	getWzrdProjectContext,
	updateLastKnownUpdatedAt,
} from "./wzrd-project-context";

const supabase = typedSupabase as any;

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

	try {
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
	} catch (err) {
		// Best-effort logging (avoid crashing the editor)
		console.warn("[WZRD/QCut] Failed to persist qcut_project_json", err);
	}
}
