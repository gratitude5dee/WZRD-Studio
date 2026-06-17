import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { AudioTrack, Clip, CompositionSettings } from '@/store/videoEditorStore';
import { getEditorMediaPlaybackUrl } from '@/lib/editor/mediaPlayback';

interface EditorPreviewStageProps {
  clips: Clip[];
  audioTracks: AudioTrack[];
  composition: CompositionSettings;
  currentTimeMs: number;
  isPlaying: boolean;
  volume: number;
  selectedClipIds: string[];
  lockedTrackIds: Set<string>;
  onSelectClip: (clipId: string, event?: React.MouseEvent) => void;
}

function isActive(item: Pick<Clip | AudioTrack, 'startTime' | 'duration' | 'endTime'>, currentTimeMs: number) {
  const start = item.startTime ?? 0;
  const end = item.endTime ?? start + (item.duration ?? 0);
  return currentTimeMs >= start && currentTimeMs < end;
}

function sourceTimeSeconds(item: Pick<Clip | AudioTrack, 'startTime' | 'trimStart' | 'playbackRate'>, currentTimeMs: number) {
  const localMs = Math.max(0, currentTimeMs - (item.startTime ?? 0));
  const rate = Number.isFinite(item.playbackRate) && (item.playbackRate ?? 0) > 0 ? item.playbackRate ?? 1 : 1;
  return ((item.trimStart ?? 0) + localMs * rate) / 1000;
}

function buildFilter(clip: Clip): string | undefined {
  if (!clip.effects?.length) return undefined;
  const parts = clip.effects.flatMap((effect) => {
    const params = effect.params ?? {};
    const name = (effect.id || effect.name || '').toLowerCase();
    if (name === 'blur') return [`blur(${params.amount ?? params.radius ?? 4}px)`];
    if (name === 'brightness') return [`brightness(${params.amount ?? params.value ?? 1.1})`];
    if (name === 'contrast') return [`contrast(${params.amount ?? params.value ?? 1.1})`];
    if (name === 'saturation') return [`saturate(${params.amount ?? params.value ?? 1.2})`];
    if (name === 'grayscale') return [`grayscale(${params.amount ?? params.value ?? 1})`];
    if (name === 'sepia') return [`sepia(${params.amount ?? params.value ?? 1})`];
    if (name === 'invert') return [`invert(${params.amount ?? params.value ?? 1})`];
    return [];
  });
  return parts.length ? parts.join(' ') : undefined;
}

function isJsdomRuntime() {
  return typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');
}

function pauseMedia(media: HTMLMediaElement) {
  if (isJsdomRuntime()) return;
  media.pause();
}

function playMedia(media: HTMLMediaElement, onError?: () => void) {
  if (isJsdomRuntime()) return;
  try {
    void media.play().catch(() => onError?.());
  } catch {
    onError?.();
  }
}

function clipStyle(clip: Clip): CSSProperties {
  const transform = clip.transforms;
  return {
    transform: `translate(${transform.position.x}px, ${transform.position.y}px) scale(${transform.scale.x}, ${transform.scale.y}) rotate(${transform.rotation}deg)`,
    opacity: transform.opacity,
    filter: buildFilter(clip),
    zIndex: clip.layer ?? 0,
  };
}

function PreviewVideo({
  clip,
  currentTimeMs,
  isPlaying,
  volume,
}: {
  clip: Clip;
  currentTimeMs: number;
  isPlaying: boolean;
  volume: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const src = getEditorMediaPlaybackUrl(clip);
  const targetSeconds = sourceTimeSeconds(clip, currentTimeMs);

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const rate = Number.isFinite(clip.playbackRate) && (clip.playbackRate ?? 0) > 0 ? clip.playbackRate ?? 1 : 1;
    video.playbackRate = rate;
    video.volume = Math.max(0, Math.min(1, volume));
    if (Math.abs(video.currentTime - targetSeconds) > 0.08) {
      try {
        video.currentTime = targetSeconds;
      } catch {
        setStatus('error');
      }
    }
    if (isPlaying) {
      playMedia(video, () => setStatus('error'));
    } else {
      pauseMedia(video);
    }
  }, [clip.playbackRate, isPlaying, targetSeconds, volume]);

  return (
    <>
      <video
        ref={videoRef}
        data-testid={`editor-preview-video-${clip.id}`}
        src={src}
        className="absolute inset-0 h-full w-full object-cover"
        style={clipStyle(clip)}
        playsInline
        preload="metadata"
        onLoadedData={() => setStatus('ready')}
        onCanPlay={() => setStatus('ready')}
        onError={() => setStatus('error')}
      />
      {status === 'loading' ? (
        <div className="pointer-events-none absolute left-4 top-4 z-[480] rounded-md border border-white/10 bg-black/70 px-3 py-2 text-xs text-zinc-300">
          Loading preview...
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="absolute left-4 top-4 z-[500] max-w-sm rounded-md border border-red-400/40 bg-red-950/90 p-3 text-sm text-red-50 shadow-lg">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} />
            <span>Unable to preview {clip.name}</span>
          </div>
          <p className="mt-1 text-xs text-red-100/80">Use a local file or regenerate the preview proxy for reliable playback.</p>
        </div>
      ) : null}
    </>
  );
}

function PreviewAudio({
  track,
  currentTimeMs,
  isPlaying,
  volume,
}: {
  track: AudioTrack;
  currentTimeMs: number;
  isPlaying: boolean;
  volume: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const src = getEditorMediaPlaybackUrl(track);
  const targetSeconds = sourceTimeSeconds(track, currentTimeMs);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const rate = Number.isFinite(track.playbackRate) && (track.playbackRate ?? 0) > 0 ? track.playbackRate ?? 1 : 1;
    audio.playbackRate = rate;
    audio.volume = track.isMuted ? 0 : Math.max(0, Math.min(1, (track.volume ?? 1) * volume));
    if (Math.abs(audio.currentTime - targetSeconds) > 0.08) {
      try {
        audio.currentTime = targetSeconds;
      } catch {
        return;
      }
    }
    if (isPlaying && !track.isMuted) {
      playMedia(audio);
    } else {
      pauseMedia(audio);
    }
  }, [currentTimeMs, isPlaying, targetSeconds, track, volume]);

  return <audio ref={audioRef} data-testid={`editor-preview-audio-${track.id}`} src={src} preload="metadata" />;
}

function TextPreview({ clip }: { clip: Clip }) {
  const transform = clip.transforms;
  return (
    <div
      className="absolute left-1/2 top-1/2 max-w-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap leading-tight"
      style={{
        ...clipStyle(clip),
        transform: `translate(calc(-50% + ${transform.position.x}px), calc(-50% + ${transform.position.y}px)) scale(${transform.scale.x}, ${transform.scale.y}) rotate(${transform.rotation}deg)`,
        color: clip.style?.color ?? '#ffffff',
        fontFamily: clip.style?.fontFamily ?? 'Inter, sans-serif',
        fontSize: clip.style?.fontSize ?? 72,
        fontWeight: clip.style?.fontWeight ?? 700,
        textAlign: clip.style?.textAlign ?? 'center',
        backgroundColor: clip.style?.backgroundColor ?? 'transparent',
        padding: clip.style?.backgroundColor ? '12px 18px' : 0,
      }}
    >
      {clip.text || clip.name || 'Text'}
    </div>
  );
}

function ElementPreview({ clip }: { clip: Clip }) {
  const element = clip.element;
  const transform = clip.transforms;
  const isLine = element?.elementType === 'line';
  const shape = element?.shape ?? 'rectangle';
  return (
    <div
      role="img"
      aria-label={clip.name || 'Graphic element'}
      className="absolute left-1/2 top-1/2"
      style={{
        ...clipStyle(clip),
        transform: `translate(calc(-50% + ${transform.position.x}px), calc(-50% + ${transform.position.y}px)) scale(${transform.scale.x}, ${transform.scale.y}) rotate(${transform.rotation}deg)`,
        width: isLine ? 360 : 320,
        height: isLine ? Math.max(2, element?.strokeWidth ?? 4) : 180,
        backgroundColor: element?.color ?? '#ffffff',
        borderRadius: shape === 'circle' ? '9999px' : shape === 'rectangle' ? '8px' : '4px',
        clipPath: shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
      }}
    />
  );
}

export function EditorPreviewStage({
  clips,
  audioTracks,
  composition,
  currentTimeMs,
  isPlaying,
  volume,
  selectedClipIds,
  lockedTrackIds,
  onSelectClip,
}: EditorPreviewStageProps) {
  const activeClips = useMemo(
    () =>
      clips
        .filter((clip) => isActive(clip, currentTimeMs))
        .sort((left, right) => (left.layer ?? 0) - (right.layer ?? 0)),
    [clips, currentTimeMs],
  );
  const activeAudioTracks = useMemo(
    () => audioTracks.filter((track) => isActive(track, currentTimeMs)),
    [audioTracks, currentTimeMs],
  );

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded border border-white/10 shadow-2xl"
      style={{
        aspectRatio: `${composition.width} / ${composition.height}`,
        maxWidth: '100%',
        maxHeight: '100%',
        background: composition.backgroundColor || '#000000',
      }}
      aria-label="Editor preview stage"
    >
      {activeClips.map((clip) => {
        const trackId = `visual-${clip.layer ?? clip.trackIndex ?? 0}`;
        const locked = lockedTrackIds.has(trackId);
        const selected = selectedClipIds.includes(clip.id);
        return (
          <button
            key={clip.id}
            type="button"
            aria-label={`Select preview clip ${clip.name}`}
            disabled={locked}
            onClick={(event) => onSelectClip(clip.id, event)}
            className="absolute inset-0 block h-full w-full cursor-pointer bg-transparent p-0 text-left disabled:cursor-not-allowed"
            style={{ zIndex: (clip.layer ?? 0) + 20 }}
          >
            {clip.type === 'text' ? (
              <TextPreview clip={clip} />
            ) : clip.type === 'element' ? (
              <ElementPreview clip={clip} />
            ) : clip.type === 'image' ? (
              <img
                src={getEditorMediaPlaybackUrl(clip)}
                alt={clip.name}
                className="absolute inset-0 h-full w-full object-cover"
                style={clipStyle(clip)}
              />
            ) : (
              <PreviewVideo clip={clip} currentTimeMs={currentTimeMs} isPlaying={isPlaying} volume={volume} />
            )}
            {selected && !locked ? (
              <span className="pointer-events-none absolute inset-3 rounded border border-orange-300/90 shadow-[0_0_0_1px_rgba(0,0,0,0.65)]" />
            ) : null}
          </button>
        );
      })}
      {activeClips.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
          No active visual clip at this time
        </div>
      ) : null}
      {activeClips.map((clip) => {
        if (!clip.mediaError && clip.mediaStatus !== 'preparing' && clip.mediaStatus !== 'warning') return null;
        return (
          <div
            key={`media-status-${clip.id}`}
            className="absolute bottom-4 left-4 z-[520] max-w-sm rounded-md border border-amber-400/30 bg-amber-950/90 px-3 py-2 text-xs text-amber-50 shadow-lg"
          >
            {clip.mediaStatus === 'preparing' ? 'Preparing local preview...' : clip.mediaError ?? 'Media may need local desktop preparation.'}
          </div>
        );
      })}
      {activeAudioTracks.map((track) => (
        <PreviewAudio
          key={track.id}
          track={track}
          currentTimeMs={currentTimeMs}
          isPlaying={isPlaying}
          volume={volume}
        />
      ))}
    </div>
  );
}
