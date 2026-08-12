/**
 * Phase 6a — schema validation, including the negative cases that must fail:
 * unknown top-level manifest field, skill name ≠ directory, description > 1024,
 * tool name > 40 chars, and a `headers` block on wzrd-remote.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain ESM validator shared with the CLI
import {
  MAX_SKILL_DESCRIPTION_LENGTH,
  parseFrontmatter,
  validateManifest,
  validateMcpConfig,
  validateMirrorDrift,
  validateSkill,
  validateSkillTeachesSafetyLoop,
  validateSpendingToolDescriptions,
  validateToolNames,
} from '../../scripts/plugin/validate-lib.mjs';
// @ts-expect-error - plain ESM helper shared with the CLI
import { EXPECTED_SKILLS, parseToolRegistry } from '../../scripts/plugin/validate.mjs';

const repoRoot = join(__dirname, '../..');
const readJson = (path: string) => JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
const readText = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

const validManifest = {
  name: 'wzrd-studio',
  version: '1.1.0',
  description: 'A plugin.',
  mcp: './mcp.json',
  skills: './skills',
};

const validMcp = {
  version: '1.1.0',
  mcpServers: {
    'wzrd-remote': {
      type: 'http',
      url: 'https://example.supabase.co/functions/v1/mcp-server',
      auth: { type: 'bearer', tokenEnv: 'WZRD_PAT' },
    },
  },
};

const skillBody = `# Title

get_credits, dryRun, confirm, idempotencyKey, https://app/project/x?tab=timeline
`;

const skillFile = (name: string, description: string, body = skillBody) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;

describe('plugin manifest schema', () => {
  it('accepts the committed manifest', () => {
    expect(validateManifest(readJson('plugin/plugin.json'))).toEqual([]);
  });

  it('rejects an unknown top-level field', () => {
    const errors = validateManifest({ ...validManifest, sideloadEverything: true });
    expect(errors.some((error: string) => error.includes('unknown top-level field "sideloadEverything"'))).toBe(true);
  });

  it('rejects a missing required field', () => {
    const { skills: _skills, ...withoutSkills } = validManifest;
    expect(validateManifest(withoutSkills).some((error: string) => error.includes('missing required field "skills"'))).toBe(true);
  });

  it('rejects a non-semver version', () => {
    expect(validateManifest({ ...validManifest, version: '1.1' }).some((error: string) => error.includes('semver'))).toBe(true);
  });
});

describe('mcp.json schema', () => {
  it('accepts the committed config and its root mirror', () => {
    expect(validateMcpConfig(readJson('plugin/mcp.json'))).toEqual([]);
    expect(validateMcpConfig(readJson('.mcp.json'), { label: '.mcp.json' })).toEqual([]);
  });

  it('rejects a headers block on wzrd-remote', () => {
    const config = {
      ...validMcp,
      mcpServers: {
        'wzrd-remote': { ...validMcp.mcpServers['wzrd-remote'], headers: { Authorization: 'Bearer wzrd_pat_leaked' } },
      },
    };
    const errors = validateMcpConfig(config);
    expect(errors.some((error: string) => error.includes('unsupported field "headers"'))).toBe(true);
  });

  it('rejects a non-https URL and a missing tokenEnv', () => {
    const errors = validateMcpConfig({
      ...validMcp,
      mcpServers: { 'wzrd-remote': { type: 'http', url: 'http://insecure', auth: { type: 'bearer' } } },
    });
    expect(errors.some((error: string) => error.includes('https'))).toBe(true);
    expect(errors.some((error: string) => error.includes('tokenEnv'))).toBe(true);
  });

  it('detects mirror drift and version disagreement', () => {
    expect(
      validateMirrorDrift({ pluginMcp: validMcp, rootMcp: { ...validMcp, version: '1.0.0' }, versions: {} }).length,
    ).toBeGreaterThan(0);
    expect(
      validateMirrorDrift({
        pluginMcp: validMcp,
        rootMcp: validMcp,
        versions: { a: '1.1.0', b: '1.0.0' },
      }).some((error: string) => error.includes('version fields disagree')),
    ).toBe(true);
  });
});

describe('SKILL.md lint', () => {
  it('accepts every committed skill', () => {
    for (const dirName of readdirSync(join(repoRoot, 'plugin/skills'))) {
      const content = readText(`plugin/skills/${dirName}/SKILL.md`);
      expect(validateSkill({ dirName, content, relativePath: `${dirName}/SKILL.md` })).toEqual([]);
      expect(validateSkillTeachesSafetyLoop({ dirName, content })).toEqual([]);
    }
  });

  it('ships exactly the nine expected skills', () => {
    expect(readdirSync(join(repoRoot, 'plugin/skills')).sort()).toEqual([...EXPECTED_SKILLS].sort());
  });

  it('rejects a name that differs from the directory', () => {
    const errors = validateSkill({
      dirName: 'wzrd-storyboard',
      content: skillFile('wzrd-story-board', 'Use this when storyboarding.'),
      relativePath: 'wzrd-storyboard/SKILL.md',
    });
    expect(errors.some((error: string) => error.includes('must equal the directory name'))).toBe(true);
  });

  it('rejects a description longer than 1024 characters', () => {
    const errors = validateSkill({
      dirName: 'wzrd-storyboard',
      content: skillFile('wzrd-storyboard', `Use this when ${'x'.repeat(MAX_SKILL_DESCRIPTION_LENGTH)}`),
      relativePath: 'wzrd-storyboard/SKILL.md',
    });
    expect(errors.some((error: string) => /description is \d+ chars/.test(error))).toBe(true);
  });

  it('rejects a lowercase skill.md filename and nested skill files', () => {
    expect(
      validateSkill({ dirName: 'wzrd-storyboard', fileName: 'skill.md', content: skillFile('wzrd-storyboard', 'Use this when storyboarding.') })
        .some((error: string) => error.includes('named exactly "SKILL.md"')),
    ).toBe(true);
    expect(
      validateSkill({
        dirName: 'wzrd-storyboard',
        content: skillFile('wzrd-storyboard', 'Use this when storyboarding.'),
        relativePath: 'wzrd-storyboard/nested/SKILL.md',
      }).some((error: string) => error.includes('immediate child')),
    ).toBe(true);
  });

  it('rejects malformed names and a missing wzrd- prefix', () => {
    for (const name of ['wzrd--storyboard', '-wzrd-storyboard', 'wzrd-storyboard-', 'WZRD-Storyboard']) {
      const errors = validateSkill({ dirName: name, content: skillFile(name, 'Use this when storyboarding.') });
      expect(errors.length).toBeGreaterThan(0);
    }
    expect(
      validateSkill({ dirName: 'storyboard', content: skillFile('storyboard', 'Use this when storyboarding.') }).some((error: string) =>
        error.includes('prefixed with "wzrd-"'),
      ),
    ).toBe(true);
  });

  it('rejects a body longer than 500 lines', () => {
    const errors = validateSkill({
      dirName: 'wzrd-storyboard',
      content: skillFile('wzrd-storyboard', 'Use this when storyboarding.', 'line\n'.repeat(501)),
      relativePath: 'wzrd-storyboard/SKILL.md',
    });
    expect(errors.some((error: string) => /body is \d+ lines/.test(error))).toBe(true);
  });

  it('parses frontmatter without a YAML dependency', () => {
    const { frontmatter } = parseFrontmatter(skillFile('wzrd-billing', 'Use this for billing.'));
    expect(frontmatter).toEqual({ name: 'wzrd-billing', description: 'Use this for billing.' });
  });
});

describe('MCP tool surface', () => {
  const tools = parseToolRegistry(readText('supabase/functions/mcp-server/tools.ts'));

  it('parses the registry and every name is valid', () => {
    expect(tools.length).toBeGreaterThan(10);
    expect(validateToolNames(tools.map((tool: { name: string }) => tool.name))).toEqual([]);
  });

  it('rejects a tool name longer than 40 characters', () => {
    const tooLong = `generate_${'x'.repeat(40)}`;
    expect(validateToolNames([tooLong]).some((error: string) => error.includes('max 40'))).toBe(true);
  });

  it('requires spending tools to advertise cost and dryRun', () => {
    expect(validateSpendingToolDescriptions(tools)).toEqual([]);
    expect(
      validateSpendingToolDescriptions([{ name: 'generate_shot_image', description: 'Makes a picture.', spends: true }]).length,
    ).toBe(1);
  });

  it('exposes the golden-path tools', () => {
    const names = tools.map((tool: { name: string }) => tool.name);
    for (const required of [
      'setup_project',
      'storyboard_propose',
      'storyboard_diff',
      'storyboard_commit',
      'generate_shot_image',
      'seedance_handoff',
      'get_timeline',
      'get_credits',
      'export_video',
    ]) {
      expect(names).toContain(required);
    }
  });
});
