import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  Clapperboard,
  DatabaseZap,
  FolderKanban,
  Globe,
  Images,
  Layers,
  Music2,
  Scissors,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { appRoutes } from '@/lib/routes';
import { KANVAS_STUDIO_ORDER, KANVAS_STUDIO_META } from '@/features/kanvas/helpers';
import { KANVAS_STUDIO_ICONS } from '@/features/kanvas/studioIcons';

export type SidebarNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  isRoute?: boolean;
  path?: string;
  showBadge?: boolean;
};

export type SidebarNavGroup = SidebarNavItem & {
  collapsible: true;
  children: SidebarNavItem[];
  /** Rendered in place of children when the group has none. */
  emptyLabel?: string;
};

export type SidebarNavNode = SidebarNavItem | SidebarNavGroup;

export type SidebarNavSection = {
  id: string;
  label?: string;
  labelIcon?: LucideIcon;
  accent?: boolean;
  items: SidebarNavNode[];
};

export function isNavGroup(node: SidebarNavNode): node is SidebarNavGroup {
  return 'collapsible' in node && node.collapsible === true;
}

export const kanvasStudioPath = (studio: string) => `${appRoutes.kanvas}?studio=${studio}`;

const KANVAS_GROUP: SidebarNavGroup = {
  id: 'kanvas',
  label: 'Kanvas',
  icon: Layers,
  collapsible: true,
  isRoute: true,
  path: appRoutes.kanvas,
  showBadge: true,
  children: [
    ...KANVAS_STUDIO_ORDER.map((studio) => ({
      id: `kanvas-${studio}`,
      label: KANVAS_STUDIO_META[studio].label,
      icon: KANVAS_STUDIO_ICONS[studio],
      isRoute: true,
      path: kanvasStudioPath(studio),
    })),
    { id: 'kanvas-lyrics', label: 'Lyrics', icon: Music2, isRoute: true, path: appRoutes.kanvasLyrics },
  ],
};

const CLIP_STUDIO_GROUP: SidebarNavGroup = {
  id: 'clip-studio',
  label: 'Clip Studio',
  icon: Clapperboard,
  collapsible: true,
  isRoute: true,
  path: appRoutes.clipper,
  children: [
    { id: 'clipper', label: 'Clipper', icon: Scissors, isRoute: true, path: appRoutes.clipper, showBadge: true },
    { id: 'sourcify', label: 'Sourcify', icon: DatabaseZap, isRoute: true, path: appRoutes.sourcify, showBadge: true },
  ],
};

const STUDIO_GROUP: SidebarNavGroup = {
  id: 'studio',
  label: 'Studio',
  icon: Sparkles,
  collapsible: true,
  children: [
    { id: 'all', label: 'All Projects', icon: FolderKanban },
    { id: 'shared', label: 'Shared with me', icon: Users },
    { id: 'community', label: 'Community', icon: Globe },
    { id: 'favorites', label: 'Favorites', icon: Star },
    { id: 'aura', label: 'Aura', icon: Sparkles },
  ],
};

const IP_MANAGEMENT_GROUP: SidebarNavGroup = {
  id: 'ip-management',
  label: 'IP Management',
  icon: ShieldCheck,
  collapsible: true,
  children: [
    { id: 'asset-store', label: 'Asset Store', icon: Images },
    { id: 'ip-vault', label: 'WTR', icon: ShieldCheck, isRoute: true, path: appRoutes.ipVault },
  ],
};

export const SIDEBAR_SECTIONS: SidebarNavSection[] = [
  {
    id: 'main',
    items: [
      STUDIO_GROUP,
      KANVAS_GROUP,
      IP_MANAGEMENT_GROUP,
      CLIP_STUDIO_GROUP,
      { id: 'postz', label: 'Postz', icon: CalendarDays, isRoute: true, path: appRoutes.postz },
      { id: 'settings', label: 'Settings', icon: Settings, isRoute: true, path: appRoutes.settings.billing },
    ],
  },
];

const GROUP_ID_BY_CHILD_ID: Record<string, string> = Object.fromEntries(
  SIDEBAR_SECTIONS.flatMap((section) =>
    section.items.flatMap((node) =>
      isNavGroup(node) ? node.children.map((child) => [child.id, node.id] as const) : []
    )
  )
);

/** The group that should be expanded so the active view stays visible. */
export function getGroupIdForView(view: string): string | undefined {
  return GROUP_ID_BY_CHILD_ID[view];
}

/**
 * Open/closed state for collapsible groups. The group owning the active view
 * is open unless the user explicitly collapsed it.
 */
export function useNavGroupState(activeView: string) {
  const activeGroupId = getGroupIdForView(activeView);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeGroupId) return;
    setOverrides((current) => {
      if (!(activeGroupId in current)) return current;
      const { [activeGroupId]: _removed, ...rest } = current;
      return rest;
    });
  }, [activeGroupId]);

  const isGroupOpen = useCallback(
    (groupId: string) => overrides[groupId] ?? groupId === activeGroupId,
    [overrides, activeGroupId]
  );

  const toggleGroup = useCallback(
    (groupId: string) => {
      setOverrides((current) => ({
        ...current,
        [groupId]: !(current[groupId] ?? groupId === activeGroupId),
      }));
    },
    [activeGroupId]
  );

  return { isGroupOpen, toggleGroup };
}

export type FloatingNavEntry =
  | { kind: 'divider'; id: string }
  | { kind: 'item'; id: string; node: SidebarNavNode };

export const FLOATING_NAV_ITEMS: FloatingNavEntry[] = SIDEBAR_SECTIONS.flatMap((section, index) => [
  ...(index > 0 ? [{ kind: 'divider' as const, id: `_divider-${section.id}` }] : []),
  ...section.items.map((node) => ({ kind: 'item' as const, id: node.id, node })),
]);
