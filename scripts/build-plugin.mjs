/**
 * Build (and validate) the WZRD Studio agent plugin package.
 *
 * `plugin/src/` holds the single source of truth: the metadata and the MCP
 * server definition. Every artefact harnesses read — plugin.json, mcp.json,
 * .mcp.json, .claude-plugin/* — is generated from those two files here, so a
 * version or a URL can never drift between them.
 *
 *   node scripts/build-plugin.mjs            # full build + tarball
 *   node scripts/build-plugin.mjs --validate # lint + schema only (pre-commit)
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSkills, readTools } from './plugin/registry.mjs';
import {
  validateMcpServers,
  validateSkill,
  validateSkillTeachesSafetyLoop,
  validateSkillToolReferences,
  validateSpendingToolDescriptions,
  validateToolNames,
  validateVersionParity,
} from './plugin/validate-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'plugin', 'src');
const SCHEMAS = path.join(ROOT, 'plugin', 'schemas');
const SKILLS = path.join(ROOT, 'plugin', 'skills');
const CLAUDE = path.join(ROOT, '.claude-plugin');
const TOOLS_DIR = path.join(ROOT, 'supabase', 'functions', 'mcp-server', 'tools');
const OUT = path.join(ROOT, 'dist', 'wzrd-studio');

const validateOnly = process.argv.includes('--validate');
const failures = [];

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const meta = readJson(path.join(SRC, 'plugin.meta.json'));
const mcpSource = readJson(path.join(SRC, 'mcp.source.json'));
const marketplaceTemplate = readFileSync(path.join(SRC, 'marketplace.tpl.json'), 'utf8');
const claudeTemplate = readFileSync(path.join(SRC, 'claude.tpl.json'), 'utf8');
const MCP_URL = mcpSource.servers['wzrd-remote']?.url ?? '';

// ─── Artefacts ─────────────────────────────────────────────────────
// plugin.json is a closed schema: only the fields the spec names may appear.
const pluginJson = {
  name: meta.name,
  version: meta.version,
  description: meta.description,
  author: { name: meta.author },
  homepage: meta.homepage,
  license: meta.license,
  keywords: meta.keywords,
};

const mcpJson = { servers: mcpSource.servers };

// Claude/OpenClaw read `mcpServers` and spell the remote transport as
// `transport`, not `type`.
const dotMcpJson = {
  mcpServers: Object.fromEntries(
    Object.entries(mcpSource.servers).map(([name, server]) => {
      if (server.type === 'streamable-http') {
        const { type: _type, ...rest } = server;
        return [name, { transport: 'streamable-http', ...rest }];
      }
      const { type: _type, ...rest } = server;
      return [name, rest];
    }),
  ),
};

const marketplaceJson = JSON.parse(
  marketplaceTemplate
    .replaceAll('{{name}}', meta.name)
    .replaceAll('{{version}}', meta.version)
    .replaceAll('{{description}}', meta.description)
    .replaceAll('{{author}}', meta.author),
);

// ─── Invariants ────────────────────────────────────────────────────
/**
 * Claude Code reads `.claude-plugin/`. `skillsPath` differs per target because the
 * repo-root copy points into the checkout while the packaged copy points at the
 * skills folder inside the tarball.
 */
function renderClaude({ skillsPath, marketplaceSource, marketplaceSkillsPath }) {
  const { note: _note, ...rendered } = JSON.parse(
    claudeTemplate
      .replaceAll('{{name}}', meta.name)
      .replaceAll('{{version}}', meta.version)
      .replaceAll('{{description}}', meta.description)
      .replaceAll('{{author}}', meta.author)
      .replaceAll('{{homepage}}', meta.homepage)
      .replaceAll('{{mcpUrl}}', MCP_URL)
      .replaceAll('{{skillsPath}}', skillsPath)
      .replaceAll('{{marketplaceSource}}', marketplaceSource)
      .replaceAll('{{marketplaceSkillsPath}}', marketplaceSkillsPath),
  );
  return rendered;
}

// The repo-root copy is what `/plugin marketplace add <repo>` installs from.
const claudeRoot = renderClaude({
  skillsPath: '../plugin/skills',
  marketplaceSource: 'github:gratitude5dee/WZRD-Studio',
  marketplaceSkillsPath: 'plugin/skills',
});
// Inside the tarball everything is relative to the bundle root.
const claudeBundle = renderClaude({
  skillsPath: '../skills',
  marketplaceSource: './',
  marketplaceSkillsPath: 'skills',
});

const skills = readSkills(ROOT);
const tools = readTools(ROOT);

function checkSkills() {
  assert(skills.length >= 9, `expected the nine plugin skills, found ${skills.length}`);
  const knownTools = tools.map((tool) => tool.name);
  for (const skill of skills) {
    for (const error of validateSkill(skill)) fail(error);
    for (const error of validateSkillTeachesSafetyLoop(skill)) fail(error);
    for (const error of validateSkillToolReferences({ ...skill, knownTools })) fail(error);
  }
}

function checkTools() {
  assert(tools.length > 0, `could not read any tool definition from ${path.relative(ROOT, TOOLS_DIR)}`);
  for (const error of validateToolNames(tools.map((tool) => tool.name))) fail(error);
  for (const error of validateSpendingToolDescriptions(tools)) fail(error);

  // The agent-agnostic discovery index must only name tools the server exposes.
  const known = new Set(tools.map((tool) => tool.name));
  for (const skill of readJson(path.join(ROOT, 'agent-skills', 'index.json')).skills) {
    for (const tool of skill.mcp_tools ?? []) {
      if (!known.has(tool)) {
        fail(`agent-skills/index.json: skill "${skill.id}" references unknown tool "${tool}"`);
      }
    }
  }
}

/**
 * `.claude-plugin/` at the repo root is committed, because Claude Code installs
 * from the repository, so it must equal what this script generates.
 */
function checkClaudeDrift() {
  for (const [relative, expected] of [
    ['.claude-plugin/plugin.json', claudeRoot.plugin],
    ['.claude-plugin/marketplace.json', claudeRoot.marketplace],
  ]) {
    assert(
      JSON.stringify(readJson(path.join(ROOT, relative))) === JSON.stringify(expected),
      `${relative} has drifted from plugin/src/claude.tpl.json — run \`bun run plugin:build\` to regenerate it`,
    );
  }

  // A manifest path that does not resolve makes the plugin install empty.
  for (const [manifest, base, relative] of [
    ['.claude-plugin/plugin.json', CLAUDE, claudeRoot.plugin.skills],
    ['.claude-plugin/plugin.json', CLAUDE, claudeRoot.plugin.commands],
    ['.claude-plugin/plugin.json', CLAUDE, claudeRoot.plugin.hooks],
    ['.claude-plugin/marketplace.json', ROOT, claudeRoot.marketplace.plugins[0].skills],
  ]) {
    assert(
      existsSync(path.resolve(base, relative)),
      `${manifest}: path "${relative}" does not exist in the repository`,
    );
  }
}

function checkVersionParity() {
  const bridgePackage = readJson(path.join(ROOT, 'plugin', 'bridge', 'package.json'));
  assert(
    bridgePackage.version === meta.version,
    `version parity: plugin.meta.json is ${meta.version} but plugin/bridge/package.json is ${bridgePackage.version}`,
  );

  const serverVersion = readFileSync(
    path.join(ROOT, 'supabase', 'functions', 'mcp-server', 'version.ts'),
    'utf8',
  ).match(/PLUGIN_VERSION\s*=\s*'([^']+)'/);
  assert(serverVersion, 'version parity: could not read PLUGIN_VERSION from mcp-server/version.ts');
  if (serverVersion) {
    assert(
      serverVersion[1] === meta.version,
      `version parity: plugin.meta.json is ${meta.version} but mcp-server reports ${serverVersion[1]}`,
    );
  }

  assert(
    marketplaceJson.plugins[0]?.version === meta.version,
    'version parity: marketplace.json plugin entry does not match plugin.meta.json',
  );

  // Client metadata is committed rather than generated, so it is checked, not fixed.
  const hermes = /^version:\s*(\S+)\s*$/m.exec(readFileSync(path.join(ROOT, 'com.hermes', 'agent.yaml'), 'utf8'));
  const hermesInclude = /^version:\s*(\S+)\s*$/m.exec(readFileSync(path.join(ROOT, '.hermes', 'agent.yaml'), 'utf8'));
  for (const error of validateVersionParity({
    'plugin.meta.json': meta.version,
    'com.openai.codex/marketplace.json': readJson(path.join(ROOT, 'com.openai.codex', 'marketplace.json')).version,
    'ai.openclaw/manifest.json': readJson(path.join(ROOT, 'ai.openclaw', 'manifest.json')).version,
    'public/.well-known/agents.json': readJson(path.join(ROOT, 'public', '.well-known', 'agents.json')).version,
    'com.hermes/agent.yaml': hermes?.[1],
    '.hermes/agent.yaml': hermesInclude?.[1],
  })) {
    fail(error);
  }
}

function checkMcpRules() {
  for (const error of validateMcpServers(mcpSource.servers)) fail(error);
}

/** mcp.json and .mcp.json must describe the same servers. */
function checkSemanticEquivalence() {
  const normalize = (server) => {
    // Claude infers stdio from the presence of `command`, so an absent
    // transport on a command server is still stdio.
    const transport = server.type ?? server.transport ?? (server.command ? 'stdio' : null);
    return JSON.stringify({
      transport,
      command: server.command ?? null,
      args: server.args ?? [],
      env: server.env ?? {},
      cwd: server.cwd ?? null,
      url: server.url ?? null,
    });
  };

  const left = Object.entries(mcpJson.servers).map(([name, s]) => `${name}=${normalize(s)}`).sort();
  const right = Object.entries(dotMcpJson.mcpServers).map(([name, s]) => `${name}=${normalize(s)}`).sort();

  assert(
    JSON.stringify(left) === JSON.stringify(right),
    `mcp.json and .mcp.json are not semantically equivalent:\n  ${left.join('\n  ')}\n  ---\n  ${right.join('\n  ')}`,
  );
}

async function checkSchemas() {
  let Ajv;
  try {
    ({ default: Ajv } = await import('ajv'));
  } catch {
    fail('ajv is not installed. Run `bun install` before building the plugin package.');
    return;
  }

  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  const cases = [
    ['plugin.json', 'plugin.schema.json', pluginJson],
    ['mcp.json', 'mcp.schema.json', mcpJson],
    ['marketplace.json', 'marketplace.schema.json', marketplaceJson],
  ];

  for (const [label, schemaFile, document] of cases) {
    const validate = ajv.compile(readJson(path.join(SCHEMAS, schemaFile)));
    if (!validate(document)) {
      for (const error of validate.errors ?? []) {
        fail(`${label}${error.instancePath || ''} ${error.message}`);
      }
    }
  }
}

/** Secret scan over the staged tree; the packaged files are generated from it. */
function runGitleaks() {
  try {
    execFileSync('gitleaks', ['protect', '--staged', '--redact', '--no-banner'], {
      cwd: ROOT,
      stdio: 'pipe',
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('[plugin:build] gitleaks is not installed — skipping the staged secret scan.');
      return;
    }
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    fail(`gitleaks found problems in the staged tree:\n${output}`);
  }
}

function writeArtifacts() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(path.join(OUT, '.claude-plugin'), { recursive: true });
  mkdirSync(path.join(OUT, 'bridge'), { recursive: true });

  const write = (relative, document) =>
    writeFileSync(path.join(OUT, relative), `${JSON.stringify(document, null, 2)}\n`);

  write('plugin.json', pluginJson);
  write('mcp.json', mcpJson);
  write('.mcp.json', dotMcpJson);
  write('.claude-plugin/plugin.json', claudeBundle.plugin);
  write('.claude-plugin/marketplace.json', claudeBundle.marketplace);

  for (const file of ['index.mjs', 'package.json']) {
    writeFileSync(
      path.join(OUT, 'bridge', file),
      readFileSync(path.join(ROOT, 'plugin', 'bridge', file)),
    );
  }

  // Skills are the fallback surface for clients with no extensions, so they ship
  // verbatim and unnested — in the bundle and at dist/skills for `npx skills add`.
  cpSync(SKILLS, path.join(OUT, 'skills'), { recursive: true });
  rmSync(path.join(ROOT, 'dist', 'skills'), { recursive: true, force: true });
  cpSync(SKILLS, path.join(ROOT, 'dist', 'skills'), { recursive: true });
  for (const dir of ['commands', 'hooks']) {
    cpSync(path.join(CLAUDE, dir), path.join(OUT, '.claude-plugin', dir), { recursive: true });
  }

  // Regenerate the committed repo-root copy so it cannot drift from the template.
  writeFileSync(path.join(CLAUDE, 'plugin.json'), `${JSON.stringify(claudeRoot.plugin, null, 2)}\n`);
  writeFileSync(path.join(CLAUDE, 'marketplace.json'), `${JSON.stringify(claudeRoot.marketplace, null, 2)}\n`);
}

/** Nothing a manifest in the bundle points at may be missing from the bundle. */
function checkBundlePaths() {
  const required = [
    'plugin.json',
    'mcp.json',
    '.mcp.json',
    'bridge/index.mjs',
    path.join('.claude-plugin', claudeBundle.plugin.commands),
    path.join('.claude-plugin', claudeBundle.plugin.hooks),
    path.join('.claude-plugin', claudeBundle.plugin.skills),
    claudeBundle.marketplace.plugins[0].skills,
  ];
  for (const relative of required) {
    assert(
      existsSync(path.resolve(OUT, relative)),
      `bundle is missing "${relative}", which a manifest inside it points at`,
    );
  }
  for (const skill of skills) {
    assert(
      existsSync(path.join(OUT, 'skills', skill.relativePath)),
      `bundle is missing skill "${skill.relativePath}"`,
    );
  }
}

function writeTarball() {
  const tarball = path.join(ROOT, 'dist', `${meta.name}-${meta.version}.tgz`);
  try {
    execFileSync('tar', ['-czf', tarball, '-C', path.join(ROOT, 'dist'), meta.name], {
      stdio: 'pipe',
    });
  } catch (error) {
    fail(`tarball creation failed: ${error.message}`);
    return null;
  }
  return tarball;
}

checkVersionParity();
checkMcpRules();
checkSemanticEquivalence();
checkSkills();
checkTools();
await checkSchemas();
// A full build regenerates the committed copy; validation only reports the drift.
if (validateOnly) checkClaudeDrift();

if (!validateOnly) {
  runGitleaks();
}

if (failures.length > 0) {
  console.error('[plugin:build] failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

if (validateOnly) {
  console.log(`[plugin:validate] ${meta.name}@${meta.version} sources are valid.`);
  process.exit(0);
}

writeArtifacts();
checkBundlePaths();
const tarball = writeTarball();

if (failures.length > 0) {
  console.error('[plugin:build] failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`[plugin:build] wrote ${path.relative(ROOT, OUT)}`);
if (tarball) console.log(`[plugin:build] wrote ${path.relative(ROOT, tarball)}`);

if (!existsSync(path.join(OUT, 'plugin.json'))) {
  console.error('[plugin:build] expected plugin.json in the output directory');
  process.exit(1);
}
