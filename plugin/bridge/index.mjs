#!/usr/bin/env node
/**
 * WZRD Studio stdio ↔ Streamable HTTP bridge.
 *
 * Harnesses that can only speak stdio JSON-RPC (Claude Code, Codex CLI, Hermes)
 * run this file; it forwards every frame verbatim to the remote MCP server and
 * writes the response back, adding only the Authorization and X-WZRD-Client
 * headers. Nothing else is rewritten, so new tools and notifications work
 * without touching the bridge.
 *
 * Node >= 20, zero required dependencies.
 */
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The bridge locates itself from its own module URL: harnesses launch it with an
// arbitrary cwd and placeholders like ${PLUGIN_ROOT} are not expanded in every
// harness, so neither can be trusted.
const BRIDGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(BRIDGE_DIR, '..');

const REQUEST_TIMEOUT_MS = 55_000;
const DEFAULT_MCP_URL = 'https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/mcp-server';
const MINT_URL = 'https://wzrd.tech/settings/agent-access';
const TOKEN_PREFIX = 'wzrd_pat_';

const RPC_AUTH_ERROR = -32001;
const RPC_INTERNAL_ERROR = -32000;

let token = null;

/** Bridge version, read from the packaged plugin metadata beside this file. */
async function bridgeVersion() {
  for (const candidate of ['plugin.json', 'src/plugin.meta.json']) {
    try {
      const raw = await readFile(path.join(PLUGIN_ROOT, candidate), 'utf8');
      const version = JSON.parse(raw).version;
      if (typeof version === 'string') return version;
    } catch {
      // Try the next location.
    }
  }
  return 'unknown';
}

/** Never let a credential reach stderr or an error payload. */
function redact(text) {
  const value = String(text ?? '');
  const withoutKnownToken = token ? value.split(token).join('wzrd_pat_***') : value;
  return withoutKnownToken.replace(/wzrd_pat_[A-Za-z0-9_-]+/g, 'wzrd_pat_***');
}

function log(message) {
  process.stderr.write(`[wzrd-bridge] ${redact(message)}\n`);
}

function fatal(message) {
  log(message);
  process.exit(1);
}

function writeFrame(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function errorFrame(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message: redact(message), ...(data ? { data } : {}) },
  };
}

// ─── Credentials ───────────────────────────────────────────────────
// Resolution order is fixed: env var, credentials file, optional keytar, then a
// hard error that says exactly where to mint a token.
async function resolveToken() {
  const fromEnv = process.env.WZRD_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const credentialsPath = process.env.WZRD_CREDENTIALS_PATH?.trim();
  if (credentialsPath) {
    try {
      const raw = await readFile(credentialsPath, 'utf8');
      const parsed = JSON.parse(raw);
      const candidate = (parsed.token ?? parsed.WZRD_API_TOKEN ?? parsed.api_token ?? '').trim();
      if (candidate) return candidate;
      log(`WZRD_CREDENTIALS_PATH file has no "token" field: ${credentialsPath}`);
    } catch (error) {
      log(`Could not read WZRD_CREDENTIALS_PATH (${credentialsPath}): ${error.message}`);
    }
  }

  try {
    const keytar = await import('keytar');
    const stored = await keytar.default.getPassword('wzrd-studio', 'api-token');
    if (stored?.trim()) return stored.trim();
  } catch {
    // keytar is optional; absence is normal.
  }

  return null;
}

function missingTokenMessage() {
  return [
    'No WZRD access token found.',
    `Mint one at ${MINT_URL} (Settings → Agent access), then either:`,
    '  1. export WZRD_API_TOKEN="wzrd_pat_…"  (recommended)',
    '  2. write {"token":"wzrd_pat_…"} to a file and set WZRD_CREDENTIALS_PATH to it',
    '  3. store it in your OS keychain as service "wzrd-studio", account "api-token"',
  ].join('\n');
}

// ─── Remote transport ──────────────────────────────────────────────
const mcpUrl = (process.env.WZRD_MCP_URL?.trim() || DEFAULT_MCP_URL).replace(/\/+$/, '');
let clientHeader = 'wzrd-bridge/unknown';

function requestHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
    'X-WZRD-Client': clientHeader,
  };
}

async function pingHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(mcpUrl, { method: 'GET', signal: controller.signal });
    if (!response.ok) {
      fatal(`Health check failed: ${mcpUrl} returned HTTP ${response.status}.`);
    }
    const health = await response.json();
    if (health?.ok !== true) {
      fatal(`Health check failed: ${mcpUrl} did not report ok.`);
    }
    log(`connected to ${mcpUrl} (v${health.version}, ${health.toolCount} tools)`);
  } catch (error) {
    fatal(
      `Cannot reach the WZRD MCP server at ${mcpUrl}: ${error.message}. ` +
        'Check WZRD_MCP_URL and your network.',
    );
  } finally {
    clearTimeout(timer);
  }
}

async function forward(frame) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify(frame),
      signal: controller.signal,
    });

    const text = response.status === 204 ? '' : await response.text();
    if (!text) {
      // Only notifications may go unanswered; an empty body for a request would
      // hang the harness until its own timeout, so it becomes an error frame.
      if (frame.id === undefined) return null;
      return errorFrame(
        frame.id,
        RPC_INTERNAL_ERROR,
        `The MCP server returned an empty response (HTTP ${response.status}).`,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      return errorFrame(
        frame.id,
        RPC_INTERNAL_ERROR,
        `The MCP server returned a non-JSON response (HTTP ${response.status}).`,
      );
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return errorFrame(
        frame.id,
        RPC_INTERNAL_ERROR,
        `${frame.method} exceeded ${REQUEST_TIMEOUT_MS / 1000}s. Long operations return a jobId immediately — ` +
          'retry the call and poll it with get_job({ jobId }).',
        { hint: 'poll_with_get_job', timeoutSeconds: REQUEST_TIMEOUT_MS / 1000 },
      );
    }
    return errorFrame(frame.id, RPC_INTERNAL_ERROR, `Transport error: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function captureClientInfo(frame) {
  if (frame.method !== 'initialize') return;
  const info = frame.params?.clientInfo;
  if (!info?.name) return;
  clientHeader = `${info.name}/${info.version ?? 'unknown'}`;
}

async function main() {
  token = await resolveToken();
  if (!token) {
    // Answer the first frame with an actionable JSON-RPC error rather than dying
    // silently: harnesses surface this text straight to the user.
    log(missingTokenMessage());
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let id = null;
      try {
        id = JSON.parse(line).id ?? null;
      } catch {
        id = null;
      }
      writeFrame(errorFrame(id, RPC_AUTH_ERROR, missingTokenMessage(), { mintUrl: MINT_URL }));
    }
    return;
  }

  if (!token.startsWith(TOKEN_PREFIX)) {
    fatal(
      `The configured credential is not a WZRD personal access token (expected a "${TOKEN_PREFIX}" prefix). ` +
        `Mint one at ${MINT_URL}; Supabase project keys are rejected by the server.`,
    );
  }

  log(`wzrd-studio bridge ${await bridgeVersion()} (${PLUGIN_ROOT})`);
  await pingHealth();

  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let frame;
    try {
      frame = JSON.parse(trimmed);
    } catch {
      writeFrame(errorFrame(null, -32700, 'Parse error: stdin frame was not valid JSON.'));
      continue;
    }

    captureClientInfo(frame);
    // Requests are forwarded concurrently: a harness may pipeline a tools/list
    // behind a slow tools/call, and JSON-RPC ids let it match replies itself.
    void forward(frame).then((response) => {
      // Notifications have no id and get no reply.
      if (response !== null && frame.id !== undefined) writeFrame(response);
    });
  }
}

process.on('uncaughtException', (error) => fatal(`Unexpected failure: ${error.message}`));
process.on('unhandledRejection', (error) => fatal(`Unexpected failure: ${String(error)}`));

main().catch((error) => fatal(`Bridge stopped: ${error.message}`));
