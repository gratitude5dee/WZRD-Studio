import { describe, expect, it } from 'vitest';

import { deleteExportedClip, listExportedClips, saveExportedClip } from './localLibrary';
import type { ExportedClip } from './types';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

function clip(id: string): ExportedClip {
  return {
    id,
    sourceId: 'source-1',
    candidateId: 'candidate-1',
    sourceName: 'source.mp4',
    title: `Clip ${id}`,
    hook: 'Hook',
    archetype: 'hook',
    platformFit: ['shorts'],
    startSeconds: 0,
    endSeconds: 30,
    durationSeconds: 30,
    score: 80,
    exportPath: `/tmp/${id}.mp4`,
    createdAt: '2026-05-25T00:00:00.000Z',
  };
}

describe('Clip Studio local library persistence', () => {
  it('saves, lists, replaces, and deletes exported clip metadata', () => {
    const storage = new MemoryStorage();

    expect(saveExportedClip(clip('a'), storage)).toHaveLength(1);
    expect(saveExportedClip(clip('b'), storage).map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(saveExportedClip({ ...clip('a'), title: 'Updated' }, storage).map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(listExportedClips(storage)[0].title).toBe('Updated');
    expect(deleteExportedClip('a', storage).map((entry) => entry.id)).toEqual(['b']);
  });
});
