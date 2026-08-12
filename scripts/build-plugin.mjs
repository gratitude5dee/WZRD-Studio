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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'plugin', 'src');
const SCHEMAS = path.join(ROOT, 'plugin', 'schemas');
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
}

const PLACEHOLDER = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;

function checkMcpRules() {
  for (const [name, server] of Object.entries(mcpSource.servers)) {
    if (server.type === 'stdio') {
      assert(
        server.command === 'node',
        `${name}: mcp.json command must be exactly "node" (got ${JSON.stringify(server.command)})`,
      );
      assert(
        !PLACEHOLDER.test(server.command),
        `${name}: placeholders do not expand in "command"`,
      );
    }
    if (server.type === 'streamable-http') {
      assert(!('headers' in server), `${name}: remote server must not carry a headers block`);
      assert(
        !PLACEHOLDER.test(server.url),
        `${name}: placeholders do not expand in "url"`,
      );
    }
  }

  assert(
    !('headers' in (mcpSource.servers['wzrd-remote'] ?? {})),
    'wzrd-remote must not carry a headers block: the bridge supplies Authorization',
  );
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
  write('.claude-plugin/plugin.json', pluginJson);
  write('.claude-plugin/marketplace.json', marketplaceJson);

  for (const file of ['index.mjs', 'package.json']) {
    writeFileSync(
      path.join(OUT, 'bridge', file),
      readFileSync(path.join(ROOT, 'plugin', 'bridge', file)),
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
await checkSchemas();

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
