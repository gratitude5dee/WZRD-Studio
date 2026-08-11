import { beforeEach, describe, expect, it, vi } from "vitest";

const gifInstances = vi.hoisted(() => [] as Array<any>);

vi.mock("gif.js", () => ({
	default: class MockGIF {
		options: Record<string, unknown>;
		frames: unknown[] = [];
		handlers = new Map<string, (value?: any) => void>();
		aborted = false;

		constructor(options: Record<string, unknown>) {
			this.options = options;
			gifInstances.push(this);
		}

		addFrame(frame: unknown, options: unknown) {
			this.frames.push({ frame, options });
		}

		on(event: string, callback: (value?: any) => void) {
			this.handlers.set(event, callback);
			return this;
		}

		render() {
			this.handlers.get("progress")?.(0.5);
			this.handlers
				.get("finished")
				?.(new Blob(["gif"], { type: "image/gif" }));
		}

		abort() {
			this.aborted = true;
		}
	},
}));

vi.mock("../export-engine", () => ({
	ExportEngine: class MockExportEngine {
		protected canvas: HTMLCanvasElement;
		protected fps = 30;
		protected totalDuration: number;
		protected isExporting = false;
		protected abortController: AbortController | null = null;

		constructor(canvas: HTMLCanvasElement, _settings: unknown, _tracks: unknown, _mediaItems: unknown, totalDuration: number) {
			this.canvas = canvas;
			this.totalDuration = totalDuration;
		}

		async renderFrame() {}

		calculateTotalFrames() {
			return Math.ceil(this.totalDuration * this.fps);
		}

		protected isExportCancelled() {
			return this.abortController?.signal.aborted ?? false;
		}

		cancel() {
			this.abortController?.abort();
			this.isExporting = false;
		}
	},
}));

vi.mock("@qcut-app/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugError: vi.fn(),
}));

import { resolveExportFilename } from "../export-filename";
import { GifTimelineExportEngine } from "../export-engine-gif";

function createCanvas() {
	const canvas = {
		width: 1920,
		height: 1080,
		getContext: vi.fn(() => ({})),
	} as unknown as HTMLCanvasElement;
	return canvas;
}

function createSettings(frameRate: 15 | 20 | 25 | 30 = 15) {
	return {
		format: "gif" as const,
		quality: "1080p" as const,
		filename: "animation.mp4",
		width: 1920,
		height: 1080,
		gifConfig: {
			frameRate,
			loop: true,
			sizePreset: "medium" as const,
			quality: 10,
		},
	};
}

describe("GifTimelineExportEngine", () => {
	beforeEach(() => {
		gifInstances.length = 0;
	});

	it("samples at the configured GIF frame rate and returns image/gif", async () => {
		const engine = new GifTimelineExportEngine(
			createCanvas(),
			createSettings(15),
			[],
			[],
			1
		);
		const renderFrame = vi
			.spyOn(engine, "renderFrame")
			.mockResolvedValue(undefined);
		const progress = vi.fn();

		const blob = await engine.export(progress);

		expect(renderFrame).toHaveBeenCalledTimes(15);
		expect(renderFrame).toHaveBeenNthCalledWith(2, 1 / 15);
		expect(blob.type).toBe("image/gif");
		expect(progress).toHaveBeenCalledWith(100, "Export complete!");
		expect(gifInstances[0].frames).toHaveLength(15);
	});

	it("honors the GIF size preset and production worker URL", () => {
		new GifTimelineExportEngine(
			createCanvas(),
			createSettings(),
			[],
			[],
			1
		);

		expect(gifInstances[0].options).toMatchObject({
			width: 1280,
			height: 720,
			workerScript: expect.stringContaining("/gif.worker.js"),
		});
	});

	it("aborts gif.js when cancelled", () => {
		const engine = new GifTimelineExportEngine(
			createCanvas(),
			createSettings(),
			[],
			[],
			1
		);

		engine.cancel();

		expect(gifInstances[0].aborted).toBe(true);
	});

	it("resolves the GIF filename from the blob MIME", () => {
		const blob = new Blob(["gif"], { type: "image/gif" });

		expect(resolveExportFilename(blob, "animation.mp4", "gif")).toBe(
			"animation.gif"
		);
	});
});
