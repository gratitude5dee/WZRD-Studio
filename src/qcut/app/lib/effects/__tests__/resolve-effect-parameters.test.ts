import { describe, expect, it } from "vitest";
import { resolveEffectParameters } from "../effects-utils";
import type { EffectInstance } from "@qcut-app/types/effects";

function effectWith(
	overrides: Partial<EffectInstance> = {}
): EffectInstance {
	return {
		id: "fx-1",
		name: "Brightness ramp",
		effectType: "color-correction" as EffectInstance["effectType"],
		parameters: { brightness: 10, contrast: 5 },
		duration: 4,
		enabled: true,
		...overrides,
	};
}

describe("resolveEffectParameters", () => {
	const animated = effectWith({
		animations: [
			{
				parameter: "brightness",
				keyframes: [
					{ time: 0, value: 0 },
					{ time: 2, value: 100 },
				],
				interpolation: "linear",
			},
		],
	});

	it("returns static parameters when no time is provided", () => {
		expect(resolveEffectParameters(animated)).toEqual({
			brightness: 10,
			contrast: 5,
		});
	});

	it("returns static parameters when the effect has no animations", () => {
		expect(resolveEffectParameters(effectWith(), 1)).toEqual({
			brightness: 10,
			contrast: 5,
		});
	});

	it("interpolates animated parameters at element-local time", () => {
		expect(resolveEffectParameters(animated, 1)).toEqual({
			brightness: 50,
			contrast: 5,
		});
	});

	it("clamps to the first and last keyframes outside their range", () => {
		expect(resolveEffectParameters(animated, -1).brightness).toBe(0);
		expect(resolveEffectParameters(animated, 10).brightness).toBe(100);
	});

	it("leaves unanimated parameters untouched", () => {
		expect(resolveEffectParameters(animated, 2).contrast).toBe(5);
	});
});
