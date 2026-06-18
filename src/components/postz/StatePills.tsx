import type { PostzPostState } from "@/types/postz";
import { postStateClass, postStateLabel } from "@/components/postz/postzMeta";
import { cn } from "@/lib/utils";

export const POSTZ_STATE_FILTER_ALL = "__all__" as const;

export type PostzStateFilter = typeof POSTZ_STATE_FILTER_ALL | PostzPostState;

export function StatePills({
  value,
  onChange,
  counts,
}: {
  value: PostzStateFilter;
  onChange: (next: PostzStateFilter) => void;
  counts: Partial<Record<PostzPostState, number>>;
}) {
  const states: PostzStateFilter[] = [POSTZ_STATE_FILTER_ALL, "DRAFT", "QUEUE", "PUBLISHING", "PUBLISHED", "ERROR"];
  const allCount = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {states.map((state) => {
        const selected = value === state;
        const label = state === POSTZ_STATE_FILTER_ALL ? "All" : postStateLabel(state);
        const count = state === POSTZ_STATE_FILTER_ALL ? allCount : counts[state] ?? 0;

        return (
          <button
            key={state}
            type="button"
            onClick={() => onChange(state)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
              selected
                ? "border-orange-400/40 bg-orange-500/10 text-orange-100"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
            )}
          >
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] uppercase",
                state === POSTZ_STATE_FILTER_ALL ? "border-white/10 bg-white/5 text-zinc-300" : postStateClass(state),
              )}
            >
              {label}
            </span>
            <span className="text-[11px] text-zinc-400">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
