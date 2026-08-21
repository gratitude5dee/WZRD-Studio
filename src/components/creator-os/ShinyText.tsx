import type { CSSProperties, ReactNode } from "react";

import styles from "./ShinyText.module.css";

type ShinyTextProps = {
  children: ReactNode;
  className?: string;
  duration?: number;
};

/**
 * A composable, CSS-driven interpretation of the React Bits shimmer. Keeping
 * the sweep in CSS avoids a requestAnimationFrame loop for every text label.
 */
export default function ShinyText({ children, className, duration = 4.8 }: ShinyTextProps) {
  return (
    <span
      className={[styles.shinyText, className].filter(Boolean).join(" ")}
      style={{ "--shiny-duration": `${duration}s` } as CSSProperties}
    >
      {children}
    </span>
  );
}
