import { describe, expect, it, vi } from "vitest";
import { renderKaraokeCaptionToCanvas } from "../karaoke-canvas";
import { DEFAULT_SUBTITLE_STYLE } from "../subtitle-style";
import type { SubtitleStyle } from "@qcut-app/types/timeline";
import type { WordItem } from "@qcut-app/types/word-timeline";

function word(id: string, text: string, start: number, end: number): WordItem {
	return { id, text, start, end, type: "word", filterState: "none" };
}

function makeCtx() {
	const gradient = { addColorStop: vi.fn() };
	const ctx = {
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		scale: vi.fn(),
		measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
		fillText: vi.fn(),
		strokeText: vi.fn(),
		fillRect: vi.fn(),
		createLinearGradient: vi.fn(() => gradient),
		globalAlpha: 1,
		font: "",
		textAlign: "left",
		textBaseline: "middle",
		fillStyle: "" as unknown,
		strokeStyle: "",
		lineWidth: 0,
		lineJoin: "round",
	};
	return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, gradient };
}

const canvas = { width: 1920, height: 1080 };

function styleWith(overrides: Partial<SubtitleStyle>): SubtitleStyle {
	return { ...DEFAULT_SUBTITLE_STYLE, ...overrides };
}

const words = [
	word("w1", "Hello", 1.0, 1.5),
	word("w2", "world", 1.5, 2.0),
];

describe("renderKaraokeCaptionToCanvas", () => {
	it("returns false when karaoke mode is none", () => {
		const { ctx } = makeCtx();
		const drew = renderKaraokeCaptionToCanvas({
			ctx,
			canvas,
			style: styleWith({ karaokeMode: "none" }),
			words,
			currentTime: 1.2,
		});
		expect(drew).toBe(false);
	});

	it("returns false when there are no words", () => {
		const { ctx } = makeCtx();
		const drew = renderKaraokeCaptionToCanvas({
			ctx,
			canvas,
			style: styleWith({ karaokeMode: "word-highlight" }),
			words: [],
			currentTime: 1.2,
		});
		expect(drew).toBe(false);
	});

	it("draws every word in word-highlight mode", () => {
		const { ctx, raw } = makeCtx();
		const drew = renderKaraokeCaptionToCanvas({
			ctx,
			canvas,
			style: styleWith({ karaokeMode: "word-highlight" }),
			words,
			currentTime: 1.2,
		});
		expect(drew).toBe(true);
		const drawn = raw.fillText.mock.calls.map((c) => c[0]);
		expect(drawn).toContain("Hello");
		expect(drawn).toContain("world");
	});

	it("draws only the active word in word-by-word mode", () => {
		const { ctx, raw } = makeCtx();
		renderKaraokeCaptionToCanvas({
			ctx,
			canvas,
			style: styleWith({ karaokeMode: "word-by-word" }),
			words,
			currentTime: 1.2,
		});
		const drawn = raw.fillText.mock.calls.map((c) => c[0]);
		expect(drawn).toContain("Hello");
		expect(drawn).not.toContain("world");
	});

	it("builds a hard-stop canvas gradient for karaoke fill progress", () => {
		const { ctx, raw, gradient } = makeCtx();
		renderKaraokeCaptionToCanvas({
			ctx,
			canvas,
			style: styleWith({
				karaokeMode: "karaoke",
				highlightColor: "#ff0000",
				upcomingColor: "#0000ff",
			}),
			words,
			// Halfway through "Hello" (1.0-1.5)
			currentTime: 1.25,
		});
		expect(raw.createLinearGradient).toHaveBeenCalled();
		const stops = gradient.addColorStop.mock.calls;
		expect(stops).toContainEqual([0, "#ff0000"]);
		expect(stops).toContainEqual([0.5, "#ff0000"]);
		expect(stops).toContainEqual([0.5, "#0000ff"]);
		expect(stops).toContainEqual([1, "#0000ff"]);
	});

	it("skips hidden upcoming words in bounce mode", () => {
		const { ctx, raw } = makeCtx();
		renderKaraokeCaptionToCanvas({
			ctx,
			canvas,
			style: styleWith({ karaokeMode: "bounce" }),
			words,
			currentTime: 1.2,
		});
		const drawn = raw.fillText.mock.calls.map((c) => c[0]);
		expect(drawn).toContain("Hello");
		expect(drawn).not.toContain("world");
	});
});
