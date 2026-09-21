import { describe, expect, it } from 'vitest';

import { KANVAS_NAV_ITEMS, kanvasStudioFromNavItem } from '@/components/home/navigation';
import { appRoutes, getRouteEntry, isRegisteredRoute } from '@/lib/routes';

describe('Motion Splat route', () => {
  it('registers the canonical top-level page', () => {
    expect(appRoutes.motionSplat).toBe('/motion-splat');
    expect(isRegisteredRoute('/motion-splat')).toBe(true);
    expect(getRouteEntry('/motion-splat')?.category).toBe('core');
  });

  it('is a routed Kanvas nav entry, like Lyrics', () => {
    const item = KANVAS_NAV_ITEMS.find((entry) => entry.id === 'kanvas-motion-splat');
    expect(item).toBeDefined();
    expect(item?.isRoute).toBe(true);
    expect(item?.path).toBe(appRoutes.motionSplat);
    expect(kanvasStudioFromNavItem(item!)).toBeNull();
  });
});
