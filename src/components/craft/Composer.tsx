import { cn } from '@/lib/utils';
import './craft.css';

export function ComposerContextChip({
  children,
  accent = false,
  className,
}: {
  children: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] leading-none',
        accent
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border/60 bg-muted/60 text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Composer({
  children,
  context,
  leading,
  trailing,
  disabled = false,
  busy = false,
  className,
}: {
  children: React.ReactNode;
  context?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-busy={busy || undefined}
      className={cn(
        'craft-motion rounded-2xl border border-border/60 bg-background/70 p-3 shadow-sm',
        'transition-[border-color,box-shadow,opacity] duration-200',
        'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      {context ? <div className="mb-2 flex flex-wrap items-center gap-2">{context}</div> : null}
      <div className="flex items-end gap-2">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="min-w-0 flex-1">{children}</div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </div>
  );
}
