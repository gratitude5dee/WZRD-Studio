/**
 * Reads the plugin's two sources of truth — the skill bodies under
 * plugin/skills/ and the MCP tool surface declared in TypeScript under
 * supabase/functions/mcp-server/tools/ — for the build and the test suites, so
 * neither keeps its own copy of the tool list.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function pluginMeta(rootDir) {
  return JSON.parse(readFileSync(path.join(rootDir, 'plugin', 'src', 'plugin.meta.json'), 'utf8'));
}

export function readSkills(rootDir) {
  const skillsDir = path.join(rootDir, 'plugin', 'skills');
  const skills = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relative);
      } else if (entry.name.toLowerCase().endsWith('.md')) {
        skills.push({
          dirName: relative.split('/')[0],
          fileName: entry.name,
          relativePath: relative,
          content: readFileSync(path.join(dir, entry.name), 'utf8'),
        });
      }
    }
  };
  walk(skillsDir, '');
  return skills;
}

/**
 * Each entry of a `ToolDefinition[]` literal is an indented object literal, and
 * a tool that composes `spendingSchema` can spend credits.
 */
export function readTools(rootDir) {
  const toolsDir = path.join(rootDir, 'supabase', 'functions', 'mcp-server', 'tools');
  const tools = [];
  for (const file of readdirSync(toolsDir).filter((name) => name.endsWith('.ts'))) {
    if (['types.ts', 'shared.ts', 'index.ts'].includes(file)) continue;
    const source = readFileSync(path.join(toolsDir, file), 'utf8');
    for (const chunk of source.split(/\n(?=\s{2,6}\{\n)/)) {
      const name = /\n\s*name: '([a-z0-9_]+)',/.exec(chunk);
      if (!name) continue;
      const description = /\n\s*description:\s*([\s\S]*?),\n\s*scope:/.exec(chunk);
      const scope = /\n\s*scope: '([a-z]+)'/.exec(chunk);
      tools.push({
        name: name[1],
        description: description ? description[1] : '',
        scope: scope ? scope[1] : 'read',
        spends: /spendingSchema\(/.test(chunk),
        file,
      });
    }
  }
  return tools;
}
