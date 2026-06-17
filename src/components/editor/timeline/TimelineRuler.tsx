import { editorTheme, typography, exactMeasurements } from '@/lib/editor/theme';
import { generateTimelineTicks } from '@/lib/editor/timelineZoom';

interface TimelineRulerProps {
  zoom: number;
  scrollOffset: number;
  durationMs: number;
  fps?: number;
}

export function TimelineRuler({ zoom, scrollOffset, durationMs, fps = 30 }: TimelineRulerProps) {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : Math.ceil((durationMs / 1000) * zoom);
  const marks = generateTimelineTicks({
    durationMs,
    fps,
    pixelsPerSecond: zoom,
    scrollLeft: scrollOffset,
    viewportWidth,
  });

  return (
    <div
      className="relative select-none"
      style={{
        height: `${exactMeasurements.timeline.rulerHeight}px`,
        background: editorTheme.bg.tertiary,
        borderBottom: `1px solid ${editorTheme.border.subtle}`,
        fontSize: typography.fontSize.xs,
        fontFamily: typography.fontFamily.mono,
        color: editorTheme.text.tertiary,
      }}
    >
      {marks.map((mark, idx) => (
        <div
          key={idx}
          className="absolute flex flex-col items-center justify-end"
          style={{
            left: `${mark.x}px`,
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {mark.kind === 'major' ? (
            <>
              <span
                className="tabular-nums mb-1"
                style={{
                  fontSize: typography.fontSize.xs,
                  color: editorTheme.text.tertiary,
                }}
              >
                {mark.label}
              </span>
              <div
                style={{
                  width: '1px',
                  height: '8px',
                  background: editorTheme.border.default,
                }}
              />
            </>
          ) : (
            <div
              style={{
                width: '1px',
                height: mark.kind === 'frame' ? '3px' : '4px',
                background: editorTheme.border.subtle,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
