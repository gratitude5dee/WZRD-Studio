#!/usr/bin/env node
/**
 * `bun run plugin:validate` — the gate that runs on every push and PR.
 *
 * Checks: manifest schema, MCP config schema (including no inline auth headers),
 * SKILL.md lint (name == directory, description length, body length, no nesting,
 * safety-loop coverage), MCP tool-name length, plugin/mcp.json ↔ .mcp.json mirror
 * drift, and version-field agreement across every file that advertises a version.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  validateManifest,
  validateMcpConfig,
  validateMirrorDrift,
  validateSkill,
  validateSkillTeachesSafetyLoop,
  validateSpendingToolDescriptions,
  validateToolNames,
} from './validate-lib.mjs';

const repoRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const readJson = (path) => JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
const readText = (path) => readFileSync(join(repoRoot, path), 'utf8');

export const EXPECTED_SKILLS = [
  'wzrd-setup-project',
  'wzrd-storyboard',
  'wzrd-generate-shot',
  'wzrd-seedance-handoff',
  'wzrd-studio-graph',
  'wzrd-edit-timeline',
  'wzrd-render-timeline',
  'wzrd-export-video',
  'wzrd-billing',
];

/** Parse the tool registry out of the Deno source without importing Deno. */
export function parseToolRegistry(source) {
  const tools = [];
  const pattern = /\n\s{4}name: '([a-z0-9_]+)',\n([\s\S]*?)\n\s{4}spends: (true|false),/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    tools.push({ name: match[1], description: match[2], spends: match[3] === 'true' });
  }
  return tools;
}

function walkSkillFiles(skillsDir) {
  const entries = [];
  for (const dirName of readdirSync(skillsDir)) {
    const dirPath = join(skillsDir, dirName);
    if (!statSync(dirPath).isDirectory()) {
      entries.push({ dirName: '', fileName: dirName, relativePath: dirName, content: '' });
      continue;
    }
    const stack = [dirPath];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of readdirSync(current)) {
        const entryPath = join(current, entry);
        if (statSync(entryPath).isDirectory()) {
          stack.push(entryPath);
          continue;
        }
        entries.push({
          dirName,
          fileName: entry,
          relativePath: relative(skillsDir, entryPath),
          content: readFileSync(entryPath, 'utf8'),
        });
      }
    }
  }
  return entries;
}

function main() {
  const errors = [];

  const manifest = readJson('plugin/plugin.json');
  errors.push(...validateManifest(manifest));

  const pluginMcp = readJson('plugin/mcp.json');
  const rootMcp = readJson('.mcp.json');
  errors.push(...validateMcpConfig(pluginMcp));
  errors.push(...validateMcpConfig(rootMcp, { label: '.mcp.json' }));

  const claudePlugin = readJson('.claude-plugin/plugin.json');
  const marketplace = readJson('.claude-plugin/marketplace.json');
  const codex = readJson('com.openai.codex/marketplace.json');
  const openclaw = readJson('ai.openclaw/manifest.json');
  const wellKnown = readJson('public/.well-known/agents.json');
  const serverVersion = /PLUGIN_VERSION = '([^']+)'/.exec(readText('supabase/functions/mcp-server/version.ts'))?.[1];
  const hermesVersion = /^version:\s*(.+)$/m.exec(readText('com.hermes/agent.yaml'))?.[1]?.trim();
  const hermesRootVersion = /^version:\s*(.+)$/m.exec(readText('.hermes/agent.yaml'))?.[1]?.trim();

  errors.push(
    ...validateMirrorDrift({
      pluginMcp,
      rootMcp,
      versions: {
        'plugin/plugin.json': manifest.version,
        'plugin/mcp.json': pluginMcp.version,
        '.mcp.json': rootMcp.version,
        '.claude-plugin/plugin.json': claudePlugin.version,
        '.claude-plugin/marketplace.json': marketplace.version,
        'marketplace.plugins[0]': marketplace.plugins?.[0]?.version,
        'com.openai.codex/marketplace.json': codex.version,
        'ai.openclaw/manifest.json': openclaw.version,
        'public/.well-known/agents.json': wellKnown.version,
        'mcp-server/version.ts': serverVersion,
        'com.hermes/agent.yaml': hermesVersion,
        '.hermes/agent.yaml': hermesRootVersion,
      },
    }),
  );

  // Skills
  const skillsDir = join(repoRoot, 'plugin/skills');
  const files = walkSkillFiles(skillsDir);
  const foundSkills = new Set();
  for (const file of files) {
    if (!file.dirName) {
      errors.push(`plugin/skills/${file.fileName}: loose file — skills must be directories containing SKILL.md`);
      continue;
    }
    errors.push(...validateSkill(file));
    if (file.fileName === 'SKILL.md' && file.relativePath === `${file.dirName}/SKILL.md`) {
      foundSkills.add(file.dirName);
      errors.push(...validateSkillTeachesSafetyLoop({ dirName: file.dirName, content: file.content }));
    }
  }
  for (const expected of EXPECTED_SKILLS) {
    if (!foundSkills.has(expected)) errors.push(`plugin/skills/${expected}/SKILL.md is missing`);
  }
  for (const found of foundSkills) {
    if (!EXPECTED_SKILLS.includes(found)) errors.push(`plugin/skills/${found}: unexpected skill (update EXPECTED_SKILLS deliberately)`);
  }

  // MCP tool surface
  const tools = parseToolRegistry(readText('supabase/functions/mcp-server/tools.ts'));
  if (tools.length === 0) errors.push('supabase/functions/mcp-server/tools.ts: no tools parsed — the registry format changed');
  errors.push(...validateToolNames(tools.map((tool) => tool.name)));
  errors.push(...validateSpendingToolDescriptions(tools));

  // Every skill's declared tools must exist.
  const toolNames = new Set(tools.map((tool) => tool.name));
  for (const skill of readJson('agent-skills/index.json').skills) {
    for (const tool of skill.mcp_tools ?? []) {
      if (!toolNames.has(tool)) errors.push(`agent-skills/index.json: skill "${skill.id}" references unknown tool "${tool}"`);
    }
  }

  if (errors.length > 0) {
    console.error(`plugin:validate failed with ${errors.length} error(s):`);
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exit(1);
  }

  console.log(
    `plugin:validate ok — version ${manifest.version}, ${foundSkills.size} skills, ${tools.length} tools (${tools.filter((tool) => tool.spends).length} spending).`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
