import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface KanvasTabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface KanvasTabsProps<T extends string = string>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: ReadonlyArray<KanvasTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tab strip. */
  label: string;
}

/**
 * Underlined tab strip (Explore / History, Presets / Uploads). Renders a real
 * `tablist` of buttons with roving `tabIndex`; panels are owned by the caller.
 */
function KanvasTabsInner<T extends string>(
  { className, items, value, onChange, label, ...props }: KanvasTabsProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      className={cn("flex items-center gap-1", className)}
      {...props}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 border-b-2 px-3 text-xs font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kanvas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-kanvas-bg disabled:cursor-not-allowed disabled:opacity-40",
              active
                ? "border-kanvas-accent text-kanvas-text-primary"
                : "border-transparent text-kanvas-text-muted hover:text-kanvas-text-secondary",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export const KanvasTabs = forwardRef(KanvasTabsInner) as <T extends string>(
  props: KanvasTabsProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => ReturnType<typeof KanvasTabsInner>;
