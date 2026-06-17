import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, Music, Unlock, Video, Volume2, VolumeX } from 'lucide-react';
import { useVideoEditorStore, type AudioTrack, type Clip, type LibraryMediaItem } from '@/store/videoEditorStore';
import { TimelineClip } from './TimelineClip';
import { WaveformRenderer } from './WaveformRenderer';
import { editorTheme, typography, exactMeasurements } from '@/lib/editor/theme';
import { useDrop } from '@/lib/react-dnd';
import { buildTimelineDropMedia, timeFromTimelineDropX } from './timelineDrop';

interface TimelineTrackProps {
  type: 'video' | 'audio';
  index: number;
  clips?: Clip[];
  audioTrack?: AudioTrack;
  zoom: number;
  selectedIds: string[];
  onSelect: (id: string, additive: boolean) => void;
}

export function TimelineTrack({
  type,
  index,
  clips = [],
  audioTrack,
  zoom,
  onSelect,
  selectedIds,
}: TimelineTrackProps) {
  const [collapsed, setCollapsed] = useState(false);
  const addClip = useVideoEditorStore((state) => state.addClip);
  const addAudioTrack = useVideoEditorStore((state) => state.addAudioTrack);
  const allClips = useVideoEditorStore((state) => state.clips);
  const audioTracks = useVideoEditorStore((state) => state.audioTracks);
  const timeline = useVideoEditorStore((state) => state.timeline);
  const toggleTrackLocked = useVideoEditorStore((state) => state.toggleTrackLocked);
  const toggleTrackVisible = useVideoEditorStore((state) => state.toggleTrackVisible);
  const toggleTrackMuted = useVideoEditorStore((state) => state.toggleTrackMuted);
  const trackId = type === 'audio' ? `audio-${index}` : `visual-${index}`;
  const trackControl = useVideoEditorStore((state) => state.trackControls[trackId]);
  const locked = trackControl?.locked ?? false;
  const visible = trackControl?.visible ?? true;
  const muted = type === 'audio' ? (trackControl?.muted ?? audioTrack?.isMuted ?? false) : false;
  
  const items: (Clip | AudioTrack)[] =
    type === 'audio' && audioTrack ? (clips.length ? clips : [audioTrack]) : clips;
  const sortedItems = [...items].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  const Icon = type === 'video' ? Video : Music;
  const trackLabel = type === 'video' ? `Video Track ${index + 1}` : `Audio Track ${index + 1}`;
  const controlButtonClass = 'rounded p-1 transition-colors hover:bg-white/10 hover:text-white';
  const stopControlClick = (handler: () => void) => (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handler();
  };

  // Drop zone for adding clips from media library
  const [{ isOver }, dropRef] = useDrop({
    accept: 'MEDIA_ITEM',
    canDrop: (item: { mediaItem?: LibraryMediaItem }) => {
      if (locked || !item.mediaItem) return false;
      return type === 'audio' ? item.mediaItem.mediaType === 'audio' : item.mediaItem.mediaType !== 'audio';
    },
    drop: (item: { mediaItem: LibraryMediaItem }, monitor) => {
      if (locked) return;
      const offset = monitor.getClientOffset();
      if (!offset) return;

      const trackElement = document.querySelector(`[data-track-type="${type}-${index}"]`);
      if (!trackElement) return;

      const trackRect = trackElement.getBoundingClientRect();
      const startTimeMs = timeFromTimelineDropX({
        clientX: offset.x,
        containerLeft: trackRect.left,
        scrollOffset: timeline.scrollOffset,
        zoom,
      });
      if (startTimeMs === null) return;

      const result = buildTimelineDropMedia({
        mediaItem: item.mediaItem,
        target: { type, trackIndex: index },
        startTimeMs,
        clips: allClips,
        audioTracks,
        timeline,
      });

      if (result?.kind === 'audio') {
        addAudioTrack(result.audioTrack);
      } else if (result?.kind === 'clip') {
        addClip(result.clip);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  return (
    <div
      style={{
        borderBottom: `1px solid ${editorTheme.border.subtle}`,
        background: editorTheme.bg.secondary,
      }}
    >
      {/* Track Header */}
      <div
        className="flex items-center"
        style={{
          height: '40px',
          paddingLeft: '12px',
          paddingRight: '12px',
          borderBottom: `1px solid ${editorTheme.border.subtle}`,
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.medium,
          color: editorTheme.text.secondary,
        }}
        >
        <button
          className="mr-2 p-1 rounded transition-colors"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${trackLabel}`}
          style={{
            color: editorTheme.text.secondary,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = editorTheme.bg.hover;
            e.currentTarget.style.color = editorTheme.text.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = editorTheme.text.secondary;
          }}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        
        <div className="flex items-center gap-2 flex-1">
          <Icon
            className="h-4 w-4"
            style={{ color: type === 'video' ? editorTheme.accent.primary : editorTheme.accent.secondary }}
          />
          <span
            className="uppercase tracking-wider"
            style={{
              fontSize: typography.fontSize.xs,
              color: editorTheme.text.secondary,
            }}
          >
            {trackLabel}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={controlButtonClass}
            aria-label={`${locked ? 'Unlock' : 'Lock'} ${trackLabel}`}
            title={`${locked ? 'Unlock' : 'Lock'} ${trackLabel}`}
            onClick={stopControlClick(() => toggleTrackLocked(trackId))}
            style={{ color: locked ? editorTheme.accent.primary : editorTheme.text.tertiary }}
          >
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className={controlButtonClass}
            aria-label={`${visible ? 'Hide' : 'Show'} ${trackLabel}`}
            title={`${visible ? 'Hide' : 'Show'} ${trackLabel}`}
            onClick={stopControlClick(() => toggleTrackVisible(trackId))}
            style={{ color: visible ? editorTheme.text.tertiary : editorTheme.accent.primary }}
          >
            {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          {type === 'audio' && (
            <button
              type="button"
              className={controlButtonClass}
              aria-label={`${muted ? 'Unmute' : 'Mute'} ${trackLabel}`}
              title={`${muted ? 'Unmute' : 'Mute'} ${trackLabel}`}
              onClick={stopControlClick(() => toggleTrackMuted(trackId))}
              style={{ color: muted ? editorTheme.accent.primary : editorTheme.text.tertiary }}
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          )}
          <div
            className="tabular-nums"
            style={{
              fontSize: typography.fontSize.xs,
              color: editorTheme.text.tertiary,
            }}
          >
            {sortedItems.length} clip{sortedItems.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Track Content */}
      {!collapsed && visible && (
        <div
          ref={dropRef}
          data-track-type={`${type}-${index}`}
          className="relative overflow-hidden"
          style={{
            height: `${exactMeasurements.timeline.trackHeight}px`,
            background: isOver ? 'hsl(var(--primary) / 0.1)' : editorTheme.bg.secondary,
            border: isOver ? '2px dashed hsl(var(--primary))' : 'none',
            transition: 'all 0.2s',
          }}
        >
          {type === 'audio' && audioTrack && <WaveformRenderer track={audioTrack} />}
          {sortedItems.map((clip) => (
            <TimelineClip
              key={clip.id}
              clip={clip}
              zoom={zoom}
              onSelect={onSelect}
              isSelected={selectedIds.includes(clip.id)}
              isTrackLocked={locked}
            />
          ))}
        </div>
      )}
    </div>
  );
}
