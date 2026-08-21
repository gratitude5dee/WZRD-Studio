import Spline from "@splinetool/react-spline/next";

import styles from "./CreatorOSLanding.module.css";

const SPLINE_SCENE = "https://prod.spline.design/7n8f5YWSgL4MSvLr/scene.splinecode";

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

export default function SplinePartnerHero() {
  return (
    <section aria-label="WZRD.tech" className={styles.splineHero} id="top">
      <h1 className={styles.visuallyHidden}>WZRD.tech</h1>
      <div aria-hidden="true" className={styles.splineLayer}>
        <Spline renderOnDemand={false} scene={SPLINE_SCENE} />
      </div>

      <div className={styles.splineWash} />

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
