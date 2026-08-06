import { ChevronLeft, LogOut } from 'lucide-react';
import { memo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { ShineBorder } from '@/components/ui/shine-border';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FLOATING_NAV_ITEMS,
  isNavGroup,
  useNavGroupState,
  type SidebarNavItem,
  type SidebarNavNode,
} from './navigation';

export const FloatingNavButton = memo(function FloatingNavButton({
  item,
  isActive,
  isChild = false,
  onClick,
}: {
  item: SidebarNavItem;
  isActive: boolean;
  isChild?: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={item.label}
          className={cn(
            'relative flex items-center justify-center rounded-lg transition-all duration-200',
            isChild ? 'h-8 w-8' : 'h-10 w-10',
            isActive
              ? 'bg-white/10 text-[#f97316]'
              : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full bg-[#f97316] shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
          )}
          <Icon className={cn(isChild ? 'h-4 w-4' : 'h-[18px] w-[18px]')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="z-[60]">
        <span className="flex items-center gap-2">
          {item.label}
          {item.showBadge && (
            <Badge variant="secondary" className="text-[9px] bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.2)] px-1.5 py-0.5">
              New
            </Badge>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
});

export interface FloatingNavPillProps {
  activeView: string;
  onViewChange?: (view: string) => void;
  /** Rendered as an expand button when provided (sidebar collapsed mode). */
  onExpand?: () => void;
}

/**
 * Hover-revealed floating navigation pill anchored to the left edge.
 * Used by the collapsed home sidebar and standalone on pages without a
 * persistent sidebar (Kanvas, timeline, editors, …).
 */
export const FloatingNavPill = memo(function FloatingNavPill({
  activeView,
  onViewChange,
  onExpand,
}: FloatingNavPillProps) {
  const { isGroupOpen, toggleGroup } = useNavGroupState(activeView);
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setIsVisible((current) => (current ? e.clientX <= 96 : e.clientX <= 80));
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Failed to log out');
    } else {
      toast.success('Logged out successfully');
      navigate('/');
    }
  };

  const handleItemClick = useCallback((item: SidebarNavItem) => {
    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
    } else if (item.isRoute) {
      navigate(item.path ?? appRoutes.kanvas);
    } else if (onViewChange) {
      onViewChange(item.id);
    } else {
      navigate(appRoutes.home);
    }
  }, [navigate, onViewChange]);

  const handleNodeClick = useCallback((node: SidebarNavNode) => {
    if (isNavGroup(node)) {
      toggleGroup(node.id);
      return;
    }
    handleItemClick(node);
  }, [handleItemClick, toggleGroup]);

  return (
    <TooltipProvider delayDuration={200}>
      {/* Invisible hover trigger zone */}
      <div className="fixed left-0 top-[68px] bottom-0 w-[80px] z-[49] pointer-events-none" />

      <aside
        className={cn(
          'fixed left-3 top-[calc(50%+34px)] -translate-y-1/2 z-50 flex max-h-[calc(100vh-100px)] flex-col items-center py-3 rounded-2xl',
          'bg-[#0A0A0A]/90 backdrop-blur-xl',
          'shadow-[0_0_15px_rgba(249,115,22,0.15),0_0_30px_rgba(249,115,22,0.05),0_8px_32px_rgba(0,0,0,0.5)]',
          'transition-all duration-300 ease-out',
          isVisible ? 'w-14 opacity-100 translate-x-0' : 'w-3 opacity-0 -translate-x-2 pointer-events-none overflow-hidden',
        )}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {/* Animated orange glow border */}
        <ShineBorder
          shineColor={["#f97316", "#d4a574"]}
          borderWidth={1}
          duration={8}
        />

        {/* Faint orange top-highlight */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-orange-500/5 to-transparent pointer-events-none" />

        {onExpand && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onExpand}
                  aria-label="Expand sidebar"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300"
                >
                  <ChevronLeft className="h-[18px] w-[18px] rotate-180" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="z-[60]">Expand sidebar</TooltipContent>
            </Tooltip>

            <div className="mx-auto my-2 h-px w-6 shrink-0 bg-white/[0.06]" />
          </>
        )}

        {/* Nav items */}
        <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto hide-scrollbar">
          {FLOATING_NAV_ITEMS.map((entry) => {
            if (entry.kind === 'divider') {
              return <div key={entry.id} className="mx-auto my-2 h-px w-6 shrink-0 bg-white/[0.06]" />;
            }

            const node = entry.node;
            const group = isNavGroup(node) ? node : null;
            const isOpen = group ? isGroupOpen(group.id) : false;

            return (
              <div key={node.id} className="flex shrink-0 flex-col items-center gap-1">
                <FloatingNavButton
                  item={node}
                  isActive={activeView === node.id}
                  onClick={() => handleNodeClick(node)}
                />
                {group && isOpen && group.children.map((child) => (
                  <FloatingNavButton
                    key={child.id}
                    item={child}
                    isActive={activeView === child.id}
                    isChild
                    onClick={() => handleItemClick(child)}
                  />
                ))}
              </div>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-auto my-2 h-px w-6 shrink-0 bg-white/[0.06]" />

        {/* Logout */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-rose-500/10 hover:text-rose-400"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="z-[60]">Logout</TooltipContent>
        </Tooltip>

        {/* Brand dot */}
        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-[#f97316]/60 shadow-[0_0_6px_rgba(249,115,22,0.3)]" />
        </div>
      </aside>
    </TooltipProvider>
  );
});
