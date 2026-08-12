#!/usr/bin/env node
/**
 * `bun run plugin:wellknown` — regenerate public/.well-known/agents.json from the
 * plugin manifest so the discovery document can never advertise a stale version.
 * The CI `wellknown` job runs this, fails if it produced a diff, and then triggers
 * the Vercel deploy hook.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'plugin/plugin.json'), 'utf8'));
const mcp = JSON.parse(readFileSync(join(repoRoot, 'plugin/mcp.json'), 'utf8'));
const serverUrl = mcp.mcpServers['wzrd-remote'].url;
const target = join(repoRoot, 'public/.well-known/agents.json');

const previous = JSON.parse(readFileSync(target, 'utf8'));

const document = {
  $schema: previous.$schema,
  name: 'WZRD Studio',
  version: manifest.version,
  description: previous.description,
  homepage: manifest.homepage,
  mcp: {
    url: serverUrl,
    transport: 'streamable-http',
    auth: 'bearer',
    health: `${serverUrl}/health`,
    token_instructions: 'Create a personal access token in the WZRD web app under Settings → Agent access.',
  },
  plugin: {
    manifest: '/plugin/plugin.json',
    mcp_config: '/.mcp.json',
    skills: '/plugin/skills',
    marketplace: '/.claude-plugin/marketplace.json',
  },
  skills_index: '/agent-skills/index.json',
  supported_harnesses: ['claude-code', 'codex', 'openclaw', 'hermes'],
  configs: {
    'claude-code': '/.claude-plugin/plugin.json',
    codex: '/com.openai.codex/marketplace.json',
    openclaw: '/ai.openclaw/manifest.json',
    hermes: '/com.hermes/agent.yaml',
  },
};

writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`plugin:wellknown ok — public/.well-known/agents.json at version ${manifest.version}`);
