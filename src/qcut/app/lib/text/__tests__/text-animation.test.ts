import { describe, it, expect } from "vitest";
import {
	getTextAnimationState,
	DEFAULT_TEXT_ANIMATION_DURATION,
} from "../text-animation";

const IDENTITY = {
	opacity: 1,
	scale: 1,
	offsetX: 0,
	offsetY: 0,
	visibleCharacters: null,
};

describe("getTextAnimationState", () => {
	it("returns identity for undefined animation", () => {
		expect(getTextAnimationState(undefined, 1, 5, 10)).toEqual(IDENTITY);
	});

	it("returns identity for preset none", () => {
		expect(getTextAnimationState({ preset: "none" }, 0, 5, 10)).toEqual(
			IDENTITY
		);
	});

	it("fade starts transparent and ends opaque", () => {
		const start = getTextAnimationState({ preset: "fade" }, 0, 5, 10);
		expect(start.opacity).toBe(0);
		const mid = getTextAnimationState(
			{ preset: "fade" },
			DEFAULT_TEXT_ANIMATION_DURATION / 2,
			5,
			10
		);
		expect(mid.opacity).toBeGreaterThan(0);
		expect(mid.opacity).toBeLessThan(1);
		const done = getTextAnimationState({ preset: "fade" }, 2, 5, 10);
		expect(done.opacity).toBe(1);
	});

	it("slide-up moves from below to rest", () => {
		const start = getTextAnimationState({ preset: "slide-up" }, 0, 5, 10);
		expect(start.offsetY).toBeGreaterThan(0);
		const done = getTextAnimationState({ preset: "slide-up" }, 2, 5, 10);
		expect(done.offsetY).toBe(0);
		expect(done.opacity).toBe(1);
	});

	it("slide-down moves from above to rest", () => {
		const start = getTextAnimationState({ preset: "slide-down" }, 0, 5, 10);
		expect(start.offsetY).toBeLessThan(0);
	});

	it("pop scales up to full size", () => {
		const start = getTextAnimationState({ preset: "pop" }, 0, 5, 10);
		expect(start.scale).toBeLessThan(1);
		const done = getTextAnimationState({ preset: "pop" }, 2, 5, 10);
		expect(done.scale).toBe(1);
		expect(done.opacity).toBe(1);
	});

	it("typewriter reveals characters over the enter phase", () => {
		const start = getTextAnimationState({ preset: "typewriter" }, 0, 5, 10);
		expect(start.visibleCharacters).toBe(0);
		const mid = getTextAnimationState(
			{ preset: "typewriter", duration: 1 },
			0.5,
			5,
			10
		);
		expect(mid.visibleCharacters).toBe(5);
		const done = getTextAnimationState({ preset: "typewriter" }, 2, 5, 10);
		expect(done.visibleCharacters).toBe(10);
	});

	it("respects a custom duration", () => {
		const state = getTextAnimationState(
			{ preset: "fade", duration: 2 },
			1,
			5,
			10
		);
		expect(state.opacity).toBeGreaterThan(0);
		expect(state.opacity).toBeLessThan(1);
	});

	it("mirrors the animation at the end when animateOut is set", () => {
		const anim = { preset: "fade" as const, animateOut: true };
		const middle = getTextAnimationState(anim, 2.5, 5, 10);
		expect(middle.opacity).toBe(1);
		const end = getTextAnimationState(anim, 5, 5, 10);
		expect(end.opacity).toBe(0);
	});

	it("does not animate out by default", () => {
		const end = getTextAnimationState({ preset: "fade" }, 5, 5, 10);
		expect(end.opacity).toBe(1);
	});
});
