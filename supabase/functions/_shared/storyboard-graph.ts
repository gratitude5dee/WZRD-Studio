/**
 * Shot-graph continuity + storyboard session helpers (Universal Plugin Phase 3).
 *
 * Pure TypeScript on purpose: no remote imports and no Deno globals, so the same
 * module is used by the `storyboard-session` / `seedance-handoff` edge functions
 * and by the Node/vitest conformance suites under `tests/plugin/`.
 *
 * Continuity model: shots are nodes; a directed edge `from -> to` means `to`
 * inherits continuity of one entity (character / location / prop) from `from`.
 * Edges are derived at storyboard_commit by entity extraction over shot prompts
 * and are overridable per shot via `update_shot({ continuity })`.
 *
 * The graph is what makes reference resolution correct: the continuity frame of a
 * shot is the last frame of its *graph* predecessor for the location entity, which
 * is not necessarily shot n-1 (a scene returning to an earlier location resolves
 * back to that earlier scene).
 */

export type ContinuityEntityType = 'character' | 'location' | 'prop';

export interface SceneNode {
  id: string;
  scene_number: number;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  lighting?: string | null;
  weather?: string | null;
}

export interface ShotNode {
  id: string;
  scene_id: string;
  shot_number: number;
  prompt_idea?: string | null;
  visual_prompt?: string | null;
  dialogue?: string | null;
  shot_type?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  shot_packet?: Record<string, unknown> | null;
  continuity?: ContinuityOverride | null;
}

export interface CharacterNode {
  id: string;
  name: string;
  image_url?: string | null;
  description?: string | null;
}

/** Agent-supplied continuity override stored on `shots.continuity`. */
export interface ContinuityOverride {
  characters?: string[];
  locations?: string[];
  props?: string[];
  /** Force the graph predecessor instead of deriving it. */
  predecessorShotId?: string | null;
  /** Explicitly mark this shot as a continuity reset (no predecessor). */
  reset?: boolean;
}

export interface ContinuityEdge {
  from_shot_id: string;
  to_shot_id: string;
  entity_type: ContinuityEntityType;
  entity_key: string;
  source: 'derived' | 'agent';
}

export interface EntityDictionary {
  characters: string[];
  locations: string[];
  props: string[];
}

export interface ExtractedEntities {
  characters: string[];
  locations: string[];
  props: string[];
}

// ── Entity extraction ───────────────────────────────────────────────────────

export function normalizeEntityKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive whole-phrase match of a known entity inside free text. */
export function textMentionsEntity(text: string, entity: string): boolean {
  const key = normalizeEntityKey(entity);
  if (!key) return false;
  const haystack = ` ${normalizeEntityKey(text)} `;
  return haystack.includes(` ${key} `);
}

/**
 * Extract known entities from a shot's text. Extraction is dictionary-driven —
 * we never invent entities from arbitrary nouns, so edges stay explainable.
 */
export function extractEntities(text: string, dictionary: EntityDictionary): ExtractedEntities {
  const pick = (candidates: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const candidate of candidates) {
      const key = normalizeEntityKey(candidate);
      if (!key || seen.has(key)) continue;
      if (textMentionsEntity(text, candidate)) {
        seen.add(key);
        out.push(candidate);
      }
    }
    return out;
  };

  return {
    characters: pick(dictionary.characters),
    locations: pick(dictionary.locations),
    props: pick(dictionary.props),
  };
}

export function shotText(shot: ShotNode, scene?: SceneNode): string {
  return [
    shot.visual_prompt,
    shot.prompt_idea,
    shot.dialogue,
    scene?.title,
    scene?.description,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' \n ');
}

/** Deterministic storyboard order: scene number, then shot number. */
export function orderShots(shots: ShotNode[], scenes: SceneNode[]): ShotNode[] {
  const sceneOrder = new Map(scenes.map((scene) => [scene.id, scene.scene_number ?? 0]));
  return [...shots].sort((a, b) => {
    const sceneDelta = (sceneOrder.get(a.scene_id) ?? 0) - (sceneOrder.get(b.scene_id) ?? 0);
    if (sceneDelta !== 0) return sceneDelta;
    return (a.shot_number ?? 0) - (b.shot_number ?? 0);
  });
}

export function buildEntityDictionary(input: {
  scenes: SceneNode[];
  shots: ShotNode[];
  characters: CharacterNode[];
}): EntityDictionary {
  const locations = new Set<string>();
  for (const scene of input.scenes) {
    if (scene.location) locations.add(scene.location);
  }
  const props = new Set<string>();
  for (const shot of input.shots) {
    for (const location of shot.continuity?.locations ?? []) locations.add(location);
    for (const prop of shot.continuity?.props ?? []) props.add(prop);
  }
  return {
    characters: input.characters.map((character) => character.name).filter(Boolean),
    locations: [...locations],
    props: [...props],
  };
}

/** Entities a shot carries, merging derived extraction with agent overrides. */
export function shotEntities(
  shot: ShotNode,
  scene: SceneNode | undefined,
  dictionary: EntityDictionary,
): ExtractedEntities {
  const derived = extractEntities(shotText(shot, scene), dictionary);
  const override = shot.continuity ?? {};

  const merge = (a: string[], b: string[] | undefined) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of [...(b ?? []), ...a]) {
      const key = normalizeEntityKey(value);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out;
  };

  const locations = merge(derived.locations, override.locations);
  // A scene's own location always applies to its shots even when unnamed in the prompt.
  if (scene?.location && !locations.some((value) => normalizeEntityKey(value) === normalizeEntityKey(scene.location as string))) {
    locations.unshift(scene.location);
  }

  return {
    characters: merge(derived.characters, override.characters),
    locations,
    props: merge(derived.props, override.props),
  };
}

/**
 * Derive the continuity edge set for a project. Each shot links back to the most
 * recent earlier shot that shares an entity, per entity, typed by entity kind.
 */
export function deriveContinuityEdges(input: {
  scenes: SceneNode[];
  shots: ShotNode[];
  characters: CharacterNode[];
  projectId?: string;
}): ContinuityEdge[] {
  const dictionary = buildEntityDictionary(input);
  const sceneById = new Map(input.scenes.map((scene) => [scene.id, scene]));
  const ordered = orderShots(input.shots, input.scenes);

  // entity_type -> entity_key -> most recent shot id carrying it
  const lastSeen = new Map<string, string>();
  const edges: ContinuityEdge[] = [];

  for (const shot of ordered) {
    const scene = sceneById.get(shot.scene_id);
    const entities = shotEntities(shot, scene, dictionary);
    const override = shot.continuity ?? {};

    const groups: Array<[ContinuityEntityType, string[]]> = [
      ['character', entities.characters],
      ['location', entities.locations],
      ['prop', entities.props],
    ];

    for (const [entityType, values] of groups) {
      for (const value of values) {
        const entityKey = normalizeEntityKey(value);
        const slot = `${entityType}:${entityKey}`;
        const previous = lastSeen.get(slot);
        if (previous && previous !== shot.id && !override.reset) {
          edges.push({
            from_shot_id: previous,
            to_shot_id: shot.id,
            entity_type: entityType,
            entity_key: entityKey,
            source: 'derived',
          });
        }
        lastSeen.set(slot, shot.id);
      }
    }

    if (override.predecessorShotId) {
      edges.push({
        from_shot_id: override.predecessorShotId,
        to_shot_id: shot.id,
        entity_type: 'location',
        entity_key: '__agent_override__',
        source: 'agent',
      });
    }
  }

  return dedupeEdges(edges);
}

export function dedupeEdges(edges: ContinuityEdge[]): ContinuityEdge[] {
  const seen = new Set<string>();
  const out: ContinuityEdge[] = [];
  for (const edge of edges) {
    const key = [edge.to_shot_id, edge.from_shot_id, edge.entity_type, edge.entity_key].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

export interface PredecessorResolution {
  shotId: string | null;
  entityType: ContinuityEntityType | null;
  entityKey: string | null;
  source: 'agent' | 'derived' | null;
  reason: string | null;
}

/**
 * Resolve the graph predecessor of a shot for continuity-frame purposes.
 *
 * Precedence: agent override > location edge > prop edge > character edge.
 * Never falls back to "the previous shot in sequence" — an unrelated neighbour is
 * a worse reference than no reference, and a null slot must carry a reason.
 */
export function resolveContinuityPredecessor(input: {
  shotId: string;
  edges: ContinuityEdge[];
  shots: ShotNode[];
  scenes: SceneNode[];
}): PredecessorResolution {
  const ordered = orderShots(input.shots, input.scenes);
  const position = new Map(ordered.map((shot, index) => [shot.id, index]));
  const target = position.get(input.shotId);
  if (target === undefined) {
    return { shotId: null, entityType: null, entityKey: null, source: null, reason: 'shot_not_in_project_graph' };
  }

  const shot = ordered[target];
  if (shot.continuity?.reset) {
    return { shotId: null, entityType: null, entityKey: null, source: 'agent', reason: 'continuity_reset_requested_by_agent' };
  }

  const incoming = input.edges.filter((edge) => edge.to_shot_id === input.shotId);

  const agentEdge = incoming.find((edge) => edge.source === 'agent');
  if (agentEdge) {
    return {
      shotId: agentEdge.from_shot_id,
      entityType: agentEdge.entity_type,
      entityKey: agentEdge.entity_key,
      source: 'agent',
      reason: null,
    };
  }

  const priority: ContinuityEntityType[] = ['location', 'prop', 'character'];
  for (const entityType of priority) {
    const candidates = incoming
      .filter((edge) => edge.entity_type === entityType)
      .map((edge) => ({ edge, index: position.get(edge.from_shot_id) ?? -1 }))
      .filter((candidate) => candidate.index >= 0 && candidate.index < target)
      .sort((a, b) => b.index - a.index);
    if (candidates.length > 0) {
      const winner = candidates[0].edge;
      return {
        shotId: winner.from_shot_id,
        entityType,
        entityKey: winner.entity_key,
        source: 'derived',
        reason: null,
      };
    }
  }

  if (target === 0) {
    return { shotId: null, entityType: null, entityKey: null, source: null, reason: 'first_shot_in_storyboard' };
  }
  return {
    shotId: null,
    entityType: null,
    entityKey: null,
    source: null,
    reason: 'no_continuity_edge_shares_an_entity_with_an_earlier_shot',
  };
}

// ── Storyboard session state (staged deltas) ────────────────────────────────

export interface StagedSceneDelta {
  op: 'create' | 'update' | 'delete';
  sceneId?: string;
  /** Client-visible handle for scenes that do not exist yet. */
  key?: string;
  scene_number?: number;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  lighting?: string | null;
  weather?: string | null;
}

export interface StagedShotDelta {
  op: 'create' | 'update' | 'delete';
  shotId?: string;
  key?: string;
  sceneId?: string;
  sceneKey?: string;
  shot_number?: number;
  prompt_idea?: string | null;
  visual_prompt?: string | null;
  dialogue?: string | null;
  shot_type?: string | null;
  continuity?: ContinuityOverride | null;
}

export interface StoryboardSessionState {
  scenes: StagedSceneDelta[];
  shots: StagedShotDelta[];
  notes?: string | null;
  proposedBy?: string | null;
  proposedAt?: string | null;
}

export function emptySessionState(): StoryboardSessionState {
  return { scenes: [], shots: [], notes: null, proposedBy: null, proposedAt: null };
}

export function normalizeSessionState(value: unknown): StoryboardSessionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptySessionState();
  const raw = value as Record<string, unknown>;
  return {
    scenes: Array.isArray(raw.scenes) ? (raw.scenes as StagedSceneDelta[]) : [],
    shots: Array.isArray(raw.shots) ? (raw.shots as StagedShotDelta[]) : [],
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    proposedBy: typeof raw.proposedBy === 'string' ? raw.proposedBy : null,
    proposedAt: typeof raw.proposedAt === 'string' ? raw.proposedAt : null,
  };
}

export interface DiffField {
  field: string;
  before: unknown;
  after: unknown;
}

export interface DiffEntry {
  kind: 'scene' | 'shot';
  op: 'create' | 'update' | 'delete';
  id: string | null;
  key: string | null;
  label: string;
  fields: DiffField[];
}

export interface ContinuityWarning {
  code: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  shotId?: string | null;
  shotKey?: string | null;
}

export interface StoryboardDiff {
  revision: number;
  nextRevision: number;
  entries: DiffEntry[];
  warnings: ContinuityWarning[];
  creditCost: 0;
}

const SCENE_DIFF_FIELDS = ['scene_number', 'title', 'description', 'location', 'lighting', 'weather'] as const;
const SHOT_DIFF_FIELDS = ['shot_number', 'prompt_idea', 'visual_prompt', 'dialogue', 'shot_type'] as const;

function diffFields<T extends Record<string, unknown>>(
  before: T | undefined,
  after: Record<string, unknown>,
  fields: readonly string[],
): DiffField[] {
  const out: DiffField[] = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const nextValue = after[field] ?? null;
    const prevValue = (before?.[field] ?? null) as unknown;
    if (JSON.stringify(prevValue) === JSON.stringify(nextValue)) continue;
    out.push({ field, before: prevValue, after: nextValue });
  }
  return out;
}

/** Normalized diff of staged deltas against committed rows. Always free. */
export function diffStoryboard(input: {
  revision: number;
  state: StoryboardSessionState;
  scenes: SceneNode[];
  shots: ShotNode[];
  characters: CharacterNode[];
}): StoryboardDiff {
  const sceneById = new Map(input.scenes.map((scene) => [scene.id, scene]));
  const shotById = new Map(input.shots.map((shot) => [shot.id, shot]));
  const entries: DiffEntry[] = [];

  for (const delta of input.state.scenes) {
    const existing = delta.sceneId ? sceneById.get(delta.sceneId) : undefined;
    entries.push({
      kind: 'scene',
      op: delta.op,
      id: delta.sceneId ?? null,
      key: delta.key ?? null,
      label: delta.title ?? existing?.title ?? `Scene ${delta.scene_number ?? existing?.scene_number ?? '?'}`,
      fields: delta.op === 'delete'
        ? []
        : diffFields(existing as unknown as Record<string, unknown> | undefined, delta as unknown as Record<string, unknown>, SCENE_DIFF_FIELDS),
    });
  }

  for (const delta of input.state.shots) {
    const existing = delta.shotId ? shotById.get(delta.shotId) : undefined;
    const fields = delta.op === 'delete'
      ? []
      : diffFields(existing as unknown as Record<string, unknown> | undefined, delta as unknown as Record<string, unknown>, SHOT_DIFF_FIELDS);
    if (delta.op !== 'delete' && delta.continuity !== undefined) {
      const before = existing?.continuity ?? null;
      if (JSON.stringify(before) !== JSON.stringify(delta.continuity ?? null)) {
        fields.push({ field: 'continuity', before, after: delta.continuity ?? null });
      }
    }
    entries.push({
      kind: 'shot',
      op: delta.op,
      id: delta.shotId ?? null,
      key: delta.key ?? null,
      label: `Shot ${delta.shot_number ?? existing?.shot_number ?? '?'}`,
      fields,
    });
  }

  return {
    revision: input.revision,
    nextRevision: input.revision + 1,
    entries,
    warnings: continuityWarnings(input),
    creditCost: 0,
  };
}

/**
 * Continuity warnings for the staged storyboard. These are structural checks the
 * harness renders next to the diff; deeper rubric scoring comes from the
 * `evaluate-storyboard-packet` function and is merged in by the edge function.
 */
export function continuityWarnings(input: {
  state: StoryboardSessionState;
  scenes: SceneNode[];
  shots: ShotNode[];
  characters: CharacterNode[];
}): ContinuityWarning[] {
  const warnings: ContinuityWarning[] = [];
  const projected = projectStagedStoryboard(input);
  const dictionary = buildEntityDictionary(projected);
  const sceneById = new Map(projected.scenes.map((scene) => [scene.id, scene]));
  const ordered = orderShots(projected.shots, projected.scenes);
  const edges = deriveContinuityEdges(projected);

  const knownCharacterKeys = new Set(input.characters.map((character) => normalizeEntityKey(character.name)));

  for (const shot of ordered) {
    const scene = sceneById.get(shot.scene_id);
    const text = shotText(shot, scene);

    if (!shot.visual_prompt && !shot.prompt_idea) {
      warnings.push({
        code: 'shot_missing_prompt',
        severity: 'error',
        message: `Shot ${shot.shot_number} has no prompt_idea or visual_prompt; it cannot be compiled into a reference packet.`,
        shotId: shot.id,
      });
    }

    if (!scene?.location) {
      warnings.push({
        code: 'scene_missing_location',
        severity: 'warn',
        message: `Shot ${shot.shot_number} belongs to a scene without a location, so no setting reference can be resolved.`,
        shotId: shot.id,
      });
    }

    const entities = shotEntities(shot, scene, dictionary);
    for (const name of entities.characters) {
      if (!knownCharacterKeys.has(normalizeEntityKey(name))) {
        warnings.push({
          code: 'character_not_in_cast',
          severity: 'warn',
          message: `Shot ${shot.shot_number} references "${name}", which has no character record to resolve an identity reference from.`,
          shotId: shot.id,
        });
      }
    }

    const predecessor = resolveContinuityPredecessor({
      shotId: shot.id,
      edges,
      shots: projected.shots,
      scenes: projected.scenes,
    });
    if (!predecessor.shotId && predecessor.reason === 'no_continuity_edge_shares_an_entity_with_an_earlier_shot') {
      warnings.push({
        code: 'continuity_island',
        severity: 'info',
        message: `Shot ${shot.shot_number} shares no character, location, or prop with any earlier shot, so it starts a new continuity island.`,
        shotId: shot.id,
      });
    }

    if (shot.continuity?.predecessorShotId && !projected.shots.some((candidate) => candidate.id === shot.continuity?.predecessorShotId)) {
      warnings.push({
        code: 'predecessor_override_unknown_shot',
        severity: 'error',
        message: `Shot ${shot.shot_number} overrides its predecessor with an unknown shot id.`,
        shotId: shot.id,
      });
    }

    if (text.length > 0 && text.length < 24) {
      warnings.push({
        code: 'shot_prompt_too_thin',
        severity: 'info',
        message: `Shot ${shot.shot_number} has a very short prompt; consider adding subject, action, and camera.`,
        shotId: shot.id,
      });
    }
  }

  return warnings;
}

/** Apply staged deltas on top of committed rows without writing anything. */
export function projectStagedStoryboard(input: {
  state: StoryboardSessionState;
  scenes: SceneNode[];
  shots: ShotNode[];
  characters?: CharacterNode[];
}): { scenes: SceneNode[]; shots: ShotNode[]; characters: CharacterNode[] } {
  const scenes = new Map(input.scenes.map((scene) => [scene.id, { ...scene }]));
  const shots = new Map(input.shots.map((shot) => [shot.id, { ...shot }]));
  const stagedSceneIds = new Map<string, string>();

  for (const delta of input.state.scenes) {
    if (delta.op === 'delete') {
      if (delta.sceneId) scenes.delete(delta.sceneId);
      continue;
    }
    const id = delta.sceneId ?? `staged:${delta.key ?? `scene-${scenes.size + 1}`}`;
    if (delta.key) stagedSceneIds.set(delta.key, id);
    const previous = scenes.get(id);
    scenes.set(id, {
      id,
      scene_number: delta.scene_number ?? previous?.scene_number ?? scenes.size + 1,
      title: delta.title ?? previous?.title ?? null,
      description: delta.description ?? previous?.description ?? null,
      location: delta.location ?? previous?.location ?? null,
      lighting: delta.lighting ?? previous?.lighting ?? null,
      weather: delta.weather ?? previous?.weather ?? null,
    });
  }

  for (const delta of input.state.shots) {
    if (delta.op === 'delete') {
      if (delta.shotId) shots.delete(delta.shotId);
      continue;
    }
    const id = delta.shotId ?? `staged:${delta.key ?? `shot-${shots.size + 1}`}`;
    const previous = shots.get(id);
    const sceneId = delta.sceneId
      ?? (delta.sceneKey ? stagedSceneIds.get(delta.sceneKey) : undefined)
      ?? previous?.scene_id
      ?? '';
    shots.set(id, {
      id,
      scene_id: sceneId,
      shot_number: delta.shot_number ?? previous?.shot_number ?? shots.size + 1,
      prompt_idea: delta.prompt_idea ?? previous?.prompt_idea ?? null,
      visual_prompt: delta.visual_prompt ?? previous?.visual_prompt ?? null,
      dialogue: delta.dialogue ?? previous?.dialogue ?? null,
      shot_type: delta.shot_type ?? previous?.shot_type ?? null,
      image_url: previous?.image_url ?? null,
      video_url: previous?.video_url ?? null,
      continuity: delta.continuity !== undefined ? delta.continuity : previous?.continuity ?? null,
    });
  }

  return {
    scenes: [...scenes.values()],
    shots: [...shots.values()],
    characters: input.characters ?? [],
  };
}
