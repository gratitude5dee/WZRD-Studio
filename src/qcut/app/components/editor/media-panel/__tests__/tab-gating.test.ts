import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlatformCapability } from "@qcut/platform-core";

const hasCapability = vi.fn();

vi.mock("@qcut/platform-core", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@qcut/platform-core")>();
	return {
		...actual,
		platform: () => ({ hasCapability }),
	};
});

import {
	isTabAvailable,
	availableTabsForGroup,
	useMediaPanelStore,
} from "../store";

describe("platform tab gating", () => {
	beforeEach(() => {
		hasCapability.mockReset();
		useMediaPanelStore.setState({
			activeGroup: "media",
			activeTab: "media",
			lastTabPerGroup: {
				media: "media",
				"ai-create": "ai",
				agents: "nano-edit",
				edit: "word-timeline",
			},
		});
	});

	it("hides desktop-only tabs when the capability is missing", () => {
		hasCapability.mockReturnValue(false);
		expect(isTabAvailable("pty")).toBe(false);
		expect(isTabAvailable("nano-edit")).toBe(false);
		expect(isTabAvailable("project-folder")).toBe(false);
		expect(isTabAvailable("remotion")).toBe(false);
		expect(isTabAvailable("media")).toBe(true);
		expect(availableTabsForGroup("agents")).toEqual(["ai-chat"]);
		expect(availableTabsForGroup("media")).toEqual(["media", "search"]);
	});

	it("keeps all tabs when the platform has the capabilities", () => {
		hasCapability.mockReturnValue(true);
		expect(isTabAvailable("pty")).toBe(true);
		expect(availableTabsForGroup("agents")).toEqual([
			"nano-edit",
			"ai-chat",
			"pty",
			"remotion",
		]);
	});

	it("queries the right capability per tab", () => {
		hasCapability.mockReturnValue(true);
		isTabAvailable("pty");
		expect(hasCapability).toHaveBeenCalledWith(PlatformCapability.Pty);
		isTabAvailable("project-folder");
		expect(hasCapability).toHaveBeenCalledWith(
			PlatformCapability.ProjectFolder
		);
	});

	it("falls back to an available tab when switching to a group whose remembered tab is gated", () => {
		hasCapability.mockReturnValue(false);
		useMediaPanelStore.getState().setActiveGroup("agents");
		expect(useMediaPanelStore.getState().activeTab).toBe("ai-chat");
	});

	it("keeps the remembered tab when it is available", () => {
		hasCapability.mockReturnValue(true);
		useMediaPanelStore.getState().setActiveGroup("agents");
		expect(useMediaPanelStore.getState().activeTab).toBe("nano-edit");
	});
});
