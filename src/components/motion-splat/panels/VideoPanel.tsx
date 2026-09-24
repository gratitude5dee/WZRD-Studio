import { useMemo } from 'react';
import { Clapperboard } from 'lucide-react';

import { KanvasButton, KanvasChip, KanvasFieldRow, KanvasProgress, KanvasSectionHeader } from '@/components/kanvas/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { MotionSplatProgress, MotionSplatVideoAsset } from '@/lib/stores/motion-splat-store';
import { formatTimecode } from '@/lib/motion-splat/timeline';
import { imageToVideoModels } from './videoModels';

export interface VideoPanelProps {
  prompt: string;
  modelId: string;
  duration: 5 | 10;
  video: MotionSplatVideoAsset | null;
  busy: boolean;
  canGenerate: boolean;
  creditCost: number;
  /** Progress of this step only; null while another step is running. */
  progress?: MotionSplatProgress | null;
  /** True while this step owns the run, so it can show progress and cancel. */
  active?: boolean;
  onPrompt: (prompt: string) => void;
  onModel: (modelId: string) => void;
  onDuration: (duration: 5 | 10) => void;
  onGenerate: () => void;
  onCancel: () => void;
}

/** Step 2 — turn the still into a short clip. */
export function VideoPanel({
  prompt,
  modelId,
  duration,
  video,
  busy,
  canGenerate,
  creditCost,
  progress,
  active = false,
  onPrompt,
  onModel,
  onDuration,
  onGenerate,
  onCancel,
}: VideoPanelProps) {
  const models = useMemo(() => imageToVideoModels(), []);
  const selected = models.find((model) => model.id === modelId);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="motion-splat-video-heading">
      <KanvasSectionHeader
        eyebrow="02 / Motion"
        title={<span id="motion-splat-video-heading">Generate the video</span>}
        description="Describe the motion. Keep the camera steady for the cleanest depth."
      />
      <KanvasFieldRow label="Prompt" stacked>
        {({ labelId }) => (
          <Textarea
            aria-labelledby={labelId}
            value={prompt}
            onChange={(event) => onPrompt(event.target.value)}
            placeholder="A slow push-in as the fish drifts through the reef, particles catching the light"
            rows={3}
            disabled={busy}
            className="min-h-[88px] resize-none border-kanvas-border-default bg-kanvas-surface-2 text-sm text-kanvas-text-primary placeholder:text-kanvas-text-faint"
          />
        )}
      </KanvasFieldRow>
      <KanvasFieldRow label="Model" stacked>
        {({ labelId }) => (
          <Select value={modelId} onValueChange={onModel} disabled={busy}>
            <SelectTrigger aria-labelledby={labelId} className="h-11 border-kanvas-border-default bg-kanvas-surface-2 text-sm">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <span className="flex items-center gap-2">
                    <span>{model.name}</span>
                    <span className="font-mono text-[10px] text-kanvas-text-muted">{model.credits} cr</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </KanvasFieldRow>
      <KanvasFieldRow label="Duration">
        {() => (
          <div className="flex gap-2" role="group" aria-label="Clip duration">
            {([5, 10] as const).map((seconds) => (
              <KanvasChip key={seconds} size="sm" active={duration === seconds} onClick={() => onDuration(seconds)} disabled={busy}>
                {seconds}s
              </KanvasChip>
            ))}
          </div>
        )}
      </KanvasFieldRow>
      {video && (
        <div className="overflow-hidden rounded-kanvas-lg border border-kanvas-border-subtle bg-kanvas-surface-2" data-testid="motion-splat-video-preview">
          <video src={video.url} className="aspect-video w-full object-cover" muted playsInline loop autoPlay controls={false} />
          <div className="flex items-center justify-between px-3 py-2 font-mono text-[11px] text-kanvas-text-muted">
            <span>{video.width && video.height ? `${video.width}×${video.height}` : 'Video'}</span>
            <span>{video.duration ? formatTimecode(video.duration, video.fps ?? 24) : ''}</span>
          </div>
        </div>
      )}
      {active && progress && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-kanvas-text-secondary">
            <span>{progress.label}</span>
            <span className="tabular-nums">{Math.round(progress.value * 100)}%</span>
          </div>
          <KanvasProgress label={progress.label} value={progress.value * 100} />
        </div>
      )}
      {active ? (
        <KanvasButton variant="outline" fullWidth onClick={onCancel} data-testid="motion-splat-cancel-video">
          Cancel
        </KanvasButton>
      ) : (
        <KanvasButton
          variant={video ? 'outline' : 'accent'}
          fullWidth
          icon={<Clapperboard className="h-4 w-4" />}
          busy={busy}
          disabled={!canGenerate || busy}
          onClick={onGenerate}
          data-testid="motion-splat-generate-video"
        >
          {video ? 'Regenerate video' : 'Generate video'}
          <span className="ml-2 font-mono text-[11px] opacity-70">{creditCost} cr</span>
        </KanvasButton>
      )}
      {selected?.description && <p className="text-[11px] leading-relaxed text-kanvas-text-faint">{selected.description}</p>}
    </section>
  );
}
