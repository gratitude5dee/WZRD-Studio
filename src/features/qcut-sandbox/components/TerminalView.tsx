import { useEffect, useRef } from 'react';

/**
 * xterm.js mount + WebSocket pipe. ArrayBuffer transport, not text —
 * the PTY emits raw bytes and `qcut` output sometimes uses non-UTF8
 * box-drawing.
 */
interface Props {
  wsUrl: string;
  onExit: (reason: string) => void;
}

export function TerminalView({ wsUrl, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;

    // Lazy-load xterm so it doesn't pull into the route-shell bundle
    // for users who never open the terminal.
    void (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);
      await import('@xterm/xterm/css/xterm.css');
      if (cancelled || !containerRef.current) return;

      const term = new Terminal({
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 13,
        theme: { background: '#0b0d10' },
        cursorBlink: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(containerRef.current);
      fit.fit();

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      ws.addEventListener('message', (e) => {
        term.write(new Uint8Array(e.data as ArrayBuffer));
      });
      ws.addEventListener('close', (e) => onExit(e.reason || 'disconnect'));
      ws.addEventListener('error', () => onExit('error'));

      const inputDisposable = term.onData((d) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(d);
      });

      const sendResize = () => {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ kind: 'resize', cols: term.cols, rows: term.rows }));
        }
      };
      const resizeObs = new ResizeObserver(sendResize);
      resizeObs.observe(containerRef.current);

      dispose = () => {
        resizeObs.disconnect();
        inputDisposable.dispose();
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        term.dispose();
      };
    })();

    return () => {
      cancelled = true;
      if (dispose) dispose();
    };
  }, [wsUrl, onExit]);

  return <div ref={containerRef} className="h-full w-full rounded-md bg-[#0b0d10] p-2" />;
}
