import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeFalStreamMock = vi.fn();
const platformMock = vi.fn();

vi.mock("@/services/unifiedGenerationService", () => ({
	executeFalStream: (...args: unknown[]) => executeFalStreamMock(...args),
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => platformMock(),
}));

import {
	falModelIdFromUrl,
	isBrowserFalStreamPath,
	makeFalRequest,
} from "../fal-request";
import { T2V_MODELS } from "@qcut-app/components/editor/media-panel/views/ai/constants/text2video-models-config/models";
import {
	inferFalMediaType,
	resolveFalModelOrFallback,
} from "../../../../../../../supabase/functions/_shared/falai-client.ts";

/**
 * The text-to-video picker endpoints that reach `makeFalRequest` (Fal-backed;
 * GMI/Runway ids in T2V_MODELS never touch the Fal path). Every one of these
 * must resolve directly in the server's canonical registry, or a strict
 * browser request would be refused instead of generating.
 */
const FAL_T2V_ENDPOINTS = [
	"fal-ai/sora-2/text-to-video",
	"fal-ai/sora-2/text-to-video/pro",
	"fal-ai/kling-video/v3/pro/text-to-video",
	"fal-ai/kling-video/v3/standard/text-to-video",
	"fal-ai/kling-video/v2.6/pro/text-to-video",
	"fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
	"fal-ai/kling-video/v2.5-turbo/standard/text-to-video",
	"fal-ai/ltxv-2/text-to-video",
	"fal-ai/ltxv-2/text-to-video/fast",
	"fal-ai/ltx-2.3/text-to-video",
	"fal-ai/ltx-2.3/text-to-video/fast",
	"fal-ai/veo3.1",
	"fal-ai/veo3.1/fast",
	"fal-ai/veo3.1/lite",
	"fal-ai/minimax/hailuo-2.3/standard/text-to-video",
	"fal-ai/minimax/hailuo-2.3/pro/text-to-video",
	"fal-ai/vidu/q3/text-to-video",
	"fal-ai/bytedance/seedance/v1/lite/text-to-video",
	"fal-ai/bytedance/seedance/v1/pro/text-to-video",
	"fal-ai/bytedance/seedance-2.0/text-to-video",
	"wan/v2.6/text-to-video",
	"alibaba/happy-horse/text-to-video",
];

describe("browser Fal request routing", () => {
	beforeEach(() => {
		executeFalStreamMock.mockReset();
		platformMock.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("extracts the Fal model id from sync and queue URLs", () => {
		expect(falModelIdFromUrl("https://fal.run/fal-ai/veo3.1/fast")).toBe(
			"fal-ai/veo3.1/fast"
		);
		expect(
			falModelIdFromUrl("https://queue.fal.run/fal-ai/ltxv-2/text-to-video")
		).toBe("fal-ai/ltxv-2/text-to-video");
		expect(falModelIdFromUrl("https://fal.run/upload")).toBeUndefined();
		expect(
			falModelIdFromUrl("https://api.imarouter.com/v1/videos")
		).toBeUndefined();
	});

	it("reports the browser fal-stream path only off Electron", () => {
		platformMock.mockReturnValue({ isElectron: false });
		expect(isBrowserFalStreamPath()).toBe(true);

		platformMock.mockReturnValue({ isElectron: true });
		expect(isBrowserFalStreamPath()).toBe(false);

		platformMock.mockImplementation(() => {
			throw new Error("Platform not initialized");
		});
		expect(isBrowserFalStreamPath()).toBe(false);
	});

	it("routes browser Fal requests through fal-stream with strict pricing", async () => {
		platformMock.mockReturnValue({ isElectron: false });
		const videoResult = { video: { url: "https://fal.media/out.mp4" } };
		executeFalStreamMock.mockResolvedValue({
			result: videoResult,
			resolvedModelId: "fal-ai/ltxv-2/text-to-video",
			fallbackUsed: false,
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await makeFalRequest("fal-ai/ltxv-2/text-to-video", {
			prompt: "a fox",
			duration: 6,
		});

		expect(response.ok).toBe(true);
		expect(await response.json()).toEqual(videoResult);
		expect(fetchMock).not.toHaveBeenCalled();
		const [modelId, inputs, onProgress, pricingMode] =
			executeFalStreamMock.mock.calls[0];
		expect(modelId).toBe("fal-ai/ltxv-2/text-to-video");
		expect(inputs).toMatchObject({ prompt: "a fox", duration: 6 });
		expect(onProgress).toBeUndefined();
		expect(pricingMode).toBe("catalog-strict");
	});

	it("keeps Electron requests on the direct Fal path", async () => {
		platformMock.mockReturnValue({
			isElectron: true,
			apiKeys: { get: async () => ({ falApiKey: "test-key" }) },
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await makeFalRequest("fal-ai/ltxv-2/text-to-video", { prompt: "a fox" });

		expect(executeFalStreamMock).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(
			"https://fal.run/fal-ai/ltxv-2/text-to-video"
		);
	});

	it("keeps non-Fal URLs off the fal-stream path in the browser", async () => {
		platformMock.mockReturnValue({ isElectron: false });
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		vi.stubEnv("VITE_FAL_API_KEY", "test-key");

		await makeFalRequest("https://api.example.com/v1/videos", {
			prompt: "a fox",
		});

		expect(executeFalStreamMock).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		vi.unstubAllEnvs();
	});

	it("resolves every Fal text-to-video picker endpoint directly without fallback", () => {
		const configEndpoints = new Set(
			Object.values(T2V_MODELS)
				.map((model) => model.endpoints?.text_to_video)
				.filter((endpoint): endpoint is string => Boolean(endpoint))
		);

		for (const endpoint of FAL_T2V_ENDPOINTS) {
			const resolution = resolveFalModelOrFallback(endpoint, {
				mediaTypeHint: inferFalMediaType(endpoint),
				uiGroup: "generation",
			});

			expect(resolution.model.id, `endpoint ${endpoint}`).toBe(endpoint);
			expect(resolution.fallbackUsed, `endpoint ${endpoint}`).toBe(false);
		}

		// Guard against picker drift: every fal-ai endpoint in the T2V config
		// must be in the list above (and therefore canonically registered).
		for (const endpoint of configEndpoints) {
			if (
				falModelIdFromUrl(`https://fal.run/${endpoint}`) &&
				endpoint.startsWith("fal-ai/")
			) {
				expect(
					FAL_T2V_ENDPOINTS,
					`unlisted fal-ai T2V endpoint ${endpoint}`
				).toContain(endpoint);
			}
		}
	});
});
