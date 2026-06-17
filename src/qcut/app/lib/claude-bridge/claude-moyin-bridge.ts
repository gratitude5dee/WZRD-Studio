/**
 * Claude Moyin (Director) Bridge — WZRD stub
 *
 * WZRD-EDIT: The Moyin suite is explicitly out of scope for this integration
 * (deferred per goal spec). QCut upstream wires a platform().moyin namespace
 * into the editor and Claude bridge lifecycle. In WZRD we ship without it, so
 * this bridge becomes a no-op.
 */

// WZRD-EDIT: Keep the exported API surface so upstream callers don't need to change.
export function setupClaudeMoyinBridge(): void {
	// no-op
}

// WZRD-EDIT: Keep the exported API surface so upstream callers don't need to change.
export function cleanupClaudeMoyinBridge(): void {
	// no-op
}
