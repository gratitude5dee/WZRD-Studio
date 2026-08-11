/**
 * Browser transcription via the server-side `fal-stream` Edge Function.
 *
 * Electron transcribes locally (Gemini over IPC after FFmpeg audio
 * extraction); the browser has neither a local key nor FFmpeg, so it sends
 * the media inline to Fal Whisper through `fal-stream`, which authenticates
 * the user and bills Supabase credits under catalog-strict pricing.
 */

import { platform } from "@qcut/platform-core";
import { executeFalStream } from "@/services/unifiedGenerationService";
import type { TranscriptionResult, TranscriptionSegment } from "@qcut-app/types/captions";

export const BROWSER_TRANSCRIPTION_MODEL = "fal-ai/whisper";

/**
 * Inline data-URI payload ceiling. The media travels inside the JSON body of
 * the Edge Function request, so this is deliberately far below the panel's
 * general 100 MB limit.
 */
export const MAX_BROWSER_TRANSCRIPTION_BYTES = 20 * 1024 * 1024;

/** Whether transcription should route through `fal-stream` (browser). */
export function isBrowserTranscriptionPath(): boolean {
	try {
		return !platform().isElectron;
	} catch {
		return false;
	}
}

export function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}

interface WhisperChunk {
	timestamp?: unknown;
	start?: unknown;
	end?: unknown;
	text?: unknown;
}

function asFiniteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function chunkBounds(
	chunk: WhisperChunk
): { start: number; end: number } | undefined {
	if (Array.isArray(chunk.timestamp)) {
		const start = asFiniteNumber(chunk.timestamp[0]);
		const end = asFiniteNumber(chunk.timestamp[1]);
		if (start !== undefined && end !== undefined) return { start, end };
	}
	const start = asFiniteNumber(chunk.start);
	const end = asFiniteNumber(chunk.end);
	if (start !== undefined && end !== undefined) return { start, end };
	return undefined;
}

/**
 * Map a Fal Whisper response (`{ text, chunks: [{ timestamp: [s, e], text }],
 * inferred_languages }`) onto the editor's `TranscriptionResult` shape.
 */
export function mapWhisperResultToTranscription(
	raw: unknown,
	fallbackLanguage: string
): TranscriptionResult {
	const obj =
		raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const text = typeof obj.text === "string" ? obj.text : "";

	const rawChunks = Array.isArray(obj.chunks)
		? obj.chunks
		: Array.isArray(obj.segments)
			? obj.segments
			: [];

	const segments: TranscriptionSegment[] = [];
	for (const rawChunk of rawChunks) {
		if (!rawChunk || typeof rawChunk !== "object") continue;
		const chunk = rawChunk as WhisperChunk;
		const bounds = chunkBounds(chunk);
		const chunkText = typeof chunk.text === "string" ? chunk.text.trim() : "";
		if (!bounds || !chunkText) continue;
		segments.push({
			id: segments.length,
			seek: 0,
			start: bounds.start,
			end: bounds.end,
			text: chunkText,
			tokens: [],
			temperature: 0,
			avg_logprob: 0,
			compression_ratio: 0,
			no_speech_prob: 0,
		});
	}

	const inferred = Array.isArray(obj.inferred_languages)
		? obj.inferred_languages.find((l): l is string => typeof l === "string")
		: undefined;
	const language =
		inferred ??
		(typeof obj.language === "string" ? obj.language : undefined) ??
		fallbackLanguage;

	return { text, segments, language };
}

/**
 * Transcribe a media file in the browser through `fal-stream`.
 * Throws on oversize files, refused models, or insufficient credits
 * (`executeFalStream` already routes the top-up flow before throwing).
 */
export async function transcribeInBrowser(options: {
	file: File;
	language: string;
	signal?: AbortSignal;
}): Promise<TranscriptionResult> {
	const { file, language, signal } = options;
	if (file.size > MAX_BROWSER_TRANSCRIPTION_BYTES) {
		throw new Error(
			`File too large for browser transcription (max ${Math.floor(
				MAX_BROWSER_TRANSCRIPTION_BYTES / (1024 * 1024)
			)}MB). Use a shorter clip or the desktop app.`
		);
	}

	const audioUrl = await fileToDataUrl(file);
	const inputs: Record<string, unknown> = {
		audio_url: audioUrl,
		task: "transcribe",
		chunk_level: "segment",
	};
	if (language && language !== "auto") {
		inputs.language = language;
	}

	const { result } = await executeFalStream(
		BROWSER_TRANSCRIPTION_MODEL,
		inputs,
		undefined,
		"catalog-strict",
		signal
	);

	const mapped = mapWhisperResultToTranscription(result, language);
	if (!mapped.text && mapped.segments.length === 0) {
		throw new Error("Transcription returned no text");
	}
	return mapped;
}
