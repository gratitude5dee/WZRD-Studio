import './craft.css';

/**
 * Centered empty state: an icon chip on an inset surface, a short title,
 * a supporting line, and an optional action. Fades in as a unit.
 */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`craft-motion flex flex-col items-center justify-center gap-1 px-4 py-10 text-center ${className}`}
      style={{ animation: 'craft-fade-in 250ms ease-out both' }}
    >
      {icon && (
        <span className="mb-2 flex size-9 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground">
          {icon}
        </span>
      )}
      <span className="text-[13.5px] font-medium text-foreground">{title}</span>
      {description && (
        <span className="max-w-sm text-[12.5px] text-muted-foreground">{description}</span>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
