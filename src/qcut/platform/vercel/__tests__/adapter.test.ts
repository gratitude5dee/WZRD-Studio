import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createVercelAdapter } from "../index";

const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;

function installObjectUrlStub(value = "blob:proxied-media") {
	Object.defineProperty(URL, "createObjectURL", {
		configurable: true,
		value: vi.fn(() => value),
	});
}

describe("createVercelAdapter", () => {
	beforeEach(() => {
		installObjectUrlStub();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		globalThis.fetch = originalFetch;
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: originalCreateObjectURL,
		});
	});

	it("uses the authenticated media proxy before falling back to browser fetch", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response("video", {
				status: 200,
				headers: { "content-type": "video/mp4" },
			});
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const adapter = createVercelAdapter();
		const result = await adapter.mediaImport.cacheRemoteMedia?.({
			url: "https://cdn.example.com/render/output.mp4",
			operationId: "asset-1",
		});

		expect(result).toMatchObject({
			name: "output.mp4",
			path: "blob:proxied-media",
			mediaUrl: "blob:proxied-media",
			mimeType: "video/mp4",
			size: 5,
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/media/proxy?url=https%3A%2F%2Fcdn.example.com%2Frender%2Foutput.mp4&operationId=asset-1",
			{ headers: undefined }
		);
	});

	it("falls back to the base web adapter when the proxy cannot fetch media", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const value = String(input);
			if (value.startsWith("/api/media/proxy")) {
				return new Response(null, { status: 502 });
			}
			return new Response("direct", {
				status: 200,
				headers: { "content-type": "video/mp4" },
			});
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const adapter = createVercelAdapter();
		const result = await adapter.mediaImport.cacheRemoteMedia?.({
			url: "https://cdn.example.com/direct.mp4",
			operationId: "asset-2",
		});

		expect(result).toMatchObject({
			name: "direct.mp4",
			path: "blob:proxied-media",
			mediaUrl: "blob:proxied-media",
			mimeType: "video/mp4",
			size: 6,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenLastCalledWith("https://cdn.example.com/direct.mp4", {
			mode: "cors",
		});
	});

	it("resolves self-hosted FFmpeg wasm assets for Vercel", async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		globalThis.fetch = fetchMock as typeof fetch;

		const adapter = createVercelAdapter();

		await expect(
			adapter.ffmpeg.getFFmpegResourcePath("ffmpeg-core.js")
		).resolves.toBe("/ffmpeg/ffmpeg-core.js");
		await expect(
			adapter.ffmpeg.checkFFmpegResource("ffmpeg-core.wasm")
		).resolves.toBe(true);
		await expect(
			adapter.ffmpeg.getFFmpegResourcePath("../secret")
		).rejects.toThrow("Unsupported FFmpeg resource");
	});
});
