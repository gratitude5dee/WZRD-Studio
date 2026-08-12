import { describe, it, expect } from 'vitest';
import {
  buildProjectRow,
  buildStoryboardPacket,
  createProjectBrief,
  projectBriefFromProjectData,
  projectDataFromBrief,
} from '../projectBrief';
import type { ProjectData } from '../types';
import { DEFAULT_EVALUATION_THRESHOLDS } from '@/lib/evaluation';

const USER_ID = 'user-golden';

/** Golden input: exactly what `setup_project` accepts in one call. */
const GOLDEN_INPUT = {
  concept: 'A lighthouse keeper who talks to the storm',
  format: 'short_film' as const,
  aspectRatio: '9:16' as const,
  style: 'film-noir' as const,
};

/**
 * Stand-in for the Handoff A `setup_project` tool: it must normalize its inputs
 * through `createProjectBrief` and write through `buildProjectRow`. When Handoff A
 * lands, this stub is replaced by the real tool implementation; the assertions
 * below are the contract it has to satisfy.
 */
function setupProjectStub(input: typeof GOLDEN_INPUT, userId: string) {
  const brief = createProjectBrief({
    concept: input.concept,
    format: input.format,
    look: { aspectRatio: input.aspectRatio, videoStyle: input.style },
  });
  return { brief, row: buildProjectRow(brief, { userId }) };
}

/** The wizard path: ProjectData (the wizard's working state) → brief → row. */
function wizardPath(input: typeof GOLDEN_INPUT, userId: string) {
  const wizardState: ProjectData = {
    title: 'Untitled Project',
    concept: input.concept,
    genre: '',
    tone: '',
    format: input.format,
    customFormat: '',
    specialRequests: '',
    addVoiceover: false,
    product: '',
    targetAudience: '',
    mainMessage: '',
    callToAction: '',
    conceptOption: 'ai',
    aspectRatio: input.aspectRatio,
    videoStyle: input.style,
    voiceoverId: '',
    voiceoverName: '',
    voiceoverPreviewUrl: '',
    storylineTextModel: 'gmi/gemini-3.1-flash-lite',
    storylineTextSettings: {},
    baseImageModel: 'gmi/seedream-5.0-lite',
    baseVideoModel: 'gmi/ltx-fast-i2v',
    baseAudioModel: 'fal-ai/elevenlabs/tts/turbo-v2.5',
    evaluationMode: 'shadow',
    evaluationThresholds: DEFAULT_EVALUATION_THRESHOLDS,
    canonFacts: [],
    creativeConstraints: [],
  };

  const brief = projectBriefFromProjectData(wizardState);
  return { brief, row: buildProjectRow(brief, { userId }) };
}

describe('project brief parity (wizard vs setup_project)', () => {
  it('produces byte-identical projects rows for identical inputs', () => {
    const wizard = wizardPath(GOLDEN_INPUT, USER_ID);
    const plugin = setupProjectStub(GOLDEN_INPUT, USER_ID);

    // Rows carry no id/timestamps: those are assigned by the database.
    expect(Object.keys(wizard.row)).not.toContain('id');
    expect(Object.keys(wizard.row)).not.toContain('created_at');

    // Byte-identical, which also pins key order.
    expect(JSON.stringify(wizard.row)).toBe(JSON.stringify(plugin.row));
  });

  it('produces equivalent storyboard packets', () => {
    const wizard = wizardPath(GOLDEN_INPUT, USER_ID);
    const plugin = setupProjectStub(GOLDEN_INPUT, USER_ID);

    expect(buildStoryboardPacket(wizard.brief)).toEqual(
      buildStoryboardPacket(plugin.brief),
    );
  });

  it('normalizes unknown / blank inputs deterministically', () => {
    const brief = createProjectBrief({
      title: '   ',
      concept: '  a concept  ',
      format: 'not-a-format' as never,
      conceptOption: 'nope' as never,
      look: { aspectRatio: '4:3' as never, videoStyle: 'clay' as never },
    });

    expect(brief.title).toBe('Untitled Project');
    expect(brief.concept).toBe('a concept');
    expect(brief.format).toBe('custom');
    expect(brief.conceptOption).toBe('ai');
    expect(brief.look.aspectRatio).toBe('16:9');
    expect(brief.look.videoStyle).toBe('cinematic');
  });

  it('round-trips brief → ProjectData → brief', () => {
    const brief = createProjectBrief({
      concept: GOLDEN_INPUT.concept,
      format: GOLDEN_INPUT.format,
      look: { aspectRatio: GOLDEN_INPUT.aspectRatio, videoStyle: GOLDEN_INPUT.style },
      cast: { addVoiceover: true, voiceoverId: 'voice-1', voiceoverName: 'Ada' },
    });

    expect(projectBriefFromProjectData(projectDataFromBrief(brief))).toEqual(brief);
  });

  it('is idempotent: normalizing an already-canonical brief is a no-op', () => {
    const brief = createProjectBrief({ concept: GOLDEN_INPUT.concept });
    expect(createProjectBrief(brief)).toEqual(brief);
  });
});
