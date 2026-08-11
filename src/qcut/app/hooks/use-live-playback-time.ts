import { useEffect, useState } from "react";
import { usePlaybackStore } from "@qcut-app/stores/editor/playback-store";

/**
 * The store's `currentTime` is intentionally not updated per frame during
 * playback (see playback-store). This hook follows the per-frame
 * `playback-update` events while playing, and the store's `currentTime`
 * while paused/scrubbing, so time-dependent rendering stays smooth.
 */
export function useLivePlaybackTime(): number {
	const currentTime = usePlaybackStore((s) => s.currentTime);
	const isPlaying = usePlaybackStore((s) => s.isPlaying);
	const [liveTime, setLiveTime] = useState(currentTime);

	useEffect(() => {
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
	}, [isPlaying, currentTime]);

	return isPlaying ? liveTime : currentTime;
}
