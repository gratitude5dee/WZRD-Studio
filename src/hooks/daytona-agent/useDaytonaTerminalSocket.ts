import { useCallback, useState } from 'react';
import { createDaytonaPtyToken, type DaytonaAgentSession } from '@/services/daytonaAgentService';

export function useDaytonaTerminalSocket() {
  const [wsUrl, setWsUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async ({ session }: { session: DaytonaAgentSession }) => {
    setIsConnecting(true);
    setError('');
    try {
      const token = await createDaytonaPtyToken({ sessionId: session.id });
      setWsUrl(token.wsUrl);
      return token;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWsUrl('');
  }, []);

  return {
    wsUrl,
    error,
    isConnecting,
    connect,
    disconnect,
  };
}
