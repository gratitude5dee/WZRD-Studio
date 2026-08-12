'use client';

import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Menu,
  Pause,
  Play,
  Sparkles,
} from 'lucide-react';
import { type KeyboardEvent, type TouchEvent, createElement, useEffect, useRef, useState } from 'react';

import cinemaNeonStreet from '@/assets/generated/music-polish/cinema-neon-street.png';
import cinemaSoundstage from '@/assets/generated/music-polish/cinema-soundstage.png';
import lyricsRnbGlass from '@/assets/generated/music-polish/lyrics-rnb-glass.png';
import rooftopChoreography from '@/assets/generated/music-polish/rooftop-choreography.png';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { appRoutes, buildLoginPath } from '@/lib/routes';
import { staticAssetUrl } from '@/lib/staticAsset';

import styles from './NativeCreatorLanding.module.css';

type ProductTourStep = {
  id: string;
  eyebrow: string;
  title: string;
  outcome: string;
  sourceRoute: string;
  imageSrc: string;
  imageAlt: string;
  ctaHref: string;
};

type MusicWorld = {
  genre: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
};

type SkyElement = HTMLElement & { progress: number };

const MOTION_STORAGE_KEY = 'wzrd:landing-motion';
const ENTER_STUDIO_HREF = buildLoginPath(appRoutes.kanvas);

const PRODUCT_TOUR_STEPS: ProductTourStep[] = [
  {
    id: 'anchor',
    eyebrow: '01 / Reference',
    title: 'Anchor the world before you generate.',
    outcome: 'Set the format, cast, and visual grammar once so every scene belongs to the same release.',
    sourceRoute: '/kanvas?studio=cinema',
    imageSrc: '/lovable-uploads/4e20f36a-2bff-48d8-b07b-257334e35506.png',
    imageAlt: 'WZRD Cinema Studio settings and cast workspace with format and visual style controls',
    ctaHref: ENTER_STUDIO_HREF,
  },
  {
    id: 'treatment',
    eyebrow: '02 / Treatment',
    title: 'Branch the treatment without losing the idea.',
    outcome: 'Move from a creative brief into connected shots, character studies, camera choices, and variations.',
    sourceRoute: '/studio',
    imageSrc: '/lovable-uploads/075616c6-e4fc-4662-a4b8-68b746782b65.png',
    imageAlt: 'WZRD Studio node canvas showing connected character, camera, and video generation branches',
    ctaHref: ENTER_STUDIO_HREF,
  },
  {
    id: 'release',
    eyebrow: '03 / Studio',
    title: 'Carry the decisions into production.',
    outcome: 'The same creative direction travels with the work across desktop and mobile instead of disappearing in handoffs.',
    sourceRoute: '/kanvas',
    imageSrc: '/creator-os/devices.png',
    imageAlt: 'WZRD creator dashboard shown across a laptop and phone',
    ctaHref: ENTER_STUDIO_HREF,
  },
];

const MUSIC_WORLDS: MusicWorld[] = [
  {
    genre: 'Hip-hop',
    title: 'Performance, movement, and pressure.',
    description: 'Block the street, the choreography, and the camera language before the first frame is rendered.',
    imageSrc: staticAssetUrl(cinemaNeonStreet),
    imageAlt: 'Hyperreal neon street performance music video still with controlled cyan rain light',
  },
  {
    genre: 'R&B',
    title: 'Light that leaves room for the vocal.',
    description: 'Build restrained lyric plates and intimate visual systems that can hold a full release campaign.',
    imageSrc: staticAssetUrl(lyricsRnbGlass),
    imageAlt: 'Minimal R&B lyric visual plate with black glass, warm coral light, and soft cyan fill',
  },
  {
    genre: 'Country',
    title: 'A place, a performance, a lived-in frame.',
    description: 'Turn narrative references into practical locations, grounded lighting, and camera-ready treatments.',
    imageSrc: staticAssetUrl(cinemaSoundstage),
    imageAlt: 'Hyperreal music video soundstage with practical lighting and camera rig',
  },
  {
    genre: 'Techno',
    title: 'Rhythm becomes spatial direction.',
    description: 'Map repetition, bodies, light, and edit energy into a visual world designed to move.',
    imageSrc: staticAssetUrl(rooftopChoreography),
    imageAlt: 'Hyperreal rooftop view of a choreographed movement sequence in a rain-lit city plaza',
  },
];

const SYSTEM_STAGES = [
  ['01', 'Reference', 'A lyric, voice note, frame, or product becomes the shared starting point.'],
  ['02', 'Direction', 'WZRD holds the treatment, cast, locations, and visual rules together.'],
  ['03', 'Production', 'Generate, edit, animate, and assemble without rebuilding the brief.'],
  ['04', 'Release', 'Carry the same world into films, lyric plates, covers, and commerce.'],
] as const;

function readStoredMotionPreference() {
  if (typeof window === 'undefined') return true;
  try {
    return window.sessionStorage.getItem(MOTION_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function useMotionPreference() {
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  // Keep the server render and the first client render deterministic. Reading
  // sessionStorage during hydration would otherwise make a returning visitor
  // with Motion off receive markup different from the HTML we just sent.
  const [userMotionEnabled, setUserMotionEnabled] = useState(true);

  useEffect(() => {
    setUserMotionEnabled(readStoredMotionPreference());
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateSystemPreference = () => setSystemReducedMotion(media.matches);
    updateSystemPreference();

    if (typeof media.addEventListener === 'function') media.addEventListener('change', updateSystemPreference);
    else media.addListener(updateSystemPreference);
    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', updateSystemPreference);
      else media.removeListener(updateSystemPreference);
    };
  }, []);

  const setMotionEnabled = (enabled: boolean) => {
    setUserMotionEnabled(enabled);
    try {
      window.sessionStorage.setItem(MOTION_STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  };

  return {
    motionEnabled: userMotionEnabled && !systemReducedMotion,
    setMotionEnabled,
    systemReducedMotion,
    userMotionEnabled,
  };
}

function useProgressiveSky(motionEnabled: boolean) {
  const [deviceAllowsShader, setDeviceAllowsShader] = useState(false);
  const [shaderRegistered, setShaderRegistered] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 48rem)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;

    const inspect = () => {
      if (!desktop.matches || connection?.saveData) {
        setDeviceAllowsShader(false);
        return;
      }

      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl');
        setDeviceAllowsShader(Boolean(gl));
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        setDeviceAllowsShader(false);
      }
    };

    inspect();
    if (typeof desktop.addEventListener === 'function') desktop.addEventListener('change', inspect);
    else desktop.addListener(inspect);
    return () => {
      if (typeof desktop.removeEventListener === 'function') desktop.removeEventListener('change', inspect);
      else desktop.removeListener(inspect);
    };
  }, []);

  useEffect(() => {
    if (!motionEnabled || !deviceAllowsShader || shaderRegistered) return;
    let cancelled = false;

    const register = () => {
      import('./wz-sky-element')
        .then(({ registerWzSkyElement }) => {
          if (cancelled) return;
          registerWzSkyElement();
          setShaderRegistered(true);
        })
        .catch(() => {
          // The static atmosphere is deliberately permanent, so module load
          // failure needs no visual recovery path beyond leaving it in place.
        });
    };

    const windowWithIdle = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const idleId = windowWithIdle.requestIdleCallback?.(register, { timeout: 900 });
    const timeoutId = idleId === undefined ? window.setTimeout(register, 80) : undefined;

    return () => {
      cancelled = true;
      if (idleId !== undefined) windowWithIdle.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [deviceAllowsShader, motionEnabled, shaderRegistered]);

  return { deviceAllowsShader, shaderRegistered };
}

function ProductTour() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [filmOpen, setFilmOpen] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const touchStart = useRef<number | null>(null);
  const activeStep = PRODUCT_TOUR_STEPS[activeIndex];

  const selectStep = (index: number, focus = false) => {
    const boundedIndex = (index + PRODUCT_TOUR_STEPS.length) % PRODUCT_TOUR_STEPS.length;
    setActiveIndex(boundedIndex);
    if (focus) window.requestAnimationFrame(() => tabRefs.current[boundedIndex]?.focus());
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      selectStep(index + 1, true);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectStep(index - 1, true);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectStep(0, true);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectStep(PRODUCT_TOUR_STEPS.length - 1, true);
    }
  };

  const handleTouchStart = (event: TouchEvent) => {
    touchStart.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = null;
    if (start === null || end === undefined || Math.abs(end - start) < 48) return;
    selectStep(activeIndex + (end < start ? 1 : -1));
  };

  return (
    <section id="product-tour" className={styles.tourSection} aria-labelledby="tour-title" data-reveal>
      <div className={styles.sectionHeading}>
        <p className={styles.kicker}>A real WZRD workflow</p>
        <h2 id="tour-title">From a reference to a world you can produce.</h2>
        <p>
          The treatment stays attached to the work, so the artist, director, and editor keep making the same film.
        </p>
      </div>

      <div className={styles.tourLayout}>
        <div className={styles.tourTabs} role="tablist" aria-label="Product tour steps">
          {PRODUCT_TOUR_STEPS.map((step, index) => (
            <button
              key={step.id}
              ref={node => { tabRefs.current[index] = node; }}
              id={`tour-tab-${step.id}`}
              type="button"
              role="tab"
              aria-controls={`tour-panel-${step.id}`}
              aria-selected={activeIndex === index}
              tabIndex={activeIndex === index ? 0 : -1}
              className={styles.tourTab}
              onClick={() => selectStep(index)}
              onKeyDown={event => handleTabKeyDown(event, index)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step.title}</strong>
            </button>
          ))}
        </div>

        <article
          id={`tour-panel-${activeStep.id}`}
          role="tabpanel"
          aria-labelledby={`tour-tab-${activeStep.id}`}
          className={styles.tourPanel}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className={styles.tourMedia} aria-busy={!loadedImages[activeStep.id] && !failedImages[activeStep.id]}>
            {!loadedImages[activeStep.id] && !failedImages[activeStep.id] && (
              <div className={styles.mediaLoading} aria-hidden="true">
                <span />
              </div>
            )}
            {failedImages[activeStep.id] ? (
              <div className={styles.mediaFallback} role="status">
                <Sparkles aria-hidden="true" />
                <strong>Preview unavailable</strong>
                <span>The source workspace is still available at {activeStep.sourceRoute}.</span>
              </div>
            ) : (
              <img
                key={activeStep.id}
                src={activeStep.imageSrc}
                alt={activeStep.imageAlt}
                width="1920"
                height="1200"
                loading={activeIndex === 0 ? 'eager' : 'lazy'}
                decoding="async"
                onLoad={() => setLoadedImages(current => ({ ...current, [activeStep.id]: true }))}
                onError={() => setFailedImages(current => ({ ...current, [activeStep.id]: true }))}
              />
            )}
          </div>

          <div className={styles.tourCopy}>
            <p className={styles.kicker}>{activeStep.eyebrow}</p>
            <h3>{activeStep.title}</h3>
            <p>{activeStep.outcome}</p>
            <div className={styles.tourActions}>
              <a href={activeStep.ctaHref} className={styles.textLink}>
                Enter this workflow <ArrowRight aria-hidden="true" />
              </a>
              <span>{activeStep.sourceRoute}</span>
            </div>
          </div>

          <div className={styles.tourPager} aria-label="Product tour navigation">
            <button type="button" onClick={() => selectStep(activeIndex - 1)} aria-label="Previous product tour step">
              <ChevronLeft aria-hidden="true" /> Previous
            </button>
            <span aria-live="polite">{activeIndex + 1} / {PRODUCT_TOUR_STEPS.length}</span>
            <button type="button" onClick={() => selectStep(activeIndex + 1)} aria-label="Next product tour step">
              Next <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </article>
      </div>

      <details className={styles.filmDetails} onToggle={event => setFilmOpen(event.currentTarget.open)}>
        <summary><Play aria-hidden="true" /> Watch the WZRD intro film</summary>
        {filmOpen && (
          <div className={styles.filmFrame}>
            <video controls preload="metadata" poster="/generated-media/video/wzrd-intro-poster.webp">
              <source src="/introani.mp4" type="video/mp4" />
              Your browser does not support HTML video. Continue through the product tour above.
            </video>
          </div>
        )}
      </details>
    </section>
  );
}

export default function NativeCreatorLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const skyRef = useRef<HTMLElement | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [shaderFailed, setShaderFailed] = useState(false);
  const { motionEnabled, setMotionEnabled, systemReducedMotion, userMotionEnabled } = useMotionPreference();
  const { deviceAllowsShader, shaderRegistered } = useProgressiveSky(motionEnabled);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!motionEnabled || systemReducedMotion || typeof IntersectionObserver === 'undefined') {
      reveals.forEach(element => { element.dataset.visible = 'true'; });
      setEnhanced(false);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.visible = 'true';
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -10%', threshold: 0.08 },
    );
    reveals.forEach(element => observer.observe(element));
    setEnhanced(true);
    return () => observer.disconnect();
  }, [motionEnabled, systemReducedMotion]);

  useEffect(() => {
    const sky = skyRef.current;
    const hero = heroRef.current;
    if (!sky || !hero || !shaderRegistered) return;

    const handleReady = () => setShaderFailed(false);
    const handleError = () => setShaderFailed(true);
    sky.addEventListener('wz-sky-ready', handleReady);
    sky.addEventListener('wz-sky-error', handleError);

    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      const bounds = hero.getBoundingClientRect();
      const travel = Math.max(1, hero.offsetHeight + window.innerHeight);
      (sky as SkyElement).progress = Math.max(0, Math.min(1, (window.innerHeight - bounds.top) / travel));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress);
    };
    updateProgress();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      sky.removeEventListener('wz-sky-ready', handleReady);
      sky.removeEventListener('wz-sky-error', handleError);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [shaderRegistered]);

  const showShader = shaderRegistered && deviceAllowsShader && motionEnabled && !shaderFailed;

  return (
    <div
      ref={rootRef}
      className={`dark ${styles.landing} ${enhanced ? styles.enhanced : ''} ${!motionEnabled ? styles.motionOff : ''}`}
    >
      <a className={styles.skipLink} href="#main-content">Skip to content</a>

      <header className={styles.header}>
        <a className={styles.wordmark} href="#top" aria-label="WZRD.tech home">
          <img src="/creator-os/wzrd-wordmark.png" alt="WZRD.tech" width="500" height="124" />
        </a>

        <nav className={styles.desktopNav} aria-label="Primary navigation">
          <a href="#product-tour">Product tour</a>
          <a href="#music-worlds">Music worlds</a>
          <a href="#system">How it works</a>
        </nav>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.motionToggle}
            aria-pressed={motionEnabled}
            disabled={systemReducedMotion}
            onClick={() => setMotionEnabled(!userMotionEnabled)}
          >
            {motionEnabled ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            <span>{systemReducedMotion ? 'Reduced motion' : `Motion ${motionEnabled ? 'on' : 'off'}`}</span>
          </button>
          <a href={ENTER_STUDIO_HREF} className={styles.headerCta}>Enter Studio</a>

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <button type="button" className={styles.menuButton} aria-label="Open navigation">
                <Menu aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className={styles.mobileSheet}>
              <SheetHeader>
                <SheetTitle>WZRD Creator OS</SheetTitle>
                <SheetDescription>Move through the product story or enter the studio.</SheetDescription>
              </SheetHeader>
              <nav className={styles.mobileNav} aria-label="Mobile navigation">
                <SheetClose asChild><a href="#product-tour">Product tour</a></SheetClose>
                <SheetClose asChild><a href="#music-worlds">Music worlds</a></SheetClose>
                <SheetClose asChild><a href="#next">Cinema + commerce</a></SheetClose>
                <SheetClose asChild><a href="#system">How it works</a></SheetClose>
                <button
                  type="button"
                  className={styles.mobileMotionToggle}
                  aria-pressed={motionEnabled}
                  disabled={systemReducedMotion}
                  onClick={() => setMotionEnabled(!userMotionEnabled)}
                >
                  {motionEnabled ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                  <span>{systemReducedMotion ? 'Reduced motion follows your device' : `Motion ${motionEnabled ? 'on' : 'off'}`}</span>
                </button>
                <SheetClose asChild><a href={ENTER_STUDIO_HREF} className={styles.mobileSheetCta}>Enter Studio</a></SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main id="main-content">
        <section ref={heroRef} id="top" className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.staticAtmosphere} data-static-atmosphere aria-hidden="true" />
          {createElement('wz-sky', {
            ref: skyRef,
            'aria-hidden': 'true',
            'data-hero-sky': 'true',
            class: `${styles.sky} ${showShader ? styles.skyVisible : ''}`,
            mode: motionEnabled ? 'full' : 'off',
            rays: '0.82',
          })}
          <div className={styles.heroScrim} aria-hidden="true" />
          <div className={styles.heroCoordinates} aria-hidden="true">
            <span>WZRD / CREATOR OS</span>
            <span>LOS ANGELES · EVERYWHERE</span>
          </div>

          <div className={styles.heroContent}>
            <p className={styles.kicker}>Creative infrastructure for independent culture</p>
            <h1 id="hero-title">Build the world around the record.</h1>
            <p className={styles.heroLead}>
              Turn a reference, a lyric, or a rough treatment into artist visuals, camera-ready scenes,
              and launch assets inside one creative system.
            </p>
            <div className={styles.heroActions}>
              <a href={ENTER_STUDIO_HREF} className={styles.primaryCta}>
                Enter Studio <ArrowRight aria-hidden="true" />
              </a>
              <a href="#product-tour" className={styles.secondaryCta}>
                <Play aria-hidden="true" /> Product tour
              </a>
            </div>
          </div>

          <div className={styles.genreRail} aria-label="Music directions">
            <span>Hip-hop</span><span>R&amp;B</span><span>Country</span><span>Techno</span>
          </div>
        </section>

        <ProductTour />

        <section id="music-worlds" className={styles.musicSection} aria-labelledby="music-title">
          <div className={styles.sectionHeading} data-reveal>
            <p className={styles.kicker}>Music first</p>
            <h2 id="music-title">One engine. Different visual grammar for every record.</h2>
            <p>Build a coherent world without sanding away the genre, the scene, or the artist.</p>
          </div>

          <ol className={styles.worldList}>
            {MUSIC_WORLDS.map((world, index) => (
              <li key={world.genre} className={styles.worldRow} data-reveal>
                <div className={styles.worldIndex}>{String(index + 1).padStart(2, '0')}</div>
                <div className={styles.worldCopy}>
                  <p className={styles.kicker}>{world.genre}</p>
                  <h3>{world.title}</h3>
                  <p>{world.description}</p>
                </div>
                <figure className={styles.worldVisual}>
                  <img src={world.imageSrc} alt={world.imageAlt} width="1672" height="940" loading="lazy" decoding="async" />
                </figure>
              </li>
            ))}
          </ol>
        </section>

        <section id="next" className={styles.horizonSection} aria-labelledby="horizon-title" data-reveal>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>The same engine, next</p>
            <h2 id="horizon-title">A treatment can travel beyond the music video.</h2>
          </div>
          <div className={styles.horizonLayout}>
            <article>
              <span>01 / Cinema</span>
              <h3>Build the treatment before the camera rolls.</h3>
              <p>Carry fictional performers, locations, visual motifs, and camera language into production-ready scene plans.</p>
              <a href={ENTER_STUDIO_HREF} className={styles.textLink}>Explore Cinema Studio <ArrowRight aria-hidden="true" /></a>
            </article>
            <article>
              <span>02 / Commerce</span>
              <h3>Give the product a place inside the world.</h3>
              <p>Stage objects, campaign frames, and release assets without separating commerce from the creative direction.</p>
              <a href={ENTER_STUDIO_HREF} className={styles.textLink}>Create campaign visuals <ArrowRight aria-hidden="true" /></a>
            </article>
          </div>
        </section>

        <section id="system" className={styles.systemSection} aria-labelledby="system-title">
          <div className={styles.sectionHeading} data-reveal>
            <p className={styles.kicker}>Plain-language infrastructure</p>
            <h2 id="system-title">The brief stays with the work.</h2>
            <p>No restart between ideation, generation, edit, and release.</p>
          </div>
          <ol className={styles.systemFlow}>
            {SYSTEM_STAGES.map(([index, title, description]) => (
              <li key={index} data-reveal>
                <span>{index}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-title" data-reveal>
          <p className={styles.kicker}>WZRD Creator OS</p>
          <h2 id="final-title">The record is the beginning.<br />Build everything around it.</h2>
          <a href={ENTER_STUDIO_HREF} className={styles.primaryCta}>
            Enter Studio <ArrowRight aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className={styles.footer}>
        <img src="/creator-os/wzrd-wordmark.png" alt="WZRD.tech" width="500" height="124" />
        <p>Creative infrastructure for artists with a world to build.</p>
        <div><a href="#top">Back to top</a><a href={ENTER_STUDIO_HREF}>Enter Studio</a></div>
      </footer>
    </div>
  );
}
