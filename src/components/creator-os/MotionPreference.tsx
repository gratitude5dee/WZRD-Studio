"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type MotionPreference = {
  motionAllowed: boolean;
  motionLabel: "on" | "off" | "reduced";
  motionOn: boolean;
  reduced: boolean;
  toggleMotion: () => void;
};

const MotionPreferenceContext = createContext<MotionPreference | null>(null);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;

    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

function useMotionPreferenceState(): MotionPreference {
  const reduced = useReducedMotion();
  const [motionOn, setMotionOn] = useState(true);
  const motionAllowed = motionOn && !reduced;

  return useMemo(
    () => ({
      motionAllowed,
      motionLabel: reduced ? "reduced" : motionOn ? "on" : "off",
      motionOn,
      reduced,
      toggleMotion: () => setMotionOn((value) => !value),
    }),
    [motionAllowed, motionOn, reduced],
  );
}

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const preference = useMotionPreferenceState();
  return <MotionPreferenceContext.Provider value={preference}>{children}</MotionPreferenceContext.Provider>;
}

export function useMotionPreference() {
  const preference = useContext(MotionPreferenceContext);
  if (!preference) throw new Error("useMotionPreference must be used inside MotionPreferenceProvider");
  return preference;
}
