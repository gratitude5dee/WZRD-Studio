import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

import { MobileBottomNav } from '@/components/home/MobileBottomNav';
import { Sidebar } from '@/components/home/Sidebar';
import { MotionSplatStudio } from '@/components/motion-splat/MotionSplatStudio';
import { useSidebar } from '@/contexts/SidebarContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMotionSplatStore } from '@/lib/stores/motion-splat-store';
import { appRoutes } from '@/lib/routes';

const exposeStoreForTests =
  import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true';

export default function MotionSplatPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isCollapsed } = useSidebar();

  // E2E harness: lets Playwright seed a manifest without a fal round-trip.
  useEffect(() => {
    if (!exposeStoreForTests) return;
    (window as unknown as { __wzrdMotionSplatStore?: typeof useMotionSplatStore }).__wzrdMotionSplatStore = useMotionSplatStore;
  }, []);

  const handleHomeViewChange = useCallback(
    (view: string) => {
      navigate(appRoutes.home, { state: { activeView: view } });
    },
    [navigate],
  );

  const handleCreateProject = useCallback(() => {
    navigate(appRoutes.projectSetup);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-kanvas-bg">
      <div className="hidden md:block">
        <Sidebar activeView="kanvas-motion-splat" onViewChange={handleHomeViewChange} />
      </div>

      <motion.div
        className="flex h-screen min-h-screen flex-col pb-20 md:pb-0"
        animate={{ marginLeft: isMobile ? 0 : isCollapsed ? 0 : 256 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        initial={false}
      >
        <MotionSplatStudio className="flex-1" />
      </motion.div>

      <MobileBottomNav activeView="kanvas-motion-splat" onViewChange={handleHomeViewChange} onCreateProject={handleCreateProject} />
    </div>
  );
}
