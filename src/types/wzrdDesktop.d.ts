import type { WzrdDesktopBridge } from '@/lib/desktop';

declare global {
  interface Window {
    wzrdDesktop?: WzrdDesktopBridge;
  }
}

export {};
