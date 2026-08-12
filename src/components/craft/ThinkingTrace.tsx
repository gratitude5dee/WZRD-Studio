import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { ShimmerText } from './ShimmerText';
import './craft.css';

/**
 * Expandable step trace for long-running pipelines and agent work.
 *
 * A compact header shows a shimmering label while working and settles to a
 * static one when done; the body is a vertical trace of steps with a
 * hairline spine — completed steps get muted checks, the active step a
 * spinner, pending steps a dim ring.
 */

export type TraceStepStatus = 'pending' | 'active' | 'done';

export interface TraceStep {
  id: string;
  label: string;
  detail?: string;
  status: TraceStepStatus;
}

function StepMarker({ status }: { status: TraceStepStatus }) {
  if (status === 'done') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (status === 'active') {
    return (
      <span className="craft-motion size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-border border-t-foreground" />
    );
  }
  return <span className="size-3 shrink-0 rounded-full border-[1.5px] border-border/60" />;
}

export function ThinkingTrace({
  label,
  doneLabel,
  working,
  steps,
  defaultExpanded = true,
  className = '',
}: {
  label: string;
  doneLabel: string;
  working: boolean;
  steps: TraceStep[];
  defaultExpanded?: boolean;
  className?: string;
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? (defaultExpanded && working);

  return (
    <div className={`flex w-full flex-col ${className}`}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded((current) => !(current ?? (defaultExpanded && working)))}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-100 hover:bg-muted/50"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={working ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}
          className="shrink-0"
        >
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
        {working ? (
          <ShimmerText className="whitespace-nowrap text-[13px]">{label}</ShimmerText>
        ) : (
          <span
            className="craft-motion whitespace-nowrap text-[13px] font-medium text-muted-foreground"
            style={{ animation: 'craft-fade-in 350ms ease-out both' }}
          >
            {doneLabel}
          </span>
        )}
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-300"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: expanded ? '1fr' : '0fr',
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[7px] border-l border-border/60 pl-4">
            <div className="flex flex-col gap-1 py-1">
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  className="craft-motion flex min-h-7 items-center gap-2 rounded-md px-1.5 py-0.5"
                  style={{
                    animation: `craft-fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${Math.min(i, 8) * 60}ms both`,
                  }}
                >
                  <StepMarker status={step.status} />
                  <span
                    className={`min-w-0 truncate text-[12.5px] ${
                      step.status === 'pending'
                        ? 'text-muted-foreground/60'
                        : step.status === 'active'
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                  {step.detail && (
                    <span className="shrink-0 text-[11.5px] text-muted-foreground/70">
                      {step.detail}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
