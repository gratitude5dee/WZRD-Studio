import { useCallback, useState } from 'react';
import { Copy, Download, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { KanvasButton, KanvasFieldRow, KanvasSectionHeader } from '@/components/kanvas/primitives';
import { Input } from '@/components/ui/input';
import type { MotionSplatManifest } from '@/types/motionSplat';
import { buildIntroBundle } from '@/lib/motion-splat/introBundle';

export interface ExportPanelProps {
  manifest: MotionSplatManifest;
  manifestUrl: string | null;
  title: string;
  onTitle: (title: string) => void;
}

/** After a build: name it, share the manifest, or package it as the wzrd.tech intro. */
export function ExportPanel({ manifest, manifestUrl, title, onTitle }: ExportPanelProps) {
  const [bundling, setBundling] = useState(false);

  const copyManifestUrl = useCallback(async () => {
    if (!manifestUrl) return;
    try {
      await navigator.clipboard.writeText(manifestUrl);
      toast.success('Manifest URL copied');
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  }, [manifestUrl]);

  const downloadBundle = useCallback(async () => {
    setBundling(true);
    try {
      const blob = await buildIntroBundle(manifest);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'intro-splat.zip';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success('Intro bundle downloaded — unzip into public/intro-splat/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not build the bundle');
    } finally {
      setBundling(false);
    }
  }, [manifest]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="motion-splat-export-heading">
      <KanvasSectionHeader
        eyebrow="04 / Ship"
        title={<span id="motion-splat-export-heading">Use it</span>}
        description="Scrub above. Share the manifest, or make it the wzrd.tech intro."
      />
      <KanvasFieldRow label="Title" stacked>
        {({ labelId }) => (
          <Input
            aria-labelledby={labelId}
            value={title}
            onChange={(event) => onTitle(event.target.value)}
            placeholder={manifest.title}
            className="h-11 border-kanvas-border-default bg-kanvas-surface-2 text-sm"
          />
        )}
      </KanvasFieldRow>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-kanvas-text-muted">
        <dt>Provider</dt>
        <dd className="text-right text-kanvas-text-secondary">{manifest.provider}</dd>
        <dt>Track</dt>
        <dd className="text-right text-kanvas-text-secondary">{manifest.track.kind}</dd>
        <dt>Duration</dt>
        <dd className="text-right text-kanvas-text-secondary">{manifest.duration.toFixed(2)}s @ {manifest.fps}fps</dd>
        <dt>Frame</dt>
        <dd className="text-right text-kanvas-text-secondary">{manifest.width}×{manifest.height}</dd>
      </dl>
      <div className="flex flex-col gap-2">
        <KanvasButton variant="outline" fullWidth icon={<Copy className="h-4 w-4" />} onClick={copyManifestUrl} disabled={!manifestUrl}>
          Copy manifest URL
        </KanvasButton>
        {manifest.track.kind === 'rgbd' && (
          <KanvasButton variant="accent" fullWidth icon={<Sparkles className="h-4 w-4" />} busy={bundling} onClick={downloadBundle} data-testid="motion-splat-intro-bundle">
            Use as site intro
          </KanvasButton>
        )}
        {manifest.track.kind !== 'rgbd' && (
          <KanvasButton variant="outline" fullWidth icon={<Download className="h-4 w-4" />} onClick={downloadBundle} busy={bundling}>
            Download bundle (.zip)
          </KanvasButton>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-kanvas-text-faint">
        {manifest.track.kind === 'rgbd' ? (
          <>
            The intro bundle unzips into <code className="font-mono">public/intro-splat/</code>; the landing plays it once per visitor and falls back to the film when WebGL2 is unavailable.
          </>
        ) : (
          <>The bundle holds the manifest and every keyframe splat. Only depth-video splats can play as the site intro.</>
        )}
      </p>
    </section>
  );
}
