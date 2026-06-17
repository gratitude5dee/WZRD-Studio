import { useEffect, useState } from 'react';

interface Props {
  sessionId: string;
  expiresAt: string;
  onStop: () => void;
}

export function SessionHeader({ sessionId, expiresAt, onStop }: Props) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, '0');

  return (
    <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
      <span className="font-mono text-muted-foreground">session {sessionId.slice(0, 8)} · TTL {m}:{s}</span>
      <button
        type="button"
        className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700"
        onClick={onStop}
      >
        Stop
      </button>
    </div>
  );
}
