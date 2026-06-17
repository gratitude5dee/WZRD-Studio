import type { MediaItem } from "@qcut-app/stores/media/media-store-types";
import type { TimelineElement, TimelineTrack } from "@qcut-app/types/timeline";

export interface ActiveElement {
	element: TimelineElement;
	track: TimelineTrack;
	mediaItem: MediaItem | null;
}

export interface PreviewDimensions {
	width: number;
	height: number;
}
