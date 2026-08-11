/**
 * Mediabunny-based export engine for iPad/browser environments.
 *
 * Uses the WebCodecs API via mediabunny's CanvasSource for
 * hardware-accelerated H.264 encoding and proper MP4 muxing.
 * This replaces FFmpeg on platforms where native binaries are unavailable.
 */

import { ExportEngine } from "./export-engine";
import type { ExportSettings } from "@qcut-app/types/export";
import type { TimelineTrack } from "@qcut-app/types/timeline";
import type { MediaItem } from "@qcut-app/stores/media/media-store-types";
// Type-only: mediabunny itself stays behind the dynamic import below.
import type { AudioCodec, VideoCodec } from "mediabunny";

// Progress callback type
type ProgressCallback = (progress: number, status: string) => void;

/** Race a promise against a timeout; clears the timer on success to avoid leaks. */
function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout>;
	return Promise.race([
		promise.then((v) => {
			clearTimeout(timeoutId);
			return v;
		}),
		new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => reject(new Error(message)), ms);
		}),
	]);
}

/** Quality preset → H.264 video bitrate mapping */
const VIDEO_BITRATE: Record<string, number> = {
	"1080p": 8_000_000,
	"720p": 5_000_000,
	"480p": 2_500_000,
};

/** Quality preset → audio bitrate mapping */
const AUDIO_BITRATE: Record<string, number> = {
	"1080p": 128_000,
	"720p": 128_000,
	"480p": 96_000,
};

/** The part of mediabunny's `OutputFormat` the codec negotiation needs. */
interface OutputFormatLike {
	mimeType: string;
	fileExtension: string;
	getSupportedVideoCodecs(): VideoCodec[];
	getSupportedAudioCodecs(): AudioCodec[];
}

/** Mixdown format used for both the OfflineAudioContext and the encoder probe. */
const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_CHANNELS = 2;

/**
 * WZRD-EDIT: what the browser actually agreed to encode.
 *
 * Browsers disagree wildly about codecs — Chromium on Linux ships no AAC
 * encoder, Firefox has no H.264 encoder — so the container and both codecs are
 * negotiated at export time rather than assumed. `container: "webm"` is a
 * genuine fallback and is surfaced to the user, not silently substituted.
 */
export interface MuxerEncodingPlan {
	container: "mp4" | "webm";
	mimeType: string;
	fileExtension: string;
	videoCodec: VideoCodec;
	audioCodec: AudioCodec | null;
}

/**
 * Export engine using mediabunny for proper MP4 muxing via WebCodecs.
 * Works on iPad Safari 16.4+ and modern browsers without FFmpeg.
 */
export class ExportEngineMuxer extends ExportEngine {
	private activeOutput: any = null;
	/** Set once the codecs are negotiated; read by callers to label the result. */
	encodingPlan: MuxerEncodingPlan | null = null;

	/** Override main export method with mediabunny pipeline. */
	async export(progressCallback?: ProgressCallback): Promise<Blob> {
		if (this.isExporting) {
			throw new Error("Export already in progress");
		}

		this.isExporting = true;
		this.abortController = new AbortController();

		try {
			progressCallback?.(0, "Initializing WebCodecs encoder...");

			// Dynamic import to avoid loading mediabunny on desktop
			const {
				Output,
				Mp4OutputFormat,
				WebMOutputFormat,
				BufferTarget,
				CanvasSource,
				AudioBufferSource,
				getFirstEncodableVideoCodec,
				getFirstEncodableAudioCodec,
			} = await import("mediabunny");

			const fps = this.getFrameRate();
			const totalFrames = this.calculateTotalFrames();
			const quality = this.settings.quality || "720p";
			const videoBitrate = VIDEO_BITRATE[quality] ?? 5_000_000;
			const audioBitrate = AUDIO_BITRATE[quality] ?? 128_000;

			// Prepare audio first: the container choice depends on whether the
			// browser can encode audio for it at all.
			const audioData = await this.extractTimelineAudio();

			const plan = await this.negotiateEncoding({
				Mp4OutputFormat,
				WebMOutputFormat,
				getFirstEncodableVideoCodec,
				getFirstEncodableAudioCodec,
				videoBitrate,
				audioBitrate,
				needsAudio: audioData !== null,
			});
			this.encodingPlan = plan;

			if (audioData && !plan.audioCodec) {
				progressCallback?.(
					1,
					"No audio encoder available — exporting video only"
				);
				console.warn(
					"[ExportEngineMuxer] No encodable audio codec for the chosen container; exporting without audio."
				);
			}

			const target = new BufferTarget();
			const output = new Output({
				format:
					plan.container === "mp4"
						? new Mp4OutputFormat({ fastStart: "in-memory" })
						: new WebMOutputFormat(),
				target,
			});

			// Use "no-preference" so it works on both real hardware (GPU) and simulator (software)
			const videoSource = new CanvasSource(this.canvas, {
				codec: plan.videoCodec,
				bitrate: videoBitrate,
				hardwareAcceleration: "no-preference",
			});
			output.addVideoTrack(videoSource, { frameRate: fps });

			let audioSource: InstanceType<typeof AudioBufferSource> | null = null;
			if (audioData && plan.audioCodec) {
				audioSource = new AudioBufferSource({
					codec: plan.audioCodec,
					bitrate: audioBitrate,
				});
				output.addAudioTrack(audioSource);
			}

			this.activeOutput = output;
			await output.start();

			progressCallback?.(2, "Rendering frames...");

			const frameDuration = 1 / fps;

			// Render and encode each frame
			for (let frame = 0; frame < totalFrames; frame++) {
				if (this.isExportCancelled()) {
					throw new Error("Export cancelled by user");
				}

				const currentTime = frame * frameDuration;

				// Render frame to canvas using existing renderer
				await this.renderFrame(currentTime);

				// Feed canvas to mediabunny's CanvasSource with timeout
				// (WebCodecs encoder can stall on simulator or unsupported platforms)
				await withTimeout(
					videoSource.add(currentTime, frameDuration),
					10_000,
					`Encoder stalled at frame ${frame + 1}/${totalFrames}`
				);

				// Progress (reserve 5% for finalization)
				const progress = 2 + (frame / totalFrames) * 90;
				progressCallback?.(
					progress,
					`Encoding frame ${frame + 1}/${totalFrames}`
				);

				// Yield to UI every 10 frames
				if (frame % 10 === 0) {
					await new Promise((resolve) => setTimeout(resolve, 0));
				}
			}

			// Add audio data if present
			if (audioSource && audioData) {
				progressCallback?.(93, "Encoding audio...");
				await audioSource.add(audioData);
			}

			progressCallback?.(96, `Finalizing ${plan.container.toUpperCase()}...`);
			await output.finalize();

			if (!target.buffer) {
				throw new Error("Export finalization failed — no output buffer");
			}
			const blob = new Blob([target.buffer], { type: plan.mimeType });
			progressCallback?.(100, "Export complete!");

			return blob;
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === "Export cancelled by user"
			) {
				throw error;
			}
			console.error("[ExportEngineMuxer] Export failed:", error);
			throw error;
		} finally {
			this.activeOutput = null;
			this.isExporting = false;
		}
	}

	/**
	 * WZRD-EDIT: pick a container and codecs the browser can actually encode.
	 *
	 * MP4/H.264 is preferred and WebM is the labelled fallback. Audio is
	 * optional: a timeline whose audio cannot be encoded still exports video
	 * rather than failing the whole job.
	 */
	private async negotiateEncoding(deps: {
		Mp4OutputFormat: new (options?: Record<string, unknown>) => OutputFormatLike;
		WebMOutputFormat: new () => OutputFormatLike;
		getFirstEncodableVideoCodec: (
			codecs: VideoCodec[],
			options: { width: number; height: number; bitrate: number }
		) => Promise<VideoCodec | null>;
		getFirstEncodableAudioCodec: (
			codecs: AudioCodec[],
			options: {
				numberOfChannels: number;
				sampleRate: number;
				bitrate: number;
			}
		) => Promise<AudioCodec | null>;
		videoBitrate: number;
		audioBitrate: number;
		needsAudio: boolean;
	}): Promise<MuxerEncodingPlan> {
		const videoOptions = {
			width: this.settings.width,
			height: this.settings.height,
			bitrate: deps.videoBitrate,
		};
		const audioOptions = {
			numberOfChannels: AUDIO_CHANNELS,
			sampleRate: AUDIO_SAMPLE_RATE,
			bitrate: deps.audioBitrate,
		};

		const candidates: Array<{
			container: "mp4" | "webm";
			format: OutputFormatLike;
		}> = [
			{
				container: "mp4",
				format: new deps.Mp4OutputFormat({ fastStart: "in-memory" }),
			},
			{ container: "webm", format: new deps.WebMOutputFormat() },
		];

		const plans: MuxerEncodingPlan[] = [];
		for (const { container, format } of candidates) {
			const videoCodec = await deps.getFirstEncodableVideoCodec(
				format.getSupportedVideoCodecs(),
				videoOptions
			);
			if (!videoCodec) continue;

			const audioCodec = deps.needsAudio
				? await deps.getFirstEncodableAudioCodec(
						format.getSupportedAudioCodecs(),
						audioOptions
					)
				: null;

			const plan: MuxerEncodingPlan = {
				container,
				mimeType: format.mimeType,
				fileExtension: format.fileExtension,
				videoCodec,
				audioCodec,
			};

			// Preferred container that also carries the audio — take it now.
			if (!deps.needsAudio || audioCodec) return plan;
			plans.push(plan);
		}

		// Every container that can encode video would have to drop the audio;
		// keep the most preferred one and export video-only.
		if (plans.length > 0) return plans[0];

		throw new Error(
			`This browser cannot encode video at ${this.settings.width}×${this.settings.height} in either MP4 or WebM. Try a smaller resolution or a different browser.`
		);
	}

	/**
	 * Extract and mix audio from timeline elements into a single AudioBuffer.
	 * Returns null if no audio elements are present, or if none of them could be
	 * decoded — a track of pure silence is not worth an audio encoder.
	 */
	private async extractTimelineAudio(): Promise<AudioBuffer | null> {
		const audioElements: Array<{
			src: string;
			startTime: number;
			duration: number;
			trimStart: number;
			volume: number;
		}> = [];

		// Collect audio sources from timeline
		for (const track of this.tracks) {
			for (const element of track.elements) {
				// Only media elements have mediaId/volume
				if (!("mediaId" in element)) continue;
				const mediaId = element.mediaId as string;

				const mediaItem = this.mediaItems.find((m) => m.id === mediaId);
				if (!mediaItem) continue;

				const isAudio = track.type === "audio" || mediaItem.type === "video";
				if (!isAudio) continue;

				const src =
					mediaItem.url || mediaItem.originalUrl || mediaItem.localPath;
				if (!src) continue;

				const vol =
					"volume" in element && typeof element.volume === "number"
						? element.volume / 100
						: 1;

				audioElements.push({
					src,
					startTime: element.startTime,
					duration: element.duration,
					trimStart: element.trimStart || 0,
					volume: vol,
				});
			}
		}

		if (audioElements.length === 0) return null;

		try {
			const sampleRate = AUDIO_SAMPLE_RATE;
			const totalSamples = Math.ceil(this.totalDuration * sampleRate);
			const audioCtx = new OfflineAudioContext(
				AUDIO_CHANNELS,
				totalSamples,
				sampleRate
			);
			let decodedCount = 0;

			// Decode and schedule each audio source
			for (const el of audioElements) {
				try {
					const response = await fetch(el.src);
					const arrayBuffer = await response.arrayBuffer();
					const decoded = await audioCtx.decodeAudioData(arrayBuffer);

					const source = audioCtx.createBufferSource();
					source.buffer = decoded;

					// Apply volume
					const gainNode = audioCtx.createGain();
					gainNode.gain.value = el.volume;
					source.connect(gainNode);
					gainNode.connect(audioCtx.destination);

					// Schedule with trim offset
					source.start(el.startTime, el.trimStart, el.duration);
					decodedCount++;
				} catch (err) {
					console.warn(
						"[ExportEngineMuxer] Failed to decode audio source:",
						el.src,
						err
					);
				}
			}

			if (decodedCount === 0) return null;

			return await audioCtx.startRendering();
		} catch (err) {
			console.warn(
				"[ExportEngineMuxer] Audio extraction failed, exporting without audio:",
				err
			);
			return null;
		}
	}

	/** Override cancel to clean up mediabunny encoder resources. */
	cancel(): void {
		super.cancel();
		if (this.activeOutput) {
			try {
				this.activeOutput.cancel?.();
			} catch {
				// Ignore errors during cleanup
			}
			this.activeOutput = null;
		}
	}
}
