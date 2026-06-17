/**
 * FalAiService — WZRD implementation
 *
 * Phase 3:
 * - Route QCut image generation/editing through WZRD's unifiedGenerationService
 *   so credit usage + storage + auth stay centralized.
 */

import { unifiedGenerationService } from "@/services/unifiedGenerationService";
import { extractInsufficientCreditsError, routeToBillingTopUp } from "@/lib/billing-errors";

import { useProjectStore } from "@qcut-app/stores/project-store";
import { getWzrdProjectContext } from "../../../bridge/wzrd-project-context";

export type FalImageSize = { width: number; height: number };

export type FalGenerateImageOptions = {
	num_images?: number;
	image_size?: FalImageSize;
	[key: string]: unknown;
};

export type FalEditImagesOptions = {
	num_images?: number;
	[key: string]: unknown;
};

function resolveWzrdProjectId(): string | undefined {
	const qcutProjectId = useProjectStore.getState().activeProject?.id;
	if (!qcutProjectId) return undefined;
	return getWzrdProjectContext(qcutProjectId)?.wzrdProjectId;
}

async function handleGenerationError(error: unknown): Promise<void> {
	const payload = await extractInsufficientCreditsError(error);
	if (payload) {
		routeToBillingTopUp(payload);
	}
}

export class FalAiService {
	/**
	 * Simple text-to-image generation.
	 *
	 * NOTE: QCut upstream may support multiple models; for now we use a stable
	 * default that exists in WZRD's model catalog.
	 */
	static async generateImage(
		prompt: string,
		options?: FalGenerateImageOptions
	): Promise<string[]> {
		try {
			const projectId = resolveWzrdProjectId();
			const count =
				typeof options?.num_images === "number" && options.num_images > 0
					? options.num_images
					: 1;

			const result = await unifiedGenerationService.generate({
				model: "fal-ai/nano-banana-2",
				prompt,
				parameters: {
					...options,
					num_images: count,
				},
				outputConfig: {
					count,
					autoStore: true,
				},
				metadata: {
					source: "editor",
					projectId,
				},
			});

			return result.url ? [result.url] : [];
		} catch (error) {
			await handleGenerationError(error);
			console.warn("[WZRD/FalAiService] generateImage failed", error);
			return [];
		}
	}

	/**
	 * Image editing / variation.
	 */
	static async editImages(
		prompt: string,
		inputs: string[],
		options?: FalEditImagesOptions
	): Promise<string[]> {
		try {
			const projectId = resolveWzrdProjectId();
			const count =
				typeof options?.num_images === "number" && options.num_images > 0
					? options.num_images
					: 1;

			const referenceAssets = (inputs ?? [])
				.filter((url) => typeof url === "string" && url.length > 0)
				.map((url) => ({ url, type: "image" as const, role: "input_image" }));

			const result = await unifiedGenerationService.generate({
				model: "fal-ai/nano-banana-2",
				prompt,
				referenceAssets,
				parameters: {
					...options,
					num_images: count,
				},
				outputConfig: {
					count,
					autoStore: true,
				},
				metadata: {
					source: "editor",
					projectId,
				},
			});

			return result.url ? [result.url] : [];
		} catch (error) {
			await handleGenerationError(error);
			console.warn("[WZRD/FalAiService] editImages failed", error);
			return [];
		}
	}
}
