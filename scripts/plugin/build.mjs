#!/usr/bin/env node
/**
 * `bun run plugin:build` — assemble the distributable plugin.
 *
 * dist-plugin/
 *   plugin.json
 *   mcp.json
 *   skills/<name>/SKILL.md      ← verbatim, unnested, so `npx skills add` works
 *   .claude-plugin/…            ← commands + hooks for Claude Code
 *   com.openai.codex/…, ai.openclaw/…, com.hermes/…
 *
 * The tarball produced here is what the release workflow attaches to the GitHub
 * release.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const outDir = join(repoRoot, 'dist-plugin');

const version = JSON.parse(readFileSync(join(repoRoot, 'plugin/plugin.json'), 'utf8')).version;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(repoRoot, 'plugin/plugin.json'), join(outDir, 'plugin.json'));
cpSync(join(repoRoot, 'plugin/mcp.json'), join(outDir, 'mcp.json'));
cpSync(join(repoRoot, 'plugin/schema'), join(outDir, 'schema'), { recursive: true });

// Skills are copied verbatim and stay immediate children of skills/.
cpSync(join(repoRoot, 'plugin/skills'), join(outDir, 'skills'), { recursive: true });

for (const clientDir of ['.claude-plugin', 'com.openai.codex', 'ai.openclaw', 'com.hermes']) {
  cpSync(join(repoRoot, clientDir), join(outDir, clientDir), { recursive: true });
}

cpSync(join(repoRoot, 'agent-skills/index.json'), join(outDir, 'skills-index.json'));

writeFileSync(
  join(outDir, 'VERSION'),
  `${version}\n${process.env.GITHUB_SHA ?? ''}\n`.trimEnd() + '\n',
  'utf8',
);

// Sanity check: no nesting deeper than skills/<name>/SKILL.md for the entrypoints.
const skillsOut = join(outDir, 'skills');
for (const dirName of readdirSync(skillsOut)) {
  const dirPath = join(skillsOut, dirName);
  if (!statSync(dirPath).isDirectory()) throw new Error(`dist skills/: loose file "${dirName}"`);
  if (!readdirSync(dirPath).includes('SKILL.md')) throw new Error(`dist skills/${dirName}: missing SKILL.md`);
}

console.log(`plugin:build ok — dist-plugin/ (version ${version}, ${readdirSync(skillsOut).length} skills)`);
