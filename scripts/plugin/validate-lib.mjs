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

export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
export const MAX_SKILL_BODY_LINES = 500;
export const MAX_TOOL_NAME_LENGTH = 40;

/** lowercase alphanumerics and hyphens, no leading/trailing/consecutive hyphens */
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TOOL_NAME = /^[a-z][a-z0-9_]*$/;

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

/**
 * A tool that can move credits must say so in `tools/list`, where the agent picks
 * it: either its price, or that this particular call is free and what is billed
 * instead. "Find out by calling it" is not an option for a spending tool.
 */
export function validateSpendingToolDescriptions(tools) {
  return tools
    .filter((tool) => tool.spends)
    .filter((tool) => !/credit|billed|free/i.test(tool.description))
    .map(
      (tool) =>
        `tool "${tool.name}" can spend credits but its description states neither a cost nor that it is free`,
    );
}

/**
 * Skills are the fallback for clients that implement no extensions, so a skill
 * naming a tool the server does not expose is a broken plugin, not a typo. Tool
 * invocations in a skill body are written as `tool_name { args }` or listed after
 * a `Tool:`/`Tools:` lead-in.
 */
export function validateSkillToolReferences({ dirName, content, knownTools }) {
  const label = `plugin/skills/${dirName}/SKILL.md`;
  const referenced = new Set();

  for (const [, name] of content.matchAll(/`([a-z][a-z0-9_]*)\s*\{/g)) referenced.add(name);
  for (const line of content.split(/\r?\n/)) {
    if (!/^Tools?:/.test(line.trim())) continue;
    for (const [, name] of line.matchAll(/`([a-z][a-z0-9_]+)`/g)) referenced.add(name);
  }

  return [...referenced]
    .filter((name) => !knownTools.includes(name))
    .sort()
    .map((name) => `${label}: references tool "${name}", which the MCP server does not expose`);
}

const PLACEHOLDER = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;

/**
 * Rules a JSON schema cannot express: a `headers` block on the remote server
 * would bake a bearer token into a committed file (the stdio bridge supplies
 * Authorization at runtime), and `${VAR}` placeholders do not expand in
 * `command` or `url`.
 */
export function validateMcpServers(servers) {
  const errors = [];
  for (const [name, server] of Object.entries(servers ?? {})) {
    if (server.type === 'stdio') {
      if (server.command !== 'node') {
        errors.push(`${name}: mcp.json command must be exactly "node" (got ${JSON.stringify(server.command)})`);
      }
      if (PLACEHOLDER.test(server.command ?? '')) errors.push(`${name}: placeholders do not expand in "command"`);
    }
    if (server.type === 'streamable-http') {
      if ('headers' in server) {
        errors.push(`${name}: remote server must not carry a headers block — it would bake a bearer token into a committed file`);
      }
      if (PLACEHOLDER.test(server.url ?? '')) errors.push(`${name}: placeholders do not expand in "url"`);
    }
  }
  return errors;
}

/** One version for the whole plugin: any artefact that disagrees breaks a client. */
export function validateVersionParity(versions) {
  const entries = Object.entries(versions ?? {});
  const distinct = [...new Set(entries.map(([, version]) => version))];
  if (distinct.length <= 1) return [];
  return [
    `version fields disagree: ${entries.map(([label, version]) => `${label}=${version}`).join(', ')}`,
  ];
}
