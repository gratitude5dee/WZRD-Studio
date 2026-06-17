import { useCallback, useEffect, useRef } from 'react';
import { useVideoEditorStore, type PlaybackState } from '@/store/videoEditorStore';

export interface EditorPlaybackAdvanceInput {
  currentTime: number;
  deltaMs: number;
  playbackRate: number;
  minTime: number;
  maxTime: number;
  isLooping: boolean;
}

export interface EditorPlaybackAdvanceResult {
  currentTime: number;
  shouldPause: boolean;
}

export function advanceEditorPlaybackTime({
  currentTime,
  deltaMs,
  playbackRate,
  minTime,
  maxTime,
  isLooping,
}: EditorPlaybackAdvanceInput): EditorPlaybackAdvanceResult {
  const start = Math.max(0, minTime);
  const end = Math.max(start, maxTime);
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const next = Math.max(start, currentTime) + Math.max(0, deltaMs) * rate;

  if (end <= start) {
    return { currentTime: start, shouldPause: true };
  }

  if (next < end) {
    return { currentTime: next, shouldPause: false };
  }

  if (!isLooping) {
    return { currentTime: end, shouldPause: true };
  }

  const span = end - start;
  const wrapped = start + ((next - start) % span);
  return { currentTime: wrapped, shouldPause: false };
}

function getPlaybackEnd(playback: PlaybackState) {
  const state = useVideoEditorStore.getState();
  const clipEnd = state.clips.reduce((cursor, clip) => {
    const end = clip.endTime ?? (clip.startTime ?? 0) + (clip.duration ?? 0);
    return Math.max(cursor, end);
  }, 0);
  const audioEnd = state.audioTracks.reduce((cursor, track) => {
    const end = track.endTime ?? (track.startTime ?? 0) + (track.duration ?? 0);
    return Math.max(cursor, end);
  }, 0);
  const duration = Math.max(state.composition.duration, state.project.duration, clipEnd, audioEnd, 0);
  return playback.outPoint > playback.inPoint ? Math.min(playback.outPoint, duration || playback.outPoint) : duration;
}

export function useEditorPlaybackClock() {
  const frameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    lastTimestampRef.current = null;
  }, []);

  const tick = useCallback((timestamp: number) => {
    const state = useVideoEditorStore.getState();
    const playback = state.playback;

    if (!playback.isPlaying) {
      cancelFrame();
      return;
    }

    if (lastTimestampRef.current === null) {
      lastTimestampRef.current = timestamp;
    }

    const deltaMs = Math.max(0, timestamp - lastTimestampRef.current);
    lastTimestampRef.current = timestamp;
    const result = advanceEditorPlaybackTime({
      currentTime: playback.currentTime,
      deltaMs,
      playbackRate: playback.playbackRate,
      minTime: playback.inPoint,
      maxTime: getPlaybackEnd(playback),
      isLooping: playback.isLooping,
    });

    useVideoEditorStore.setState((current) => ({
      playback: {
        ...current.playback,
        currentTime: result.currentTime,
        isPlaying: result.shouldPause ? false : current.playback.isPlaying,
      },
    }));

    frameRef.current = requestAnimationFrame(tick);
  }, [cancelFrame]);

  const scheduleFrame = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => {
    const unsubscribe = useVideoEditorStore.subscribe((state, previousState) => {
      if (state.playback.isPlaying && !previousState.playback.isPlaying) {
        scheduleFrame();
      }
      if (!state.playback.isPlaying && previousState.playback.isPlaying) {
        cancelFrame();
      }
    });

    if (useVideoEditorStore.getState().playback.isPlaying) {
      scheduleFrame();
    }

    return () => {
      unsubscribe();
      cancelFrame();
    };
  }, [cancelFrame, scheduleFrame]);
}
