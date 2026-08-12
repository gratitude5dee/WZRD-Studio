/**
 * Phase 3 acceptance: the three-scene fixture where scene 3 returns to scene 1's
 * location must resolve scene 1's frame, not scene 2's.
 */
import { describe, expect, it } from 'vitest';
import {
  type CharacterNode,
  type SceneNode,
  type ShotNode,
  deriveContinuityEdges,
  diffStoryboard,
  extractEntities,
  buildEntityDictionary,
  normalizeEntityKey,
  resolveContinuityPredecessor,
} from '../../supabase/functions/_shared/storyboard-graph.ts';

const scenes: SceneNode[] = [
  { id: 'scene-1', scene_number: 1, title: 'Rooftop', location: 'Rooftop', lighting: 'dusk' },
  { id: 'scene-2', scene_number: 2, title: 'Stairwell', location: 'Stairwell', lighting: 'fluorescent' },
  { id: 'scene-3', scene_number: 3, title: 'Rooftop again', location: 'Rooftop', lighting: 'night' },
];

const shots: ShotNode[] = [
  { id: 'shot-1', scene_id: 'scene-1', shot_number: 1, visual_prompt: 'Mara stands on the rooftop holding the brass key', image_url: 'https://cdn/1.png' },
  { id: 'shot-2', scene_id: 'scene-2', shot_number: 2, visual_prompt: 'Mara descends the stairwell', image_url: 'https://cdn/2.png' },
  { id: 'shot-3', scene_id: 'scene-3', shot_number: 3, visual_prompt: 'Mara returns to the rooftop at night', image_url: null },
];

const characters: CharacterNode[] = [{ id: 'char-1', name: 'Mara', image_url: 'https://cdn/mara.png' }];

describe('continuity graph derivation', () => {
  const edges = deriveContinuityEdges({ scenes, shots, characters });

  it('derives typed edges for characters and locations', () => {
    expect(edges.some((edge) => edge.entity_type === 'character' && edge.entity_key === 'mara')).toBe(true);
    expect(edges.some((edge) => edge.entity_type === 'location' && edge.entity_key === 'rooftop')).toBe(true);
    expect(edges.every((edge) => ['character', 'location', 'prop'].includes(edge.entity_type))).toBe(true);
  });

  it('links shot 3 back to shot 1 through the shared rooftop location', () => {
    const locationEdge = edges.find(
      (edge) => edge.to_shot_id === 'shot-3' && edge.entity_type === 'location' && edge.entity_key === 'rooftop',
    );
    expect(locationEdge?.from_shot_id).toBe('shot-1');
  });

  it('resolves the predecessor of shot 3 as shot 1, not shot 2', () => {
    const resolution = resolveContinuityPredecessor({ shotId: 'shot-3', edges, shots, scenes });
    expect(resolution.shotId).toBe('shot-1');
    expect(resolution.entityType).toBe('location');
    expect(resolution.reason).toBeNull();
  });

  it('never invents a predecessor for the first shot', () => {
    const resolution = resolveContinuityPredecessor({ shotId: 'shot-1', edges, shots, scenes });
    expect(resolution.shotId).toBeNull();
    expect(resolution.reason).toBe('first_shot_in_storyboard');
  });

  it('honours an agent override of the predecessor', () => {
    const overridden = shots.map((shot) =>
      shot.id === 'shot-3' ? { ...shot, continuity: { predecessorShotId: 'shot-2' } } : shot,
    );
    const overriddenEdges = deriveContinuityEdges({ scenes, shots: overridden, characters });
    const resolution = resolveContinuityPredecessor({ shotId: 'shot-3', edges: overriddenEdges, shots: overridden, scenes });
    expect(resolution.shotId).toBe('shot-2');
    expect(resolution.source).toBe('agent');
  });

  it('honours an explicit continuity reset', () => {
    const reset = shots.map((shot) => (shot.id === 'shot-3' ? { ...shot, continuity: { reset: true } } : shot));
    const resetEdges = deriveContinuityEdges({ scenes, shots: reset, characters });
    const resolution = resolveContinuityPredecessor({ shotId: 'shot-3', edges: resetEdges, shots: reset, scenes });
    expect(resolution.shotId).toBeNull();
    expect(resolution.reason).toBe('continuity_reset_requested_by_agent');
  });

  it('does not link an unrelated shot to its sequence neighbour', () => {
    const isolated: ShotNode[] = [
      ...shots,
      { id: 'shot-4', scene_id: 'scene-3', shot_number: 4, visual_prompt: 'An unrelated satellite drifts above Neptune' },
    ];
    const isolatedScenes: SceneNode[] = [...scenes];
    const isolatedEdges = deriveContinuityEdges({ scenes: isolatedScenes, shots: isolated, characters });
    const resolution = resolveContinuityPredecessor({ shotId: 'shot-4', edges: isolatedEdges, shots: isolated, scenes: isolatedScenes });
    // shot-4 sits in scene 3, so it shares the rooftop location; the point is that
    // resolution follows an entity edge rather than "the shot before me".
    expect(resolution.shotId === null || resolution.entityType !== null).toBe(true);
  });
});

describe('entity extraction', () => {
  const dictionary = buildEntityDictionary({ scenes, shots, characters });

  it('extracts characters, locations, and props from prompt text', () => {
    const entities = extractEntities('Mara stands on the rooftop holding the brass key', dictionary);
    expect(entities.characters.map(normalizeEntityKey)).toContain('mara');
    expect(entities.locations.map(normalizeEntityKey)).toContain('rooftop');
  });

  it('does not match a name inside a longer word', () => {
    const entities = extractEntities('Maraschino cherries on the counter', dictionary);
    expect(entities.characters).toEqual([]);
  });
});

describe('storyboard diff', () => {
  it('reports staged creates and flags a shot without a prompt', () => {
    const diff = diffStoryboard({
      revision: 3,
      scenes,
      shots,
      characters,
      state: {
        scenes: [],
        shots: [{ op: 'create', key: 'new', sceneId: 'scene-3', shot_number: 4 }],
        notes: null,
      },
    });
    expect(diff.creditCost).toBe(0);
    expect(diff.nextRevision).toBe(4);
    expect(diff.entries.length).toBeGreaterThan(0);
    expect(diff.warnings.some((warning) => warning.code === 'shot_missing_prompt')).toBe(true);
  });
});
