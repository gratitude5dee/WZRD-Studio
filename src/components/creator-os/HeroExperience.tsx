"use client";

import { cloneElement, useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement, RefObject } from "react";

import styles from "./CreatorOSLanding.module.css";
import IntroVideo from "./IntroVideo";
import { useMotionPreference } from "./MotionPreference";

const SPLINE_SCENE = "https://prod.spline.design/7n8f5YWSgL4MSvLr/scene.splinecode";
const SPLINE_PRELOAD_LEAD_SECONDS = 8;

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

type HeroExperienceProps = {
  splineScene: ReactElement<{ onLoad?: () => void; renderOnDemand?: boolean }>;
};

export default function HeroExperience({ splineScene }: HeroExperienceProps) {
  const { motionAllowed, reduced } = useMotionPreference();
  const stageRef = useRef<HTMLElement>(null);
  const stageVisible = useStageVisibility(stageRef);
  const [introKey, setIntroKey] = useState(0);
  const [sceneRequested, setSceneRequested] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [heroRevealed, setHeroRevealed] = useState(false);

  const requestScene = useCallback(() => setSceneRequested(true), []);
  const revealHero = useCallback(() => {
    requestScene();
    setHeroRevealed(true);
  }, [requestScene]);

  useEffect(() => {
    if (!motionAllowed || reduced) revealHero();
  }, [motionAllowed, reduced, revealHero]);

  const replay = useCallback(() => {
    if (reduced || !motionAllowed) return;
    setIntroKey((value) => value + 1);
  }, [motionAllowed, reduced]);

  const mountSpline = sceneRequested && stageVisible;

  return (
    <section aria-label="WZRD.tech" className={styles.splineHero} id="top">
      <h1 className={styles.visuallyHidden}>WZRD.tech Creator OS</h1>

      <section aria-label="WZRD.tech hero" className={styles.heroStage} ref={stageRef}>
        <div aria-hidden="true" className={styles.splineFallback} data-hidden={sceneReady && mountSpline}>
          <img alt="" src="/creator-os/wzrd-wordmark-1600.png" />
        </div>

        {mountSpline && (
          <div aria-hidden="true" className={styles.splineLayer} data-ready={sceneReady}>
            {cloneElement(splineScene, {
              onLoad: () => setSceneReady(true),
              renderOnDemand: !motionAllowed || reduced,
            })}
          </div>
        )}

        <div aria-hidden="true" className={styles.splineWash} />
        <IntroVideo
          key={introKey}
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
            {!reduced && (
              <button aria-label="Replay introduction" className={styles.replayIntro} onClick={replay} type="button">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M19.4 8.3A7.8 7.8 0 1 0 20 15" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                  <path d="M19.7 4.6v4.1h-4.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                </svg>
                <span>Replay</span>
              </button>
            )}
          </>
        )}
      </div>

      <div aria-label="Technology ecosystem" className={styles.partnerRail}>
        <p>Built across the AI ecosystem</p>
        <div className={styles.partnerViewport}>
          <div className={styles.partnerTrack}>
            <PartnerSet />
            <PartnerSet hidden />
          </div>
        </div>
      </div>
    </section>
  );
}
