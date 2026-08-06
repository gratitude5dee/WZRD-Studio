import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { supabase } from '@/integrations/supabase/client';
import type { KanvasStudio } from '@/features/kanvas/types';
import { KANVAS_STUDIO_ORDER } from '@/features/kanvas/helpers';
import { FloatingNavButton } from '@/components/home/Sidebar';
import {
  FLOATING_NAV_ITEMS,
  isNavGroup,
  useNavGroupState,
  type SidebarNavItem,
  type SidebarNavNode,
} from '@/components/home/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ShineBorder } from '@/components/ui/shine-border';

interface KanvasSidebarProps {
  activeStudio: KanvasStudio;
  onStudioChange: (studio: KanvasStudio) => void;
}

const KANVAS_STUDIO_PATH_PREFIX = `${appRoutes.kanvas}?studio=`;

export function KanvasSidebar({ activeStudio, onStudioChange }: KanvasSidebarProps) {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const activeView = `kanvas-${activeStudio}`;
  const { isGroupOpen, toggleGroup } = useNavGroupState(activeView);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setIsVisible(e.clientX <= 80);
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
    if (item.path?.startsWith(KANVAS_STUDIO_PATH_PREFIX)) {
      const studio = item.path.slice(KANVAS_STUDIO_PATH_PREFIX.length);
      if ((KANVAS_STUDIO_ORDER as readonly string[]).includes(studio)) {
        onStudioChange(studio as KanvasStudio);
        return;
      }
    }
    if (item.isRoute) {
      navigate(item.path ?? appRoutes.kanvas);
      return;
    }
    navigate(appRoutes.home, { state: { activeView: item.id } });
  }, [navigate, onStudioChange]);

  const handleNodeClick = useCallback((node: SidebarNavNode) => {
    if (isNavGroup(node)) {
      toggleGroup(node.id);
      return;
    }
    handleItemClick(node);
  }, [handleItemClick, toggleGroup]);

  return (
    <TooltipProvider delayDuration={200}>
      {/* Invisible hover trigger zone — desktop only */}
      <div className="hidden md:block fixed left-0 top-[68px] bottom-0 w-[80px] z-[49] pointer-events-none" />

      <aside
        className={cn(
          'hidden md:flex fixed left-3 top-[calc(50%+34px)] -translate-y-1/2 z-50 max-h-[calc(100vh-100px)] flex-col items-center py-3 rounded-2xl',
          'bg-[#0A0A0A]/90 backdrop-blur-xl',
          'shadow-[0_0_15px_rgba(249,115,22,0.15),0_0_30px_rgba(249,115,22,0.05),0_8px_32px_rgba(0,0,0,0.5)]',
          'transition-all duration-300 ease-out',
          isVisible
            ? 'w-14 opacity-100 translate-x-0'
            : 'w-3 opacity-0 -translate-x-2 pointer-events-none overflow-hidden',
        )}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {/* Animated orange glow border (matches the home floating pill) */}
        <ShineBorder
          shineColor={['#f97316', '#d4a574']}
          borderWidth={1}
          duration={8}
        />

        {/* Faint orange top-highlight */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-orange-500/5 to-transparent pointer-events-none" />

        {/* Home button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate(appRoutes.home)}
              aria-label="Home"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300"
            >
              <Home className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="z-[60]">Home</TooltipContent>
        </Tooltip>

        {/* Divider */}
        <div className="mx-auto my-2 h-px w-6 shrink-0 bg-white/[0.06]" />

        {/* Nav items (same structure as the home sidebar) */}
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
}
