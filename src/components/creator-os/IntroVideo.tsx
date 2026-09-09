"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./IntroVideo.module.css";

const INTRO_VIDEO = "/creator-os/assets/universe-teeming-intro.mp4";

type PlaybackState = "fallback" | "loading" | "paused" | "playing" | "replay";

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
  const playbackTokenRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [playback, setPlayback] = useState<PlaybackState>("loading");
  const reducedMotion = useReducedMotion();

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current === null) return;
    window.clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
  }, []);

  const showFallback = useCallback(() => {
    clearFallbackTimer();
    videoRef.current?.pause();
    setPlayback("fallback");
  }, [clearFallbackTimer]);

  const startPlayback = useCallback(async (token: number) => {
    const video = videoRef.current;
    if (!video || reducedMotion) return;

    clearFallbackTimer();
    setPlayback("loading");
    video.muted = true;
    let timedOut = false;
    fallbackTimerRef.current = window.setTimeout(() => {
      if (token !== playbackTokenRef.current) return;
      timedOut = true;
      showFallback();
    }, 3000);

    try {
      await video.play();
      if (timedOut || token !== playbackTokenRef.current) return;
      clearFallbackTimer();
      setPlayback("playing");
    } catch {
      showFallback();
    }
  }, [clearFallbackTimer, reducedMotion, showFallback]);

  useEffect(() => {
    playbackTokenRef.current += 1;
    const token = playbackTokenRef.current;

    if (reducedMotion) {
      showFallback();
      return;
    }

    void startPlayback(token);

    return clearFallbackTimer;
  }, [attempt, clearFallbackTimer, reducedMotion, showFallback, startPlayback]);

  const pause = useCallback(() => {
    clearFallbackTimer();
    videoRef.current?.pause();
    setPlayback("paused");
  }, [clearFallbackTimer]);

  const replay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setAttempt((value) => value + 1);
  }, []);

  const onCanPlay = useCallback(() => {
    clearFallbackTimer();
  }, [clearFallbackTimer]);

  const onEnded = useCallback(() => {
    clearFallbackTimer();
    setPlayback("replay");
  }, [clearFallbackTimer]);

  const videoVisible = playback === "loading" || playback === "playing" || playback === "paused";
  const primaryAction = playback === "playing" ? "Pause introduction" : playback === "replay" ? "Replay introduction" : "Play introduction";

  return (
    <section aria-label="WZRD.tech introduction film" className={styles.intro} data-playback={playback}>
      <div className={styles.frame}>
        <video
          aria-label="WZRD.tech introduction film"
          autoPlay={!reducedMotion}
          className={styles.video}
          muted
          onCanPlay={onCanPlay}
          onEnded={onEnded}
          onError={showFallback}
          playsInline
          preload="metadata"
          ref={videoRef}
          src={INTRO_VIDEO}
          tabIndex={-1}
        />
        <div aria-hidden="true" className={styles.frameOverlay} />
        {!videoVisible && <span aria-hidden="true" className={styles.staticLabel}>The WZRD universe, at rest</span>}
      </div>

      <div className={styles.controls}>
        <p aria-live="polite" className={styles.status}>
          {reducedMotion
            ? "Motion is reduced. The hero is ready to explore."
            : playback === "fallback"
              ? "The hero is ready to explore."
              : playback === "replay"
                ? "Introduction complete."
                : playback === "paused"
                  ? "Introduction paused."
                  : "Introduction playing."}
        </p>
        <button className={styles.button} onClick={playback === "playing" ? pause : replay} type="button">
          {primaryAction}
        </button>
      </div>
    </section>
  );
}
