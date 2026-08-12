/**
 * Phase 3 — the Seedance reference-packet compiler: every slot populated or
 * explicitly null with a reason, and mode "auto" refused while Seedance 2.5
 * pricing is unverified (never invent a price).
 */
import { describe, expect, it } from 'vitest';
import {
  type CharacterNode,
  type SceneNode,
  type ShotNode,
  deriveContinuityEdges,
} from '../../supabase/functions/_shared/storyboard-graph.ts';
import {
  DEFAULT_SHOT_DURATION_SECONDS,
  SEEDANCE_REQUIRED_VERSION,
  SeedanceAutoModeUnavailableError,
  assertAutoModeAvailable,
  compileReferencePackets,
  compileStyleAnchor,
  reportPacketCompleteness,
} from '../../supabase/functions/_shared/seedance-packet.ts';

const project = {
  id: 'project-1',
  title: 'Nightfall',
  video_style: 'cinematic noir',
  cinematic_inspiration: 'Blade Runner 2049',
  aspect_ratio: '16:9',
  tone: 'ominous',
  styleReferenceUrl: 'https://cdn/style.png',
};

const scenes: SceneNode[] = [
  { id: 'scene-1', scene_number: 1, title: 'Rooftop', location: 'Rooftop' },
  { id: 'scene-2', scene_number: 2, title: 'Stairwell', location: 'Stairwell' },
  { id: 'scene-3', scene_number: 3, title: 'Rooftop again', location: 'Rooftop' },
];

const shots: ShotNode[] = [
  { id: 'shot-1', scene_id: 'scene-1', shot_number: 1, visual_prompt: 'Mara on the rooftop', shot_type: 'wide', image_url: 'https://cdn/1.png' },
  { id: 'shot-2', scene_id: 'scene-2', shot_number: 2, visual_prompt: 'Mara in the stairwell', shot_type: 'medium', image_url: 'https://cdn/2.png' },
  { id: 'shot-3', scene_id: 'scene-3', shot_number: 3, visual_prompt: 'Mara returns to the rooftop', shot_type: 'wide', image_url: null },
];

const characters: CharacterNode[] = [
  { id: 'char-1', name: 'Mara', image_url: 'https://cdn/mara.png' },
];

function compile(overrides: Partial<Parameters<typeof compileReferencePackets>[0]> = {}) {
  const shotList = overrides.shots ?? shots;
  const sceneList = overrides.scenes ?? scenes;
  const characterList = overrides.characters ?? characters;
  return compileReferencePackets({
    project: overrides.project ?? project,
    scenes: sceneList,
    shots: shotList,
    characters: characterList,
    edges: overrides.edges ?? deriveContinuityEdges({ scenes: sceneList, shots: shotList, characters: characterList }),
    ...overrides,
  });
}

describe('reference packet compiler', () => {
  const packets = compile();

  it('compiles one packet per shot in graph order', () => {
    expect(packets.map((packet) => packet.shotId)).toEqual(['shot-1', 'shot-2', 'shot-3']);
    expect(packets[0].duration).toBe(DEFAULT_SHOT_DURATION_SECONDS);
    expect(packets[0].camera).toContain('wide');
    expect(packets[0].negative).toBeTruthy();
  });

  it('resolves the continuity frame through the graph predecessor, not shot n-1', () => {
    expect(packets[2].continuityFrame.fromShotId).toBe('shot-1');
    expect(packets[2].continuityFrame.value).toBe('https://cdn/1.png');
    expect(packets[2].continuityFrame.via).toContain('location');
  });

  it('resolves character refs through character edges', () => {
    expect(packets[0].characterRefs).toHaveLength(1);
    expect(packets[0].characterRefs[0]).toMatchObject({ name: 'Mara', characterId: 'char-1', value: 'https://cdn/mara.png', reason: null });
  });

  it('never omits a slot silently — a missing value always carries a reason', () => {
    const bare = compile({
      project: { id: 'project-2' },
      scenes: [{ id: 'scene-x', scene_number: 1, title: 'Void' }],
      shots: [{ id: 'shot-x', scene_id: 'scene-x', shot_number: 1, visual_prompt: 'Someone somewhere' }],
      characters: [],
    });
    const packet = bare[0];
    for (const slot of [packet.settingRef, packet.styleAnchor, packet.continuityFrame]) {
      expect(slot).toBeDefined();
      if (slot.value === null) expect(typeof slot.reason).toBe('string');
      else expect(slot.reason).toBeNull();
    }
    expect(packet.continuityFrame.reason).toBe('first_shot_in_storyboard');
  });

  it('explains a character without an identity image instead of dropping it', () => {
    const packet = compile({ characters: [{ id: 'char-1', name: 'Mara', image_url: null }] })[0];
    expect(packet.characterRefs[0].value).toBeNull();
    expect(packet.characterRefs[0].reason).toBe('character_has_no_generated_identity_image');
  });

  it('builds a project-level style anchor, preferring an explicit reference image', () => {
    expect(compileStyleAnchor(project).value).toBe('https://cdn/style.png');
    expect(compileStyleAnchor({ id: 'p', video_style: 'cinematic noir', tone: 'ominous' }).value).toContain('cinematic noir');
    expect(compileStyleAnchor({ id: 'project-3' })).toEqual({
      value: null,
      reason: 'project_has_no_style_reference_asset_or_style_descriptors',
    });
  });

  it('reports completeness so the agent can approve shot by shot', () => {
    const report = reportPacketCompleteness(packets);
    expect(report.totalShots).toBe(3);
    expect(report.blocking).toEqual([]);
    // shot-1 has no predecessor: reported with a reason, never omitted.
    expect(report.emptySlots.some((slot) => slot.shotId === 'shot-1' && slot.slot === 'continuityFrame')).toBe(true);
    expect(report.emptySlots.every((slot) => typeof slot.reason === 'string' && slot.reason !== 'unknown')).toBe(true);
  });
});

describe('mode "auto" pricing gate', () => {
  const priceResolver = (row: { credits?: number | null }) => {
    if (!row.credits || row.credits <= 0) throw new Error('unpriced_model');
    return row.credits;
  };

  it('refuses when no Seedance 2.5 catalog row exists', () => {
    expect(() => assertAutoModeAvailable({ rows: [{ id: 'fal-ai/some-other-model', credits: 4 }], priceResolver })).toThrow(
      SeedanceAutoModeUnavailableError,
    );
    try {
      assertAutoModeAvailable({ rows: [], priceResolver });
    } catch (error) {
      expect((error as Error).message).toContain(`Seedance ${SEEDANCE_REQUIRED_VERSION}`);
      expect((error as Error).message).toContain('review');
    }
  });

  it('refuses when the row exists but has no verified price', () => {
    expect(() =>
      assertAutoModeAvailable({ rows: [{ id: 'bytedance/seedance-2.5', credits: 0, enabled: true }], priceResolver }),
    ).toThrow(/no verified price/);
  });

  it('refuses a disabled catalog row', () => {
    expect(() =>
      assertAutoModeAvailable({ rows: [{ id: 'bytedance/seedance-2.5', credits: 12, enabled: false }], priceResolver }),
    ).toThrow(SeedanceAutoModeUnavailableError);
  });

  it('only allows auto mode once a priced row exists', () => {
    const allowed = assertAutoModeAvailable({
      rows: [{ id: 'bytedance/seedance-2.5', credits: 12, enabled: true }],
      priceResolver,
    });
    expect(allowed).toEqual({ row: { id: 'bytedance/seedance-2.5', credits: 12, enabled: true }, credits: 12 });
  });
});
