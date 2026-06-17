import { Download, FileText, Folder, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AgentFileEntry } from '@/services/daytonaAgentService';

interface AgentFileBrowserProps {
  files: AgentFileEntry[];
  path: string;
  isLoading?: boolean;
  onRefresh: () => void;
  onDownload: (filename: string) => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AgentFileBrowser({ files, path, isLoading, onRefresh, onDownload }: AgentFileBrowserProps) {
  return (
    <div className="flex h-full min-h-[260px] flex-col border-l border-white/10 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Output files</p>
          <p className="truncate text-xs text-zinc-500">{path || '/tmp/wzrd-output'}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Refresh files"
          aria-label="Refresh files"
          disabled={isLoading}
          onClick={onRefresh}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {files.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-zinc-500">No output files yet.</div>
        ) : (
          <div className="space-y-1">
            {files.map((file) => (
              <div key={file.path} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-white/5">
                {file.isDir ? (
                  <Folder className="h-4 w-4 text-amber-300" aria-hidden="true" />
                ) : (
                  <FileText className="h-4 w-4 text-zinc-300" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-100">{file.filename}</p>
                  <p className="text-xs text-zinc-500">{file.isDir ? 'folder' : formatBytes(file.bytes)}</p>
                </div>
                {!file.isDir ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={`Download ${file.filename}`}
                    aria-label={`Download ${file.filename}`}
                    onClick={() => onDownload(file.filename)}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
