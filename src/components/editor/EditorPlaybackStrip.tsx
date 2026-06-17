import { Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import { formatTimecode } from '@/lib/editor/time';

interface EditorPlaybackStripProps {
  durationMs: number;
  fps: number;
}

const buttonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

function clampTime(value: number, durationMs: number) {
  return Math.max(0, Math.min(durationMs, value));
}

export function EditorPlaybackStrip({ durationMs, fps }: EditorPlaybackStripProps) {
  const playback = useVideoEditorStore((state) => state.playback);
  const play = useVideoEditorStore((state) => state.play);
  const pause = useVideoEditorStore((state) => state.pause);
  const seek = useVideoEditorStore((state) => state.seek);
  const setIsLooping = useVideoEditorStore((state) => state.setIsLooping);
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const frameMs = 1000 / safeFps;
  const safeDuration = Math.max(0, durationMs);

  const handleTogglePlayback = () => {
    if (playback.isPlaying) {
      pause();
      return;
    }
    if (safeDuration > 0 && playback.currentTime >= safeDuration) {
      seek(playback.inPoint || 0);
    }
    play();
  };

  return (
    <div className="flex items-center gap-3 border-b border-white/10 bg-[#111111] px-3 py-2 text-xs text-zinc-200">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-200"
        aria-label={playback.isPlaying ? 'Pause timeline' : 'Play timeline'}
        onClick={handleTogglePlayback}
      >
        {playback.isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
      </button>

      <button
        type="button"
        className={buttonClass}
        aria-label="Previous frame"
        onClick={() => seek(clampTime(playback.currentTime - frameMs, safeDuration))}
      >
        <SkipBack size={15} />
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label="Next frame"
        onClick={() => seek(clampTime(playback.currentTime + frameMs, safeDuration))}
      >
        <SkipForward size={15} />
      </button>

      <div className="min-w-[108px] font-mono text-[11px] tabular-nums text-zinc-300">
        {formatTimecode(playback.currentTime, safeFps)} / {formatTimecode(safeDuration, safeFps)}
      </div>

      <input
        type="range"
        aria-label="Timeline scrubber"
        min={0}
        max={safeDuration}
        step={Math.max(1, frameMs)}
        value={clampTime(playback.currentTime, safeDuration)}
        onChange={(event) => seek(Number(event.currentTarget.value))}
        className="h-1 min-w-[160px] flex-1 accent-orange-500"
      />

      <button
        type="button"
        className={`${buttonClass} ${playback.isLooping ? 'border-orange-400/60 text-orange-200' : ''}`}
        aria-label={playback.isLooping ? 'Disable loop playback' : 'Enable loop playback'}
        aria-pressed={playback.isLooping}
        onClick={() => setIsLooping(!playback.isLooping)}
      >
        <Repeat size={15} />
      </button>
    </div>
  );
}
