/**
 * Feature flags for the vendored QCut editor UI.
 *
 * Phase 2 notes:
 * - We run in "web adapter" mode, so desktop-only capabilities are expected
 *   to show QCut's unsupported states.
 * - Moyin is deferred and removed during vendoring.
 */

export const QCUT_FEATURE_FLAGS = {
	moyin: false,
} as const;

export type QCutFeatureFlags = typeof QCUT_FEATURE_FLAGS;
