/**
 * Plugin identity for the MCP server.
 *
 * `plugin/src/plugin.meta.json` is the single source of truth; `bun run
 * plugin:validate` fails the build when these constants drift from it. Edge
 * Functions cannot import files from outside their own directory, hence the
 * mirrored constants rather than a JSON import.
 */
export const PLUGIN_NAME = 'wzrd-studio';
export const PLUGIN_VERSION = '0.1.0';

/** MCP protocol revision this server implements. */
export const MCP_PROTOCOL_VERSION = '2025-03-26';

/** Deploy commit, surfaced by GET /health so a stale deploy is visible. */
export function commitSha(): string {
  return Deno.env.get('WZRD_COMMIT_SHA') ?? Deno.env.get('VERCEL_GIT_COMMIT_SHA') ?? 'unknown';
}
