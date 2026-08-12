#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook: renders a `get_storyboard` result as a markdown
 * table with inline image links, so the storyboard is readable without the agent
 * spending tokens reformatting JSON.
 *
 * The renderer is exported and unit-tested (see tests/plugin/hook-render.test.ts);
 * the CLI wrapper only runs when this file is executed directly.
 */

const MAX_PROMPT_CHARS = 120;

function truncate(value, max = MAX_PROMPT_CHARS) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function imageCell(shot) {
  const url = shot.image_url ?? shot.imageUrl ?? null;
  if (!url) return shot.image_status === 'generating' ? 'generating…' : '—';
  return `[frame](${url})`;
}

/** @param {Record<string, any>} payload a `get_storyboard` tool result */
export function renderStoryboardTable(payload) {
  const data = payload?.data ?? payload ?? {};
  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  const shots = Array.isArray(data.shots) ? data.shots : [];
  const staged = data.staged ?? data.state?.staged ?? null;
  const revision = data.revision ?? '—';

  const sceneNumber = new Map(scenes.map((scene) => [scene.id, scene.scene_number ?? scene.sceneNumber]));

  const lines = [];
  lines.push(`**WZRD storyboard** — revision ${revision} · ${scenes.length} scenes · ${shots.length} shots`);
  lines.push('');
  lines.push('| Scene | Shot | Type | Prompt | Frame |');
  lines.push('| --- | --- | --- | --- | --- |');

  if (shots.length === 0) {
    lines.push('| — | — | — | _no committed shots yet_ | — |');
  }

  for (const shot of shots) {
    lines.push(
      `| ${escapeCell(sceneNumber.get(shot.scene_id) ?? '—')} | ${escapeCell(shot.shot_number ?? '—')} | ${escapeCell(
        truncate(shot.shot_type, 24),
      )} | ${escapeCell(truncate(shot.visual_prompt || shot.prompt_idea))} | ${imageCell(shot)} |`,
    );
  }

  const stagedScenes = Array.isArray(staged?.scenes) ? staged.scenes : [];
  const stagedShots = Array.isArray(staged?.shots) ? staged.shots : [];
  if (stagedScenes.length > 0 || stagedShots.length > 0) {
    lines.push('');
    lines.push(
      `**Staged (not committed)** — ${stagedScenes.length} scene deltas, ${stagedShots.length} shot deltas. Run \`storyboard_diff\`, then \`storyboard_commit\` at revision ${revision}.`,
    );
  }

  if (data.deep_link) {
    lines.push('');
    lines.push(`[Open the timeline](${data.deep_link})`);
  }

  return lines.join('\n');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let event = {};
  try {
    event = JSON.parse((await readStdin()) || '{}');
  } catch {
    process.exit(0);
  }

  const response = event.tool_response ?? event.toolResponse ?? {};
  let payload = response;
  // MCP results arrive as { content: [{ type: 'text', text: '<json>' }] }.
  const text = Array.isArray(response?.content) ? response.content[0]?.text : null;
  if (typeof text === 'string') {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = response;
    }
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: renderStoryboardTable(payload),
      },
    }),
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
