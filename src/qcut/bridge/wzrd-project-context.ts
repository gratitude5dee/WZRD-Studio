/**
 * WZRD <-> QCut project context
 *
 * Phase 3:
 * - QCut uses its own internal project IDs for local IndexedDB storage.
 * - WZRD uses Supabase `projects.id`.
 *
 * We key QCut projects as: `wzrd:${wzrdProjectId}` and keep a mapping so
 * platform adapters / services can resolve the owning WZRD project.
 */

export type WzrdProjectContext = {
	wzrdProjectId: string;
	qcutProjectId: string;
	/** Supabase projects.updated_at (string) as last observed by the renderer */
	lastKnownUpdatedAt?: string | null;
};

const qcutToWzrd = new Map<string, WzrdProjectContext>();
const hydrationPending = new Set<string>();
const hydrationDone = new Set<string>();

/**
 * While hydration is pending for a project, snapshot writes are suppressed so
 * the just-loaded (still empty) local state can't overwrite the remote
 * snapshot before it has been read back.
 */
export function markSnapshotHydrationPending(qcutProjectId: string) {
	hydrationDone.delete(qcutProjectId);
	hydrationPending.add(qcutProjectId);
}

/** Clear the pending gate without marking hydration successful (error paths). */
export function clearSnapshotHydrationPending(qcutProjectId: string) {
	hydrationPending.delete(qcutProjectId);
}

export function markSnapshotHydrationDone(qcutProjectId: string) {
	hydrationPending.delete(qcutProjectId);
	hydrationDone.add(qcutProjectId);
}

export function isSnapshotHydrationPending(qcutProjectId: string): boolean {
	return hydrationPending.has(qcutProjectId);
}

/** True once the remote snapshot has been read back this session. */
export function isSnapshotHydrationDone(qcutProjectId: string): boolean {
	return hydrationDone.has(qcutProjectId);
}

export function setWzrdProjectContext(ctx: WzrdProjectContext) {
	qcutToWzrd.set(ctx.qcutProjectId, ctx);
}

export function getWzrdProjectContext(qcutProjectId: string): WzrdProjectContext | null {
	return qcutToWzrd.get(qcutProjectId) ?? null;
}

export function updateLastKnownUpdatedAt(qcutProjectId: string, updatedAt: string | null | undefined) {
	const existing = qcutToWzrd.get(qcutProjectId);
	if (!existing) return;
	qcutToWzrd.set(qcutProjectId, { ...existing, lastKnownUpdatedAt: updatedAt ?? null });
}
