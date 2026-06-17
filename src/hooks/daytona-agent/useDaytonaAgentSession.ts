import { useCallback, useEffect, useState } from 'react';
import { createDaytonaAgentSession, stopDaytonaAgentSession, type DaytonaAgentSession } from '@/services/daytonaAgentService';

export function useDaytonaAgentSession({ projectId }: { projectId?: string | null }) {
  const [session, setSession] = useState<DaytonaAgentSession | null>(null);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const createSession = useCallback(
    async ({ forceNew = false }: { forceNew?: boolean } = {}) => {
      setIsLoading(true);
      setError('');
      try {
        const next = await createDaytonaAgentSession({ projectId, forceNew });
        setSession(next);
        return next;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [projectId],
  );

  const stopSession = useCallback(async () => {
    if (!session) return null;
    setIsLoading(true);
    setError('');
    try {
      const next = await stopDaytonaAgentSession({ sessionId: session.id });
      setSession(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void createSession();
  }, [createSession]);

  return {
    session,
    setSession,
    error,
    isLoading,
    createSession,
    stopSession,
  };
}
