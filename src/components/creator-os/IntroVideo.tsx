"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./IntroVideo.module.css";

const INTRO_DISMISSED_KEY = "wzrd:intro-dismissed";
const INTRO_VIDEO = "/creator-os/assets/universe-teeming-intro.mp4";
const INTRO_POSTER = "/creator-os/assets/universe-teeming-poster.jpg";

export default function IntroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(INTRO_DISMISSED_KEY) === "true") setVisible(false);
  }, []);

  const dismiss = useCallback(() => {
    videoRef.current?.pause();
    window.sessionStorage.setItem(INTRO_DISMISSED_KEY, "true");
    setVisible(false);
  }, []);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = muted;
    try {
      await video.play();
      setPlaybackError(false);
      setPlaying(true);
    } catch {
      // The visible button is the user gesture required by browser audio policy.
      setPlaybackError(true);
    }
  }, [muted]);

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (videoRef.current) videoRef.current.muted = nextMuted;
  }, [muted]);

  if (!visible) return null;

  return (
    <section aria-label="WZRD.tech introduction" aria-modal="true" className={styles.intro} role="dialog">
      <video
        className={styles.video}
        muted={muted}
        onEnded={dismiss}
        onError={() => setPlaybackError(true)}
        playsInline
        poster={INTRO_POSTER}
        preload="metadata"
        ref={videoRef}
        src={INTRO_VIDEO}
      />
      <div aria-hidden="true" className={styles.vignette} />

      <div className={styles.brand}>
        <img alt="WZRD.tech" src="/wzrdtechlogo.png" />
      </div>

      <div className={styles.controls}>
        {!playing ? (
          <button className={`${styles.button} ${styles.primaryButton}`} onClick={start} type="button">
            Enter with sound
          </button>
        ) : null}
        <div className={styles.utilityControls}>
          <button className={styles.button} onClick={toggleMute} type="button">
            {muted ? "Unmute" : "Mute"}
          </button>
          <button className={styles.button} onClick={dismiss} type="button">
            Skip intro
          </button>
        </div>
        {playbackError ? <p className={styles.error}>Playback is unavailable. You can still enter the site.</p> : null}
      </div>
    </section>
  );
}
