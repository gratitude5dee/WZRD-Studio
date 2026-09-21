'use client';

import { Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react';

import type { MotionSplatManifest } from '@/types/motionSplat';
import {
  isWebGL2Available,
  markSplatIntroSeen,
  probeIntroManifest,
  resolveIntroManifestUrl,
  shouldShowSplatIntro,
} from '@/components/landing/introGate';

const SplatIntroOverlay = lazy(() => import('@/components/landing/SplatIntroOverlay'));

type Phase = 'ssr' | 'probing' | 'active' | 'done';

export interface LandingIntroGateProps {
  /** The landing content. SSR and the first client render always show it. */
  children: ReactNode;
  /** Overrides the manifest URL (env/default otherwise). */
  manifestUrl?: string;
}

/**
 * Hydration-safe gate for the wzrd.tech intro. On the server and the first
 * client render it renders its children untouched. After mount, if the
 * motion-splat intro should show, it raises a black shield and unmounts the
 * children so their WebGL scenes release the GPU while the intro plays.
 */
export default function LandingIntroGate({ children, manifestUrl }: LandingIntroGateProps) {
  const [phase, setPhase] = useState<Phase>('ssr');
  const [manifest, setManifest] = useState<MotionSplatManifest | null>(null);

  useEffect(() => {
    if (!shouldShowSplatIntro() || !isWebGL2Available()) {
      setPhase('done');
      return;
    }
    let cancelled = false;
    setPhase('probing');
    probeIntroManifest(resolveIntroManifestUrl(manifestUrl)).then((result) => {
      if (cancelled) return;
      if (!result) {
        setPhase('done');
        return;
      }
      setManifest(result);
      setPhase('active');
    });
    return () => {
      cancelled = true;
    };
  }, [manifestUrl]);

  useEffect(() => {
    if (phase !== 'probing' && phase !== 'active') return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    root.dataset.introActive = 'true';
    return () => {
      root.style.overflow = previousOverflow;
      delete root.dataset.introActive;
    };
  }, [phase]);

  const finish = useCallback(() => {
    markSplatIntroSeen();
    setPhase('done');
  }, []);

  if (phase === 'ssr' || phase === 'done') {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[99999] bg-black" data-testid="landing-intro-gate" data-phase={phase}>
      {phase === 'active' && manifest && (
        <Suspense fallback={null}>
          <SplatIntroOverlay manifest={manifest} onComplete={finish} onError={finish} />
        </Suspense>
      )}
    </div>
  );
}
