/**
 * WZRD Studio MCP Server (hand-rolled JSON-RPC 2.0 over HTTP).
 *
 * Streamable-HTTP-compatible MCP transport used by Claude Code, Codex, OpenClaw,
 * and Hermes. `npm:mcp-lite` is unresolvable in Deno, so the envelope is
 * hand-rolled here.
 *
 * Layout:
 *   auth.ts     — PAT resolution, scopes, monthly caps (-32001 / -32002 / -32003)
 *   tools.ts    — the tool surface and the one spend-safety gate
 *   jobs.ts     — non-blocking billed jobs (reserve → run → commit/release)
 *   redact.ts   — secret scrubbing applied to every response and error
 *   version.ts  — the version reported by initialize and /health
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { McpSupabaseClient } from './supabase-client.ts';
import { McpAuthError, authenticate } from './auth.ts';
import { redactDeep } from './redact.ts';
import { ToolError, type ToolContext, callTool, toolListing } from './tools.ts';
import { PLUGIN_VERSION, PROTOCOL_VERSION, SERVER_NAME, commitSha } from './version.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const APP_URL = (Deno.env.get('WZRD_APP_URL') ?? 'https://studio.wzrd.tech').replace(/\/$/, '');

function svc(): McpSupabaseClient {
  // The generated client's builders are structurally compatible with the surface
  // the MCP server and the shared credit helpers use, but not nominally so.
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) as unknown as McpSupabaseClient;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function scrub<T>(payload: T): T {
  return redactDeep(payload, [SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY]);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(scrub(body)), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function textContent(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

async function dispatch(req: JsonRpcRequest, headers: Headers): Promise<unknown> {
  switch (req.method) {
    case 'initialize':
      return rpcResult(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: PLUGIN_VERSION },
        capabilities: { tools: {} },
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notification — no response
    case 'ping':
      return rpcResult(req.id, {});
    case 'tools/list':
      return rpcResult(req.id, { tools: toolListing() });
    case 'tools/call': {
      const params = (req.params ?? {}) as Record<string, unknown>;
      const name = String(params.name ?? '');
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const supabase = svc();

      try {
        const auth = await authenticate(supabase, headers);
        const ctx: ToolContext = {
          supabase,
          auth,
          appUrl: APP_URL,
          supabaseUrl: SUPABASE_URL,
          serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        };
        const result = await callTool(name, args, ctx);
        return rpcResult(req.id, textContent(result));
      } catch (error) {
        if (error instanceof McpAuthError) {
          return rpcError(req.id, error.code, error.message, error.data);
        }
        if (error instanceof ToolError) {
          if (error.code === 'unknown_tool') {
            return rpcError(req.id, -32601, error.message);
          }
          return rpcError(req.id, -32000, error.message, { code: error.code, ...(error.details ?? {}) });
        }
        const message = error instanceof Error ? error.message : 'Tool execution failed';
        return rpcError(req.id, -32000, message);
      }
    }
    default:
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  if (url.pathname.endsWith('/health')) {
    return jsonResponse({
      status: 'ok',
      name: SERVER_NAME,
      version: PLUGIN_VERSION,
      commit: commitSha(),
      protocolVersion: PROTOCOL_VERSION,
      tools: toolListing().length,
    });
  }

  if (req.method === 'GET') {
    return jsonResponse({
      name: SERVER_NAME,
      version: PLUGIN_VERSION,
      transport: 'streamable-http-jsonrpc2',
      endpoint: '/functions/v1/mcp-server',
      health: '/functions/v1/mcp-server/health',
      auth: 'bearer wzrd_pat_… (Settings → Agent access)',
      tools: toolListing().map((tool) => tool.name),
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(rpcError(null, -32600, 'Only POST is accepted for JSON-RPC.'), 405);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, 'Parse error'), 400);
  }

  if (Array.isArray(payload)) {
    const responses = await Promise.all(payload.map((entry) => dispatch(entry as JsonRpcRequest, req.headers)));
    return jsonResponse(responses.filter((response) => response !== null));
  }

  const result = await dispatch(payload as JsonRpcRequest, req.headers);
  if (result === null) return new Response(null, { status: 204, headers: corsHeaders });
  return jsonResponse(result);
});
