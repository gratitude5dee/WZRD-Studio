/**
 * The Project brief: the single reviewable object that describes a project's
 * setup. It is what the wizard's "Project brief" step edits and what the
 * `setup_project` plugin tool fills in one round-trip.
 *
 * Everything that writes a `projects` row (wizard or agent) must go through
 * `createProjectBrief` + `buildProjectRow` so both paths produce byte-identical
 * rows for identical inputs (modulo `id` / timestamps).
 */
import {
  normalizeEvaluationThresholds,
  type EvaluationMode,
  type EvaluationThresholds,
} from '@/lib/evaluation';
import { buildConceptPayload, type ConceptPayload } from '@/services/conceptPayloadService';
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_VIDEO_STYLE,
  isAspectRatio,
  isVideoStyle,
  type AspectRatioOption,
  type VideoStyleOption,
} from './videoStyles';
import type {
  AdBriefData,
  CustomMetaPrompts,
  InfotainmentData,
  MusicVideoData,
  ProjectData,
  ProjectFormat,
  ShortFilmData,
} from './types';

export const DEFAULT_STORYLINE_TEXT_MODEL = 'gmi/gemini-3.1-flash-lite';
export const DEFAULT_BASE_IMAGE_MODEL = 'gmi/seedream-5.0-lite';
export const DEFAULT_BASE_VIDEO_MODEL = 'gmi/ltx-fast-i2v';
export const DEFAULT_BASE_AUDIO_MODEL = 'fal-ai/elevenlabs/tts/turbo-v2.5';
export const DEFAULT_PROJECT_TITLE = 'Untitled Project';

const PROJECT_FORMATS: readonly ProjectFormat[] = [
  'custom',
  'short_film',
  'commercial',
  'music_video',
  'infotainment',
];

/** Look-and-feel half of the brief (formerly the Settings step). */
export interface ProjectBriefLook {
  aspectRatio: AspectRatioOption;
  videoStyle: VideoStyleOption;
  cinematicInspiration: string;
  styleReferenceUrl: string | null;
  styleReferenceAssetId: string | null;
}

/** Cast half of the brief (formerly the Cast step). */
export interface ProjectBriefCast {
  addVoiceover: boolean;
  voiceoverId: string | null;
  voiceoverName: string | null;
  voiceoverPreviewUrl: string | null;
}

export interface ProjectBriefModels {
  storylineTextModel: string;
  storylineTextSettings: Record<string, unknown>;
  baseImageModel: string;
  baseVideoModel: string;
  baseAudioModel: string;
  evaluationMode: EvaluationMode;
  evaluationThresholds: EvaluationThresholds;
  canonFacts: string[];
  creativeConstraints: string[];
}

export interface ProjectBriefFormatData {
  adBrief: AdBriefData | null;
  musicVideoData: MusicVideoData | null;
  infotainmentData: InfotainmentData | null;
  shortFilmData: ShortFilmData | null;
  customMetaPrompts: CustomMetaPrompts | null;
}

export interface ProjectBrief {
  title: string;
  concept: string;
  conceptOption: 'ai' | 'manual';
  format: ProjectFormat;
  customFormat: string;
  genre: string;
  tone: string;
  specialRequests: string;
  commercial: {
    product: string;
    targetAudience: string;
    mainMessage: string;
    callToAction: string;
  };
  look: ProjectBriefLook;
  cast: ProjectBriefCast;
  models: ProjectBriefModels;
  formatData: ProjectBriefFormatData;
}

/** Loosely-typed brief input — what an agent (or a form) can hand us. */
export type ProjectBriefInput = {
  title?: string | null;
  concept?: string | null;
  conceptOption?: string | null;
  format?: string | null;
  customFormat?: string | null;
  genre?: string | null;
  tone?: string | null;
  specialRequests?: string | null;
  commercial?: Partial<ProjectBrief['commercial']> | null;
  look?: Partial<ProjectBriefLook> | null;
  cast?: Partial<ProjectBriefCast> | null;
  models?: Partial<ProjectBriefModels> | null;
  formatData?: Partial<ProjectBriefFormatData> | null;
};

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

const nullableText = (value: unknown): string | null => {
  const trimmed = text(value);
  return trimmed.length > 0 ? trimmed : null;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : [];

const plainObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asFormat = (value: unknown): ProjectFormat =>
  PROJECT_FORMATS.includes(value as ProjectFormat) ? (value as ProjectFormat) : 'custom';

const EVALUATION_MODES: readonly EvaluationMode[] = ['off', 'shadow', 'soft_gate', 'hard_gate'];

const asEvaluationMode = (value: unknown): EvaluationMode =>
  EVALUATION_MODES.find((mode) => mode === value) ?? 'shadow';

/**
 * Normalize any brief-shaped input into the canonical brief.
 * Deterministic: identical inputs always yield a deeply-equal brief.
 */
export function createProjectBrief(input: ProjectBriefInput = {}): ProjectBrief {
  const look = input.look ?? {};
  const cast = input.cast ?? {};
  const models = input.models ?? {};
  const formatData = input.formatData ?? {};
  const commercial = input.commercial ?? {};

  return {
    title: text(input.title, DEFAULT_PROJECT_TITLE),
    concept: text(input.concept),
    conceptOption: input.conceptOption === 'manual' ? 'manual' : 'ai',
    format: asFormat(input.format),
    customFormat: text(input.customFormat),
    genre: text(input.genre),
    tone: text(input.tone),
    specialRequests: text(input.specialRequests),
    commercial: {
      product: text(commercial.product),
      targetAudience: text(commercial.targetAudience),
      mainMessage: text(commercial.mainMessage),
      callToAction: text(commercial.callToAction),
    },
    look: {
      aspectRatio: isAspectRatio(look.aspectRatio) ? look.aspectRatio : DEFAULT_ASPECT_RATIO,
      videoStyle: isVideoStyle(look.videoStyle) ? look.videoStyle : DEFAULT_VIDEO_STYLE,
      cinematicInspiration: text(look.cinematicInspiration),
      styleReferenceUrl: nullableText(look.styleReferenceUrl),
      styleReferenceAssetId: nullableText(look.styleReferenceAssetId),
    },
    cast: {
      addVoiceover: cast.addVoiceover === true,
      voiceoverId: nullableText(cast.voiceoverId),
      voiceoverName: nullableText(cast.voiceoverName),
      voiceoverPreviewUrl: nullableText(cast.voiceoverPreviewUrl),
    },
    models: {
      storylineTextModel: text(models.storylineTextModel, DEFAULT_STORYLINE_TEXT_MODEL),
      storylineTextSettings: plainObject(models.storylineTextSettings),
      baseImageModel: text(models.baseImageModel, DEFAULT_BASE_IMAGE_MODEL),
      baseVideoModel: text(models.baseVideoModel, DEFAULT_BASE_VIDEO_MODEL),
      baseAudioModel: text(models.baseAudioModel, DEFAULT_BASE_AUDIO_MODEL),
      evaluationMode: asEvaluationMode(models.evaluationMode),
      evaluationThresholds: normalizeEvaluationThresholds(models.evaluationThresholds),
      canonFacts: stringList(models.canonFacts),
      creativeConstraints: stringList(models.creativeConstraints),
    },
    formatData: {
      adBrief: formatData.adBrief ?? null,
      musicVideoData: formatData.musicVideoData ?? null,
      infotainmentData: formatData.infotainmentData ?? null,
      shortFilmData: formatData.shortFilmData ?? null,
      customMetaPrompts: formatData.customMetaPrompts ?? null,
    },
  };
}

/** Project brief view of the wizard's working state. */
export function projectBriefFromProjectData(data: ProjectData): ProjectBrief {
  return createProjectBrief({
    title: data.title,
    concept: data.concept,
    conceptOption: data.conceptOption,
    format: data.format,
    customFormat: data.customFormat,
    genre: data.genre,
    tone: data.tone,
    specialRequests: data.specialRequests,
    commercial: {
      product: data.product,
      targetAudience: data.targetAudience,
      mainMessage: data.mainMessage,
      callToAction: data.callToAction,
    },
    look: {
      aspectRatio: data.aspectRatio as AspectRatioOption | undefined,
      videoStyle: data.videoStyle as VideoStyleOption | undefined,
      cinematicInspiration: data.cinematicInspiration,
      styleReferenceUrl: data.styleReferenceUrl ?? null,
      styleReferenceAssetId: data.styleReferenceAssetId ?? null,
    },
    cast: {
      addVoiceover: data.addVoiceover,
      voiceoverId: data.voiceoverId ?? null,
      voiceoverName: data.voiceoverName ?? null,
      voiceoverPreviewUrl: data.voiceoverPreviewUrl ?? null,
    },
    models: {
      storylineTextModel: data.storylineTextModel,
      storylineTextSettings: data.storylineTextSettings,
      baseImageModel: data.baseImageModel,
      baseVideoModel: data.baseVideoModel,
      baseAudioModel: data.baseAudioModel,
      evaluationMode: data.evaluationMode,
      evaluationThresholds: data.evaluationThresholds,
      canonFacts: data.canonFacts,
      creativeConstraints: data.creativeConstraints,
    },
    formatData: {
      adBrief: data.adBrief ?? null,
      musicVideoData: data.musicVideoData ?? null,
      infotainmentData: data.infotainmentData ?? null,
      shortFilmData: data.shortFilmData ?? null,
      customMetaPrompts: data.customMetaPrompts ?? null,
    },
  });
}

/** Wizard working state derived from a brief (agent → wizard direction). */
export function projectDataFromBrief(brief: ProjectBrief): ProjectData {
  return {
    title: brief.title,
    concept: brief.concept,
    genre: brief.genre,
    tone: brief.tone,
    format: brief.format,
    customFormat: brief.customFormat,
    specialRequests: brief.specialRequests,
    addVoiceover: brief.cast.addVoiceover,
    product: brief.commercial.product,
    targetAudience: brief.commercial.targetAudience,
    mainMessage: brief.commercial.mainMessage,
    callToAction: brief.commercial.callToAction,
    conceptOption: brief.conceptOption,
    aspectRatio: brief.look.aspectRatio,
    videoStyle: brief.look.videoStyle,
    cinematicInspiration: brief.look.cinematicInspiration,
    styleReferenceUrl: brief.look.styleReferenceUrl ?? undefined,
    styleReferenceAssetId: brief.look.styleReferenceAssetId ?? undefined,
    adBrief: brief.formatData.adBrief ?? undefined,
    musicVideoData: brief.formatData.musicVideoData ?? undefined,
    infotainmentData: brief.formatData.infotainmentData ?? undefined,
    shortFilmData: brief.formatData.shortFilmData ?? undefined,
    voiceoverId: brief.cast.voiceoverId ?? undefined,
    voiceoverName: brief.cast.voiceoverName ?? undefined,
    voiceoverPreviewUrl: brief.cast.voiceoverPreviewUrl ?? undefined,
    storylineTextModel: brief.models.storylineTextModel,
    storylineTextSettings: brief.models.storylineTextSettings,
    baseImageModel: brief.models.baseImageModel,
    baseVideoModel: brief.models.baseVideoModel,
    baseAudioModel: brief.models.baseAudioModel,
    evaluationMode: brief.models.evaluationMode,
    evaluationThresholds: brief.models.evaluationThresholds,
    canonFacts: brief.models.canonFacts,
    creativeConstraints: brief.models.creativeConstraints,
    customMetaPrompts: brief.formatData.customMetaPrompts ?? undefined,
  };
}

/** Canonical `projects` row payload. Key order is fixed so rows serialize identically. */
export interface ProjectRow {
  user_id: string;
  title: string;
  concept_text: string;
  concept_option: 'ai' | 'manual';
  format: ProjectFormat;
  custom_format_description: string | null;
  genre: string | null;
  tone: string | null;
  add_voiceover: boolean;
  special_requests: string | null;
  product_name: string | null;
  target_audience: string | null;
  main_message: string | null;
  call_to_action: string | null;
  ad_brief_data: AdBriefData | null;
  music_video_data: MusicVideoData | null;
  infotainment_data: InfotainmentData | null;
  short_film_data: ShortFilmData | null;
  voiceover_id: string | null;
  voiceover_name: string | null;
  voiceover_preview_url: string | null;
  style_reference_asset_id: string | null;
  aspect_ratio: AspectRatioOption;
  video_style: VideoStyleOption;
  cinematic_inspiration: string | null;
  custom_meta_prompts: CustomMetaPrompts | null;
}

/**
 * The one and only `projects` write payload builder.
 * Both the wizard and `setup_project` call this, which is what makes the two
 * paths produce byte-identical rows.
 */
export function buildProjectRow(brief: ProjectBrief, options: { userId: string }): ProjectRow {
  const nullable = (value: string) => (value.length > 0 ? value : null);

  return {
    user_id: options.userId,
    title: brief.title,
    concept_text: brief.concept,
    concept_option: brief.conceptOption,
    format: brief.format,
    custom_format_description: nullable(brief.customFormat),
    genre: nullable(brief.genre),
    tone: nullable(brief.tone),
    add_voiceover: brief.cast.addVoiceover,
    special_requests: nullable(brief.specialRequests),
    product_name: nullable(brief.commercial.product),
    target_audience: nullable(brief.commercial.targetAudience),
    main_message: nullable(brief.commercial.mainMessage),
    call_to_action: nullable(brief.commercial.callToAction),
    ad_brief_data: brief.formatData.adBrief,
    music_video_data: brief.formatData.musicVideoData,
    infotainment_data: brief.formatData.infotainmentData,
    short_film_data: brief.formatData.shortFilmData,
    voiceover_id: brief.cast.voiceoverId,
    voiceover_name: brief.cast.voiceoverName,
    voiceover_preview_url: brief.cast.voiceoverPreviewUrl,
    style_reference_asset_id: brief.look.styleReferenceAssetId,
    aspect_ratio: brief.look.aspectRatio,
    video_style: brief.look.videoStyle,
    cinematic_inspiration: nullable(brief.look.cinematicInspiration),
    custom_meta_prompts: brief.format === 'custom' ? brief.formatData.customMetaPrompts : null,
  };
}

export interface ProjectSettingsRow {
  project_id: string;
  storyline_text_model: string;
  storyline_text_settings: Record<string, unknown>;
  base_image_model: string;
  base_video_model: string;
  evaluation_mode: EvaluationMode;
  evaluation_thresholds: EvaluationThresholds;
  canon_facts: string[];
  creative_constraints: string[];
}

export function buildProjectSettingsRow(brief: ProjectBrief, projectId: string): ProjectSettingsRow {
  return {
    project_id: projectId,
    storyline_text_model: brief.models.storylineTextModel,
    storyline_text_settings: brief.models.storylineTextSettings,
    base_image_model: brief.models.baseImageModel,
    base_video_model: brief.models.baseVideoModel,
    evaluation_mode: brief.models.evaluationMode,
    evaluation_thresholds: brief.models.evaluationThresholds,
    canon_facts: brief.models.canonFacts,
    creative_constraints: brief.models.creativeConstraints,
  };
}

export interface StoryboardPacket {
  concept: ConceptPayload;
  storyline: {
    model: string;
    settings: Record<string, unknown>;
  };
  settings: {
    aspectRatio: AspectRatioOption;
    videoStyle: VideoStyleOption;
    cinematicInspiration: string | null;
    baseImageModel: string;
    baseVideoModel: string;
    styleReferenceAssetId: string | null;
    evaluationMode: EvaluationMode;
    evaluationThresholds: EvaluationThresholds;
    canonFacts: string[];
    creativeConstraints: string[];
  };
  cast: {
    addVoiceover: boolean;
    voiceoverId: string | null;
    voiceoverName: string | null;
  };
}

/** The finalize-project-setup payload, derived purely from the brief. */
export function buildStoryboardPacket(brief: ProjectBrief): StoryboardPacket {
  return {
    concept: buildConceptPayload(projectDataFromBrief(brief)),
    storyline: {
      model: brief.models.storylineTextModel,
      settings: brief.models.storylineTextSettings,
    },
    settings: {
      aspectRatio: brief.look.aspectRatio,
      videoStyle: brief.look.videoStyle,
      cinematicInspiration: brief.look.cinematicInspiration.length > 0 ? brief.look.cinematicInspiration : null,
      baseImageModel: brief.models.baseImageModel,
      baseVideoModel: brief.models.baseVideoModel,
      styleReferenceAssetId: brief.look.styleReferenceAssetId,
      evaluationMode: brief.models.evaluationMode,
      evaluationThresholds: brief.models.evaluationThresholds,
      canonFacts: brief.models.canonFacts,
      creativeConstraints: brief.models.creativeConstraints,
    },
    cast: {
      addVoiceover: brief.cast.addVoiceover,
      voiceoverId: brief.cast.voiceoverId,
      voiceoverName: brief.cast.voiceoverName,
    },
  };
}

/** A brief is reviewable/complete when the agent or the user has supplied the essentials. */
export function isProjectBriefComplete(brief: ProjectBrief): boolean {
  return brief.title.length > 0 && brief.concept.length > 0;
}
