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
  const exitTimerRef = useRef<number | null>(null);
  const playbackTokenRef = useRef(0);
  const hasPrefetchedRef = useRef(false);
  const hasExitedRef = useRef(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [playback, setPlayback] = useState<PlaybackState>("loading");

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current === null) return;

    window.clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
  }, []);

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current === null) return;

    window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = null;
  }, []);

  const transitionToSpline = useCallback((immediate = false) => {
    clearFallbackTimer();
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
  }, [clearFallbackTimer, onPrefetchSpline, onReveal]);

  const startPlayback = useCallback(async (token: number) => {
    const video = videoRef.current;
    if (!video || reducedMotion || !motionAllowed || hasExitedRef.current) return;

    clearFallbackTimer();
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
  }, [clearFallbackTimer, motionAllowed, reducedMotion, transitionToSpline]);

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
      clearExitTimer();
    };
  }, [clearExitTimer, clearFallbackTimer, motionAllowed, reducedMotion, startPlayback, transitionToSpline]);

  const pause = useCallback(() => {
    clearFallbackTimer();
    videoRef.current?.pause();
    setPlayback("paused");
  }, [clearFallbackTimer]);

  const resume = useCallback(async () => {
    const video = videoRef.current;
    if (!video || hasExitedRef.current) return;

    try {
      await video.play();
      if (!hasExitedRef.current) setPlayback("playing");
    } catch {
      transitionToSpline(true);
    }
  }, [transitionToSpline]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || hasExitedRef.current) return;

    if (video.currentTime > 0.1) clearFallbackTimer();

    if (!hasPrefetchedRef.current && Number.isFinite(video.duration) && video.currentTime >= video.duration - prefetchLeadSeconds) {
      hasPrefetchedRef.current = true;
      onPrefetchSpline?.();
    }
  }, [clearFallbackTimer, onPrefetchSpline, prefetchLeadSeconds]);

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
          onTimeUpdate={onTimeUpdate}
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
