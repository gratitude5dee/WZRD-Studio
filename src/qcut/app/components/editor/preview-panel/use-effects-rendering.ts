import { useEffect, useMemo, useState } from "react";
import { useEffectsStore } from "@qcut-app/stores/ai/effects-store";
import { usePlaybackStore } from "@qcut-app/stores/editor/playback-store";
import {
	parametersToCSSFilters,
	mergeEffectParameters,
	resolveEffectParameters,
} from "@qcut-app/lib/effects/effects-utils";
import type { EffectInstance } from "@qcut-app/types/effects";

const EMPTY_EFFECTS: readonly EffectInstance[] = [];

/** Compute the aggregate CSS filter string for an element's enabled effects. */
export function useEffectsRendering(
	elementId: string | null,
	enabled = false,
	elementStartTime = 0
) {
	const effects = useEffectsStore((state) => {
		if (!enabled || !elementId) return EMPTY_EFFECTS;
		return state.activeEffects.get(elementId) ?? EMPTY_EFFECTS;
	});

	const currentTime = usePlaybackStore((state) => state.currentTime);
	const isPlaying = usePlaybackStore((state) => state.isPlaying);

	const hasAnimations = useMemo(
		() =>
			effects.some(
				(e) => e.enabled && e.animations && e.animations.length > 0
			),
		[effects]
	);

	// During playback the store's currentTime is throttled; keyframed effects
	// need per-frame time, so listen to the playback-update event directly.
	const [animationTime, setAnimationTime] = useState(currentTime);
	useEffect(() => {
		setAnimationTime(currentTime);
		if (!hasAnimations || !isPlaying) return;

		const handlePlaybackUpdate = (e: Event) => {
			setAnimationTime((e as CustomEvent).detail.time as number);
		};
		window.addEventListener("playback-update", handlePlaybackUpdate);
		return () =>
			window.removeEventListener("playback-update", handlePlaybackUpdate);
	}, [hasAnimations, isPlaying, currentTime]);

	return useMemo(() => {
		if (!enabled || effects.length === 0) {
			return { filterStyle: "", hasEffects: false };
		}

		try {
			const enabledEffects = effects.filter((e) => e.enabled);

			if (enabledEffects.length === 0) {
				return { filterStyle: "", hasEffects: false };
			}

			const elementTime = hasAnimations
				? Math.max(0, animationTime - elementStartTime)
				: undefined;
			const mergedParams = mergeEffectParameters(
				...enabledEffects.map((e) => resolveEffectParameters(e, elementTime))
			);

			return {
				filterStyle: parametersToCSSFilters(mergedParams),
				hasEffects: true,
			};
		} catch {
			return { filterStyle: "", hasEffects: false };
		}
	}, [enabled, effects, hasAnimations, animationTime, elementStartTime]);
}
