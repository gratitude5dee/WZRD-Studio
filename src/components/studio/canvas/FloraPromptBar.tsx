import { FormEvent, KeyboardEvent } from 'react';
import { ArrowUp, Plus, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloraPromptBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/** A compact, keyboard-first command console for prompt-to-graph creation. */
export function FloraPromptBar({
  value,
  onChange,
  onSubmit,
  isSubmitting = false,
  disabled = false,
  placeholder = 'Describe what you want to create...',
}: FloraPromptBarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || isSubmitting || value.trim().length === 0) {
      return;
    }
    onSubmit();
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!disabled && !isSubmitting && value.trim().length > 0) {
        onSubmit();
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute bottom-6 left-1/2 z-[60] w-[min(780px,calc(100%-2rem))] -translate-x-1/2 sm:bottom-7"
    >
      <div
        className={cn(
          'border bg-[#090806]/[0.96] shadow-[0_18px_48px_rgba(0,0,0,0.48)] backdrop-blur-xl transition-colors',
          disabled
            ? 'border-[#e2c09b]/[0.09] opacity-65'
            : 'border-[#e2c09b]/[0.2] focus-within:border-[#e9a269]/70 focus-within:shadow-[0_18px_48px_rgba(0,0,0,0.48),0_0_0_1px_rgba(233,162,105,0.13)]'
        )}
      >
        <div className="flex h-7 items-center justify-between border-b border-[#e2c09b]/[0.13] px-3 text-[9px] uppercase tracking-[0.16em] text-[#8d8378]" style={{ fontFamily: 'var(--font-system)' }}>
          <span>WZRD / prompt console</span>
          <span className="hidden sm:inline">⌘ + Enter to run</span>
        </div>

        <div className="flex items-end gap-2 px-2 py-2 sm:gap-3 sm:px-3">
          <button
            type="button"
            disabled={disabled}
            className="inline-flex h-11 w-11 flex-none items-center justify-center border border-transparent text-[#bdb2a5] transition-colors hover:border-[#e2c09b]/25 hover:bg-[#e4a267]/[0.07] hover:text-[#f1e7dc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edbc8e] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Attach asset"
          >
            <Plus className="h-4 w-4" />
          </button>

          <label className="min-w-0 flex-1">
            <span className="sr-only">Prompt</span>
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handlePromptKeyDown}
              rows={1}
              disabled={disabled}
              placeholder={placeholder}
              className="max-h-40 min-h-[44px] w-full resize-none bg-transparent pt-3 text-sm leading-5 text-[#f2ece4] outline-none placeholder:text-[#716a62]"
              style={{ fontFamily: 'var(--font-system)' }}
            />
          </label>

          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              disabled={disabled}
              className="inline-flex h-11 w-11 items-center justify-center border border-transparent text-[#aaa096] transition-colors hover:border-[#e2c09b]/25 hover:bg-[#e4a267]/[0.07] hover:text-[#f1e7dc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edbc8e] disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Prompt settings"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={disabled || isSubmitting || value.trim().length === 0}
              className="inline-flex h-11 w-11 items-center justify-center border border-[#e7a36b] bg-[#df8a4d] text-[#110d09] transition-colors hover:bg-[#f0ad77] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c895] disabled:cursor-not-allowed disabled:border-[#5e4838] disabled:bg-[#2c241d] disabled:text-[#78695d]"
              aria-label="Submit prompt"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
