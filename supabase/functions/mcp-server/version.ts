/**
 * Single source of truth for the MCP server's advertised version.
 *
 * `bun run plugin:validate` fails the build when this constant drifts from the
 * `version` field in `plugin/plugin.json`, `plugin/mcp.json`, `.mcp.json`, and
 * `.claude-plugin/marketplace.json`, so `initialize.serverInfo.version` always
 * equals the plugin version clients installed.
 */
export const PLUGIN_VERSION = '1.1.0';

/** MCP protocol revision this server implements. */
export const PROTOCOL_VERSION = '2025-03-26';

export const SERVER_NAME = 'wzrd-studio';

/** Set by the deploy workflow so /health can report the deployed commit. */
export function commitSha(): string | null {
  return (
    Deno.env.get('WZRD_MCP_COMMIT_SHA') ??
    Deno.env.get('GIT_COMMIT_SHA') ??
    Deno.env.get('VERCEL_GIT_COMMIT_SHA') ??
    null
  );
}
