/**
 * Debug Utilities for CLI Export Engine
 *
 * Logging helpers for export operations including duration
 * verification and mode detection logging.
 */

import { debugLog, debugWarn } from "@qcut-app/lib/debug/debug-config";

/** Logs actual video duration from a blob and compares against expected timeline duration. */
export function logActualVideoDurationCLI(
	videoBlob: Blob,
	totalDuration: number
): void {
	const video = document.createElement("video");
	const url = URL.createObjectURL(videoBlob);

	video.onloadedmetadata = () => {
		const actualDuration = video.duration;
		const expectedDuration = totalDuration;

		debugLog(
			`[CLIExportEngine] 🎥 Actual video duration: ${actualDuration.toFixed(3)}s`
		);
		debugLog(
			`[CLIExportEngine] 📈 Timeline vs Video ratio: ${(actualDuration / expectedDuration).toFixed(3)}x`
		);

		if (Math.abs(actualDuration - expectedDuration) > 0.1) {
			debugWarn(
				`[CLIExportEngine] ⚠️  Duration mismatch detected! Expected: ${expectedDuration.toFixed(3)}s, Got: ${actualDuration.toFixed(3)}s`
			);
		} else {
			debugLog("[CLIExportEngine] ✅ Duration match within tolerance");
		}

		URL.revokeObjectURL(url);
	};

	video.onerror = () => {
		debugWarn("[CLIExportEngine] ⚠️  Could not determine actual video duration");
		URL.revokeObjectURL(url);
	};

	video.src = url;
}

/** Logs Mode 2 (direct video copy) detection status and export parameters. */
export function logMode2Detection(
	canUseMode2: boolean,
	videoInput: { path: string; trimStart: number; trimEnd: number } | null,
	needsVideoInput: boolean,
	hasTextFilters: boolean,
	hasStickerFilters: boolean
): void {
	if (canUseMode2 && videoInput) {
		debugLog("[MODE 2 EXPORT] Mode 2 optimization enabled!");
		debugLog(`[MODE 2 EXPORT] Video input: ${videoInput.path}`);
		debugLog(
			`[MODE 2 EXPORT] Trim: ${videoInput.trimStart}s - ${videoInput.trimEnd}s`
		);
		debugLog(
			`[MODE 2 EXPORT] Text filters: ${hasTextFilters}, Sticker filters: ${hasStickerFilters}`
		);
		debugLog("[MODE 2 EXPORT] Frame rendering: SKIPPED (using direct video)");
	} else if (needsVideoInput && !videoInput) {
		debugWarn("⚠️ [MODE 2 EXPORT] Video input extraction failed");
		debugWarn("⚠️ [MODE 2 EXPORT] Falling back to standard export");
	}
}
