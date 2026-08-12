import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SegmentedControl } from '@/components/craft/SegmentedControl';
import '@/components/craft/craft.css';

export interface WorkflowSettings {
  defaultModel: 'auto' | 'fast' | 'quality' | 'premium';
  outputResolution: '1K' | '2K' | '4K';
  workflowComplexity: 'simple' | 'standard' | 'advanced';
}

const DEFAULT_SETTINGS: WorkflowSettings = {
  defaultModel: 'auto',
  outputResolution: '2K',
  workflowComplexity: 'standard',
};

const MODEL_OPTIONS: { value: WorkflowSettings['defaultModel']; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto', description: 'Best model for each task' },
  { value: 'fast', label: 'Fast', description: 'Fastest generation (~3s)' },
  { value: 'quality', label: 'Quality', description: 'Higher fidelity (~8s)' },
  { value: 'premium', label: 'Premium', description: 'Best quality (~10s)' },
];

const RESOLUTION_OPTIONS: { value: WorkflowSettings['outputResolution']; label: string }[] = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const COMPLEXITY_OPTIONS: { value: WorkflowSettings['workflowComplexity']; label: string; description: string }[] = [
  { value: 'simple', label: 'Simple', description: '1–2 nodes' },
  { value: 'standard', label: 'Standard', description: '2–4 nodes' },
  { value: 'advanced', label: 'Advanced', description: '3–6 nodes' },
];

interface WorkflowSettingsMenuProps {
  settings: WorkflowSettings;
  onSettingsChange: (settings: WorkflowSettings) => void;
  className?: string;
}

export function WorkflowSettingsMenu({
  settings,
  onSettingsChange,
  className,
}: WorkflowSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    },
    [open]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleClickOutside, handleKeyDown]);

  const updateSetting = useCallback(
    <K extends keyof WorkflowSettings>(key: K, value: WorkflowSettings[K]) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange]
  );

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
          open
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border/60 bg-muted/60 text-muted-foreground hover:border-border hover:text-foreground'
        )}
        aria-label="Workflow settings"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Settings className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-full right-0 z-50 mb-2 w-[280px] overflow-hidden rounded-2xl border border-border/60 bg-background/95 shadow-lg backdrop-blur-2xl"
            role="dialog"
            aria-label="Generation settings"
          >
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <span className="text-sm font-medium text-foreground">Generation Settings</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close generation settings"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              {/* Default Model */}
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Default Model
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {MODEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateSetting('defaultModel', opt.value)}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-left transition-colors',
                        settings.defaultModel === opt.value
                          ? 'border-primary/40 bg-primary/10 text-foreground'
                          : 'border-border/60 bg-muted/50 text-muted-foreground hover:border-border hover:text-foreground'
                      )}
                    >
                      <div className="text-xs font-medium">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Resolution */}
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Output Resolution
                </div>
                <SegmentedControl
                  segments={RESOLUTION_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                  value={settings.outputResolution}
                  onChange={(value) => updateSetting('outputResolution', value)}
                  className="w-full"
                />
              </div>

              {/* Workflow Complexity */}
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Workflow Complexity
                </div>
                <div className="space-y-1.5">
                  {COMPLEXITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateSetting('workflowComplexity', opt.value)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors',
                        settings.workflowComplexity === opt.value
                          ? 'border-primary/40 bg-primary/10 text-foreground'
                          : 'border-border/60 bg-muted/50 text-muted-foreground hover:border-border hover:text-foreground'
                      )}
                    >
                      <span className="text-xs font-medium">{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { DEFAULT_SETTINGS };
export default WorkflowSettingsMenu;
