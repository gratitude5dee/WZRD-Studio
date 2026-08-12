/**
 * The full WZRD tool surface, in the order agents should discover it.
 */
import { buildBillingTools } from './billing.ts';
import { editorTools } from './editor.ts';
import { projectTools } from './project.ts';
import { storyboardTools } from './storyboard.ts';
import { studioTools } from './studio.ts';
import type { ToolDefinition } from './types.ts';

export const allTools: ToolDefinition[] = [
  ...projectTools,
  ...storyboardTools,
  ...studioTools,
  ...editorTools,
  ...buildBillingTools(() => allTools.length),
];

export const toolByName = new Map(allTools.map((tool) => [tool.name, tool]));

const tooLongNames = allTools.filter((tool) => tool.name.length > 40).map((tool) => tool.name);
if (tooLongNames.length > 0) {
  throw new Error(`MCP tool names must be <= 40 characters: ${tooLongNames.join(', ')}`);
}

export type { ToolDefinition };
