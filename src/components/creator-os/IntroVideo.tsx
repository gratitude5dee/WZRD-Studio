"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ShinyText from "./ShinyText";
import styles from "./IntroVideo.module.css";

const INTRO_DISMISSED_KEY = "wzrd:intro-dismissed";
const INTRO_VIDEO = "/creator-os/assets/universe-teeming-intro.mp4";
const INTRO_POSTER = "/creator-os/assets/universe-teeming-poster.jpg";

export default function IntroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(INTRO_DISMISSED_KEY) === "true") setVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  // Autoplay with sound is attempted first. Browsers that enforce an audio
  // gesture requirement continue the film muted, then let the shiny Unmute
  // control restore sound with the visitor's next gesture.
  useEffect(() => {
    if (!visible) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const begin = async () => {
      try {
        video.muted = false;
        await video.play();
        if (!cancelled) setMuted(false);
      } catch {
        if (cancelled) return;
        video.muted = true;
        setMuted(true);
        try {
          await video.play();
        } catch {
          // The native controls remain available if playback itself fails.
        }
      }
    };

    void begin();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const dismiss = useCallback(() => {
    if (exiting) return;
    videoRef.current?.pause();
    window.sessionStorage.setItem(INTRO_DISMISSED_KEY, "true");
    setExiting(true);
    exitTimerRef.current = window.setTimeout(() => setVisible(false), 620);
  }, [exiting]);

  const toggleMute = useCallback(async () => {
    const nextMuted = !muted;
    const video = videoRef.current;
    if (!video) return;

    video.muted = nextMuted;
    if (nextMuted) {
      setMuted(true);
      return;
    }

    try {
      await video.play();
      setMuted(false);
    } catch {
      video.muted = true;
      setMuted(true);
    }
  }, [muted]);

  if (!visible) return null;

  return (
    <section
      aria-label="WZRD.tech introduction"
      aria-modal="true"
      className={styles.intro}
      data-exiting={exiting ? "true" : undefined}
      role="dialog"
    >
      <video
        autoPlay
        className={styles.video}
        muted={muted}
        onEnded={dismiss}
        playsInline
        poster={INTRO_POSTER}
        preload="auto"
        ref={videoRef}
        src={INTRO_VIDEO}
      />
      <div aria-hidden="true" className={styles.vignette} />

      <div className={styles.brand}>
        <img alt="WZRD.tech" src="/wzrdtechlogo.png" />
      </div>

      <div className={styles.controls}>
        <div className={styles.utilityControls}>
          <button className={styles.button} onClick={() => void toggleMute()} type="button">
            <ShinyText className={styles.buttonText}>{muted ? "Unmute" : "Mute"}</ShinyText>
          </button>
          <button className={styles.button} onClick={dismiss} type="button">
            <ShinyText className={styles.buttonText}>Skip intro</ShinyText>
          </button>
        </div>
      </div>
    </section>
  );
}
