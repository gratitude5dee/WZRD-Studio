"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./IntroVideo.module.css";

const INTRO_VIDEO = "/creator-os/assets/universe-teeming-intro.mp4";
const FADE_OUT_MS = 700;

type PlaybackState = "loading" | "paused" | "playing";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);

    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export default function IntroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const playbackTokenRef = useRef(0);
  const hasExitedRef = useRef(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [playback, setPlayback] = useState<PlaybackState>("loading");
  const reducedMotion = useReducedMotion();

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
    setIsExiting(true);

    if (immediate) {
      setIsVisible(false);
      return;
    }

    exitTimerRef.current = window.setTimeout(() => setIsVisible(false), FADE_OUT_MS);
  }, [clearFallbackTimer]);

  const startPlayback = useCallback(async (token: number) => {
    const video = videoRef.current;
    if (!video || reducedMotion || hasExitedRef.current) return;

    clearFallbackTimer();
    setPlayback("loading");
    video.muted = true;
    fallbackTimerRef.current = window.setTimeout(() => {
      if (token === playbackTokenRef.current) transitionToSpline();
    }, 3000);

    try {
      await video.play();
      if (token !== playbackTokenRef.current || hasExitedRef.current) return;

      clearFallbackTimer();
      setPlayback("playing");
    } catch {
      transitionToSpline();
    }
  }, [clearFallbackTimer, reducedMotion, transitionToSpline]);

  useEffect(() => {
    playbackTokenRef.current += 1;
    const token = playbackTokenRef.current;

    if (reducedMotion) {
      transitionToSpline(true);
      return;
    }

    void startPlayback(token);

    return () => {
      clearFallbackTimer();
      clearExitTimer();
    };
  }, [clearExitTimer, clearFallbackTimer, reducedMotion, startPlayback, transitionToSpline]);

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
      transitionToSpline();
    }
  }, [transitionToSpline]);

  const onCanPlay = useCallback(() => {
    clearFallbackTimer();
  }, [clearFallbackTimer]);

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
          onCanPlay={onCanPlay}
          onEnded={() => transitionToSpline()}
          onError={() => transitionToSpline()}
          playsInline
          preload="metadata"
          ref={videoRef}
          src={INTRO_VIDEO}
          tabIndex={-1}
        />
        <div aria-hidden="true" className={styles.frameOverlay} />
        {playback !== "loading" && (
          <button
            aria-label={isPlaying ? "Pause introduction" : "Play introduction"}
            className={styles.button}
            onClick={isPlaying ? pause : resume}
            type="button"
          >
            <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
          </button>
        )}
      </div>
    </section>
  );
}
