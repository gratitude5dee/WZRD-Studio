import { useEffect, useRef } from 'react';

interface AgentTerminalProps {
  wsUrl: string;
  onOpen?: () => void;
  onExit: (reason: string) => void;
}

export function AgentTerminal({ wsUrl, onOpen, onExit }: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !wsUrl) return;
    let cancelled = false;
    let disposed = false;
    let dispose: (() => void) | null = null;

    void (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);
      await import('@xterm/xterm/css/xterm.css');
      if (cancelled || !containerRef.current) return;

      const terminal = new Terminal({
        fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
        fontSize: 13,
        cursorBlink: true,
        theme: {
          background: '#07090d',
          foreground: '#f8fafc',
          cursor: '#f59e0b',
        },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.loadAddon(new WebLinksAddon());
      terminal.open(containerRef.current);
      fit.fit();

      const socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('open', () => {
        fit.fit();
        onOpen?.();
      });
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          terminal.write(event.data);
          return;
        }
        terminal.write(new Uint8Array(event.data as ArrayBuffer));
      });
      socket.addEventListener('close', (event) => {
        if (!disposed) {
          onExit(event.reason || 'disconnect');
        }
      });
      socket.addEventListener('error', () => onExit('error'));

      const inputDisposable = terminal.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data);
      });

      const sendResize = () => {
        fit.fit();
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ kind: 'resize', cols: terminal.cols, rows: terminal.rows }));
        }
      };
      const observer = new ResizeObserver(sendResize);
      observer.observe(containerRef.current);

      dispose = () => {
        disposed = true;
        observer.disconnect();
        inputDisposable.dispose();
        try {
          socket.close();
        } catch {
          // closed already
        }
        terminal.dispose();
      };
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [onExit, onOpen, wsUrl]);

  return <div ref={containerRef} className="h-full min-h-[420px] w-full bg-[#07090d] p-2" />;
}
