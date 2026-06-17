import { Upload } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';

interface AgentUploadPanelProps {
  disabled?: boolean;
  isUploading?: boolean;
  onUpload: (file: File) => void;
}

export function AgentUploadPanel({ disabled, isUploading, onUpload }: AgentUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = '';
        }}
      />
      <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
        {isUploading ? 'Uploading...' : 'Upload'}
      </Button>
    </div>
  );
}
