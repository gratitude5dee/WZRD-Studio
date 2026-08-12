/**
 * Phase 4 — the Claude Code PostToolUse hook that renders `get_storyboard` as a
 * markdown table with inline image links.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain ESM hook shared with Claude Code
import { renderStoryboardTable } from '../../.claude-plugin/hooks/render-storyboard.mjs';

const hookPath = join(__dirname, '../../.claude-plugin/hooks/render-storyboard.mjs');

const payload = {
  data: {
    project_id: 'project-1',
    revision: 4,
    scenes: [
      { id: 'scene-1', scene_number: 1, title: 'Rooftop' },
      { id: 'scene-2', scene_number: 2, title: 'Stairwell' },
    ],
    shots: [
      { id: 'shot-1', scene_id: 'scene-1', shot_number: 1, shot_type: 'wide', visual_prompt: 'Mara on the rooftop | dusk', image_url: 'https://cdn/1.png' },
      { id: 'shot-2', scene_id: 'scene-2', shot_number: 2, shot_type: 'medium', visual_prompt: 'Mara in the stairwell', image_status: 'generating' },
    ],
    staged: { scenes: [], shots: [{ op: 'create', key: 'x' }] },
    deep_link: 'https://app.wzrd.tech/project/project-1?tab=timeline',
  },
};

describe('get_storyboard markdown renderer', () => {
  const table = renderStoryboardTable(payload);

  it('renders a markdown table header', () => {
    expect(table).toContain('| Scene | Shot | Type | Prompt | Frame |');
    expect(table).toContain('revision 4');
  });

  it('renders inline image links and generation status', () => {
    expect(table).toContain('[frame](https://cdn/1.png)');
    expect(table).toContain('generating…');
  });

  it('escapes pipes so one prompt cannot break the table', () => {
    const promptRow = table.split('\n').find((line) => line.includes('Mara on the rooftop'))!;
    expect(promptRow).toContain('Mara on the rooftop \\| dusk');
    // 6 unescaped delimiters = 5 cells; the escaped pipe stays inside its cell.
    expect((promptRow.match(/(?<!\\)\|/g) ?? []).length).toBe(6);
  });

  it('surfaces staged deltas and the timeline deep link', () => {
    expect(table).toContain('Staged (not committed)');
    expect(table).toContain('storyboard_commit');
    expect(table).toContain('?tab=timeline');
  });

  it('handles an empty storyboard without throwing', () => {
    expect(renderStoryboardTable({ data: { scenes: [], shots: [] } })).toContain('no committed shots yet');
    expect(renderStoryboardTable({})).toContain('| Scene | Shot | Type | Prompt | Frame |');
  });

  it('runs as a PostToolUse hook over stdin with an MCP-shaped result', () => {
    const stdout = execFileSync('node', [hookPath], {
      input: JSON.stringify({ tool_response: { content: [{ type: 'text', text: JSON.stringify(payload) }] } }),
      encoding: 'utf8',
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('[frame](https://cdn/1.png)');
  });
});
