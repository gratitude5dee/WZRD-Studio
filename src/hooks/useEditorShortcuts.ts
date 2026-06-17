import { useEffect } from 'react';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import {
  addKeyframeAtPlayhead,
  applyEffectToSelection,
  clearOpenCutSelection,
  copyOpenCutSelection,
  deleteSelection,
  duplicateSelection,
  moveSelectedKeyframes,
  moveSelection,
  pasteOpenCutClipboard,
  retimeSelection,
  selectAllOpenCutElements,
  separateSelectedSourceAudio,
  splitSelectedAtPlayhead,
  toggleBookmarkAtPlayhead,
  toggleMaskOnSelection,
  trimSelectionEdges,
} from '@/features/editor-opencut/openCutCommands';

const isMac = typeof navigator !== 'undefined' ? /Mac/i.test(navigator.platform) : false;

interface EditorShortcutHandlers {
  onExport?: () => void;
  onSave?: () => void;
}

export function useEditorShortcuts(handlers: EditorShortcutHandlers = {}) {
  const play = useVideoEditorStore((state) => state.play);
  const pause = useVideoEditorStore((state) => state.pause);
  const togglePlayPause = useVideoEditorStore((state) => state.togglePlayPause);
  const seek = useVideoEditorStore((state) => state.seek);
  const playback = useVideoEditorStore((state) => state.playback);
  const selectedClipIds = useVideoEditorStore((state) => state.selectedClipIds);
  const selectedAudioTrackIds = useVideoEditorStore((state) => state.selectedAudioTrackIds);
  const selectedKeyframeIds = useVideoEditorStore((state) => state.selectedKeyframeIds);
  const setTimelineZoom = useVideoEditorStore((state) => state.setTimelineZoom);
  const timeline = useVideoEditorStore((state) => state.timeline);
  const undo = useVideoEditorStore((state) => state.undo);
  const redo = useVideoEditorStore((state) => state.redo);
  const setInPoint = useVideoEditorStore((state) => state.setInPoint);
  const setOutPoint = useVideoEditorStore((state) => state.setOutPoint);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const meta = isMac ? event.metaKey : event.ctrlKey;
      const shift = event.shiftKey;

      if (['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) {
        return;
      }

      switch (key) {
        case ' ':
          event.preventDefault();
          togglePlayPause();
          return;
        case 'j':
          event.preventDefault();
          seek(Math.max(0, playback.currentTime - 500));
          return;
        case 'k':
          event.preventDefault();
          pause();
          return;
        case 'l':
          event.preventDefault();
          play();
          return;
        case 'Delete':
        case 'Backspace':
          if (selectedClipIds.length === 0 && selectedAudioTrackIds.length === 0 && selectedKeyframeIds.length === 0) return;
          event.preventDefault();
          deleteSelection();
          return;
        case 'Escape':
          if (selectedClipIds.length === 0 && selectedAudioTrackIds.length === 0 && selectedKeyframeIds.length === 0) return;
          event.preventDefault();
          clearOpenCutSelection();
          return;
        case 'ArrowLeft':
          event.preventDefault();
          if (selectedClipIds.length === 0 && selectedAudioTrackIds.length === 0 && selectedKeyframeIds.length > 0) {
            moveSelectedKeyframes({ deltaMs: -timeline.gridSize, snapToGrid: true });
          } else {
            moveSelection({ deltaMs: -timeline.gridSize, snapToGrid: true });
          }
          return;
        case 'ArrowRight':
          event.preventDefault();
          if (selectedClipIds.length === 0 && selectedAudioTrackIds.length === 0 && selectedKeyframeIds.length > 0) {
            moveSelectedKeyframes({ deltaMs: timeline.gridSize, snapToGrid: true });
          } else {
            moveSelection({ deltaMs: timeline.gridSize, snapToGrid: true });
          }
          return;
        case '+':
          event.preventDefault();
          setTimelineZoom(timeline.zoom + 10);
          return;
        case '-':
          event.preventDefault();
          setTimelineZoom(timeline.zoom - 10);
          return;
        case 'i':
          event.preventDefault();
          setInPoint(playback.currentTime);
          return;
        case 'o':
          event.preventDefault();
          setOutPoint(playback.currentTime);
          return;
        case 's':
          if (meta) break;
          event.preventDefault();
          splitSelectedAtPlayhead();
          return;
        case 'd':
          if (meta) break;
          event.preventDefault();
          duplicateSelection();
          return;
        case 'a':
          if (meta) break;
          event.preventDefault();
          separateSelectedSourceAudio();
          return;
        case 'm':
          if (meta) break;
          event.preventDefault();
          addKeyframeAtPlayhead();
          return;
        case 'b':
          if (meta) break;
          event.preventDefault();
          toggleBookmarkAtPlayhead();
          return;
        case 'e':
          if (meta) break;
          event.preventDefault();
          applyEffectToSelection('blur', { amount: 4 });
          return;
        case 'r':
          if (meta) break;
          event.preventDefault();
          retimeSelection(2);
          return;
        case 't':
          if (meta) break;
          event.preventDefault();
          trimSelectionEdges({ endDeltaMs: -timeline.gridSize });
          return;
        case 'x':
          if (meta) break;
          event.preventDefault();
          toggleMaskOnSelection('rectangle');
          return;
        default:
          break;
      }

      if (meta && key.toLowerCase() === 'z') {
        event.preventDefault();
        if (shift) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (meta && key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAllOpenCutElements();
        return;
      }

      if (meta && key.toLowerCase() === 'c') {
        event.preventDefault();
        copyOpenCutSelection();
        return;
      }

      if (meta && key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteOpenCutClipboard();
        return;
      }

      if (meta && key.toLowerCase() === 'e') {
        event.preventDefault();
        handlers.onExport?.();
        return;
      }

      if (meta && key.toLowerCase() === 's') {
        event.preventDefault();
        handlers.onSave?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    pause,
    play,
    playback.currentTime,
    redo,
    selectedAudioTrackIds,
    selectedClipIds,
    selectedKeyframeIds,
    seek,
    setInPoint,
    setOutPoint,
    setTimelineZoom,
    handlers,
    timeline.gridSize,
    timeline.zoom,
    togglePlayPause,
    undo,
  ]);
}
