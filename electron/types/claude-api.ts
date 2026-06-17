/**
 * Minimal Claude bridge types for the vendored QCut editor.
 *
 * WZRD-EDIT: In QCUT_SRC this file lives in the Electron package. We only
 * need a small subset in Phase 1 so the vendored `claude-bridge/*` modules
 * and their unit tests compile.
 */

// ---------------------------------------------------------------------------
// Snapshot versioning / safety
// ---------------------------------------------------------------------------

export const EDITOR_STATE_SNAPSHOT_VERSION = 1 as const;

// When thumbnails are huge base64 strings we strip them before transport.
export const STRIPPED_THUMBNAIL_SENTINEL = "__WZRD_STRIPPED_THUMBNAIL__" as const;

// ---------------------------------------------------------------------------
// Editor Events
// ---------------------------------------------------------------------------

export const CLAUDE_EDITOR_EVENT_CATEGORY = {
	editorPlayheadMoved: "editor.playheadMoved",
	editorSelectionChanged: "editor.selectionChanged",
	timelineElementAdded: "timeline.elementAdded",
	timelineElementUpdated: "timeline.elementUpdated",
	timelineElementRemoved: "timeline.elementRemoved",
	mediaImported: "media.imported",
	mediaDeleted: "media.deleted",
	projectSettingsChanged: "project.settingsChanged",
} as const;

export const CLAUDE_EDITOR_EVENT_ACTION = {
	playheadMoved: "playheadMoved",
	selectionChanged: "selectionChanged",
	elementAdded: "elementAdded",
	elementUpdated: "elementUpdated",
	elementRemoved: "elementRemoved",
	imported: "imported",
	deleted: "deleted",
	settingsChanged: "settingsChanged",
} as const;

export type EventCategory =
	(typeof CLAUDE_EDITOR_EVENT_CATEGORY)[keyof typeof CLAUDE_EDITOR_EVENT_CATEGORY];

export type EditorEvent = {
	eventId: string;
	timestamp: number;
	category: EventCategory;
	action: string;
	label?: string;
	value?: string | number | boolean | null;
	metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Editor state snapshots
// ---------------------------------------------------------------------------

export enum StateSection {
	TIMELINE = "timeline",
	SELECTION = "selection",
	PLAYHEAD = "playhead",
	MEDIA = "media",
	EDITOR = "editor",
	UI = "ui",
	PROJECT = "project",
}

export type EditorStateRequest = {
	include?: Array<StateSection>;
};

export type ProjectMetadataSnapshot = {
	projectId: string | null;
	name: string | null;
};

export type TimelineSnapshotTrack = {
	id: string;
	name?: string;
	type: string;
	index: number;
	elements: unknown[];
};

export type MediaStateSnapshotItem = {
	id: string;
	name: string;
	type: string;
	url?: string;
	localPath?: string;
};

export type ModalSnapshotItem = {
	id: string;
	type: string;
	open: boolean;
};

export type BlockerSnapshotItem = {
	id: string;
	reason: string;
};

export type EditorStateSnapshot = {
	version: number;
	project?: ProjectMetadataSnapshot;
	timeline?: {
		tracks: TimelineSnapshotTrack[];
		selection?: unknown;
		playhead?: unknown;
	};
	media?: {
		items: MediaStateSnapshotItem[];
	};
	ui?: {
		modals?: ModalSnapshotItem[];
		blockers?: BlockerSnapshotItem[];
	};
	meta?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Timeline import/export types referenced by the bridge
// ---------------------------------------------------------------------------

export interface ClaudeTimeline {
	name: string;
	duration: number;
	width: number;
	height: number;
	fps: number;
	tracks: ClaudeTrack[];
}

export interface ClaudeTrack {
	id?: string;
	index: number;
	name: string;
	type: string;
	elements: ClaudeElement[];
}

export interface ClaudeElement {
	id: string;
	trackIndex: number;
	startTime: number;
	endTime: number;
	duration: number;
	type: string;
	sourceId?: string;
	sourceName?: string;
	mediaId?: string;
	content?: string;
	markdownContent?: string;
	style?: Record<string, unknown>;
	props?: Record<string, unknown>;
	effects?: string[];
	trimStart?: number;
	trimEnd?: number;
}
