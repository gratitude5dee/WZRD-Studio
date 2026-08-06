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

export const FAVORITES_GROUP: SidebarNavGroup = {
  id: 'favorites',
  label: 'Favorites',
  icon: Star,
  collapsible: true,
  children: [],
  emptyLabel: 'No favorites yet',
};

export const SIDEBAR_SECTIONS: SidebarNavSection[] = [
  {
    id: 'studio',
    label: 'Studio',
    labelIcon: Sparkles,
    accent: true,
    items: [
      { id: 'all', label: 'All Projects', icon: FolderKanban },
      { id: 'shared', label: 'Shared with me', icon: Users },
      { id: 'community', label: 'Community', icon: Globe },
      FAVORITES_GROUP,
      { id: 'aura', label: 'Aura', icon: Sparkles },
    ],
  },
  {
    id: 'kanvas',
    items: [KANVAS_GROUP],
  },
  {
    id: 'ip-management',
    label: 'IP Management',
    labelIcon: ShieldCheck,
    items: [
      { id: 'asset-store', label: 'Asset Store', icon: Images },
      { id: 'ip-vault', label: 'WTR', icon: ShieldCheck, isRoute: true, path: appRoutes.ipVault },
    ],
  },
  {
    id: 'production',
    items: [
      CLIP_STUDIO_GROUP,
      { id: 'postz', label: 'Postz', icon: CalendarDays, isRoute: true, path: appRoutes.postz },
      { id: 'settings', label: 'Settings', icon: Settings, isRoute: true, path: appRoutes.settings.billing },
    ],
  },
];

export type FloatingNavEntry =
  | { kind: 'divider'; id: string }
  | { kind: 'item'; id: string; node: SidebarNavNode };

export const FLOATING_NAV_ITEMS: FloatingNavEntry[] = SIDEBAR_SECTIONS.flatMap((section, index) => [
  ...(index > 0 ? [{ kind: 'divider' as const, id: `_divider-${section.id}` }] : []),
  ...section.items.map((node) => ({ kind: 'item' as const, id: node.id, node })),
]);
