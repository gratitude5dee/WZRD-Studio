import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { PixelLayer, type PixelLayerVariant } from "./PixelLayer";
import "./PixelCard.css";

export interface PixelCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PixelLayerVariant;
  /** Disables the pixel effect (content still renders). */
  disabled?: boolean;
}

/** Container that overlays a hover-activated pixel shimmer behind its children. */
export const PixelCard = forwardRef<HTMLDivElement, PixelCardProps>(
  ({ variant = "wzrd", disabled = false, className, children, ...props }, ref) => (
    <div ref={ref} className={cn("pixel-card", className)} {...props}>
      <PixelLayer variant={variant} disabled={disabled} />
      <div className="pixel-card__content">{children}</div>
    </div>
  ),
);
PixelCard.displayName = "PixelCard";

export default PixelCard;
