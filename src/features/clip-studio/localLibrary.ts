import type { ExportedClip } from './types';

export const CLIP_STUDIO_LIBRARY_STORAGE_KEY = 'wzrd.clipStudio.library.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function listExportedClips(storage?: StorageLike): ExportedClip[] {
  const target = resolveStorage(storage);
  if (!target) return [];

  try {
    const raw = target.getItem(CLIP_STUDIO_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is ExportedClip => Boolean(entry?.id)) : [];
  } catch {
    return [];
  }
}

export function saveExportedClip(entry: ExportedClip, storage?: StorageLike): ExportedClip[] {
  const target = resolveStorage(storage);
  const next = [entry, ...listExportedClips(target ?? undefined).filter((clip) => clip.id !== entry.id)];
  if (target) {
    target.setItem(CLIP_STUDIO_LIBRARY_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}
export function deleteExportedClip(id: string, storage?: StorageLike): ExportedClip[] {
  const target = resolveStorage(storage);
  const next = listExportedClips(target ?? undefined).filter((clip) => clip.id !== id);
  if (target) {
    if (next.length === 0) {
      target.removeItem(CLIP_STUDIO_LIBRARY_STORAGE_KEY);
    } else {
      target.setItem(CLIP_STUDIO_LIBRARY_STORAGE_KEY, JSON.stringify(next));
    }
  }
  return next;
}
