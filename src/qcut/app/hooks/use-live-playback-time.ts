import { useEffect, useState } from "react";
import { usePlaybackStore } from "@qcut-app/stores/editor/playback-store";

/**
 * The store's `currentTime` is intentionally not updated per frame during
 * playback (see playback-store). This hook follows the per-frame
 * `playback-update` events while playing, and the store's `currentTime`
 * while paused/scrubbing, so time-dependent rendering stays smooth.
 *
 * Following the per-frame events re-renders the caller every frame during
 * playback, so pass `enabled: false` when the caller has nothing
 * time-dependent to render; the hook then just returns the store's
 * `currentTime` without subscribing.
 */
export function useLivePlaybackTime(enabled = true): number {
	const currentTime = usePlaybackStore((s) => s.currentTime);
	const isPlaying = usePlaybackStore((s) => s.isPlaying);
	const [liveTime, setLiveTime] = useState(currentTime);

	useEffect(() => {
		if (!enabled) return;
		if (!isPlaying) {
			setLiveTime(currentTime);
			return;
		}
		const handleTick = (e: Event) => {
			const time = (e as CustomEvent).detail?.time;
			if (time == null) return;
			setLiveTime(time);
		};
		window.addEventListener("playback-update", handleTick);
		return () => window.removeEventListener("playback-update", handleTick);
	}, [enabled, isPlaying, currentTime]);

	if (!enabled) return currentTime;
	return isPlaying ? liveTime : currentTime;
}
