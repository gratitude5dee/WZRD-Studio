import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@qcut/platform-core", () => ({
	platform: vi.fn(() => ({ isElectron: false })),
}));

const executeFalStream = vi.fn();
vi.mock("@/services/unifiedGenerationService", () => ({
	executeFalStream: (...args: unknown[]) => executeFalStream(...args),
}));

import {
	BROWSER_TRANSCRIPTION_MODEL,
	MAX_BROWSER_TRANSCRIPTION_BYTES,
	isBrowserTranscriptionPath,
	mapWhisperResultToTranscription,
	transcribeInBrowser,
} from "../browser-transcription";
import { platform } from "@qcut/platform-core";

describe("isBrowserTranscriptionPath", () => {
	it("is true in the browser and false in Electron", () => {
		expect(isBrowserTranscriptionPath()).toBe(true);
		vi.mocked(platform).mockReturnValueOnce({
			isElectron: true,
		} as unknown as ReturnType<typeof platform>);
		expect(isBrowserTranscriptionPath()).toBe(false);
	});
});

describe("mapWhisperResultToTranscription", () => {
	it("maps whisper chunks with timestamp tuples into segments", () => {
		const result = mapWhisperResultToTranscription(
			{
				text: "hello world",
				chunks: [
					{ timestamp: [0, 1.5], text: " hello" },
					{ timestamp: [1.5, 3], text: "world " },
				],
				inferred_languages: ["en"],
			},
			"auto"
		);

		expect(result.text).toBe("hello world");
		expect(result.language).toBe("en");
		expect(result.segments).toEqual([
			expect.objectContaining({ id: 0, start: 0, end: 1.5, text: "hello" }),
			expect.objectContaining({ id: 1, start: 1.5, end: 3, text: "world" }),
		]);
		expect(result.segments[0]).toMatchObject({
			seek: 0,
			tokens: [],
			temperature: 0,
			avg_logprob: 0,
			compression_ratio: 0,
			no_speech_prob: 0,
		});
	});

	it("accepts start/end field variants and skips malformed chunks", () => {
		const result = mapWhisperResultToTranscription(
			{
				text: "a b",
				segments: [
					{ start: 0, end: 1, text: "a" },
					{ start: "bad", end: 2, text: "dropped" },
					{ timestamp: [2, null], text: "dropped too" },
					{ start: 2, end: 3, text: "" },
					{ start: 3, end: 4, text: "b" },
				],
			},
			"auto"
		);

		expect(result.segments.map((s) => s.text)).toEqual(["a", "b"]);
		expect(result.segments.map((s) => s.id)).toEqual([0, 1]);
	});

	it("falls back to the requested language when none is inferred", () => {
		const result = mapWhisperResultToTranscription({ text: "x" }, "es");
		expect(result.language).toBe("es");
		expect(result.segments).toEqual([]);
	});
});

describe("transcribeInBrowser", () => {
	beforeEach(() => {
		executeFalStream.mockReset();
	});

	it("refuses files above the inline payload ceiling", async () => {
		const big = new File([new Uint8Array(1)], "big.mp3", {
			type: "audio/mpeg",
		});
		Object.defineProperty(big, "size", {
			value: MAX_BROWSER_TRANSCRIPTION_BYTES + 1,
		});

		await expect(
			transcribeInBrowser({ file: big, language: "auto" })
		).rejects.toThrow(/too large/i);
		expect(executeFalStream).not.toHaveBeenCalled();
	});

	it("sends a data URI under catalog-strict pricing and maps the result", async () => {
		executeFalStream.mockResolvedValue({
			result: {
				text: "hi",
				chunks: [{ timestamp: [0, 1], text: "hi" }],
			},
		});
		const file = new File([new Uint8Array([1, 2, 3])], "a.wav", {
			type: "audio/wav",
		});

		const result = await transcribeInBrowser({ file, language: "en" });

		expect(executeFalStream).toHaveBeenCalledTimes(1);
		const [modelId, inputs, onProgress, pricingMode] =
			executeFalStream.mock.calls[0];
		expect(modelId).toBe(BROWSER_TRANSCRIPTION_MODEL);
		expect(inputs).toMatchObject({
			task: "transcribe",
			chunk_level: "segment",
			language: "en",
		});
		expect(String((inputs as Record<string, unknown>).audio_url)).toMatch(
			/^data:/
		);
		expect(onProgress).toBeUndefined();
		expect(pricingMode).toBe("catalog-strict");
		expect(result.segments).toHaveLength(1);
	});

	it("omits the language input for auto-detect", async () => {
		executeFalStream.mockResolvedValue({
			result: { text: "hi", chunks: [{ timestamp: [0, 1], text: "hi" }] },
		});
		const file = new File([new Uint8Array([1])], "a.wav", {
			type: "audio/wav",
		});

		await transcribeInBrowser({ file, language: "auto" });
		const inputs = executeFalStream.mock.calls[0][1] as Record<
			string,
			unknown
		>;
		expect(inputs).not.toHaveProperty("language");
	});

	it("throws when the provider returns no text or segments", async () => {
		executeFalStream.mockResolvedValue({ result: {} });
		const file = new File([new Uint8Array([1])], "a.wav", {
			type: "audio/wav",
		});

		await expect(
			transcribeInBrowser({ file, language: "auto" })
		).rejects.toThrow(/no text/i);
	});
});
