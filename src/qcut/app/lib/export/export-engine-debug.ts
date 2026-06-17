import { debugLog, debugWarn } from "@qcut-app/lib/debug/debug-config";

/** Validate rendered frame to detect black/blank frames */
export function validateRenderedFrame(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	attempt: number
): { isValid: boolean; reason: string } {
	try {
		const sampleWidth = Math.min(width, 50);
		const sampleHeight = Math.min(height, 50);
		const imageData = ctx.getImageData(x, y, sampleWidth, sampleHeight);
		const pixels = imageData.data;

		let nonBlackPixels = 0;
		let totalPixels = 0;

		for (let i = 0; i < pixels.length; i += 4) {
			const r = pixels[i];
			const g = pixels[i + 1];
			const b = pixels[i + 2];
			const alpha = pixels[i + 3];

			totalPixels++;

			if ((r > 10 || g > 10 || b > 10) && alpha > 10) {
				nonBlackPixels++;
			}
		}

		const nonBlackRatio = nonBlackPixels / totalPixels;
		const minValidRatio = 0.05;

		if (nonBlackRatio < minValidRatio) {
			return {
				isValid: false,
				reason: `Frame appears to be mostly black (${(nonBlackRatio * 100).toFixed(1)}% non-black pixels, attempt ${attempt})`,
			};
		}

		if (attempt > 1) {
			debugLog(
				`[ExportEngine] ✅ Frame validation passed on attempt ${attempt} (${(nonBlackRatio * 100).toFixed(1)}% content)`
			);
		}

		return { isValid: true, reason: "Frame is valid" };
	} catch (error) {
		debugWarn(`[ExportEngine] Frame validation error: ${error}`);
		return { isValid: true, reason: "Validation error - assuming valid" };
	}
}

/** Log actual video duration from blob for debugging */
export function logActualVideoDuration(
	videoBlob: Blob,
	totalDuration: number
): void {
	const video = document.createElement("video");
	const url = URL.createObjectURL(videoBlob);

	video.onloadedmetadata = () => {
		const actualDuration = video.duration;

		debugLog(
			`[ExportEngine] 🎥 Actual video duration: ${actualDuration.toFixed(3)}s`
		);
		debugLog(
			`[ExportEngine] 📈 Timeline vs Video ratio: ${(actualDuration / totalDuration).toFixed(3)}x`
		);

		if (Math.abs(actualDuration - totalDuration) > 0.1) {
			debugWarn(
				`[ExportEngine] ⚠️  Duration mismatch detected! Expected: ${totalDuration.toFixed(3)}s, Got: ${actualDuration.toFixed(3)}s`
			);
		} else {
			debugLog("[ExportEngine] ✅ Duration match within tolerance");
		}

		URL.revokeObjectURL(url);
	};

	video.onerror = () => {
		debugWarn("[ExportEngine] ⚠️  Could not determine actual video duration");
		URL.revokeObjectURL(url);
	};

	video.src = url;
}
