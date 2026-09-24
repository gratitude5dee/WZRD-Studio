'use client';

import { Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react';

import type { MotionSplatManifest } from '@/types/motionSplat';
import {
  isWebGL2Available,
  markSplatIntroMissing,
  markSplatIntroSeen,
  probeIntroManifest,
  resolveIntroManifestUrl,
  shouldShowSplatIntro,
} from '@/components/landing/introGate';

const SplatIntroOverlay = lazy(() => import('@/components/landing/SplatIntroOverlay'));

/** Longest the black shield may cover the page while the manifest is probed. */
const PROBE_SHIELD_TIMEOUT_MS = 4_000;
/** Longest the shield may stay up waiting for the intro chunk and its first frame. */
const OVERLAY_SHIELD_TIMEOUT_MS = 30_000;

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
        // No asset on this deployment: remember it so the rest of the session
        // never raises the shield again.
        markSplatIntroMissing();
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

  // The shield must never outlive its purpose: if the probe hangs or the intro
  // chunk fails to download, hand the page back.
  useEffect(() => {
    if (phase !== 'probing' && phase !== 'active') return;
    const limit = phase === 'probing' ? PROBE_SHIELD_TIMEOUT_MS : OVERLAY_SHIELD_TIMEOUT_MS;
    const timer = setTimeout(() => setPhase('done'), limit);
    return () => clearTimeout(timer);
  }, [phase]);

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
    <>
      {/*
        While probing we only cover the landing: the probe usually finds nothing
        (no intro asset shipped), and unmounting here would tear down and rebuild
        the hero's own WebGL scene for nothing. Once the intro really starts, the
        children come out so a single WebGL context is live at a time.
      */}
      {phase === 'probing' && children}
      <div className="fixed inset-0 z-[99999] bg-black" data-testid="landing-intro-gate" data-phase={phase}>
        {phase === 'active' && manifest && (
          <Suspense fallback={null}>
            <SplatIntroOverlay manifest={manifest} onComplete={finish} onError={finish} />
          </Suspense>
        )}
      </div>
    </>
  );
}
