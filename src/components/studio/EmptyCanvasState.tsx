import { Image, Plus, Upload, Video, Workflow, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface EmptyCanvasStateProps {
  onAddBlock: (type: 'text' | 'image' | 'video') => void;
  onExploreFlows?: () => void;
  onDismiss?: () => void;
  onStartFloraExample?: () => void;
}

interface PresetRailItem {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  eyebrow: string;
  action: () => void;
}

/**
 * The empty graph is intentionally an editorial starting point rather than a
 * dashboard of feature cards. Every item still calls the same graph actions;
 * only the presentation changes to match the Creator OS Studio language.
 */
const EmptyCanvasState = ({ onAddBlock, onExploreFlows, onDismiss, onStartFloraExample }: EmptyCanvasStateProps) => {
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  if (isDismissed) return null;

  const presets: PresetRailItem[] = [
    {
      id: 'empty',
      eyebrow: '00 / BLANK',
      title: 'Blank canvas',
      description: 'Start from scratch.',
      icon: Plus,
      action: handleDismiss,
    },
    {
      id: 'flora',
      eyebrow: '01 / SEED',
      title: 'WZRD Example',
      description: 'Open a collaborative image flow.',
      icon: Workflow,
      action: () => onStartFloraExample?.(),
    },
    {
      id: 'image',
      eyebrow: '02 / IMAGE',
      title: 'Image treatment',
      description: 'Turn a treatment into a still.',
      icon: Image,
      action: () => onAddBlock('image'),
    },
    {
      id: 'video',
      eyebrow: '03 / MOTION',
      title: 'Video treatment',
      description: 'Build a moving visual.',
      icon: Video,
      action: () => onAddBlock('video'),
    },
  ];

  return (
    <section
      aria-labelledby="studio-empty-title"
      className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto px-4 py-20 sm:px-8"
    >
      <motion.div
        className="pointer-events-auto w-full max-w-6xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="mx-auto max-w-2xl text-center">
          <p
            className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#d99b67]"
            style={{ fontFamily: 'var(--font-system)' }}
          >
            01 / Studio canvas
          </p>
          <h2
            id="studio-empty-title"
            className="mt-4 text-4xl leading-[0.91] tracking-[-0.055em] text-[#f3eee5] sm:text-5xl lg:text-6xl"
            style={{ fontFamily: 'var(--font-editorial)' }}
          >
            Make a world
            <span className="block text-[#d99961]">from the void.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-[#a39b91] sm:text-base">
            Start with a thought, a reference, or an empty frame. The graph holds every decision together.
          </p>
        </header>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-3 border border-[#d98248] bg-[#d98248] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#15100c] transition-colors hover:bg-[#efa467] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c895] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090806]"
            style={{ fontFamily: 'var(--font-system)' }}
            onClick={() => onAddBlock('text')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a node
          </button>
        </div>

        <div className="mt-10 border-y border-[#e6c6a4]/[0.16] bg-[#0b0a08]/72">
          <ol className="flex flex-col lg:flex-row">
            {presets.map((preset) => {
              const Icon = preset.icon;
              return (
                <li key={preset.id} className="min-w-0 flex-1 border-b border-[#e6c6a4]/[0.12] last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                  <button
                    type="button"
                    onClick={preset.action}
                    className="group flex min-h-[106px] w-full items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-[#e5a166]/[0.055] focus-visible:bg-[#e5a166]/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#eeb37f] lg:min-h-[166px] lg:flex-col lg:items-start lg:gap-0 lg:px-5 lg:py-6"
                  >
                    <span className="flex h-9 w-9 flex-none items-center justify-center border border-[#e6c6a4]/20 text-[#dd9156] transition-colors group-hover:border-[#df985d]/60 group-hover:text-[#f1ba89] lg:mt-6">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="block min-w-0 lg:mt-auto">
                      <span
                        className="block text-[9px] uppercase tracking-[0.18em] text-[#857d73]"
                        style={{ fontFamily: 'var(--font-system)' }}
                      >
                        {preset.eyebrow}
                      </span>
                      <span className="flex items-center gap-2 text-sm font-medium text-[#eee7de]">
                        {preset.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#8e877e]">
                        {preset.description}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] uppercase tracking-[0.14em] text-[#80786f]" style={{ fontFamily: 'var(--font-system)' }}>
          <span className="inline-flex items-center gap-2">
            <Upload className="h-3.5 w-3.5 text-[#bd7c4c]" aria-hidden="true" />
            Drag media anywhere to upload
          </span>
          {onExploreFlows ? (
            <button
              type="button"
              onClick={onExploreFlows}
              className="border-b border-transparent text-[#bdb2a5] transition-colors hover:border-[#d98248]/70 hover:text-[#efe5d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c895]"
            >
              Explore templates
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center gap-1 border-b border-transparent text-[#777068] transition-colors hover:border-[#a28f7a] hover:text-[#cdc3b6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c895]"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Dismiss
          </button>
        </div>
      </motion.div>
    </section>
  );
};

export default EmptyCanvasState;
