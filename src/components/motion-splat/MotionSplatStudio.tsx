import { useCallback, useEffect } from 'react';
import { Orbit } from 'lucide-react';

import CreditsDisplay from '@/components/CreditsDisplay';
import { KanvasEmptyState, KanvasRail } from '@/components/kanvas/primitives';
import { videoModelCost } from '@/lib/motion-splat/constants';
import { useMotionSplatStore } from '@/lib/stores/motion-splat-store';
import { cn } from '@/lib/utils';
import { MotionSplatViewer } from './MotionSplatViewer';
import { ExportPanel } from './panels/ExportPanel';
import { LibraryPanel } from './panels/LibraryPanel';
import { SourcePanel } from './panels/SourcePanel';
import { SplatPanel } from './panels/SplatPanel';
import { VideoPanel } from './panels/VideoPanel';
import { useMotionSplatPipeline } from './useMotionSplatPipeline';

export interface MotionSplatStudioProps {
  className?: string;
}

/**
 * The Motion Splat studio: a black stage with the 4D viewer, and a control
 * rail that walks image → video → motion splat → ship.
 */
export function MotionSplatStudio({ className }: MotionSplatStudioProps) {
  const store = useMotionSplatStore();
  const pipeline = useMotionSplatPipeline();

  useEffect(() => {
    void pipeline.refreshLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearSource = useCallback(() => {
    store.setSourceImage(null);
    store.setVideo(null);
    store.setManifest(null);
  }, [store]);

  const imageUploaded = Boolean(store.sourceImage && store.sourceImage.url !== store.sourceImage.previewUrl);
  const estimate = pipeline.estimateCredits();

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-kanvas-bg text-kanvas-text-primary', className)} data-testid="motion-splat-studio">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-kanvas-border-subtle px-4 md:px-5">
        <div className="flex items-center gap-3">
          <Orbit className="h-4 w-4 text-kanvas-accent" aria-hidden="true" />
          <h1 className="font-mono text-xs uppercase tracking-[0.24em] text-kanvas-text-secondary">Motion Splat</h1>
          <span className="hidden text-xs text-kanvas-text-faint md:inline">Image → video → 4D Gaussian splat you can scrub through</span>
        </div>
        <CreditsDisplay showTooltip={false} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="relative flex min-h-[52vh] min-w-0 flex-1 flex-col bg-black md:min-h-0" aria-label="Motion splat stage">
          {store.manifest ? (
            <MotionSplatViewer manifest={store.manifest} quality={store.quality} className="absolute inset-0" autoPlay loop />
          ) : store.video ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
              <video src={store.video.url} className="max-h-[70%] max-w-full rounded-kanvas-md border border-kanvas-border-subtle" controls muted loop playsInline />
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-kanvas-text-muted">Video ready · build the motion splat to scrub it in 3D</p>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <KanvasEmptyState
                bare
                icon={<Orbit className="h-8 w-8 text-kanvas-text-muted" />}
                title="Your motion splat will render here"
                description="Upload an image, generate a clip, and we reconstruct it as a time-aware Gaussian splat inside its camera frustum. Drag to orbit, scrub to move through time."
              />
            </div>
          )}
          {store.error && (
            <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-kanvas-border-subtle bg-kanvas-surface-1/95 px-4 py-3 text-sm text-kanvas-text-secondary" role="alert">
              <span className="truncate">{store.error}</span>
              <button type="button" onClick={store.clearError} className="h-9 shrink-0 rounded-kanvas-sm border border-kanvas-border-default px-3 font-mono text-[11px] uppercase tracking-[0.16em] hover:bg-white/10">
                Dismiss
              </button>
            </div>
          )}
        </main>

        <KanvasRail side="right" label="Motion splat controls" className="md:h-full">
          <SourcePanel sourceImage={store.sourceImage} video={store.video} busy={store.busy} onImage={pipeline.uploadImage} onVideo={pipeline.useUploadedVideo} onClear={clearSource} />
          <hr className="border-kanvas-border-subtle" />
          <VideoPanel
            prompt={store.prompt}
            modelId={store.videoModelId}
            duration={store.videoDuration}
            video={store.video}
            busy={store.busy}
            canGenerate={imageUploaded}
            creditCost={estimate.video || videoModelCost(store.videoModelId)}
            progress={store.progress}
            active={store.step === 'generating-video' || store.step === 'uploading'}
            onPrompt={store.setPrompt}
            onModel={store.setVideoModelId}
            onDuration={store.setVideoDuration}
            onGenerate={pipeline.generateVideo}
            onCancel={pipeline.cancel}
          />
          <hr className="border-kanvas-border-subtle" />
          <SplatPanel
            buildMode={store.buildMode}
            keyframeCount={store.keyframeCount}
            quality={store.quality}
            busy={store.busy}
            canBuild={Boolean(store.video)}
            creditCost={estimate.splat}
            progress={store.step === 'building-splat' ? store.progress : null}
            hasManifest={Boolean(store.manifest)}
            onBuildMode={store.setBuildMode}
            onKeyframeCount={store.setKeyframeCount}
            onQuality={store.setQuality}
            onBuild={pipeline.buildSplat}
            onCancel={pipeline.cancel}
          />
          {store.manifest && (
            <>
              <hr className="border-kanvas-border-subtle" />
              <ExportPanel manifest={store.manifest} manifestUrl={store.manifestUrl} title={store.title} onTitle={store.setTitle} />
            </>
          )}
          <hr className="border-kanvas-border-subtle" />
          <LibraryPanel items={store.library} loading={store.libraryLoading} activeManifestUrl={store.manifestUrl} onOpen={pipeline.openFromLibrary} onRefresh={pipeline.refreshLibrary} />
        </KanvasRail>
      </div>
    </div>
  );
}

export default MotionSplatStudio;
