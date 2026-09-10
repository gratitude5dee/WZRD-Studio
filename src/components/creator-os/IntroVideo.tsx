"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./IntroVideo.module.css";

const INTRO_VIDEO = "/creator-os/assets/universe-teeming-intro.mp4";
const FADE_OUT_MS = 700;

type PlaybackState = "loading" | "paused" | "playing";

type IntroVideoProps = {
  motionAllowed?: boolean;
  onPrefetchSpline?: () => void;
  onReveal?: () => void;
  prefetchLeadSeconds?: number;
  reducedMotion?: boolean;
};

export default function IntroVideo({
  motionAllowed = true,
  onPrefetchSpline,
  onReveal,
  prefetchLeadSeconds = 8,
  reducedMotion = false,
}: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const stalledTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const playbackTokenRef = useRef(0);
  const hasPrefetchedRef = useRef(false);
  const hasExitedRef = useRef(false);
  const intentionalPauseRef = useRef(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [playback, setPlayback] = useState<PlaybackState>("loading");

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current === null) return;

    window.clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
  }, []);

  const clearStalledTimer = useCallback(() => {
    if (stalledTimerRef.current === null) return;

    window.clearTimeout(stalledTimerRef.current);
    stalledTimerRef.current = null;
  }, []);

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current === null) return;

    window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = null;
  }, []);

  const transitionToSpline = useCallback((immediate = false) => {
    clearFallbackTimer();
    clearStalledTimer();
    playbackTokenRef.current += 1;
    videoRef.current?.pause();

    if (hasExitedRef.current) return;

    hasExitedRef.current = true;
    onPrefetchSpline?.();
    onReveal?.();
    setIsExiting(true);

    if (immediate) {
      setIsVisible(false);
      return;
    }

    exitTimerRef.current = window.setTimeout(() => setIsVisible(false), FADE_OUT_MS);
  }, [clearFallbackTimer, clearStalledTimer, onPrefetchSpline, onReveal]);

  const armStalledTimer = useCallback(() => {
    clearStalledTimer();
    if (intentionalPauseRef.current || hasExitedRef.current) return;

    const token = playbackTokenRef.current;
    stalledTimerRef.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (!video || intentionalPauseRef.current || token !== playbackTokenRef.current || hasExitedRef.current) return;
      transitionToSpline(true);
    }, 3000);
  }, [clearStalledTimer, transitionToSpline]);

  const startPlayback = useCallback(async (token: number) => {
    const video = videoRef.current;
    if (!video || reducedMotion || !motionAllowed || hasExitedRef.current) return;

    clearFallbackTimer();
    clearStalledTimer();
    intentionalPauseRef.current = false;
    setPlayback("loading");
    video.muted = true;
    fallbackTimerRef.current = window.setTimeout(() => {
      if (token === playbackTokenRef.current) transitionToSpline(true);
    }, 3000);

    try {
      await video.play();
      if (token !== playbackTokenRef.current || hasExitedRef.current) return;

      setPlayback("playing");
    } catch {
      if (token === playbackTokenRef.current) transitionToSpline(true);
    }
  }, [clearFallbackTimer, clearStalledTimer, motionAllowed, reducedMotion, transitionToSpline]);

  useEffect(() => {
    playbackTokenRef.current += 1;
    const token = playbackTokenRef.current;

    if (reducedMotion || !motionAllowed) {
      transitionToSpline(true);
      return;
    }

    void startPlayback(token);

    return () => {
      clearFallbackTimer();
      clearStalledTimer();
      clearExitTimer();
    };
  }, [clearExitTimer, clearFallbackTimer, clearStalledTimer, motionAllowed, reducedMotion, startPlayback, transitionToSpline]);

  const pause = useCallback(() => {
    clearFallbackTimer();
    clearStalledTimer();
    intentionalPauseRef.current = true;
    videoRef.current?.pause();
    setPlayback("paused");
  }, [clearFallbackTimer, clearStalledTimer]);

  const resume = useCallback(async () => {
    const video = videoRef.current;
    if (!video || hasExitedRef.current) return;

    intentionalPauseRef.current = false;
    armStalledTimer();
    try {
      await video.play();
      if (!hasExitedRef.current) setPlayback("playing");
    } catch {
      transitionToSpline(true);
    }
  }, [armStalledTimer, transitionToSpline]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || hasExitedRef.current) return;

    if (video.currentTime > 0.1) clearFallbackTimer();
    clearStalledTimer();

    if (!hasPrefetchedRef.current && Number.isFinite(video.duration) && video.currentTime >= video.duration - prefetchLeadSeconds) {
      hasPrefetchedRef.current = true;
      onPrefetchSpline?.();
    }
  }, [clearFallbackTimer, clearStalledTimer, onPrefetchSpline, prefetchLeadSeconds]);

  const onWaiting = useCallback(() => {
    armStalledTimer();
  }, [armStalledTimer]);

  if (!isVisible) return null;

  const isPlaying = playback === "playing";

  return (
    <section
      aria-label="WZRD.tech introduction film"
      className={styles.intro}
      data-exiting={isExiting}
    >
      <div className={styles.frame}>
        <video
          aria-label="WZRD.tech introduction film"
          autoPlay={!reducedMotion}
          className={styles.video}
          muted
          onEnded={() => transitionToSpline()}
          onError={() => transitionToSpline(true)}
          onPlaying={clearStalledTimer}
          onStalled={onWaiting}
          onTimeUpdate={onTimeUpdate}
          onWaiting={onWaiting}
          playsInline
          preload="metadata"
          ref={videoRef}
          src={INTRO_VIDEO}
          tabIndex={-1}
        />
        <div aria-hidden="true" className={styles.frameOverlay} />
        <div className={styles.controls}>
          <button aria-label="Skip introduction" className={styles.skipButton} onClick={() => transitionToSpline()} type="button">
            Skip intro
          </button>
          {playback !== "loading" && (
            <button
              aria-label={isPlaying ? "Pause introduction" : "Play introduction"}
              className={styles.button}
              onClick={isPlaying ? pause : resume}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                {isPlaying ? (
                  <path d="M8 6v12M16 6v12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                ) : (
                  <path d="m9 7 8 5-8 5Z" fill="currentColor" />
                )}
              </svg>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
