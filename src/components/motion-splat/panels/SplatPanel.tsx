import { Box, Layers3, Orbit } from 'lucide-react';

import { KanvasButton, KanvasFieldRow, KanvasProgress, KanvasSectionHeader, KanvasStepper, KanvasTabs } from '@/components/kanvas/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MotionSplatProgress } from '@/lib/stores/motion-splat-store';
import type { MotionSplatBuildMode, MotionSplatQuality } from '@/types/motionSplat';

export interface SplatPanelProps {
  buildMode: MotionSplatBuildMode;
  keyframeCount: number;
  quality: MotionSplatQuality;
  busy: boolean;
  canBuild: boolean;
  creditCost: number;
  progress: MotionSplatProgress | null;
  hasManifest: boolean;
  onBuildMode: (mode: MotionSplatBuildMode) => void;
  onKeyframeCount: (count: number) => void;
  onQuality: (quality: MotionSplatQuality) => void;
  onBuild: () => void;
  onCancel: () => void;
}

const MODE_ITEMS = [
  { value: 'rgbd', label: 'Depth video', icon: <Layers3 className="h-4 w-4" /> },
  { value: 'splat-keyframes', label: '3D keyframes', icon: <Box className="h-4 w-4" /> },
] as const;

const QUALITY_LABELS: Record<MotionSplatQuality, string> = {
  auto: 'Auto (device)',
  low: 'Low · 21k splats',
  medium: 'Medium · 37k splats',
  high: 'High · 58k splats',
};

/** Step 3 — reconstruct the clip as a time-aware Gaussian splat. */
export function SplatPanel({
  buildMode,
  keyframeCount,
  quality,
  busy,
  canBuild,
  creditCost,
  progress,
  hasManifest,
  onBuildMode,
  onKeyframeCount,
  onQuality,
  onBuild,
  onCancel,
}: SplatPanelProps) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="motion-splat-build-heading">
      <KanvasSectionHeader
        eyebrow="03 / Motion splat"
        title={<span id="motion-splat-build-heading">Build the 4D splat</span>}
        description={
          buildMode === 'rgbd'
            ? 'Temporally consistent depth for every frame; scrub at full frame rate.'
            : 'A full 3D splat per keyframe, morphed over time. Slower, orbit-able.'
        }
      />
      <KanvasTabs
        label="Reconstruction method"
        items={MODE_ITEMS}
        value={buildMode}
        onChange={(value) => onBuildMode(value as MotionSplatBuildMode)}
      />
      {buildMode === 'rgbd' && (
        <KanvasFieldRow label="Keyframes" hint="Interpolated between; more is smoother">
          {() => <KanvasStepper label="Keyframes" value={keyframeCount} onChange={onKeyframeCount} min={6} max={60} step={6} disabled={busy} />}
        </KanvasFieldRow>
      )}
      <KanvasFieldRow label="Quality" stacked>
        {({ labelId }) => (
          <Select value={quality} onValueChange={(value) => onQuality(value as MotionSplatQuality)} disabled={busy}>
            <SelectTrigger aria-labelledby={labelId} className="h-11 border-kanvas-border-default bg-kanvas-surface-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(QUALITY_LABELS) as MotionSplatQuality[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {QUALITY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </KanvasFieldRow>
      {progress && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-kanvas-text-secondary">
            <span>{progress.label}</span>
            <span className="tabular-nums">{Math.round(progress.value * 100)}%</span>
          </div>
          <KanvasProgress label={progress.label} value={progress.value * 100} />
        </div>
      )}
      {busy ? (
        <KanvasButton variant="outline" fullWidth onClick={onCancel} data-testid="motion-splat-cancel">
          Cancel
        </KanvasButton>
      ) : (
        <KanvasButton
          variant={hasManifest ? 'outline' : 'accent'}
          fullWidth
          icon={<Orbit className="h-4 w-4" />}
          disabled={!canBuild}
          onClick={onBuild}
          data-testid="motion-splat-build"
        >
          {hasManifest ? 'Rebuild motion splat' : 'Build motion splat'}
          <span className="ml-2 font-mono text-[11px] opacity-70">{creditCost} cr</span>
        </KanvasButton>
      )}
    </section>
  );
}
