import { debugError, debugLog } from "@qcut-app/lib/debug/debug-config";
import { generateUUID } from "@qcut-app/lib/utils";
import { TIMELINE_CONSTANTS } from "@qcut-app/constants/timeline-constants";

import { useMediaStore } from "@qcut-app/stores/media/media-store";
import { useTimelineStore } from "@qcut-app/stores/timeline/timeline-store";

import { videoEditorService } from "@/services/videoEditorService";

function msToSeconds(ms: number | undefined | null): number {
	if (typeof ms !== "number" || !Number.isFinite(ms)) return 0;
	return Math.max(0, ms / 1000);
}

function importedFlagKey(wzrdProjectId: string): string {
	return `wzrd:qcut:legacy-imported:${wzrdProjectId}`;
}

function hasTimelineContent(): boolean {
	try {
		const timeline = useTimelineStore.getState();
		return timeline.tracks.some((t) => t.elements.length > 0);
	} catch {
		return false;
	}
}

export async function maybeImportLegacyTimeline({
	wzrdProjectId,
	qcutProjectId,
}: {
	wzrdProjectId: string;
	qcutProjectId: string;
}): Promise<{ imported: boolean; clipCount: number; audioCount: number }> {
	try {
		if (typeof window === "undefined") {
			return { imported: false, clipCount: 0, audioCount: 0 };
		}

		if (window.localStorage.getItem(importedFlagKey(wzrdProjectId)) === "true") {
			return { imported: false, clipCount: 0, audioCount: 0 };
		}

		if (hasTimelineContent()) {
			return { imported: false, clipCount: 0, audioCount: 0 };
		}

		const [clips, audioTracks] = await Promise.all([
			videoEditorService.getTimelineClips(wzrdProjectId),
			videoEditorService.getAudioTracks(wzrdProjectId),
		]);

		if (clips.length === 0 && audioTracks.length === 0) {
			window.localStorage.setItem(importedFlagKey(wzrdProjectId), "true");
			return { imported: false, clipCount: 0, audioCount: 0 };
		}

		debugLog("[WZRD/QCut] Importing legacy timeline", {
			wzrdProjectId,
			qcutProjectId,
			clips: clips.length,
			audioTracks: audioTracks.length,
		});

		const mediaStore = useMediaStore.getState();
		const timelineStore = useTimelineStore.getState();

		const existingMediaIds = new Set(mediaStore.mediaItems.map((m) => m.id));

		// Create reusable media/audio track lanes based on legacy indices.
		const mediaLaneMap = new Map<number, string>();
		const audioLaneMap = new Map<number, string>();
		const textLaneMap = new Map<number, string>();

		const ensureLane = (laneMap: Map<number, string>, laneIndex: number, type: "media" | "audio") => {
			const existing = laneMap.get(laneIndex);
			if (existing) return existing;
			// First media lane: reuse existing media track if it exists.
			if (type === "media" && laneMap.size === 0) {
				const first = timelineStore.tracks.find((t) => t.type === "media")?.id;
				if (first) {
					laneMap.set(laneIndex, first);
					return first;
				}
			}
			const trackId = timelineStore.addTrack(type);
			laneMap.set(laneIndex, trackId);
			return trackId;
		};

		const ensureTextLane = (laneIndex: number) => {
			const existing = textLaneMap.get(laneIndex);
			if (existing) return existing;
			// Put text tracks at the top.
			const trackId = timelineStore.insertTrackAt("text", 0);
			textLaneMap.set(laneIndex, trackId);
			return trackId;
		};

		// Import media items referenced by clips.
		for (const clip of clips) {
			if (clip.type === "text") continue;
			const rawUrl = clip.playbackUrl || clip.proxyUrl || clip.url;
			if (!rawUrl) continue;

			const mediaId = clip.mediaItemId || clip.sourceId || `legacy-${clip.id}`;
			if (!mediaId) continue;
			if (existingMediaIds.has(mediaId)) continue;

			const type = clip.type === "image" ? "image" : "video";
			const file = new File([], clip.name || "clip", { type: type === "image" ? "image/*" : "video/*" });

			await mediaStore.addMediaItem(qcutProjectId, {
				id: mediaId,
				name: clip.name || "Legacy Clip",
				type,
				file,
				url: rawUrl,
				duration: msToSeconds(clip.duration),
				metadata: {
					source: "legacy",
					legacyClipId: clip.id,
				},
			});

			existingMediaIds.add(mediaId);
		}

		for (const track of audioTracks) {
			const rawUrl = track.playbackUrl || track.proxyUrl || track.url;
			if (!rawUrl) continue;

			const mediaId = track.mediaItemId || track.sourceId || `legacy-audio-${track.id}`;
			if (!mediaId) continue;
			if (existingMediaIds.has(mediaId)) continue;

			const file = new File([], track.name || "audio", { type: "audio/*" });

			await mediaStore.addMediaItem(qcutProjectId, {
				id: mediaId,
				name: track.name || "Legacy Audio",
				type: "audio",
				file,
				url: rawUrl,
				duration: msToSeconds(track.duration),
				metadata: {
					source: "legacy",
					legacyAudioId: track.id,
				},
			});

			existingMediaIds.add(mediaId);
		}

		// Build timeline elements.
		const addElement = (
			trackId: string,
			element: any,
			options?: { pushHistory?: boolean }
		) => {
			return timelineStore.addElementToTrack(trackId, element, {
				pushHistory: options?.pushHistory,
				selectElement: false,
			});
		};

		timelineStore.pushHistory();

		let importedClips = 0;
		let importedAudio = 0;

		for (const clip of clips) {
			const laneIndex = clip.trackIndex ?? clip.layer ?? 0;
			const startTime = msToSeconds(clip.startTime);
			const duration = Math.max(0.001, msToSeconds(clip.duration) || TIMELINE_CONSTANTS.DEFAULT_IMAGE_DURATION);
			const trimStart = msToSeconds(clip.trimStart);
			const trimEnd = msToSeconds(clip.trimEnd);

			if (clip.type === "text") {
				const trackId = ensureTextLane(laneIndex);
				addElement(trackId, {
					id: generateUUID(),
					type: "text",
					name: clip.name || "Text",
					content: clip.text || "",
					duration,
					startTime,
					trimStart: 0,
					trimEnd: 0,
					fontSize: clip.style?.fontSize ?? 48,
					fontFamily: clip.style?.fontFamily ?? "Arial",
					color: clip.style?.color ?? "#ffffff",
					backgroundColor: clip.style?.backgroundColor ?? "transparent",
					textAlign: clip.style?.textAlign ?? "center",
					fontWeight: (clip.style?.fontWeight as any) ?? "normal",
					fontStyle: "normal",
					textDecoration: "none",
					x: clip.transforms?.position?.x ?? 0,
					y: clip.transforms?.position?.y ?? 0,
					rotation: clip.transforms?.rotation ?? 0,
					opacity: clip.transforms?.opacity ?? 1,
				});
				importedClips++;
				continue;
			}

			const mediaId = clip.mediaItemId || clip.sourceId || `legacy-${clip.id}`;
			const trackId = ensureLane(mediaLaneMap, laneIndex, "media");

			addElement(trackId, {
				id: generateUUID(),
				type: "media",
				name: clip.name || "Clip",
				mediaId,
				duration,
				startTime,
				trimStart,
				trimEnd,
			});
			importedClips++;
		}

		for (const track of audioTracks) {
			const laneIndex = track.trackIndex ?? 0;
			const startTime = msToSeconds(track.startTime);
			const duration = Math.max(0.001, msToSeconds(track.duration) || TIMELINE_CONSTANTS.DEFAULT_IMAGE_DURATION);
			const trimStart = msToSeconds(track.trimStart);
			const trimEnd = msToSeconds(track.trimEnd);

			const mediaId = track.mediaItemId || track.sourceId || `legacy-audio-${track.id}`;
			const trackId = ensureLane(audioLaneMap, laneIndex, "audio");

			addElement(trackId, {
				id: generateUUID(),
				type: "media",
				name: track.name || "Audio",
				mediaId,
				duration,
				startTime,
				trimStart,
				trimEnd,
				volume: track.volume ?? 1,
			});
			importedAudio++;
		}

		window.localStorage.setItem(importedFlagKey(wzrdProjectId), "true");
		debugLog("[WZRD/QCut] Legacy import complete", {
			importedClips,
			importedAudio,
		});
		return { imported: true, clipCount: importedClips, audioCount: importedAudio };
	} catch (error) {
		debugError("[WZRD/QCut] Legacy import failed", error);
		return { imported: false, clipCount: 0, audioCount: 0 };
	}
}
