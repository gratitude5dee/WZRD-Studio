import { Clapperboard, Globe2, Image as ImageIcon, Mic2, Pencil, Sparkles, Video, type LucideIcon } from 'lucide-react';
import type { KanvasStudio } from '@/features/kanvas/types';

export const KANVAS_STUDIO_ICONS: Record<KanvasStudio, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  edit: Pencil,
  cinema: Clapperboard,
  lipsync: Mic2,
  worldview: Globe2,
  'character-creation': Sparkles,
};
