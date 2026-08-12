'use client';

import {
  ArrowDown,
  ArrowUpRight,
  Menu,
  Pause,
  Play,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { createElement, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef, useState } from 'react';

import { appRoutes, buildLoginPath } from '@/lib/routes';

import styles from './CreatorOSRebuild.module.css';

type FxMode = 'full' | 'calm' | 'off';
type SkyElement = HTMLElement & { progress: number };

const FX_MODE_STORAGE_KEY = 'wzrd:creator-os-motion';
const ENTER_STUDIO_HREF = buildLoginPath(appRoutes.kanvas);

const BUBBLE_NAV = [
  { href: '#air', label: 'air', tone: 'air' },
  { href: '#studio', label: 'studio', tone: 'studio' },
  { href: '#earth', label: 'earth', tone: 'earth' },
  { href: '#zap', label: 'zap', tone: 'zap' },
  { href: '#coming-soon', label: 'fire+water', tone: 'water' },
  { href: ENTER_STUDIO_HREF, label: 'enter studio', tone: 'cream' },
] as const;

const ZAP_STEPS = [
  {
    chips: ['zap init', 'match-day/'],
    copy: 'One command scaffolds the skill directory, package scripts, and a sample recipe.',
    label: 'scaffold',
    number: '01',
    title: 'Init the project',
  },
  {
    chips: ['Zap.md', 'SKILL.md', 'prompt files'],
    copy: 'Inputs, steps, provider routes, and budget cap live together in a single Zap.md file.',
    label: 'author',
    number: '02',
    title: 'Write the recipe',
  },
  {
    chips: ['cap_usd', 'plan-only'],
    copy: 'zap validate checks the contract; zap lint flags live-provider defaults before anything runs.',
    label: 'validate',
    number: '03',
    title: 'Guard the spend',
  },
  {
    chips: ['--live', 'GMI Cloud · fal'],
    copy: 'Every run defaults to a zero-cost mock. Add --live and the budget cap is enforced before a provider job submits.',
    label: 'run',
    number: '04',
    title: 'Mock, then live',
  },
] as const;

const EARTH_ROLES = [
  { channel: 'AIR', description: 'Holds a fragment long enough to become a direction.', role: 'Signal Keeper' },
  { channel: 'STUDIO', description: 'Finds rhythm between rush and restraint.', role: 'Cut Director' },
  { channel: 'EARTH', description: 'Gives the release a room to live in.', role: 'Worldbuilder' },
  { channel: 'ZAP', description: 'Keeps every decision attached to the work.', role: 'Runtime Steward' },
] as const;

const FIRE_DATA = [
  {
    description: 'Stewards the development and maintenance of the DATA Network and Trace. It is the governance entity behind the network, not the product.',
    label: 'The DATA Foundation',
  },
  {
    description: 'The open protocol where real human data is sourced, proven, and processed to train the world\'s leading AI models.',
    label: 'The DATA Network',
  },
  {
    description: 'The public audit layer where any record on DATA Network can be verified — provenance, consent, license, and payment — with contributor identity kept private.',
    label: 'Trace',
  },
] as const;

function clamp(value: number, lower = 0, upper = 1) {
  return Math.min(upper, Math.max(lower, value));
}

function timecodeFromProgress(progress: number) {
  const totalSeconds = Math.round(clamp(progress) * 374);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(part => String(part).padStart(2, '0')).join(':');
}

function readStoredFxMode(): FxMode {
  if (typeof window === 'undefined') return 'full';
  try {
    const stored = window.sessionStorage.getItem(FX_MODE_STORAGE_KEY);
    return stored === 'calm' || stored === 'off' ? stored : 'full';
  } catch {
    return 'full';
  }
}

function useFxMode() {
  const [userMode, setUserMode] = useState<FxMode>('full');
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  useEffect(() => {
    const storedMode = readStoredFxMode();
    setUserMode(storedMode);
    document.documentElement.dataset.wzrdCreatorMotion = storedMode;
    // `matchMedia` is universally present in current browsers, but the
    // Creator OS should still render its static composition in embedded or
    // older webviews where it is unavailable.
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystemReducedMotion(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  const cycleMode = () => {
    setUserMode(current => {
      const next: FxMode = current === 'full' ? 'calm' : current === 'calm' ? 'off' : 'full';
      try {
        window.sessionStorage.setItem(FX_MODE_STORAGE_KEY, next);
      } catch {
        // Session state is still valid when storage has been disabled.
      }
      document.documentElement.dataset.wzrdCreatorMotion = next;
      return next;
    });
  };

  return {
    cycleMode,
    fxMode: systemReducedMotion ? ('off' as FxMode) : userMode,
    systemReducedMotion,
  };
}

function useSectionMotionActivity(rootRef: RefObject<HTMLDivElement | null>, fxMode: FxMode) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-motion-section]'));
    const setActive = (section: HTMLElement, active: boolean) => {
      section.dataset.motionActive = active ? 'true' : 'false';
    };

    if (fxMode === 'off' || typeof IntersectionObserver === 'undefined') {
      sections.forEach(section => setActive(section, false));
      return;
    }

    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => setActive(entry.target as HTMLElement, entry.isIntersecting)),
      { rootMargin: '12% 0px 12% 0px', threshold: 0.01 },
    );
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [fxMode, rootRef]);
}

function useDesktopViewport() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(min-width: 860px)');
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  return desktop;
}

function useProgressiveSky(fxMode: FxMode, desktop: boolean) {
  const [canUseShader, setCanUseShader] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!desktop || fxMode === 'off' || connection?.saveData) {
      setCanUseShader(false);
      return;
    }

    try {
      const probe = document.createElement('canvas');
      const context = probe.getContext('webgl');
      setCanUseShader(Boolean(context));
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      setCanUseShader(false);
    }
  }, [desktop, fxMode]);

  useEffect(() => {
    if (!canUseShader || registered) return;
    let cancelled = false;
    const load = () => {
      import('./wz-sky-element')
        .then(({ registerWzSkyElement }) => {
          if (cancelled) return;
          registerWzSkyElement();
          setRegistered(true);
        })
        .catch(() => {
          // The CSS atmosphere remains present if the optional module cannot load.
        });
    };

    const idleWindow = window as Window & {
      cancelIdleCallback?: (id: number) => void;
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    const idleId = idleWindow.requestIdleCallback?.(load, { timeout: 900 });
    const timeoutId = idleId === undefined ? window.setTimeout(load, 80) : undefined;

    return () => {
      cancelled = true;
      if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [canUseShader, registered]);

  return { canUseShader, registered };
}

function EarthWheel({ fxMode }: { fxMode: FxMode }) {
  const [rotation, setRotation] = useState(-18);
  const drag = useRef<{ pointerId: number; start: number; rotation: number } | null>(null);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { pointerId: event.pointerId, rotation, start: event.clientX };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setRotation(current.rotation + (event.clientX - current.start) * 0.22);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setRotation(current => current - 12);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setRotation(current => current + 12);
    }
  };

  return (
    <div
      aria-label="Creative Universe. Drag left or right, or use arrow keys, to explore the roles behind a release."
      className={styles.earthWheel}
      data-motion={fxMode}
      onKeyDown={handleKeyboard}
      onPointerCancel={endDrag}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      role="region"
      tabIndex={0}
    >
      <div aria-hidden="true" className={styles.earthWheelCore} />
      {EARTH_ROLES.map((item, index) => {
        const angle = rotation + index * 90;
        return (
          <article
            className={styles.earthRole}
            key={item.channel}
            style={{
              '--earth-angle': `${angle}deg`,
              '--earth-negative-angle': `${-angle}deg`,
            } as CSSProperties}
          >
            <span>{item.channel}</span>
            <strong>{item.role}</strong>
            <p>{item.description}</p>
          </article>
        );
      })}
      <p className={styles.earthWheelHint}>Drag the wheel</p>
    </div>
  );
}

function FireAndWater({ fxMode }: { fxMode: FxMode }) {
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [fireVisible, setFireVisible] = useState(false);
  const fireRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const card = fireRef.current;
    if (!card) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.some(entry => entry.isIntersecting);
        setFireVisible(visible);
      },
      { rootMargin: '220px 0px' },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (fxMode === 'full' && fireVisible) {
      void video.play().catch(() => {
        // The poster remains a complete state when autoplay is unavailable.
      });
      return;
    }
    video.pause();
  }, [fireVisible, fxMode]);

  return (
    <section aria-labelledby="fire-water-title" className={`${styles.chapter} ${styles.fireWater}`} data-motion-section id="coming-soon">
      <div className={styles.sectionRail} data-reveal>
        <span>05 / Fire+Water</span>
        <span>Coming soon</span>
      </div>
      <div className={styles.chapterIntro} data-reveal>
        <p className={styles.eyebrow}>The elements still gathering</p>
        <h2 id="fire-water-title">Fire and Water.</h2>
        <p>Two future layers for creators, culture, and the value that follows a release.</p>
      </div>

      <div className={styles.fireWaterGrid} data-reveal>
        <a
          className={`${styles.futureCard} ${styles.waterCard}`}
          href="https://joinopenstandard.com/"
          rel="noreferrer"
          target="_blank"
        >
          <span aria-hidden="true" className={styles.waterField} data-motion={fxMode} />
          <p className={styles.cardEyebrow}>Water / coming soon</p>
          <h3>WTR - Powered by The Data FDN</h3>
          <p>Financial infrastructure for the creator economy from stream-backed creative credit loans and embedded banking for artists and talent buyers, powered by $5DEE built on OpenUSD.</p>
          <span className={styles.cardLink}>Read Our Whitepaper <ArrowUpRight aria-hidden="true" /></span>
        </a>

        <article className={`${styles.futureCard} ${styles.fireCard}`} ref={fireRef}>
          <span aria-hidden="true" className={styles.firePoster} />
          {fireVisible && fxMode === 'full' ? (
            <video
              aria-hidden="true"
              className={styles.fireVideo}
              loop
              muted
              playsInline
              poster="/creator-os/assets/fire-water-loop-poster.jpg"
              preload="metadata"
              ref={videoRef}
            >
              <source src="/creator-os/assets/fire-water-loop.mp4" type="video/mp4" />
            </video>
          ) : null}
          <span aria-hidden="true" className={styles.firePixels} data-motion={fxMode} />
          <p className={styles.cardEyebrow}>FYE 🔥 / coming soon</p>
          <h3>FYE 🔥, Fifth Spaces</h3>
          <p>Physical spaces for creatives, technologists, and builders. Generative media studios and performance spaces operating as cultural nodes for verified human experiences. Partnering with the DATAFDN and Frontier Labs for anonymized data collection.</p>
          <div className={styles.fireDataList}>
            {FIRE_DATA.map((item, index) => {
              const isActive = activeCard === index;
              return (
                <button
                  aria-expanded={isActive}
                  className={styles.fireDataCard}
                  key={item.label}
                  onBlur={() => setActiveCard(current => current === index ? null : current)}
                  onClick={() => setActiveCard(current => current === index ? null : index)}
                  onPointerEnter={() => setActiveCard(index)}
                  onPointerLeave={() => setActiveCard(null)}
                  type="button"
                >
                  <span>{item.label}</span>
                  <p>{item.description}</p>
                </button>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}

export default function CreatorOSRebuild() {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const studioRef = useRef<HTMLElement>(null);
  const skyRef = useRef<SkyElement | null>(null);
  const skipRef = useRef<HTMLAnchorElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastMenuFocus = useRef<HTMLElement | null>(null);
  const menuFocusTarget = useRef<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [shaderFailed, setShaderFailed] = useState(false);
  const [studioTime, setStudioTime] = useState('00:00:00');
  const { cycleMode, fxMode, systemReducedMotion } = useFxMode();
  const desktop = useDesktopViewport();
  const { canUseShader, registered } = useProgressiveSky(fxMode, desktop);

  useSectionMotionActivity(rootRef, fxMode);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (fxMode === 'off' || typeof IntersectionObserver === 'undefined') {
      elements.forEach(element => { element.dataset.visible = 'true'; });
      setEnhanced(false);
      return;
    }

    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).dataset.visible = 'true';
        observer.unobserve(entry.target);
      }),
      { rootMargin: '0px 0px -14%', threshold: 0.02 },
    );
    elements.forEach(element => observer.observe(element));
    setEnhanced(true);
    return () => observer.disconnect();
  }, [fxMode]);

  useEffect(() => {
    if (!menuOpen) return;
    lastMenuFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = [skipRef.current, headerRef.current, mainRef.current].filter((element): element is HTMLElement => Boolean(element));
    background.forEach(element => {
      element.setAttribute('aria-hidden', 'true');
      (element as HTMLElement & { inert?: boolean }).inert = true;
    });
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('a, button')?.focus());
    const trapFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !menuRef.current) return;
      const focusable = Array.from(menuRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      background.forEach(element => {
        element.removeAttribute('aria-hidden');
        (element as HTMLElement & { inert?: boolean }).inert = false;
      });
      const target = menuFocusTarget.current;
      menuFocusTarget.current = null;
      window.requestAnimationFrame(() => {
        if (target?.startsWith('#')) {
          const destination = document.querySelector<HTMLElement>(target);
          if (destination) {
            destination.tabIndex = -1;
            destination.focus({ preventScroll: true });
          }
          return;
        }
        if (!target) lastMenuFocus.current?.focus();
      });
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!desktop || fxMode === 'off') return;
    const root = rootRef.current;
    const hero = heroRef.current;
    const studio = studioRef.current;
    const sky = skyRef.current;
    if (!root || !hero || !studio) return;

    let animationFrame = 0;
    let heroProgress = 0;
    let studioProgress = 0;
    let nextTime = '00:00:00';
    const apply = () => {
      animationFrame = 0;
      const dashboardProgress = clamp((heroProgress - 0.38) / 0.48);
      const copyProgress = clamp((heroProgress - 0.52) / 0.36);
      root.style.setProperty('--hero-progress', heroProgress.toFixed(4));
      root.style.setProperty('--dashboard-opacity', dashboardProgress.toFixed(4));
      root.style.setProperty('--dashboard-shift', `${(1 - dashboardProgress) * 4.5}rem`);
      root.style.setProperty('--hero-copy-opacity', (1 - copyProgress * 0.58).toFixed(4));
      root.style.setProperty('--hero-copy-shift', `${copyProgress * -2.2}rem`);
      root.style.setProperty('--studio-progress', studioProgress.toFixed(4));
      if (sky) sky.progress = heroProgress;
      setStudioTime(current => current === nextTime ? current : nextTime);
    };
    const measure = () => {
      const heroBounds = hero.getBoundingClientRect();
      const heroTravel = Math.max(1, hero.offsetHeight - window.innerHeight);
      heroProgress = clamp(-heroBounds.top / heroTravel);
      const studioBounds = studio.getBoundingClientRect();
      studioProgress = clamp((window.innerHeight - studioBounds.top) / (window.innerHeight + studioBounds.height));
      nextTime = timecodeFromProgress(studioProgress);
      if (!animationFrame) animationFrame = window.requestAnimationFrame(apply);
    };

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [desktop, fxMode, registered]);

  useEffect(() => {
    const sky = skyRef.current;
    if (!sky || !registered) return;
    const onReady = () => setShaderFailed(false);
    const onError = () => setShaderFailed(true);
    setShaderFailed(sky.dataset.wzSkyStatus === 'error');
    sky.addEventListener('wz-sky-ready', onReady);
    sky.addEventListener('wz-sky-error', onError);
    return () => {
      sky.removeEventListener('wz-sky-ready', onReady);
      sky.removeEventListener('wz-sky-error', onError);
    };
  }, [registered]);

  const showSky = registered && canUseShader && !shaderFailed && fxMode !== 'off';
  const motionLabel = systemReducedMotion ? 'Reduced' : fxMode === 'full' ? 'Motion' : fxMode === 'calm' ? 'Calm' : 'Still';
  const closeMenu = (target?: string) => {
    menuFocusTarget.current = target ?? null;
    setMenuOpen(false);
  };

  return (
    <div
      className={styles.landing}
      data-enhanced={enhanced || undefined}
      data-fx={fxMode}
      ref={rootRef}
    >
      <a className={styles.skipLink} href="#creator-os-main" ref={skipRef}>Skip to Creator OS</a>

      <header className={styles.header} ref={headerRef}>
        <a aria-label="WZRD.tech home" className={styles.logoControl} href="#top">
          <img alt="WZRD.tech" height="396" src="/creator-os/wzrd-wordmark-1600.png" width="1600" />
        </a>
        <div className={styles.headerControls}>
          <button
            aria-label={systemReducedMotion ? 'Motion is reduced by your device setting' : `Atmosphere: ${motionLabel}. Change motion setting.`}
            aria-pressed={fxMode !== 'off'}
            className={styles.motionControl}
            disabled={systemReducedMotion}
            onClick={cycleMode}
            type="button"
          >
            {fxMode === 'off' ? <Play aria-hidden="true" /> : fxMode === 'calm' ? <SlidersHorizontal aria-hidden="true" /> : <Pause aria-hidden="true" />}
            <span>{motionLabel}</span>
          </button>
          <button
            aria-controls="creator-os-menu"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            className={styles.menuControl}
            onClick={() => menuOpen ? closeMenu() : setMenuOpen(true)}
            type="button"
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div aria-label="Creator OS navigation" aria-modal="true" className={styles.menuOverlay} id="creator-os-menu" ref={menuRef} role="dialog">
          <button aria-label="Close navigation" className={`${styles.menuControl} ${styles.drawerClose}`} onClick={() => closeMenu()} type="button">
            <X aria-hidden="true" />
          </button>
          <nav aria-label="Creator OS chapters" className={styles.bubbleNav}>
            {BUBBLE_NAV.map((item, index) => (
              <a
                className={`${styles.bubbleLink} ${styles[`bubble${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}
                href={item.href}
                key={item.label}
                onClick={() => closeMenu(item.href)}
                style={{ '--bubble-rotation': `${[-8, 6, -6, 8, -4, 4][index]}deg`, '--bubble-delay': `${index * 70}ms` } as CSSProperties}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      ) : null}

      <main id="creator-os-main" ref={mainRef}>
        <section aria-labelledby="hero-title" className={styles.hero} data-motion-section id="top" ref={heroRef}>
          <div className={styles.heroFrame}>
            <div aria-hidden="true" className={styles.heroAtmosphere} />
            {showSky ? createElement('wz-sky', {
              ref: skyRef,
              'aria-hidden': 'true',
              class: styles.heroSky,
              mode: fxMode,
              rays: fxMode === 'calm' ? '0.48' : '0.9',
            }) : null}
            <div aria-hidden="true" className={styles.heroDither} data-motion={fxMode} />
            <div aria-hidden="true" className={styles.heroGrain} />
            <div aria-hidden="true" className={styles.heroMarks}>
              <span>LAT 34.0224° N</span>
              <span>ALT +∞</span>
            </div>

            <div className={styles.heroCopy}>
              <h1 className={styles.screenReaderOnly} id="hero-title">WZRD.tech Creator OS</h1>
              <p className={styles.heroEyebrow}>A creator operating system</p>
              <img alt="WZRD.tech" className={styles.heroWordmark} fetchPriority="high" height="396" src="/creator-os/wzrd-wordmark-1600.png" width="1600" />
              <p className={styles.heroTitle}><span>Creative</span><span>Infrastructure</span></p>
              <p className={styles.heroStatement}>Building digital and physical generative media studio to create, distribute, and monetize across all channels on one platform.</p>
              <a className={styles.heroEnter} href="#studio">Scroll to enter <ArrowDown aria-hidden="true" /></a>
            </div>

            <div aria-hidden="true" className={styles.heroDashboard}>
              <div className={styles.dashboardScrim} />
              <div className={styles.dashboardCopy}>
                <p>An Attention Engine</p>
                <strong>Your unified creative infrastructure to take action across 1000s of models, applications, and integrations.</strong>
              </div>
              <img alt="" height="373" src="/creator-os/devices.png" width="669" />
            </div>

            <div aria-hidden="true" className={styles.heroHud}>
              <span>Scroll to enter</span><i /><span>01 / 05</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="studio-title" className={`${styles.chapter} ${styles.studio}`} data-motion-section id="studio" ref={studioRef}>
          <div aria-hidden="true" className={styles.studioField} data-motion={fxMode} />
          <div className={styles.sectionRail} data-reveal><span>01 / Studio</span><span>A Generative Media Studio, in your pocket</span></div>
          <div className={styles.studioLayout}>
            <div className={styles.chapterIntro} data-reveal>
              <h2 id="studio-title">Make the cut without leaving the conversation.</h2>
              <p>Studio is a mobile creative room. Collect references, direct the agents, shape a sequence, and take the work to the next room when it is ready.</p>
            </div>
            <figure className={styles.studioStudy} data-reveal>
              <div className={styles.studyTopline}><span>Studio / interface study</span><span>{studioTime}</span></div>
              <div className={styles.studyScreen}>
                <img alt="WZRD creator dashboard shown across desktop and mobile" height="373" loading="lazy" src="/creator-os/devices.png" width="669" />
              </div>
              <div className={styles.studyTimeline} aria-hidden="true"><i /><span>Scroll to scrub</span></div>
            </figure>
            <ol className={styles.studioSteps} data-reveal>
              <li><span>01</span><p><strong>Gather</strong> Voice notes, images, fragments, and references.</p></li>
              <li><span>02</span><p><strong>Direct</strong> Give the work an angle, a tempo, a reason to exist.</p></li>
              <li><span>03</span><p><strong>Release</strong> Move the finished signal into the culture around it.</p></li>
            </ol>
          </div>
        </section>

        <section aria-labelledby="zap-title" className={`${styles.chapter} ${styles.zap}`} data-motion-section id="zap">
          <div aria-hidden="true" className={styles.zapField} data-motion={fxMode} />
          <div className={styles.sectionRail} data-reveal><span>02 / Zap</span><span>Agent Media Runtime</span></div>
          <div className={styles.zapLayout}>
            <div className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>Agent media runtime · v0.3.0</p>
              <h2 id="zap-title">Zap is the recipe runtime behind every release.</h2>
              <p>File-first media recipes for agents, creators, and operators. Prompts, provider routes, budget caps, and output shape stay inspectable — mock by default, live only when you say so.</p>
              <a className={styles.inlineLink} href="https://docs.zap.wzrd.tech" rel="noreferrer" target="_blank">Runtime spec · docs.zap.wzrd.tech <ArrowUpRight aria-hidden="true" /></a>
            </div>
            <ol className={styles.zapList} data-reveal>
              {ZAP_STEPS.map(step => (
                <li key={step.number}>
                  <span>{step.number}</span>
                  <div>
                    <p>{step.label}</p><h3>{step.title}</h3><p>{step.copy}</p>
                    <ul>{step.chips.map(chip => <li key={chip}>{chip}</li>)}</ul>
                  </div>
                  <i aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="earth-title" className={`${styles.chapter} ${styles.earth}`} data-motion-section id="earth">
          <div aria-hidden="true" className={styles.earthField} data-motion={fxMode} />
          <div className={styles.sectionRail} data-reveal><span>03 / Earth</span><span>Artist discovery</span></div>
          <div className={styles.earthLayout}>
            <div className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>Artist Discovery</p>
              <h2 id="earth-title">Enter the Creative Universe.</h2>
              <p>Drag the wheel to move through the makers, roles, and rooms behind every release — a living map of who carries the work forward.</p>
            </div>
            <EarthWheel fxMode={fxMode} />
            <aside className={styles.earthAside} data-reveal>
              <span>The creative landscape</span><strong>No release moves alone.</strong><a href="#air">Access Earth Tones <ArrowDown aria-hidden="true" /></a>
            </aside>
          </div>
        </section>

        <section aria-labelledby="air-title" className={`${styles.chapter} ${styles.air}`} data-motion-section id="air">
          <div aria-hidden="true" className={styles.airField} data-motion={fxMode} />
          <div className={styles.sectionRail} data-reveal><span>04 / Air</span><span>Intent, received</span></div>
          <div className={styles.airLayout}>
            <div className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>Air powered by Zaps, your creative assistant</p>
              <h2 id="air-title">Air by WZRD Tech is your creative assistant that lives in your iMessages.</h2>
              <p>A messages-native creative agent that hears the cue, asks the one question that matters, and turns the answer into momentum.</p>
              <a className={styles.inlineLink} href={ENTER_STUDIO_HREF}>Access Air via iMessage <ArrowDown aria-hidden="true" /></a>
            </div>
            <article aria-label="Prototype Air transcript" className={styles.airThread} data-reveal>
              <header><div><strong>Air</strong><span>creative agent</span></div><em>available</em></header>
              <p className={styles.transcriptDisclosure}>Prototype transcript · fictional, consent-safe</p>
              <div className={styles.messages}>
                <p className={styles.human}><span>/imagine Four shots. Night city. No rush.</span><small>Sent</small></p>
                <p className={styles.agent}><span>Imagining…</span></p>
                <p className={styles.agent}><span>I hear a quiet opener, a bright interruption, then room for the last beat.</span><small>Working</small></p>
                <p className={styles.human}><span>/director Keep the last beat quiet.</span><small>Approved</small></p>
                <p className={styles.agent}><span>Directing…</span></p>
                <p className={styles.human}><span>/create release packet.</span><small>Sent</small></p>
                <p className={styles.locked}><span>Locked. I&apos;ll carry the silence into the cut sheet.</span><small>Delivered</small></p>
              </div>
              <footer>Send a thought <span aria-hidden="true">↑</span></footer>
            </article>
          </div>
        </section>

        <FireAndWater fxMode={fxMode} />

        <section aria-label="Enter WZRD Studio" className={styles.closing} data-motion-section id="enter">
          <div aria-hidden="true" className={styles.closingBurst} data-motion={fxMode} />
          <div className={styles.closingInner}>
            <div><img alt="WZRD.tech" height="396" src="/creator-os/wzrd-wordmark-1600.png" width="1600" /><p>WZRD.tech / Creator OS</p></div>
            <a href={ENTER_STUDIO_HREF}>Make the next signal <ArrowUpRight aria-hidden="true" /></a>
          </div>
        </section>
      </main>
    </div>
  );
}
