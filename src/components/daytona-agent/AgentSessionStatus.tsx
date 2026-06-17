import { Clock, Cpu, Power, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DaytonaAgentSession } from '@/services/daytonaAgentService';

interface AgentSessionStatusProps {
  session: DaytonaAgentSession | null;
  isLoading: boolean;
  onRefresh: () => void;
  onStop: () => void;
}

function formatExpiry(expiresAt?: string) {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m left`;
}

export function AgentSessionStatus({ session, isLoading, onRefresh, onStop }: AgentSessionStatusProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/15 text-amber-300">
          <Cpu className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-white">Daytona agent</p>
            <Badge variant="secondary" className="capitalize">
              {session?.status ?? 'idle'}
            </Badge>
          </div>
          <p className="truncate text-xs text-zinc-400">
            {session ? `${session.id.slice(0, 8)} · ${session.workspaceDir}` : 'No active session'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {session ? (
          <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatExpiry(session.expiresAt)}
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Refresh session"
          aria-label="Refresh session"
          disabled={isLoading}
          onClick={onRefresh}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          title="Stop session"
          aria-label="Stop session"
          disabled={!session || isLoading}
          onClick={onStop}
        >
          <Power className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
