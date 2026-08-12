import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import './craft.css';

/**
 * Command-style search field: leading glyph, borderless input,
 * and a clear affordance that fades in only while there is a query.
 */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
  inputClassName = '',
  'data-testid': dataTestId,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  'data-testid'?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-10 items-center gap-2 rounded-xl border border-line-subtle bg-surface-raised px-3',
        'transition-colors duration-100 focus-within:border-accent-ember/40 hover:bg-surface-2/60',
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid={dataTestId}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary',
          inputClassName,
        )}
      />
      {value && (
        <button
          aria-label="Clear search"
          type="button"
          onClick={() => onChange('')}
          className="craft-motion flex size-[22px] items-center justify-center rounded-full text-text-tertiary
            transition-colors duration-100 hover:bg-line-subtle/70 hover:text-text-primary"
          style={{ animation: 'craft-fade-in 150ms ease-out both' }}
        >
          <X className="h-3 w-3" strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
