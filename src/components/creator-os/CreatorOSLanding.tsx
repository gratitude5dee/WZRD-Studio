"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { PretextBubble } from "./PretextBubble";
import styles from "./CreatorOSLanding.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const CloudAtmosphere = dynamic(() => import("./CloudAtmosphere"), {
  ssr: false,
});

const chapterLinks = [
  ["Air", "#air"],
  ["Studio", "#studio"],
  ["Earth", "#earth"],
  ["Zap", "#zap"],
] as const;

const runtimeStages = [
  ["01", "Intent", "A voice note, text, or reference becomes a structured brief."],
  ["02", "Agents", "Specialists plan, make, inspect, and hand the thread forward."],
  ["03", "Media", "The runtime preserves decisions while it moves across image, sound, and edit."],
  ["04", "Release", "Work leaves with context: the cut, its provenance, and its next invitation."],
] as const;

export default function CreatorOSLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  const cloudProgressRef = useRef(0);
  const invalidateCloudRef = useRef<(() => void) | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [webglReady, setWebglReady] = useState(false);

  const motionAllowed = motionEnabled && !systemReducedMotion;

  const handleCloudReady = useCallback((invalidate: (() => void) | null) => {
    invalidateCloudRef.current = invalidate;
    invalidate?.();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setSystemReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    setWebglReady(Boolean(context));

    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const hero = root.querySelector<HTMLElement>("[data-hero]");
      const wordmark = root.querySelector<HTMLElement>("[data-wordmark]");
      const creatorOS = root.querySelector<HTMLElement>("[data-creator-os]");
      const heroStatement = root.querySelector<HTMLElement>("[data-hero-statement]");
      const heroHud = root.querySelector<HTMLElement>("[data-hero-hud]");
      const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));

      if (!motionAllowed) {
        cloudProgressRef.current = 0;
        invalidateCloudRef.current?.();
        gsap.set([wordmark, creatorOS, heroStatement, heroHud].filter(Boolean), {
          clearProps: "all",
        });
        gsap.set(reveals, { clearProps: "all" });
        return;
      }

      const media = gsap.matchMedia();

      media.add("(min-width: 860px)", () => {
        if (!hero || !wordmark || !creatorOS || !heroStatement || !heroHud) return;

        gsap.set(creatorOS, { autoAlpha: 0, yPercent: 20 });
        gsap.set(heroStatement, { autoAlpha: 0, y: 28 });
        gsap.set(heroHud, { autoAlpha: 0, y: 12 });

        const transition = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            anticipatePin: 1,
            end: "+=1150",
            onUpdate: self => {
              cloudProgressRef.current = self.progress;
              invalidateCloudRef.current?.();
            },
            pin: true,
            scrub: 0.75,
            start: "top top",
            trigger: hero,
          },
        });

        transition
          .to(wordmark, { autoAlpha: 0, scale: 0.73, yPercent: -8 }, 0.18)
          .to(creatorOS, { autoAlpha: 1, duration: 0.18, yPercent: 0 }, 0.32)
          .to(heroStatement, { autoAlpha: 1, duration: 0.16, y: 0 }, 0.48)
          .to(heroHud, { autoAlpha: 1, duration: 0.12, y: 0 }, 0.55);
      });

      media.add("(max-width: 859px)", () => {
        cloudProgressRef.current = 0.12;
        invalidateCloudRef.current?.();
        gsap.set([wordmark, creatorOS, heroStatement, heroHud].filter(Boolean), {
          clearProps: "all",
        });
      });

      reveals.forEach((element, index) => {
        gsap.fromTo(
          element,
          { autoAlpha: 0, y: index % 2 === 0 ? 34 : 24 },
          {
            autoAlpha: 1,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: {
              start: "top 82%",
              toggleActions: "play none none reverse",
              trigger: element,
            },
            y: 0,
          },
        );
      });

      return () => media.revert();
    },
    { dependencies: [motionAllowed], scope: rootRef },
  );

  return (
    <div
      className={`${styles.creatorOS} ${motionAllowed ? "" : styles.motionOff}`}
      ref={rootRef}
    >
      <a className={styles.skipLink} href="#creator-os-main">
        Skip to the Creator OS
      </a>

      <header className={styles.siteHeader}>
        <a aria-label="WZRD.tech home" className={styles.brandMark} href="#top">
          <span>WZRD</span>
          <i>.tech</i>
        </a>
        <nav aria-label="Creator OS chapters" className={styles.chapterNav}>
          {chapterLinks.map(([label, href]) => (
            <a href={href} key={label}>
              {label}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <button
            aria-pressed={motionEnabled}
            className={styles.motionButton}
            onClick={() => setMotionEnabled(current => !current)}
            type="button"
          >
            Motion {motionEnabled ? "on" : "off"}
          </button>
          <a className={styles.headerCta} href="/home">
            Enter Studio <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main id="creator-os-main">
        <section
          aria-labelledby="hero-title"
          className={styles.hero}
          data-hero
          id="top"
        >
          <div aria-hidden="true" className={styles.cloudFallback} />
          {webglReady && motionAllowed ? (
            <div aria-hidden="true" className={styles.cloudCanvas}>
              <CloudAtmosphere
                onInvalidateReady={handleCloudReady}
                progressRef={cloudProgressRef}
              />
            </div>
          ) : null}
          <div aria-hidden="true" className={styles.heroGrain} />
          <div aria-hidden="true" className={styles.heroFrame}>
            <span>LAT 34.0224° N</span>
            <span>WZRD / 001</span>
            <span>ALT +∞</span>
          </div>

          <div className={styles.heroContent}>
            <p className={styles.heroKicker}>A creator operating system</p>
            <img
              alt="WZRD.tech"
              className={styles.heroWordmark}
              data-wordmark
              height="425"
              src="/creator-os/wzrd-wordmark.png"
              width="1717"
            />
            <h1 className={styles.screenReaderOnly} id="hero-title">
              WZRD.tech: Creator OS
            </h1>
            <div className={styles.creatorTitle} data-creator-os>
              <span>Creator</span>
              <strong>OS</strong>
            </div>
            <p className={styles.heroStatement} data-hero-statement>
              A living system for the people who turn passing signals into culture.
            </p>
            <a className={styles.heroCta} href="#air">
              Begin at the source <span aria-hidden="true">↓</span>
            </a>
          </div>

          <div className={styles.heroHud} data-hero-hud>
            <span>Scroll to enter</span>
            <span className={styles.hudLine} />
            <span>01 / 05</span>
          </div>
        </section>

        <section aria-labelledby="air-title" className={`${styles.chapter} ${styles.air}`} id="air">
          <div className={styles.chapterMeta} data-reveal>
            <span>01 / Air</span>
            <span>Intent, received</span>
          </div>
          <div className={styles.airLayout}>
            <header className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>An agent where your idea already lives</p>
              <h2 id="air-title">Air catches the thought before it becomes a task.</h2>
              <p>
                A messages-native creative agent that hears the cue, asks the one
                question that matters, and turns the answer into momentum.
              </p>
              <a className={styles.textLink} href="/home">
                Meet Air in Studio <span aria-hidden="true">↗</span>
              </a>
            </header>
            <article aria-label="A sample Air conversation" className={styles.messageThread} data-reveal>
              <div className={styles.threadHeader}>
                <span aria-hidden="true" className={styles.agentAvatar}>W</span>
                <div>
                  <strong>Air</strong>
                  <small>creative agent</small>
                </div>
                <span className={styles.threadStatus}>available</span>
              </div>
              <div className={styles.threadMessages}>
                <PretextBubble kind="human">Four shots. Night city. No rush.</PretextBubble>
                <PretextBubble>
                  I hear a quiet opener, a bright interruption, then room for the last beat.
                </PretextBubble>
                <PretextBubble kind="human">Keep the last beat quiet.</PretextBubble>
                <PretextBubble kind="signal">
                  Locked. I’ll carry the silence into the cut sheet.
                </PretextBubble>
              </div>
              <div className={styles.threadComposer}>
                <span>Send a thought</span>
                <b aria-hidden="true">↑</b>
              </div>
            </article>
          </div>
        </section>

        <section aria-labelledby="studio-title" className={`${styles.chapter} ${styles.studio}`} id="studio">
          <div className={styles.chapterMeta} data-reveal>
            <span>02 / Studio</span>
            <span>A pocket-sized set</span>
          </div>
          <div className={styles.studioLayout}>
            <header className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>Generative media, in your pocket</p>
              <h2 id="studio-title">Make the cut without leaving the conversation.</h2>
              <p>
                Studio is a mobile creative room. Collect references, direct the
                agents, shape a sequence, and take the work to the next room when it is ready.
              </p>
            </header>
            <figure className={styles.deviceFigure} data-reveal>
              <div aria-hidden="true" className={styles.deviceHalo} />
              <img
                alt="WZRD Studio shown across a phone and desktop workspace"
                height="373"
                loading="lazy"
                src="/creator-os/devices.png"
                width="669"
              />
              <figcaption>
                <span>Studio / live work surface</span>
                <span>Input → direction → output</span>
              </figcaption>
            </figure>
            <ol className={styles.studioSteps} data-reveal>
              <li>
                <span>01</span>
                <p><strong>Gather</strong> Voice notes, images, fragments, and references.</p>
              </li>
              <li>
                <span>02</span>
                <p><strong>Direct</strong> Give the work an angle, a tempo, a reason to exist.</p>
              </li>
              <li>
                <span>03</span>
                <p><strong>Release</strong> Move the finished signal into the culture around it.</p>
              </li>
            </ol>
          </div>
        </section>

        <section aria-labelledby="earth-title" className={`${styles.chapter} ${styles.earth}`} id="earth">
          <div className={styles.chapterMeta} data-reveal>
            <span>03 / Earth</span>
            <span>Digital → physical</span>
          </div>
          <div className={styles.earthLayout}>
            <header className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>Generative culture has a place to land</p>
              <h2 id="earth-title">Earth gives a work a world beyond the feed.</h2>
              <p>
                A cultural layer for releases that travel from a shared file to a
                room, a screen, a crowd, and the next person who wants to make something.
              </p>
            </header>
            <div aria-label="A path from a digital signal to a physical gathering" className={styles.earthArtifact} data-reveal>
              <span className={styles.earthOrbitOne} />
              <span className={styles.earthOrbitTwo} />
              <span className={styles.earthCore}>EARTH</span>
              <div className={styles.earthNodes}>
                <span>Signal</span>
                <span>Artifact</span>
                <span>Room</span>
                <span>Ritual</span>
              </div>
            </div>
            <aside className={styles.earthNote} data-reveal>
              <span>Field note / 03</span>
              <p>
                Digital work is not the opposite of physical culture. It is the invitation.
              </p>
              <a className={styles.textLink} href="#horizon">
                Follow the horizon <span aria-hidden="true">↓</span>
              </a>
            </aside>
          </div>
        </section>

        <section aria-labelledby="zap-title" className={`${styles.chapter} ${styles.zap}`} id="zap">
          <div className={styles.chapterMeta} data-reveal>
            <span>04 / Zap</span>
            <span>Agent Media Runtime</span>
          </div>
          <div className={styles.zapLayout}>
            <header className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>A framework for work that moves</p>
              <h2 id="zap-title">Zap is the runtime behind the creative current.</h2>
              <p>
                An Agent Media Runtime keeps intent attached as ideas cross tools,
                agents, formats, and collaborators. Less handoff theater. More signal.
              </p>
            </header>
            <ol aria-label="The Agent Media Runtime" className={styles.runtimeMap} data-reveal>
              {runtimeStages.map(([index, title, copy]) => (
                <li key={index}>
                  <span>{index}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                  <i aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="horizon-title" className={`${styles.chapter} ${styles.horizon}`} id="horizon">
          <div className={styles.chapterMeta} data-reveal>
            <span>05 / Horizon</span>
            <span>Coming soon</span>
          </div>
          <div className={styles.horizonHeading} data-reveal>
            <p className={styles.eyebrow}>The elements still gathering</p>
            <h2 id="horizon-title">Water and Fire.</h2>
            <p>Two future layers for creators, culture, and the value that follows a release.</p>
          </div>
          <div className={styles.horizonPair} data-reveal>
            <article className={styles.waterPanel}>
              <span className={styles.horizonNumber}>W</span>
              <p className={styles.panelKicker}>Water / coming soon</p>
              <h3>Creator Bank</h3>
              <p>Tools for the resources and relationships that let creative work keep moving.</p>
            </article>
            <article className={styles.firePanel}>
              <span className={styles.horizonNumber}>F</span>
              <p className={styles.panelKicker}>Fire / coming soon</p>
              <h3>Entertainment prediction markets</h3>
              <p>A future lens on cultural attention, momentum, and the stories people are choosing.</p>
            </article>
          </div>
        </section>

        <section aria-label="Enter WZRD Studio" className={styles.closing}>
          <p>WZRD.tech / Creator OS</p>
          <a href="/home">Make the next signal <span aria-hidden="true">↗</span></a>
        </section>
      </main>

      <footer className={styles.siteFooter}>
        <span>© {new Date().getFullYear()} WZRD.tech</span>
        <span>Built for the work between the idea and the world.</span>
      </footer>
    </div>
  );
}
