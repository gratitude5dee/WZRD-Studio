import { beforeEach, describe, expect, it, vi } from "vitest";

const executeFalStreamMock = vi.fn();
const platformMock = vi.fn();

vi.mock("@/services/unifiedGenerationService", () => ({
	executeFalStream: (...args: unknown[]) => executeFalStreamMock(...args),
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => platformMock(),
}));

import {
	falModelIdFromEndpoint,
	generateWithModel,
} from "@qcut-app/lib/ai-clients/fal-ai-client-generation";
import type { FalAIClientRequestDelegate } from "@qcut-app/lib/ai-clients/fal-ai-client-internal-types";
import { TEXT2IMAGE_MODELS } from "@qcut-app/lib/ai-models/text2image-models";
import {
	inferFalMediaType,
	resolveFalModelOrFallback,
} from "../../../../../../supabase/functions/_shared/falai-client.ts";

const imageResponse = {
	images: [
		{ url: "https://fal.media/generated.png", width: 1024, height: 1024 },
	],
	seed: 42,
};

describe("browser text-to-image routing", () => {
	beforeEach(() => {
		executeFalStreamMock.mockReset();
		platformMock.mockReset();
	});

	it("extracts the Fal model id from sync and queue endpoints", () => {
		expect(falModelIdFromEndpoint("https://fal.run/fal-ai/qwen-image")).toBe(
			"fal-ai/qwen-image"
		);
		expect(
			falModelIdFromEndpoint("https://queue.fal.run/openai/gpt-image-2")
		).toBe("openai/gpt-image-2");
		expect(
			falModelIdFromEndpoint("https://api.imarouter.com/v1/images/generations")
		).toBeUndefined();
	});

	it("resolves every fal.run picker-registry endpoint directly without fallback", () => {
		for (const model of Object.values(TEXT2IMAGE_MODELS)) {
			const modelId = falModelIdFromEndpoint(model.endpoint);
			if (!modelId) continue;

			const resolution = resolveFalModelOrFallback(modelId, {
				mediaTypeHint: inferFalMediaType(modelId),
				uiGroup: "generation",
			});

			expect(resolution.model.id, `model ${model.id} (${modelId})`).toBe(
				modelId
			);
			expect(resolution.fallbackUsed, `model ${model.id} (${modelId})`).toBe(
				false
			);
		}
	});

	it("routes browser generation through fal-stream with strict pricing", async () => {
		platformMock.mockReturnValue({ isElectron: false });
		executeFalStreamMock.mockResolvedValue({
			result: imageResponse,
			resolvedModelId: "fal-ai/qwen-image",
			fallbackUsed: false,
		});
		const makeRequest = vi.fn();
		const delegate: FalAIClientRequestDelegate = { makeRequest };

		const result = await generateWithModel(delegate, "qwen-image", "a fox", {
			imageSize: "square_hd",
		});

		expect(result.success).toBe(true);
		expect(result.imageUrl).toBe("https://fal.media/generated.png");
		expect(makeRequest).not.toHaveBeenCalled();
		expect(executeFalStreamMock).toHaveBeenCalledTimes(1);
		const [modelId, inputs, onProgress, pricingMode] =
			executeFalStreamMock.mock.calls[0];
		expect(modelId).toBe("fal-ai/qwen-image");
		expect(inputs).toMatchObject({ prompt: "a fox", num_images: 1 });
		expect(onProgress).toBeUndefined();
		expect(pricingMode).toBe("catalog-strict");
	});

	it("keeps Electron generation on the direct delegate path", async () => {
		platformMock.mockReturnValue({ isElectron: true });
		const makeRequest = vi.fn().mockResolvedValue(imageResponse);
		const delegate: FalAIClientRequestDelegate = { makeRequest };

		const result = await generateWithModel(delegate, "qwen-image", "a fox", {
			imageSize: "square_hd",
		});

		expect(result.success).toBe(true);
		expect(executeFalStreamMock).not.toHaveBeenCalled();
		expect(makeRequest).toHaveBeenCalledTimes(1);
	});

	it("falls back to the delegate when the platform is uninitialized", async () => {
		platformMock.mockImplementation(() => {
			throw new Error("Platform not initialized");
		});
		const makeRequest = vi.fn().mockResolvedValue(imageResponse);
		const delegate: FalAIClientRequestDelegate = { makeRequest };

		const result = await generateWithModel(delegate, "qwen-image", "a fox", {
			imageSize: "square_hd",
		});

		expect(result.success).toBe(true);
		expect(executeFalStreamMock).not.toHaveBeenCalled();
		expect(makeRequest).toHaveBeenCalledTimes(1);
	});

	it("surfaces strict refusals as generation errors in the browser", async () => {
		platformMock.mockReturnValue({ isElectron: false });
		executeFalStreamMock.mockRejectedValue(
			new Error("catalog-strict rejected model substitution")
		);
		const makeRequest = vi.fn();
		const delegate: FalAIClientRequestDelegate = { makeRequest };

		const result = await generateWithModel(delegate, "qwen-image", "a fox", {
			imageSize: "square_hd",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("catalog-strict rejected");
		expect(makeRequest).not.toHaveBeenCalled();
	});
});
