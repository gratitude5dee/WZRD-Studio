import { Orbit, RefreshCw } from 'lucide-react';

import { KanvasEmptyState, KanvasIconButton, KanvasRailRow, KanvasSectionHeader, KanvasSpinner } from '@/components/kanvas/primitives';
import type { MotionSplatJobSummary } from '@/types/motionSplat';

export interface LibraryPanelProps {
  items: MotionSplatJobSummary[];
  loading: boolean;
  activeManifestUrl: string | null;
  onOpen: (manifestUrl: string) => void;
  onRefresh: () => void;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Saved motion splats for this account. */
export function LibraryPanel({ items, loading, activeManifestUrl, onOpen, onRefresh }: LibraryPanelProps) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="motion-splat-library-heading">
      <KanvasSectionHeader
        eyebrow="Library"
        title={<span id="motion-splat-library-heading">Your motion splats</span>}
        action={<KanvasIconButton tone="ghost" size="sm" label="Refresh library" icon={loading ? <KanvasSpinner /> : <RefreshCw className="h-4 w-4" />} onClick={onRefresh} disabled={loading} />}
      />
      {items.length === 0 ? (
        <KanvasEmptyState
          bare
          icon={<Orbit className="h-6 w-6 text-kanvas-text-muted" />}
          title="Nothing saved yet"
          description="Built splats appear here and can be reopened any time."
          className="py-6"
        />
      ) : (
        <ul className="flex flex-col gap-1" data-testid="motion-splat-library">
          {items.map((item) => (
            <li key={item.id}>
              <KanvasRailRow
                interactive
                active={item.manifestUrl === activeManifestUrl}
                onClick={() => onOpen(item.manifestUrl)}
                leading={
                  item.posterUrl ? (
                    <img src={item.posterUrl} alt="" className="h-9 w-14 rounded-kanvas-sm object-cover" />
                  ) : (
                    <span className="flex h-9 w-14 items-center justify-center rounded-kanvas-sm bg-kanvas-surface-3">
                      <Orbit className="h-4 w-4 text-kanvas-text-muted" />
                    </span>
                  )
                }
                label={item.title}
                hint={`${item.trackKind === 'rgbd' ? 'Depth video' : item.trackKind === 'splat-keyframes' ? '3D keyframes' : 'Sequence'} · ${item.duration.toFixed(1)}s`}
                trailing={formatWhen(item.createdAt)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
