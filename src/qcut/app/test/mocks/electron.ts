import { vi } from "vitest";

/**
 * Minimal Electron API mock used by vendored QCut tests.
 *
 * WZRD-EDIT: QCut upstream has a larger surface. We only implement what the
 * currently-enabled tests (and the `@qcut/platform-desktop` shim) need.
 */
export const mockElectronAPI: any = {
	platform: "darwin",
	isElectron: true,

	// Root-level filler analysis hook
	analyzeFillers: vi.fn().mockResolvedValue({
		filteredWordIds: [],
		provider: "pattern",
	}),

	// PTY operations
	pty: {
		spawn: vi.fn().mockResolvedValue({ success: true, sessionId: "test-pty-session" }),
		write: vi.fn().mockResolvedValue({ success: true }),
		resize: vi.fn().mockResolvedValue({ success: true }),
		kill: vi.fn().mockResolvedValue({ success: true }),
		killAll: vi.fn().mockResolvedValue({ success: true }),
		onData: vi.fn(),
		onExit: vi.fn(),
		removeListeners: vi.fn(),
	},

	// Skills operations
	skills: {
		list: vi.fn().mockResolvedValue([]),
		import: vi.fn().mockResolvedValue(null),
		delete: vi.fn().mockResolvedValue(true),
		getContent: vi.fn().mockResolvedValue(null),
		browse: vi.fn().mockResolvedValue(null),
		getPath: vi.fn().mockResolvedValue("/mock/skills"),
		scanGlobal: vi.fn().mockResolvedValue([]),
		syncForClaude: vi.fn().mockResolvedValue({
			synced: true,
			copied: 0,
			skipped: 0,
			removed: 0,
			warnings: [],
		}),
	},

	// Project folder operations
	projectFolder: {
		getRoot: vi.fn().mockResolvedValue("/mock/project-root"),
		ensureStructure: vi.fn().mockResolvedValue(undefined),
		list: vi.fn().mockResolvedValue([]),
		scan: vi.fn().mockResolvedValue({
			files: [],
			folders: [],
			totalSize: 0,
			scanTime: 0,
		}),
	},

	// API key operations (used by api-key-field tests)
	apiKeys: {
		get: vi.fn().mockResolvedValue({}),
		set: vi.fn().mockResolvedValue(true),
		clear: vi.fn().mockResolvedValue(true),
		status: vi.fn().mockResolvedValue({}),
	},

	// AI Pipeline operations (used by use-ai-pipeline tests)
	aiPipeline: {
		check: vi.fn().mockResolvedValue({ available: true }),
		status: vi.fn().mockResolvedValue({
			available: true,
			version: "1.0.0",
			source: "bundled",
			compatible: true,
			features: {},
		}),
		generate: vi.fn().mockResolvedValue({ success: true }),
		listModels: vi.fn().mockResolvedValue({ success: true, models: [] }),
		estimateCost: vi.fn().mockResolvedValue({ success: true, cost: 0 }),
		cancel: vi.fn().mockResolvedValue(true),
		refresh: vi.fn().mockResolvedValue({ available: true }),
		onProgress: vi.fn().mockReturnValue(() => {}),
	},
};

export function setupElectronMock(overrides?: Record<string, unknown>): () => void {
	const previous = (globalThis as any).electronAPI;
	(globalThis as any).electronAPI = { ...mockElectronAPI, ...(overrides ?? {}) };

	return () => {
		if (previous) {
			(globalThis as any).electronAPI = previous;
		} else {
			delete (globalThis as any).electronAPI;
		}
	};
}
