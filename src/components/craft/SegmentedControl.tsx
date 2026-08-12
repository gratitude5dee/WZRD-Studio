import './craft.css';

/**
 * Segmented control with a raised sliding thumb.
 * The track sits on the muted surface; the thumb glides between equal-width
 * segments on a settling ease. Fully keyboard-accessible via the buttons.
 */

export interface Segment<T extends string> {
  value: T;
  label: React.ReactNode;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className = '',
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const index = Math.max(
    0,
    segments.findIndex((segment) => segment.value === value),
  );

  return (
    <div
      className={`relative grid rounded-lg border border-border/60 bg-muted/60 p-0.5 ${className}`}
      style={{ gridTemplateColumns: `repeat(${segments.length}, 1fr)` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 rounded-md bg-background shadow-sm transition-transform duration-300"
        style={{
          width: `calc((100% - 4px) / ${segments.length})`,
          left: 2,
          transform: `translateX(${index * 100}%)`,
          transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      />
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          aria-label={segment.ariaLabel}
          aria-pressed={segment.value === value}
          onClick={() => onChange(segment.value)}
          className={`relative z-10 flex h-7 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors duration-200 ${
            segment.value === value
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
