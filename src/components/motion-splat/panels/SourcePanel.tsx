import { Film, ImagePlus, X } from 'lucide-react';

import { KanvasIconButton, KanvasSectionHeader, KanvasUploadTile } from '@/components/kanvas/primitives';
import type { MotionSplatSourceImage, MotionSplatVideoAsset } from '@/lib/stores/motion-splat-store';

export interface SourcePanelProps {
  sourceImage: MotionSplatSourceImage | null;
  video: MotionSplatVideoAsset | null;
  busy: boolean;
  onImage: (file: File) => void;
  onVideo: (file: File) => void;
  onClear: () => void;
}

/** Step 1 — the still image (or an existing video) the motion splat starts from. */
export function SourcePanel({ sourceImage, video, busy, onImage, onVideo, onClear }: SourcePanelProps) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="motion-splat-source-heading">
      <KanvasSectionHeader
        eyebrow="01 / Source"
        title={<span id="motion-splat-source-heading">Upload an image</span>}
        description="One still is enough. We generate the motion from it."
        action={
          sourceImage || video ? (
            <KanvasIconButton tone="ghost" size="sm" label="Clear source" icon={<X className="h-4 w-4" />} onClick={onClear} disabled={busy} />
          ) : undefined
        }
      />
      {sourceImage ? (
        <div className="relative overflow-hidden rounded-kanvas-lg border border-kanvas-border-subtle bg-kanvas-surface-2">
          <img src={sourceImage.previewUrl ?? sourceImage.url} alt={sourceImage.name} className="aspect-video w-full object-cover" />
          <p className="truncate px-3 py-2 font-mono text-[11px] text-kanvas-text-muted">{sourceImage.name}</p>
        </div>
      ) : (
        <KanvasUploadTile
          label="Drop an image or click to upload"
          hint="PNG, JPG or WebP · up to 20 MB"
          accept="image/*"
          ratio="video"
          disabled={busy}
          onFiles={(files) => files[0] && onImage(files[0])}
        />
      )}
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-kanvas-md border border-dashed border-kanvas-border-default px-3 text-xs text-kanvas-text-muted transition-colors hover:border-kanvas-border-strong hover:text-kanvas-text-secondary">
        {video ? <Film className="h-4 w-4 text-kanvas-accent" /> : <ImagePlus className="h-4 w-4" />}
        <span className="truncate">{video ? 'Video attached — replace it' : 'Already have a video? Skip generation and upload it'}</span>
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onVideo(file);
            event.target.value = '';
          }}
        />
      </label>
    </section>
  );
}
