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
