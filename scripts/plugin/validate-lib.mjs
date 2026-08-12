/**
 * Pure validators for the WZRD universal plugin.
 *
 * Kept dependency-free and side-effect-free so that both the CLI
 * (`bun run plugin:validate`) and the schema-validation test suite
 * (including its negative cases) exercise exactly the same code.
 *
 * Every validator returns an array of human-readable error strings; empty means
 * valid.
 */

export const MANIFEST_ALLOWED_KEYS = [
  '$schema',
  'name',
  'version',
  'description',
  'homepage',
  'license',
  'author',
  'mcp',
  'skills',
  'clients',
];

export const MANIFEST_REQUIRED_KEYS = ['name', 'version', 'description', 'mcp', 'skills'];

export const MCP_SERVER_ALLOWED_KEYS = ['type', 'url', 'description', 'auth'];

export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
export const MAX_SKILL_BODY_LINES = 500;
export const MAX_TOOL_NAME_LENGTH = 40;

const SEMVER = /^\d+\.\d+\.\d+$/;
/** lowercase alphanumerics and hyphens, no leading/trailing/consecutive hyphens */
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TOOL_NAME = /^[a-z][a-z0-9_]*$/;

export function validateManifest(manifest, { label = 'plugin/plugin.json' } = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return [`${label}: manifest must be a JSON object`];
  }

  for (const key of Object.keys(manifest)) {
    if (!MANIFEST_ALLOWED_KEYS.includes(key)) {
      errors.push(`${label}: unknown top-level field "${key}"`);
    }
  }
  for (const key of MANIFEST_REQUIRED_KEYS) {
    if (manifest[key] === undefined) errors.push(`${label}: missing required field "${key}"`);
  }
  if (typeof manifest.name === 'string' && !SKILL_NAME.test(manifest.name)) {
    errors.push(`${label}: name "${manifest.name}" must be lowercase alphanumerics separated by single hyphens`);
  }
  if (typeof manifest.version === 'string' && !SEMVER.test(manifest.version)) {
    errors.push(`${label}: version "${manifest.version}" must be semver MAJOR.MINOR.PATCH`);
  }
  if (typeof manifest.description === 'string' && manifest.description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    errors.push(`${label}: description is ${manifest.description.length} chars (max ${MAX_SKILL_DESCRIPTION_LENGTH})`);
  }
  return errors;
}

export function validateMcpConfig(config, { label = 'plugin/mcp.json' } = {}) {
  const errors = [];
  if (!config || typeof config !== 'object') return [`${label}: must be a JSON object`];
  if (typeof config.version !== 'string' || !SEMVER.test(config.version ?? '')) {
    errors.push(`${label}: version must be semver`);
  }
  const servers = config.mcpServers;
  if (!servers || typeof servers !== 'object') return [...errors, `${label}: missing mcpServers`];

  const names = Object.keys(servers);
  if (!names.includes('wzrd-remote')) errors.push(`${label}: mcpServers must define "wzrd-remote"`);
  for (const extra of names.filter((name) => name !== 'wzrd-remote')) {
    errors.push(`${label}: unexpected MCP server "${extra}"`);
  }

  const server = servers['wzrd-remote'];
  if (server && typeof server === 'object') {
    for (const key of Object.keys(server)) {
      if (!MCP_SERVER_ALLOWED_KEYS.includes(key)) {
        // A `headers` block would bake a bearer token into a committed file.
        errors.push(`${label}: wzrd-remote has unsupported field "${key}" (auth must go through auth.tokenEnv, never inline headers)`);
      }
    }
    if (server.type !== 'http') errors.push(`${label}: wzrd-remote.type must be "http"`);
    if (typeof server.url !== 'string' || !server.url.startsWith('https://')) {
      errors.push(`${label}: wzrd-remote.url must be an https URL`);
    }
    if (!server.auth || server.auth.type !== 'bearer' || typeof server.auth.tokenEnv !== 'string') {
      errors.push(`${label}: wzrd-remote.auth must be { type: "bearer", tokenEnv: "<ENV>" }`);
    }
  }
  return errors;
}

/** Minimal frontmatter reader: `key: value` pairs, values may be quoted. */
export function parseFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content ?? '');
  if (!match) return { frontmatter: null, body: content ?? '' };
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    let value = pair[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontmatter[pair[1]] = value;
  }
  return { frontmatter, body: match[2] };
}

export function validateSkill({ dirName, fileName = 'SKILL.md', content, relativePath = '' }) {
  const label = `plugin/skills/${dirName}/${fileName}`;
  const errors = [];

  if (fileName !== 'SKILL.md') {
    errors.push(`${label}: skill file must be named exactly "SKILL.md"`);
  }
  if (relativePath && relativePath !== `${dirName}/${fileName}`) {
    errors.push(`${label}: skills must be an immediate child of skills/ (found nested path "${relativePath}")`);
  }

  const { frontmatter, body } = parseFrontmatter(content);
  if (!frontmatter) return [...errors, `${label}: missing YAML frontmatter`];

  const name = frontmatter.name;
  if (!name) {
    errors.push(`${label}: frontmatter is missing "name"`);
  } else {
    if (name !== dirName) errors.push(`${label}: frontmatter name "${name}" must equal the directory name "${dirName}"`);
    if (name.length > MAX_SKILL_NAME_LENGTH) errors.push(`${label}: name is ${name.length} chars (max ${MAX_SKILL_NAME_LENGTH})`);
    if (!SKILL_NAME.test(name)) {
      errors.push(`${label}: name "${name}" must be lowercase alphanumerics/hyphens with no leading, trailing, or consecutive hyphens`);
    }
    if (!name.startsWith('wzrd-')) errors.push(`${label}: name "${name}" must be prefixed with "wzrd-"`);
  }

  const description = frontmatter.description;
  if (!description) {
    errors.push(`${label}: frontmatter is missing "description"`);
  } else if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    errors.push(`${label}: description is ${description.length} chars (max ${MAX_SKILL_DESCRIPTION_LENGTH})`);
  } else if (!/\buse this\b|\bwhen\b/i.test(description)) {
    errors.push(`${label}: description must state when to use the skill, not only what it does`);
  }

  const bodyLines = body.split(/\r?\n/).length;
  if (bodyLines > MAX_SKILL_BODY_LINES) {
    errors.push(`${label}: body is ${bodyLines} lines (max ${MAX_SKILL_BODY_LINES})`);
  }

  return errors;
}

/** The safety loop must be teachable from the skill body alone. */
export function validateSkillTeachesSafetyLoop({ dirName, content }) {
  const label = `plugin/skills/${dirName}/SKILL.md`;
  const body = content.toLowerCase();
  const required = [
    ['get_credits', 'get_credits'],
    ['dryrun', 'dryRun cost preview'],
    ['confirm', 'explicit confirmation'],
    ['idempotency', 'idempotencyKey'],
    ['?tab=timeline', 'the timeline deep link'],
  ];
  return required.filter(([needle]) => !body.includes(needle)).map(([, human]) => `${label}: does not teach ${human}`);
}

export function validateToolNames(names) {
  const errors = [];
  const seen = new Set();
  for (const name of names) {
    if (name.length > MAX_TOOL_NAME_LENGTH) {
      errors.push(`tool "${name}" is ${name.length} chars (max ${MAX_TOOL_NAME_LENGTH})`);
    }
    if (!TOOL_NAME.test(name)) errors.push(`tool "${name}" must be lower_snake_case`);
    if (seen.has(name)) errors.push(`tool "${name}" is declared twice`);
    seen.add(name);
  }
  return errors;
}

/** Spending tools must advertise their cost in tools/list. */
export function validateSpendingToolDescriptions(tools) {
  return tools
    .filter((tool) => tool.spends)
    .filter((tool) => !/credit/i.test(tool.description) || !/dryrun/i.test(tool.description))
    .map((tool) => `tool "${tool.name}" spends credits but its description omits the cost text or the dryRun preview`);
}

/**
 * The committed MCP config is mirrored at the repo root for clients that look for
 * `.mcp.json`; drift between them silently breaks one of the two.
 */
export function validateMirrorDrift({ pluginMcp, rootMcp, versions }) {
  const errors = [];
  if (JSON.stringify(pluginMcp) !== JSON.stringify(rootMcp)) {
    errors.push('.mcp.json has drifted from plugin/mcp.json (they must be byte-identical after JSON normalization)');
  }
  const entries = Object.entries(versions ?? {});
  const distinct = [...new Set(entries.map(([, version]) => version))];
  if (distinct.length > 1) {
    errors.push(
      `version fields disagree: ${entries.map(([label, version]) => `${label}=${version}`).join(', ')}`,
    );
  }
  return errors;
}
