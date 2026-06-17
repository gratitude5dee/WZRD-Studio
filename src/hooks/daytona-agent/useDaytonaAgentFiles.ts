import { useCallback, useState } from 'react';
import {
  downloadDaytonaAgentOutput,
  listDaytonaAgentFiles,
  uploadDaytonaAgentFile,
  type AgentFileEntry,
} from '@/services/daytonaAgentService';

export function useDaytonaAgentFiles({ sessionId }: { sessionId?: string }) {
  const [files, setFiles] = useState<AgentFileEntry[]>([]);
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const refresh = useCallback(
    async (nextPath?: string) => {
      if (!sessionId) return;
      setIsLoading(true);
      setError('');
      try {
        const result = await listDaytonaAgentFiles({ sessionId, path: nextPath });
        setPath(result.path);
        setFiles(result.files);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId],
  );

  const upload = useCallback(
    async (file: File) => {
      if (!sessionId) return;
      setIsLoading(true);
      setIsUploading(true);
      setError('');
      try {
        await uploadDaytonaAgentFile({ sessionId, file });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsUploading(false);
        setIsLoading(false);
      }
    },
    [refresh, sessionId],
  );

  const download = useCallback(
    async (filename: string) => {
      if (!sessionId) return;
      setError('');
      try {
        const blob = await downloadDaytonaAgentOutput({ sessionId, filename });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [sessionId],
  );

  return {
    files,
    path,
    error,
    isLoading,
    isUploading,
    refresh,
    upload,
    download,
  };
}
