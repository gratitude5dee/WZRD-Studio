import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@qcut-app/lib/ffmpeg/ffmpeg-video-recorder", () => ({
	FFmpegVideoRecorder: class {},
	isFFmpegExportEnabled: () => false,
}));

vi.mock("@qcut-app/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugError: vi.fn(),
	debugWarn: vi.fn(),
}));

import { ExportEngine } from "../export-engine";
import { saveExportedVideo } from "../export-output";
import { ExportFormat, ExportQuality } from "@qcut-app/types/export";

function createEngine(format: ExportFormat) {
	const canvas = document.createElement("canvas");
	canvas.width = 1280;
	canvas.height = 720;
	canvas.getContext = (() => ({}) as unknown) as typeof canvas.getContext;

	return new ExportEngine(
		canvas,
		{
			format,
			quality: ExportQuality.HIGH,
			filename: "clip",
			width: 1280,
			height: 720,
		},
		[],
		[],
		1
	);
}

/** Run downloadVideo and report the filename the anchor was given. */
async function downloadedName(
	format: ExportFormat,
	blob: Blob,
	filename: string
): Promise<string> {
	const engine = createEngine(format);
	let captured = "";

	const originalCreate = document.createElement.bind(document);
	const iframe = originalCreate("iframe");
	const anchor = originalCreate("a");
	Object.defineProperty(anchor, "download", {
		set(value: string) {
			captured = value;
		},
		get() {
			return captured;
		},
	});
	Object.defineProperty(iframe, "contentDocument", {
		value: {
			createElement: () => anchor,
			body: { appendChild: vi.fn(), removeChild: vi.fn() },
		},
	});

	vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
		tag === "iframe" ? iframe : originalCreate(tag)) as never);
	vi.spyOn(document.body, "appendChild").mockImplementation((() =>
		iframe) as never);
	vi.spyOn(document.body, "removeChild").mockImplementation((() =>
		iframe) as never);

	await engine.downloadVideo(blob, filename);
	return captured;
}

describe("ExportEngine.downloadVideo naming", () => {
	beforeEach(() => {
		URL.createObjectURL = vi.fn().mockReturnValue("blob:test");
		URL.revokeObjectURL = vi.fn();
		// jsdom has no showSaveFilePicker, so the iframe path is used.
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("names a WebM fallback .webm even though MP4 was requested", async () => {
		const name = await downloadedName(
			ExportFormat.MP4,
			new Blob(["x"], { type: "video/webm" }),
			"my-clip.mp4"
		);
		expect(name).toBe("my-clip.webm");
	});

	it("keeps the requested extension when the container matches", async () => {
		const name = await downloadedName(
			ExportFormat.MP4,
			new Blob(["x"], { type: "video/mp4" }),
			"my-clip.mp4"
		);
		expect(name).toBe("my-clip.mp4");
	});

	it("keeps MOV labelled as MOV despite the shared MP4 MIME type", async () => {
		const name = await downloadedName(
			ExportFormat.MOV,
			new Blob(["x"], { type: "video/mp4" }),
			"my-clip.mov"
		);
		expect(name).toBe("my-clip.mov");
	});

	it("appends an extension when the filename has none", async () => {
		const name = await downloadedName(
			ExportFormat.MP4,
			new Blob(["x"], { type: "video/webm" }),
			"my-clip"
		);
		expect(name).toBe("my-clip.webm");
	});
});

/**
 * The editor's export flow saves through `saveExportedVideo`, not the engine's
 * download helper, so the container correction has to apply there too.
 */
describe("saveExportedVideo naming", () => {
	let anchor: HTMLAnchorElement;

	beforeEach(() => {
		URL.createObjectURL = vi.fn().mockReturnValue("blob:test");
		URL.revokeObjectURL = vi.fn();
		delete (navigator as { share?: unknown }).share;
		delete (navigator as { canShare?: unknown }).canShare;
		delete (window as { Capacitor?: unknown }).Capacitor;

		const originalCreate = document.createElement.bind(document);
		anchor = originalCreate("a");
		vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
			tag === "a" ? anchor : originalCreate(tag)) as never);
		vi.spyOn(anchor, "click").mockImplementation(() => undefined);
		vi.spyOn(document.body, "appendChild").mockImplementation((() =>
			anchor) as never);
		vi.spyOn(document.body, "removeChild").mockImplementation((() =>
			anchor) as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("downloads a WebM fallback as .webm when MP4 was requested", async () => {
		await saveExportedVideo(
			new Blob(["x"], { type: "video/webm" }),
			"my-clip.mp4",
			ExportFormat.MP4
		);
		expect(anchor.download).toBe("my-clip.webm");
	});

	it("adds the real extension when the filename has none", async () => {
		await saveExportedVideo(
			new Blob(["x"], { type: "video/webm" }),
			"my-clip",
			ExportFormat.MP4
		);
		expect(anchor.download).toBe("my-clip.webm");
	});

	it("keeps the name when the container matches the request", async () => {
		await saveExportedVideo(
			new Blob(["x"], { type: "video/mp4" }),
			"my-clip.mp4",
			ExportFormat.MP4
		);
		expect(anchor.download).toBe("my-clip.mp4");
	});

	it("infers the requested container from the filename when unspecified", async () => {
		await saveExportedVideo(
			new Blob(["x"], { type: "video/mp4" }),
			"my-clip.mov"
		);
		expect(anchor.download).toBe("my-clip.mov");
	});
});
