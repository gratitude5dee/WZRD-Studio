/**
 * Schema validation (§11.1a) — including the negative cases the spec names:
 * an unknown top-level manifest field, a skill name that differs from its
 * directory, a description over 1024 chars, a tool name over 40 chars, and a
 * `headers` block on `wzrd-remote`.
 *
 * Exercises exactly the code `bun run plugin:validate` runs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM without type declarations
import {
  validateMcpServers,
  validateSkill,
  validateSkillTeachesSafetyLoop,
  validateSpendingToolDescriptions,
  validateToolNames,
  validateVersionParity,
} from '../../scripts/plugin/validate-lib.mjs';
// @ts-expect-error — plain ESM without type declarations
import { pluginMeta, readSkills, readTools } from '../../scripts/plugin/registry.mjs';

const ROOT = join(__dirname, '..', '..');

function compile(schemaFile: string) {
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  return ajv.compile(JSON.parse(readFileSync(join(ROOT, 'plugin', 'schemas', schemaFile), 'utf8')));
}

const meta = pluginMeta(ROOT);
const validManifest = {
  name: meta.name,
  version: meta.version,
  description: meta.description,
  author: { name: meta.author },
  homepage: meta.homepage,
  license: meta.license,
  keywords: meta.keywords,
};

const skillFixture = (overrides: { name?: string; description?: string; bodyLines?: number } = {}) => {
  const name = overrides.name ?? 'wzrd-example';
  const description =
    overrides.description ??
    'Use this when the user wants an example: demonstrates the safety loop end to end.';
  const body = Array.from({ length: overrides.bodyLines ?? 20 }, (_, i) => `line ${i}`).join('\n');
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}\nget_credits dryRun confirm idempotency ?tab=timeline`;
};

describe('plugin.json schema', () => {
  it('accepts the generated manifest', () => {
    expect(compile('plugin.schema.json')(validManifest)).toBe(true);
  });

  it('rejects an unknown top-level field', () => {
    const validate = compile('plugin.schema.json');
    expect(validate({ ...validManifest, unknownField: true })).toBe(false);
    expect(JSON.stringify(validate.errors)).toContain('additional properties');
  });
});

describe('mcp.json rules', () => {
  const source = JSON.parse(readFileSync(join(ROOT, 'plugin', 'src', 'mcp.source.json'), 'utf8'));

  it('accepts the committed servers', () => {
    expect(compile('mcp.schema.json')({ servers: source.servers })).toBe(true);
    expect(validateMcpServers(source.servers)).toEqual([]);
  });

  it('rejects a headers block on wzrd-remote', () => {
    const remote = { ...source.servers['wzrd-remote'], headers: { Authorization: 'Bearer wzrd_pat_x' } };
    const errors = validateMcpServers({ 'wzrd-remote': remote });
    expect(errors.some((e: string) => /headers block/.test(e))).toBe(true);
  });
});

describe('SKILL.md lint', () => {
  it('accepts every committed skill', () => {
    for (const skill of readSkills(ROOT)) {
      expect(validateSkill(skill)).toEqual([]);
      expect(validateSkillTeachesSafetyLoop(skill)).toEqual([]);
    }
  });

  it('rejects a name that differs from the directory', () => {
    const errors = validateSkill({ dirName: 'wzrd-other', content: skillFixture() });
    expect(errors.some((e: string) => /must equal the directory name/.test(e))).toBe(true);
  });

  it('rejects a description over 1024 chars', () => {
    const errors = validateSkill({
      dirName: 'wzrd-example',
      content: skillFixture({ description: `use this when ${'x'.repeat(1024)}` }),
    });
    expect(errors.some((e: string) => /max 1024/.test(e))).toBe(true);
  });

  it('rejects a body over 500 lines', () => {
    const errors = validateSkill({ dirName: 'wzrd-example', content: skillFixture({ bodyLines: 501 }) });
    expect(errors.some((e: string) => /max 500/.test(e))).toBe(true);
  });

  it('rejects a name without the wzrd- prefix and bad hyphenation', () => {
    expect(
      validateSkill({ dirName: 'storyboard', content: skillFixture({ name: 'storyboard' }) }).some((e: string) =>
        /prefixed with "wzrd-"/.test(e),
      ),
    ).toBe(true);
    expect(
      validateSkill({ dirName: 'wzrd--x', content: skillFixture({ name: 'wzrd--x' }) }).some((e: string) =>
        /consecutive hyphens/.test(e),
      ),
    ).toBe(true);
  });
});

describe('tool registry', () => {
  const tools = readTools(ROOT);

  it('reads a non-empty registry from the modular tool files', () => {
    expect(tools.length).toBeGreaterThan(20);
  });

  it('accepts every committed tool name and rejects one over 40 chars', () => {
    expect(validateToolNames(tools.map((t: { name: string }) => t.name))).toEqual([]);
    const long = 'a'.repeat(41);
    expect(validateToolNames([long]).some((e: string) => /max 40/.test(e))).toBe(true);
  });

  it('requires spending tools to state a cost or freeness', () => {
    expect(validateSpendingToolDescriptions(tools)).toEqual([]);
    expect(
      validateSpendingToolDescriptions([{ name: 'x', spends: true, description: "'Renders things.'" }]),
    ).toHaveLength(1);
  });
});

describe('version parity', () => {
  it('flags any artefact that disagrees', () => {
    expect(validateVersionParity({ a: '1.0.0', b: '1.0.0' })).toEqual([]);
    expect(validateVersionParity({ a: '1.0.0', b: '1.0.1' })).toHaveLength(1);
  });
});
