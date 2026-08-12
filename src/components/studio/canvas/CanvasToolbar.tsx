import React from 'react';
import { motion } from 'framer-motion';
import { 
  Link2, 
  MousePointer2, 
  Grid3x3, 
  Maximize2,
  ZoomIn,
  ZoomOut,
  Trash2,
  Copy,
  Layers,
  Play,
  Square,
  Loader2,
  Save,
  Hand,
  MousePointer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface CanvasToolbarProps {
  connectionMode: 'drag' | 'click';
  onToggleConnectionMode: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  selectedCount: number;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  className?: string;
  // Execution props
  isExecuting?: boolean;
  executionProgress?: { completed: number; total: number };
  onExecute?: () => void;
  onCancelExecution?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  // Pan/Select mode
  interactionMode?: 'pan' | 'select';
  onToggleInteractionMode?: () => void;
}

const toolButton = 'h-10 w-10 rounded-none border border-transparent text-[#aaa096] transition-colors hover:border-[#e5c6a6]/20 hover:bg-[#e4a267]/[0.07] hover:text-[#f2e9df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edbc8e]';
const railTooltip = 'flex items-center gap-2 border-[#e5c6a6]/20 bg-[#0d0b09] text-[#eee6dc]';

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  connectionMode,
  onToggleConnectionMode,
  showGrid,
  onToggleGrid,
  onFitView,
  onZoomIn,
  onZoomOut,
  selectedCount,
  onDeleteSelected,
  onDuplicateSelected,
  className,
  isExecuting = false,
  executionProgress,
  onExecute,
  onCancelExecution,
  onSave,
  isSaving = false,
  interactionMode = 'pan',
  onToggleInteractionMode,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      data-walkthrough="toolbar"
      className={cn(
        'absolute bottom-6 left-[calc(50%-150px)] ml-[-10px] -translate-x-1/2 z-50',
        'flex items-center gap-1 border-y border-[#e5c6a6]/[0.2] bg-[#0a0907]/[0.96] px-1 py-1 backdrop-blur-md',
        'shadow-[0_14px_38px_rgba(0,0,0,0.42)]',
        className
      )}
    >
      <TooltipProvider delayDuration={300}>
        {/* Execute/Stop Button */}
        {onExecute && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                {isExecuting ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`${toolButton} border-[#a45d52]/35 bg-[#452622]/45 text-[#e1a39a] hover:bg-[#55302a]/65`}
                    onClick={onCancelExecution}
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`${toolButton} border-[#d98248]/45 bg-[#d98248] text-[#180f09] hover:bg-[#edaa73] hover:text-[#180f09]`}
                    onClick={onExecute}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent side="top" className={railTooltip}>
                <span>{isExecuting ? 'Stop Execution' : 'Run Graph'}</span>
                <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">⌘R</kbd>
              </TooltipContent>
            </Tooltip>

            {/* Execution Progress */}
            {isExecuting && executionProgress && (
              <div className="flex items-center gap-2 px-2" style={{ fontFamily: 'var(--font-system)' }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#df965b]" />
                <span className="text-[10px] text-[#d2c7ba]">
                  {executionProgress.completed}/{executionProgress.total}
                </span>
              </div>
            )}

            <Separator orientation="vertical" className="h-6 bg-[#e5c6a6]/15" />
          </>
        )}

        {/* Save Button */}
        {onSave && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    toolButton,
                    isSaving && 'opacity-50 cursor-not-allowed'
                  )}
                  onClick={onSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className={railTooltip}>
                <span>Save Graph</span>
                <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">⌘S</kbd>
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 bg-[#e5c6a6]/15" />
          </>
        )}

        {/* Pan/Select Mode Toggle */}
        {onToggleInteractionMode && (
          <>
            <div className="flex items-center border border-[#e5c6a6]/10 bg-[#0a0907]">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-9 w-9 rounded-none border border-transparent text-[#aaa096] transition-colors hover:bg-[#e4a267]/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edbc8e]',
                      interactionMode === 'pan' && 'border-[#e5c6a6]/20 bg-[#e4a267]/[0.07] text-[#f2e9df]'
                    )}
                    onClick={() => interactionMode !== 'pan' && onToggleInteractionMode()}
                  >
                    <Hand className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className={railTooltip}>
                  <span>Pan Mode</span>
                  <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">H</kbd>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-9 w-9 rounded-none border border-transparent text-[#aaa096] transition-colors hover:bg-[#e4a267]/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edbc8e]',
                      interactionMode === 'select' && 'border-[#d98248]/45 bg-[#e4a267]/[0.09] text-[#e99b5e]'
                    )}
                    onClick={() => interactionMode !== 'select' && onToggleInteractionMode()}
                  >
                    <MousePointer className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className={railTooltip}>
                  <span>Select Mode</span>
                  <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">V</kbd>
                </TooltipContent>
              </Tooltip>
            </div>

            <Separator orientation="vertical" className="h-6 bg-[#e5c6a6]/15" />
          </>
        )}

        {/* Connection Mode Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                toolButton,
                connectionMode === 'click' && 'border-[#d98248]/45 bg-[#e4a267]/[0.09] text-[#e99b5e] hover:bg-[#e4a267]/[0.14]'
              )}
              onClick={onToggleConnectionMode}
            >
              {connectionMode === 'drag' ? (
                <MousePointer2 className="h-4 w-4" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className={railTooltip}>
            <span>{connectionMode === 'drag' ? 'Drag to Connect' : 'Click to Connect'}</span>
            <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">C</kbd>
          </TooltipContent>
        </Tooltip>

        {/* Grid Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                toolButton,
                showGrid && 'border-[#e5c6a6]/25 bg-[#e4a267]/[0.07] text-[#f2e9df]'
              )}
              onClick={onToggleGrid}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className={railTooltip}>
            <span>Toggle Guides</span>
            <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">G</kbd>
          </TooltipContent>
        </Tooltip>

        {/* View Controls */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={toolButton}
              onClick={onFitView}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className={railTooltip}>
            <span>Fit View</span>
            <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">F</kbd>
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={toolButton}
                onClick={onZoomOut}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className={railTooltip}>
              <span>Zoom Out</span>
              <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">-</kbd>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={toolButton}
                onClick={onZoomIn}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className={railTooltip}>
              <span>Zoom In</span>
              <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">+</kbd>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Selection Actions */}
        {selectedCount > 0 && (
          <>
            <Separator orientation="vertical" className="h-6 bg-[#e5c6a6]/15" />
            
            <div className="flex items-center gap-1">
              <Badge variant="secondary" className="h-7 rounded-none border border-[#e5c6a6]/15 bg-[#e4a267]/[0.07] px-2 text-xs text-[#ddd2c4]">
                <Layers className="h-3 w-3 mr-1" />
                {selectedCount}
              </Badge>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`${toolButton} hover:text-[#e99b5e]`}
                    onClick={onDuplicateSelected}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className={railTooltip}>
                  <span>Duplicate</span>
                  <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">⌘D</kbd>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`${toolButton} hover:border-[#a45d52]/35 hover:bg-[#452622]/45 hover:text-[#e1a39a]`}
                    onClick={onDeleteSelected}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className={railTooltip}>
                  <span>Delete</span>
                  <kbd className="border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">⌫</kbd>
                </TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </TooltipProvider>
    </motion.div>
  );
};
