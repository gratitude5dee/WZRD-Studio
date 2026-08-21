"use client";

import Spline from "@splinetool/react-spline/next";

import styles from "./CreatorOSLanding.module.css";

const SPLINE_SCENE = "https://prod.spline.design/7n8f5YWSgL4MSvLr/scene.splinecode";

const partners = [
  { mark: "A", name: "Anthropic", tone: "anthropic" },
  { mark: "◎", name: "OpenAI", tone: "openai" },
  { mark: "▲", name: "Vercel", tone: "vercel" },
  { mark: "M", name: "MongoDB", tone: "mongodb" },
  { mark: "G", name: "GMI Cloud", tone: "gmi" },
  { mark: "C", name: "Cognition", tone: "cognition" },
  { mark: "O", name: "Onairos", tone: "onairos" },
] as const;

function PartnerSet({ hidden = false }: { hidden?: boolean }) {
  return (
    <div aria-hidden={hidden} className={styles.partnerSet}>
      {partners.map((partner) => (
        <span className={`${styles.partnerLogo} ${styles[partner.tone]}`} key={partner.name}>
          <span aria-hidden="true" className={styles.partnerMark}>
            {partner.mark}
          </span>
          {partner.name}
        </span>
      ))}
    </div>
  );
}

export default function SplinePartnerHero() {
  return (
    <section aria-label="WZRD.tech" className={styles.splineHero} id="top">
      <div aria-hidden="true" className={styles.splineLayer}>
        <Spline renderOnDemand={false} scene={SPLINE_SCENE} />
      </div>

      <div className={styles.splineWash} />

      <div className={styles.splineHeroCopy}>
        <p className={styles.splineEyebrow}>WZRD.tech / creator OS</p>
        <h1>Creative infrastructure for the next signal.</h1>
        <p>
          A single operating system for the artists, studios, and intelligent tools shaping what comes next.
        </p>
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

      <span aria-hidden="true" className={styles.splineScrollCue}>
        Scroll to enter
      </span>
    </section>
  );
}
