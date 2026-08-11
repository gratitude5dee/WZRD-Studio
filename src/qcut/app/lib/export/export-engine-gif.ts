import type {
	ExportSettingsWithAudio,
	GifExportConfig,
} from "@qcut-app/types/export";
import {
	calculateGifDimensions,
	DEFAULT_GIF_CONFIG,
} from "@qcut-app/types/export";
import type { TimelineTrack } from "@qcut-app/types/timeline";
import type { MediaItem } from "@qcut-app/stores/media/media-store-types";
import { debugError, debugLog } from "@qcut-app/lib/debug/debug-config";
import { ExportEngine } from "./export-engine";
import { GifExportEngine } from "./gif-export-engine";

type GifProgressCallback = (
	progress: number,
	status: string,
	advancedInfo?: {
		currentFrame: number;
		totalFrames: number;
		encodingSpeed: number;
		processedFrames: number;
		elapsedTime: number;
		averageFrameTime: number;
		estimatedTimeRemaining: number;
	}
) => void;

// WZRD-EDIT: adapt the existing timeline renderer to gif.js's frame API.
export class GifTimelineExportEngine extends ExportEngine {
	private readonly gifEncoder: GifExportEngine;
	private gifProgressCallback?: GifProgressCallback;

	constructor(
		canvas: HTMLCanvasElement,
		settings: ExportSettingsWithAudio,
		tracks: TimelineTrack[],
		mediaItems: MediaItem[],
		totalDuration: number
	) {
		const gifConfig = settings.gifConfig ?? DEFAULT_GIF_CONFIG;
		const dimensions = calculateGifDimensions(
			settings.width,
			settings.height,
			gifConfig.sizePreset
		);

		super(
			canvas,
			{
				...settings,
				width: dimensions.width,
				height: dimensions.height,
			},
			tracks,
			mediaItems,
			totalDuration
		);
		// WZRD-EDIT: identify GIF exports for agent API results.
		this.actualEngineType = "gif";

		this.fps = gifConfig.frameRate;
		this.gifEncoder = new GifExportEngine({
			width: dimensions.width,
			height: dimensions.height,
			frameRate: gifConfig.frameRate,
			loop: gifConfig.loop,
			quality: gifConfig.quality,
			onProgress: (progress) => {
				this.gifProgressCallback?.(
					90 + progress * 10,
					`Encoding GIF (${Math.round(progress * 100)}%)`
				);
			},
		});
	}

	async export(progressCallback?: GifProgressCallback): Promise<Blob> {
		if (this.isExporting) {
			throw new Error("Export already in progress");
		}

		this.isExporting = true;
		this.abortController = new AbortController();
		this.gifProgressCallback = progressCallback;
		const totalFrames = this.calculateTotalFrames();
		const startTime = Date.now();

		try {
			progressCallback?.(0, "Starting GIF export...");

			for (let frame = 0; frame < totalFrames; frame++) {
				if (this.isExportCancelled()) {
					throw new Error("Export cancelled by user");
				}

				const currentTime = frame / this.fps;
				await this.renderFrame(currentTime);
				this.gifEncoder.addFrame(this.canvas);

				const elapsedTime = (Date.now() - startTime) / 1000;
				const averageFrameTime = (elapsedTime * 1000) / (frame + 1);
				const encodingSpeed = (frame + 1) / Math.max(elapsedTime, 0.001);
				const remainingFrames = totalFrames - frame - 1;
				progressCallback?.(
					(frame / totalFrames) * 90,
					`Rendering GIF frame ${frame + 1} of ${totalFrames}`,
					{
						currentFrame: frame + 1,
						totalFrames,
						encodingSpeed,
						processedFrames: frame + 1,
						elapsedTime,
						averageFrameTime,
						estimatedTimeRemaining:
							remainingFrames * (averageFrameTime / 1000),
					}
				);
			}

			progressCallback?.(90, "Encoding GIF...");
			const encodedBlob = await this.renderGifWithCancellation();
			const gifBlob = new Blob([encodedBlob], { type: "image/gif" });
			debugLog(
				`[GifExportEngine] Encoded ${totalFrames} frames at ${this.fps}fps`
			);
			progressCallback?.(100, "Export complete!");
			return gifBlob;
		} catch (error) {
			debugError("[GifExportEngine] Export failed:", error);
			this.gifEncoder.abort();
			throw error;
		} finally {
			this.isExporting = false;
			this.abortController = null;
			this.gifProgressCallback = undefined;
		}
	}

	private async renderGifWithCancellation(): Promise<Blob> {
		const signal = this.abortController?.signal;
		if (!signal) {
			throw new Error("GIF export is not initialized");
		}

		const cancellation = new Promise<never>((_, reject) => {
			signal.addEventListener(
				"abort",
				() => reject(new Error("Export cancelled by user")),
				{ once: true }
			);
		});

		return Promise.race([this.gifEncoder.render(), cancellation]);
	}

	cancel(): void {
		this.gifEncoder.abort();
		super.cancel();
	}
}
