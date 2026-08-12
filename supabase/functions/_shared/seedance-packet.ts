/**
 * Seedance reference-packet compiler (Universal Plugin Phase 3).
 *
 * Pure module (no remote imports / no Deno globals) shared by the
 * `seedance-handoff` edge function and the `tests/plugin` suites.
 *
 * Every reference slot is represented as `{ value, reason }`: either the slot is
 * populated (`reason: null`) or it is explicitly null with a machine-readable
 * reason. Silent omission is never allowed — a reviewer approving a shot must be
 * able to see which references the model will *not* receive.
 */

import {
  type CharacterNode,
  type ContinuityEdge,
  type SceneNode,
  type ShotNode,
  buildEntityDictionary,
  normalizeEntityKey,
  orderShots,
  resolveContinuityPredecessor,
  shotEntities,
} from './storyboard-graph.ts';

export interface ReferenceSlot<T> {
  value: T | null;
  reason: string | null;
}

export interface CharacterReferenceSlot extends ReferenceSlot<string> {
  name: string;
  characterId: string | null;
}

export interface ContinuityFrameSlot extends ReferenceSlot<string> {
  fromShotId: string | null;
  /** Which entity the continuity edge was resolved through. */
  via: string | null;
}

export interface ShotReferencePacket {
  shotId: string;
  shotNumber: number;
  sceneId: string;
  sceneNumber: number | null;
  prompt: string;
  negative: string | null;
  camera: string;
  duration: number;
  characterRefs: CharacterReferenceSlot[];
  settingRef: ReferenceSlot<string>;
  styleAnchor: ReferenceSlot<string>;
  continuityFrame: ContinuityFrameSlot;
}

export interface ProjectStyleContext {
  id: string;
  title?: string | null;
  video_style?: string | null;
  cinematic_inspiration?: string | null;
  aspect_ratio?: string | null;
  tone?: string | null;
  styleReferenceUrl?: string | null;
}

export const DEFAULT_SHOT_DURATION_SECONDS = 5;
export const DEFAULT_NEGATIVE_PROMPT =
  'blurry, low resolution, watermark, text overlay, distorted anatomy, duplicated characters';

function packetField(shot: ShotNode, field: string): unknown {
  const packet = shot.shot_packet;
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return undefined;
  return (packet as Record<string, unknown>)[field];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Project-level style anchor. It is a constant for the whole project so every
 * shot in a handoff shares one aesthetic contract.
 */
export function compileStyleAnchor(project: ProjectStyleContext): ReferenceSlot<string> {
  const explicitUrl = asString(project.styleReferenceUrl);
  const descriptors = [project.video_style, project.cinematic_inspiration, project.tone]
    .map(asString)
    .filter((value): value is string => value !== null);

  if (explicitUrl) {
    return { value: explicitUrl, reason: null };
  }
  if (descriptors.length > 0) {
    return { value: descriptors.join(', '), reason: null };
  }
  return {
    value: null,
    reason: 'project_has_no_style_reference_asset_or_style_descriptors',
  };
}

export function compileCameraDirection(shot: ShotNode): string {
  const explicit = asString(packetField(shot, 'camera')) ?? asString(packetField(shot, 'camera_direction'));
  if (explicit) return explicit;
  const shotType = asString(shot.shot_type);
  return shotType ? `${shotType} shot, static framing` : 'medium shot, static framing';
}

export function compileShotDuration(shot: ShotNode): number {
  return (
    asPositiveNumber(packetField(shot, 'duration')) ??
    asPositiveNumber(packetField(shot, 'duration_seconds')) ??
    DEFAULT_SHOT_DURATION_SECONDS
  );
}

/**
 * Compile the full reference packet for a project's shots.
 *
 * `continuityFrame` resolves through the continuity graph, so a scene returning to
 * an earlier location inherits that earlier scene's last frame rather than the
 * immediately preceding shot's frame.
 */
export function compileReferencePackets(input: {
  project: ProjectStyleContext;
  scenes: SceneNode[];
  shots: ShotNode[];
  characters: CharacterNode[];
  edges: ContinuityEdge[];
  shotIds?: string[];
  negativePrompt?: string | null;
}): ShotReferencePacket[] {
  const dictionary = buildEntityDictionary({
    scenes: input.scenes,
    shots: input.shots,
    characters: input.characters,
  });
  const sceneById = new Map(input.scenes.map((scene) => [scene.id, scene]));
  const shotById = new Map(input.shots.map((shot) => [shot.id, shot]));
  const charactersByKey = new Map(
    input.characters.map((character) => [normalizeEntityKey(character.name), character]),
  );
  const styleAnchor = compileStyleAnchor(input.project);
  const ordered = orderShots(input.shots, input.scenes);
  const selected = input.shotIds && input.shotIds.length > 0
    ? ordered.filter((shot) => input.shotIds?.includes(shot.id))
    : ordered;

  return selected.map((shot) => {
    const scene = sceneById.get(shot.scene_id);
    const entities = shotEntities(shot, scene, dictionary);

    const characterRefs: CharacterReferenceSlot[] = entities.characters.map((name) => {
      const character = charactersByKey.get(normalizeEntityKey(name));
      if (!character) {
        return {
          name,
          characterId: null,
          value: null,
          reason: 'no_character_record_matches_this_name',
        };
      }
      const imageUrl = asString(character.image_url);
      return {
        name: character.name,
        characterId: character.id,
        value: imageUrl,
        reason: imageUrl ? null : 'character_has_no_generated_identity_image',
      };
    });

    const settingRef: ReferenceSlot<string> = (() => {
      const location = asString(scene?.location);
      if (!location) {
        return { value: null, reason: 'scene_has_no_location_set' };
      }
      const locationDetails = [location, asString(scene?.lighting), asString(scene?.weather)]
        .filter((value): value is string => value !== null)
        .join(', ');
      return { value: locationDetails, reason: null };
    })();

    const predecessor = resolveContinuityPredecessor({
      shotId: shot.id,
      edges: input.edges,
      shots: input.shots,
      scenes: input.scenes,
    });

    const continuityFrame: ContinuityFrameSlot = (() => {
      if (!predecessor.shotId) {
        return { value: null, reason: predecessor.reason ?? 'no_graph_predecessor', fromShotId: null, via: null };
      }
      const predecessorShot = shotById.get(predecessor.shotId);
      const via = predecessor.entityType && predecessor.entityKey
        ? `${predecessor.entityType}:${predecessor.entityKey}`
        : null;
      if (!predecessorShot) {
        return { value: null, reason: 'graph_predecessor_shot_not_found', fromShotId: predecessor.shotId, via };
      }
      const frame = asString(predecessorShot.video_url) ?? asString(predecessorShot.image_url);
      if (!frame) {
        return {
          value: null,
          reason: 'graph_predecessor_has_no_rendered_frame_yet',
          fromShotId: predecessor.shotId,
          via,
        };
      }
      return { value: frame, reason: null, fromShotId: predecessor.shotId, via };
    })();

    const prompt = asString(shot.visual_prompt) ?? asString(shot.prompt_idea) ?? '';

    return {
      shotId: shot.id,
      shotNumber: shot.shot_number,
      sceneId: shot.scene_id,
      sceneNumber: scene?.scene_number ?? null,
      prompt,
      negative: asString(packetField(shot, 'negative'))
        ?? asString(input.negativePrompt)
        ?? DEFAULT_NEGATIVE_PROMPT,
      camera: compileCameraDirection(shot),
      duration: compileShotDuration(shot),
      characterRefs,
      settingRef,
      styleAnchor,
      continuityFrame,
    };
  });
}

export interface PacketCompletenessReport {
  totalShots: number;
  emptySlots: Array<{ shotId: string; slot: string; reason: string }>;
  blocking: Array<{ shotId: string; slot: string; reason: string }>;
}

/** A packet is submit-ready only if every shot has a prompt. */
export function reportPacketCompleteness(packets: ShotReferencePacket[]): PacketCompletenessReport {
  const emptySlots: PacketCompletenessReport['emptySlots'] = [];
  const blocking: PacketCompletenessReport['blocking'] = [];

  for (const packet of packets) {
    if (!packet.prompt) {
      blocking.push({ shotId: packet.shotId, slot: 'prompt', reason: 'shot_has_no_prompt' });
    }
    for (const ref of packet.characterRefs) {
      if (ref.value === null) {
        emptySlots.push({ shotId: packet.shotId, slot: `characterRefs[${ref.name}]`, reason: ref.reason ?? 'unknown' });
      }
    }
    if (packet.settingRef.value === null) {
      emptySlots.push({ shotId: packet.shotId, slot: 'settingRef', reason: packet.settingRef.reason ?? 'unknown' });
    }
    if (packet.styleAnchor.value === null) {
      emptySlots.push({ shotId: packet.shotId, slot: 'styleAnchor', reason: packet.styleAnchor.reason ?? 'unknown' });
    }
    if (packet.continuityFrame.value === null) {
      emptySlots.push({
        shotId: packet.shotId,
        slot: 'continuityFrame',
        reason: packet.continuityFrame.reason ?? 'unknown',
      });
    }
  }

  return { totalShots: packets.length, emptySlots, blocking };
}

// ── Auto-mode pricing gate ──────────────────────────────────────────────────

/**
 * Auto mode submits and therefore spends. It stays disabled until verified
 * Seedance catalog pricing rows exist: `_shared/credits.ts` is catalog-strict and
 * throws `UnpricedModelError` rather than guessing, and this handoff must never
 * invent a price of its own.
 */
export class SeedanceAutoModeUnavailableError extends Error {
  readonly code = 'seedance_auto_mode_unavailable';
  readonly modelId: string | null;

  constructor(message: string, modelId: string | null) {
    super(message);
    this.name = 'SeedanceAutoModeUnavailableError';
    this.modelId = modelId;
  }
}

export interface CatalogPricingRow {
  id: string;
  enabled?: boolean | null;
  credits?: number | null;
  pricing_text?: string | null;
  pricing?: Record<string, unknown> | null;
}

export const SEEDANCE_MODEL_FAMILY = 'seedance';
export const SEEDANCE_REQUIRED_VERSION = '2.5';

/** Catalog rows for the Seedance generation family this handoff targets. */
export function findSeedanceCatalogRows(rows: CatalogPricingRow[]): CatalogPricingRow[] {
  return rows.filter((row) => {
    const id = row.id?.toLowerCase() ?? '';
    if (!id.includes(SEEDANCE_MODEL_FAMILY)) return false;
    return id.includes(SEEDANCE_REQUIRED_VERSION) || id.includes('v2.5') || id.includes('2-5');
  });
}

export function hasVerifiedPricing(
  row: CatalogPricingRow,
  priceResolver: (row: CatalogPricingRow) => number,
): boolean {
  if (row.enabled === false) return false;
  try {
    return priceResolver(row) > 0;
  } catch {
    return false;
  }
}

/**
 * Gate for `mode: "auto"`. Returns the priced catalog row, or throws with a
 * message the agent can relay verbatim to the user.
 */
export function assertAutoModeAvailable(input: {
  rows: CatalogPricingRow[];
  requestedModelId?: string | null;
  priceResolver: (row: CatalogPricingRow) => number;
}): { row: CatalogPricingRow; credits: number } {
  const candidates = input.requestedModelId
    ? input.rows.filter((row) => row.id === input.requestedModelId)
    : findSeedanceCatalogRows(input.rows);

  if (candidates.length === 0) {
    throw new SeedanceAutoModeUnavailableError(
      `seedance_handoff mode "auto" is disabled: no Seedance ${SEEDANCE_REQUIRED_VERSION} row exists in ai_model_catalog, so its price is unverified. ` +
        'Use mode "review" to compile and approve the reference packet at 0 credits, then submit from the app once catalog pricing is published.',
      input.requestedModelId ?? null,
    );
  }

  for (const row of candidates) {
    if (!hasVerifiedPricing(row, input.priceResolver)) continue;
    return { row, credits: input.priceResolver(row) };
  }

  throw new SeedanceAutoModeUnavailableError(
    `seedance_handoff mode "auto" is disabled: Seedance ${SEEDANCE_REQUIRED_VERSION} exists in ai_model_catalog but has no verified price ` +
      '(catalog-strict billing refuses unpriced models, and this tool never invents a price). Use mode "review" — it is free.',
    candidates[0]?.id ?? null,
  );
}
