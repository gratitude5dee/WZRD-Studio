import './craft.css';

/**
 * Floating action bar for bulk selection.
 * Pops in above the content when items are selected: a count chip,
 * caller-supplied actions, and a clear affordance.
 */

export function SelectionBar({
  count,
  onClear,
  children,
  className = '',
}: {
  count: number;
  onClear: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <div
      className={`craft-motion flex w-fit items-center gap-2 rounded-full border border-border bg-background/95 py-1.5 pr-1.5 pl-3 shadow-lg backdrop-blur ${className}`}
      style={{ animation: 'craft-pop-in 200ms cubic-bezier(0.23,1,0.32,1) both' }}
    >
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground tabular-nums">
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background">
          {count}
        </span>
        selected
      </span>
      <span className="h-4 w-px bg-border" aria-hidden />
      {children}
      <button
        type="button"
        onClick={onClear}
        className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
        aria-label="Clear selection"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
