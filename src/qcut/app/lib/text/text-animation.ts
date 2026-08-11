/**
 * Text animation presets — pure per-frame animation state for ordinary
 * timeline text elements, shared by the preview renderer and the canvas
 * export so both show the same motion.
 *
 * @module lib/text/text-animation
 */

import type { TextAnimation } from "@qcut-app/types/timeline";

export const DEFAULT_TEXT_ANIMATION_DURATION = 0.5;

/** Per-frame render state produced by a text animation preset. */
export interface TextAnimationState {
	opacity: number;
	scale: number;
	offsetX: number;
	offsetY: number;
	/** Characters to show (typewriter), or null for the full string. */
	visibleCharacters: number | null;
}

const IDENTITY: TextAnimationState = {
	opacity: 1,
	scale: 1,
	offsetX: 0,
	offsetY: 0,
	visibleCharacters: null,
};

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

/** Overshooting ease for the pop preset. */
function easeOutBack(t: number): number {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

const SLIDE_DISTANCE = 40;

/**
 * Compute the animation state of a text element at a moment in time.
 *
 * @param animation element animation settings (undefined/none → identity)
 * @param localTime seconds since the element became visible
 * @param visibleDuration seconds the element stays visible (duration minus trims)
 * @param textLength character count of the element content
 */
export function getTextAnimationState(
	animation: TextAnimation | undefined,
	localTime: number,
	visibleDuration: number,
	textLength: number
): TextAnimationState {
	if (!animation || animation.preset === "none") return IDENTITY;

	const duration = Math.max(
		0.01,
		animation.duration ?? DEFAULT_TEXT_ANIMATION_DURATION
	);
	const inProgress = clamp01(localTime / duration);
	const outProgress = animation.animateOut
		? clamp01((visibleDuration - localTime) / duration)
		: 1;
	// The dominant phase: entering at the start, exiting at the end.
	const progress = Math.min(inProgress, outProgress);
	const eased = easeOutCubic(progress);

	switch (animation.preset) {
		case "fade":
			return { ...IDENTITY, opacity: eased };
		case "slide-up":
			return {
				...IDENTITY,
				opacity: eased,
				offsetY: (1 - eased) * SLIDE_DISTANCE,
			};
		case "slide-down":
			return {
				...IDENTITY,
				opacity: eased,
				offsetY: -(1 - eased) * SLIDE_DISTANCE,
			};
		case "pop":
			return {
				...IDENTITY,
				opacity: clamp01(progress * 2),
				scale: Math.max(0, 0.5 + 0.5 * easeOutBack(progress)),
			};
		case "typewriter": {
			// Characters appear over the enter phase; exit (if any) fades.
			const visibleCharacters = Math.ceil(inProgress * textLength);
			return {
				...IDENTITY,
				opacity: animation.animateOut ? easeOutCubic(outProgress) : 1,
				visibleCharacters,
			};
		}
		default:
			return IDENTITY;
	}
}
