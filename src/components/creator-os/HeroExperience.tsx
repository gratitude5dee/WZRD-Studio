"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Application } from "@splinetool/runtime";

import styles from "./CreatorOSLanding.module.css";
import IntroVideo from "./IntroVideo";
import { useMotionPreference } from "./MotionPreference";

const SPLINE_SCENE = "https://prod.spline.design/7n8f5YWSgL4MSvLr/scene.splinecode";
const SPLINE_PRELOAD_LEAD_SECONDS = 8;

function getSplineZoom(width: number, height: number) {
  if (width <= 0 || height <= 0 || width >= height) return 1;

  // Keep the portrait framing proportional as the stage grows. The exported
  // scene has a wide camera, so this modest zoom makes the sculpture legible
  // while preserving its complete silhouette and the scene copy above it.
  const aspectRatio = height / width;
  return Math.min(1.72, Math.max(1.58, 1.62 + (aspectRatio - 1.25) * 0.16));
}

const partners = [
  { logo: "https://cdn.simpleicons.org/anthropic/E6DFD2", name: "Anthropic" },
  { logo: "/creator-os/openai-white-monoblossom.svg", name: "OpenAI" },
  { logo: "https://cdn.simpleicons.org/vercel/FFFFFF", name: "Vercel" },
  { logo: "https://cdn.simpleicons.org/mongodb/77C68A", name: "MongoDB" },
  { logo: "https://www.gmicloud.ai/favicon.ico", name: "GMI Cloud" },
  { logo: "https://cognition.com/icon.svg", name: "Cognition" },
  { logo: "https://onairos.io/favicon.png", name: "Onairos" },
] as const;

function PartnerSet({ hidden = false }: { hidden?: boolean }) {
  return (
    <div aria-hidden={hidden} className={styles.partnerSet}>
      {partners.map((partner) => (
        <span className={styles.partnerLogo} key={partner.name}>
          <img alt="" aria-hidden="true" className={styles.partnerLogoMark} src={partner.logo} />
          <span className={styles.partnerLogoText}>{partner.name}</span>
        </span>
      ))}
    </div>
  );
}

function useStageVisibility(stageRef: RefObject<HTMLElement | null>) {
  const [inViewport, setInViewport] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !window.IntersectionObserver) return;

    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), {
      rootMargin: "160px",
      threshold: 0,
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef]);

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return inViewport && pageVisible;
}

function SplineSceneFrame({
  active,
  scene,
}: {
  active: boolean;
  scene: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Application | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active) {
      setLoaded(false);
      return;
    }

    const frame = frameRef.current;
    if (!frame) return;
    setLoaded(false);
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    frame.appendChild(canvas);
    let disposed = false;
    let runtime: Application;

    try {
      runtime = new Application(canvas, { renderOnDemand: true });
      runtimeRef.current = runtime;
    } catch {
      return () => {
        canvas.remove();
      };
    }

    const resize = () => {
      const bounds = frame.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        runtime.setSize(bounds.width, bounds.height);
        runtime.setZoom(getSplineZoom(bounds.width, bounds.height));
      }
    };

    const observer = window.ResizeObserver ? new ResizeObserver(resize) : null;
    observer?.observe(frame);
    const animationFrame = window.requestAnimationFrame(resize);
    const readyTimer = window.setTimeout(resize, 1000);

    void runtime.load(scene).then(() => {
      if (disposed) return;
      resize();
      runtime.play();
      setLoaded(true);
    }).catch(() => {
      if (!disposed) setLoaded(false);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(readyTimer);
      runtime.stop();
      runtime.dispose();
      runtimeRef.current = null;
      canvas.remove();
    };
  }, [active, scene]);

  return <div aria-hidden="true" className={styles.splineLayer} data-ready={loaded ? "true" : "false"} ref={frameRef} />;
}

export default function HeroExperience() {
  const { motionAllowed, reduced } = useMotionPreference();
  const stageRef = useRef<HTMLElement>(null);
  const stageVisible = useStageVisibility(stageRef);
  const [sceneRequested, setSceneRequested] = useState(false);
  const [heroRevealed, setHeroRevealed] = useState(false);

  const requestScene = useCallback(() => setSceneRequested(true), []);
  const revealHero = useCallback(() => {
    requestScene();
    setHeroRevealed(true);
  }, [requestScene]);

  useEffect(() => {
    if (!motionAllowed || reduced) revealHero();
  }, [motionAllowed, reduced, revealHero]);

  const mountSpline = sceneRequested && stageVisible && motionAllowed && !reduced;

  return (
    <section aria-label="WZRD.tech" className={styles.splineHero} data-hero-experience="true" id="top">
      <h1 className={styles.visuallyHidden}>WZRD.tech Creator OS</h1>

      <section aria-label="WZRD.tech hero" className={styles.heroStage} ref={stageRef}>
          <div aria-hidden="true" className={styles.splineFallback}>
            <img alt="" src="/creator-os/spline-scene-still.svg" />
          </div>

        {mountSpline && (
          <SplineSceneFrame active={mountSpline} scene={SPLINE_SCENE} />
        )}

        <div aria-hidden="true" className={styles.splineWash} />
        {heroRevealed && (
          <div aria-label="Technology ecosystem" className={styles.partnerRail}>
            <p>Built across the AI ecosystem</p>
            <div className={styles.partnerViewport}>
              <div className={styles.partnerTrack}>
                <PartnerSet />
                <PartnerSet hidden />
              </div>
            </div>
          </div>
        )}
        <IntroVideo
          motionAllowed={motionAllowed}
          onPrefetchSpline={requestScene}
          onReveal={revealHero}
          prefetchLeadSeconds={SPLINE_PRELOAD_LEAD_SECONDS}
          reducedMotion={reduced}
        />
      </section>

      <div aria-live="polite" className={styles.heroActionSlot}>
        {heroRevealed && (
          <>
            <a className={styles.exploreAir} href="https://air.wzrd.tech/">
              <span>Explore Air</span>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M5.2 5.75h13.6A1.2 1.2 0 0 1 20 6.95v8.1a1.2 1.2 0 0 1-1.2 1.2h-7.05l-3.72 2.65.7-2.65H5.2A1.2 1.2 0 0 1 4 15.05v-8.1a1.2 1.2 0 0 1 1.2-1.2Z" fill="currentColor" />
                <path d="M8 10.2h8M8 13h5.5" fill="none" stroke="#1170d6" strokeLinecap="round" strokeWidth="1.45" />
              </svg>
            </a>
          </>
        )}
      </div>
    </section>
  );
}
