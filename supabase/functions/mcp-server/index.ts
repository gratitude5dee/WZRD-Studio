/**
 * WZRD Studio MCP Server (hand-rolled JSON-RPC 2.0 over Streamable HTTP).
 *
 * Identity comes exclusively from a WZRD personal access token
 * (`Authorization: Bearer wzrd_pat_…`); no tool accepts a `user_id` or
 * `auth_token` argument, so a caller can only ever act as the token's owner.
 * Around every tool this module applies the cross-cutting plugin contract:
 * scopes, argument validation, dry runs, per-token spend guards, idempotent
 * replays and async jobs. Anything that can outlast a request runs as a job and
 * answers `{ jobId, status: "queued" }` immediately.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildCreditIdempotencyKey,
  enforceTokenSpendGuard,
  TokenSpendLimitError,
} from '../_shared/credits.ts';
import {
  INTERNAL_ACTOR_HEADER,
  INTERNAL_SECRET_HEADER,
  INTERNAL_TOKEN_HEADER,
} from '../_shared/auth.ts';
import { resolveIdentity, type McpIdentity, type Scope } from './auth.ts';
import type { ServiceClient } from './client.ts';
import {
  creditsError,
  internalError,
  rateLimitedError,
  RPC_ERROR,
  RpcError,
  scopeError,
} from './errors.ts';
import { createJob, finishJob, jobEnvelope, markJobRunning, reportProgress } from './jobs.ts';
import { validateArgs } from './validate.ts';
import { allTools, toolByName } from './tools/index.ts';
import type { ToolContext, ToolDefinition } from './tools/types.ts';
import { MCP_PROTOCOL_VERSION, PLUGIN_NAME, PLUGIN_VERSION, commitSha } from './version.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, mcp-session-id, x-wzrd-client',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INTERNAL_ACTOR_SECRET = Deno.env.get('WZRD_INTERNAL_ACTOR_SECRET') ?? '';

/** Hard ceiling on a single HTTP response; bridges give up at 55s. */
const SYNC_BUDGET_MS = 45_000;
/** Budget for a background job: bounded by the platform's wall-clock limit. */
const ASYNC_BUDGET_MS = 120_000;

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Edge Function invocation on behalf of the PAT's user ──────────
//
// Downstream functions authenticate a Supabase JWT, which a PAT holder does not
// have. Instead the MCP server presents its own service credentials plus signed
// internal-actor headers that name the acting user; `resolveRequestIdentity` in
// `_shared/auth.ts` trusts those headers only when the shared secret matches.
function internalHeaders(identity: McpIdentity): Record<string, string> {
  if (!INTERNAL_ACTOR_SECRET) {
    throw internalError(
      'This deployment cannot run project tools: WZRD_INTERNAL_ACTOR_SECRET is not configured on the MCP server.',
    );
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    [INTERNAL_ACTOR_HEADER]: identity.userId,
    [INTERNAL_SECRET_HEADER]: INTERNAL_ACTOR_SECRET,
    [INTERNAL_TOKEN_HEADER]: identity.tokenId,
  };
}

async function invokeFunction(identity: McpIdentity, fn: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: internalHeaders(identity),
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  try {
    return { status: response.status, data: text ? JSON.parse(text) : null };
  } catch {
    return { status: response.status, data: text };
  }
}

async function invokeSseFunction(
  identity: McpIdentity,
  fn: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void | Promise<void>,
) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { ...internalHeaders(identity), Accept: 'text/event-stream' },
    body: JSON.stringify(body ?? {}),
  });

  const events: Array<Record<string, unknown>> = [];
  if (!response.body) return { status: response.status, events };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf('\n');

      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload) as Record<string, unknown>;
        events.push(event);
        await onEvent(event);
      } catch {
        // Partial frame: the next chunk completes it.
      }
    }
  }

  return { status: response.status, events };
}

// ─── Tool execution ────────────────────────────────────────────────
function buildContext(input: {
  identity: McpIdentity;
  svc: ServiceClient;
  jobId?: string;
  deadlineAt: number;
}): ToolContext {
  const { identity, svc, jobId, deadlineAt } = input;
  return {
    identity,
    svc,
    deadlineAt,
    jobId,
    invoke: (fn, body) => invokeFunction(identity, fn, body),
    invokeSse: (fn, body, onEvent) => invokeSseFunction(identity, fn, body, onEvent),
    progress: async (update) => {
      if (!jobId) return;
      await reportProgress(svc, jobId, { ...update, at: new Date().toISOString() });
    },
  };
}

function rpcErrorPayload(error: unknown): { code: number; message: string; data?: Record<string, unknown> } {
  if (error instanceof RpcError) {
    return { code: error.code, message: error.message, data: error.data };
  }
  if (error instanceof TokenSpendLimitError) {
    return spendLimitPayload(error);
  }
  console.error('mcp-server: unhandled tool failure', error);
  return { code: RPC_ERROR.internal, message: 'The tool failed unexpectedly.' };
}

function spendLimitPayload(error: TokenSpendLimitError) {
  if (error.code === 'daily_cap') {
    const rpc = creditsError(
      `This token has used ${error.used}/${error.cap} credits today. The cap resets at ${error.resetsAt}; raise it at /settings/agent-access.`,
      { used: error.used, cap: error.cap, resetsAt: error.resetsAt },
    );
    return { code: rpc.code, message: rpc.message, data: rpc.data };
  }
  const rpc = rateLimitedError(
    `This token exceeded ${error.limit} requests per ${error.window}. Retry after ${error.resetsAt}.`,
    { limit: error.limit, window: error.window, resetsAt: error.resetsAt },
  );
  return { code: rpc.code, message: rpc.message, data: rpc.data };
}

function requireScope(tool: ToolDefinition, scopes: Scope[]): void {
  if (!scopes.includes(tool.scope)) {
    throw scopeError(tool.scope, scopes);
  }
}

/** Fail a synchronous call before the bridge's 55s cutoff, with a hint. */
function withDeadline<T>(promise: Promise<T>, ms: number, toolName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        internalError(
          `${toolName} did not finish within ${Math.round(ms / 1000)}s. Retry it — long operations return a jobId you can poll with get_job.`,
        ),
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface CallOutcome {
  payload: unknown;
  isError?: boolean;
}

async function callTool(
  identity: McpIdentity,
  svc: ServiceClient,
  toolName: string,
  rawArgs: Record<string, unknown>,
): Promise<CallOutcome> {
  const tool = toolByName.get(toolName);
  if (!tool) {
    throw new RpcError(RPC_ERROR.methodNotFound, `Unknown tool: ${toolName}. Call tools/list to see what is available.`);
  }

  requireScope(tool, identity.scopes);
  validateArgs(tool.name, tool.inputSchema, rawArgs);

  const dryRun = rawArgs.dryRun === true;
  const idempotencyKey =
    typeof rawArgs.idempotencyKey === 'string' && rawArgs.idempotencyKey
      ? buildCreditIdempotencyKey(tool.name, identity.userId, rawArgs.idempotencyKey)
      : undefined;

  // Every call — free or not — consumes one unit of the token's rate-limit
  // budget here. The later guard pass inside `reserveCredits` charges the daily
  // cap without counting a second request.
  await enforceTokenSpendGuard({ supabase: svc, tokenId: identity.tokenId, credits: 0 });

  if (dryRun) {
    if (!tool.estimate) {
      return { payload: { dryRun: true, credits: 0, breakdown: [], note: `${tool.name} never spends credits.` } };
    }
    const estimate = await tool.estimate(
      buildContext({ identity, svc, deadlineAt: Date.now() + SYNC_BUDGET_MS }),
      rawArgs,
    );
    return { payload: { dryRun: true, ...estimate } };
  }

  if (!tool.async) {
    const context = buildContext({ identity, svc, deadlineAt: Date.now() + SYNC_BUDGET_MS });
    const result = await withDeadline(tool.handler(context, rawArgs), SYNC_BUDGET_MS, tool.name);
    return { payload: result };
  }

  const { job, replayed } = await createJob(svc, {
    identity,
    tool: tool.name,
    args: rawArgs,
    idempotencyKey,
  });

  // A replay returns the original job — including its result — and never spends
  // a second time.
  if (replayed) {
    return { payload: { ...jobEnvelope(job), replayed: true } };
  }

  const estimate = tool.estimate
    ? await tool.estimate(buildContext({ identity, svc, deadlineAt: Date.now() + SYNC_BUDGET_MS }), rawArgs)
    : { credits: 0, breakdown: [] };

  // Fail before queueing if the estimate already exceeds the token's daily cap.
  // The authoritative charge happens inside `reserveCredits`, so this check is a
  // dry run and never consumes headroom itself.
  if (estimate.credits > 0) {
    try {
      await enforceTokenSpendGuard({
        supabase: svc,
        tokenId: identity.tokenId,
        credits: estimate.credits,
        dryRun: true,
      });
    } catch (error) {
      const payload = rpcErrorPayload(error);
      await finishJob(svc, job.id, { status: 'failed', error: payload });
      throw error;
    }
  }

  const run = async () => {
    const context = buildContext({
      identity,
      svc,
      jobId: job.id,
      deadlineAt: Date.now() + ASYNC_BUDGET_MS,
    });
    try {
      await markJobRunning(svc, job.id);
      const result = await tool.handler(context, rawArgs);
      await finishJob(svc, job.id, {
        status: 'succeeded',
        result,
        credits: estimate.credits || null,
      });
    } catch (error) {
      await finishJob(svc, job.id, { status: 'failed', error: rpcErrorPayload(error) });
    }
  };

  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(run());
  } else {
    // Local dev: no background runtime, so let it run detached.
    run().catch((error) => console.error('mcp-server: job failed', error));
  }

  return {
    payload: {
      jobId: job.id,
      status: 'queued',
      tool: tool.name,
      estimatedCredits: estimate.credits,
      poll: { tool: 'get_job', arguments: { jobId: job.id } },
    },
  };
}

// ─── JSON-RPC envelope ─────────────────────────────────────────────
interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcFailure(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: Record<string, unknown>,
) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

function toolListPayload() {
  return {
    tools: allTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: tool.mutates !== true && !tool.estimate,
        destructiveHint: tool.mutates === true,
        scope: tool.scope,
        async: tool.async === true,
      },
    })),
  };
}

/** Discovery methods answerable without a token. */
function isPublicMethod(method: string): boolean {
  return method === 'initialize' || method === 'ping' || method === 'tools/list' ||
    method.startsWith('notifications/');
}

async function dispatch(
  request: JsonRpcRequest,
  identity: McpIdentity | null,
  svc: ServiceClient,
): Promise<unknown> {
  // Notifications carry no id and must never be answered.
  if (request.method.startsWith('notifications/')) return null;

  switch (request.method) {
    case 'initialize':
      return rpcResult(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: { name: PLUGIN_NAME, version: PLUGIN_VERSION },
        capabilities: { tools: { listChanged: false } },
        instructions:
          'Long-running tools return { jobId, status: "queued" } — poll get_job. Pass dryRun: true to price a generation, and idempotencyKey to make retries safe.',
      });
    case 'ping':
      return rpcResult(request.id, {});
    case 'tools/list':
      return rpcResult(request.id, toolListPayload());
    case 'tools/call': {
      const params = (request.params ?? {}) as Record<string, unknown>;
      const name = String(params.name ?? '');
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (!identity) {
        return rpcFailure(
          request.id,
          RPC_ERROR.auth,
          'Missing Authorization header. Send "Authorization: Bearer wzrd_pat_…" using a token minted at /settings/agent-access.',
        );
      }
      try {
        const outcome = await callTool(identity, svc, name, args);
        return rpcResult(request.id, {
          content: [{ type: 'text', text: JSON.stringify(outcome.payload, null, 2) }],
          structuredContent: outcome.payload,
          isError: false,
        });
      } catch (error) {
        const payload = rpcErrorPayload(error);
        return rpcFailure(request.id, payload.code, payload.message, payload.data);
      }
    }
    default:
      return rpcFailure(request.id, RPC_ERROR.methodNotFound, `Method not found: ${request.method}`);
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // Unauthenticated liveness probe: bridges ping this at startup so a
  // misconfigured install fails loudly instead of at first tool call.
  if (req.method === 'GET') {
    return jsonResponse({
      ok: true,
      version: PLUGIN_VERSION,
      toolCount: allTools.length,
      commit: commitSha(),
      name: PLUGIN_NAME,
      transport: 'streamable-http-jsonrpc2',
      endpoint: url.pathname,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(rpcFailure(null, -32600, 'Only POST is accepted for JSON-RPC.'), 405);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(rpcFailure(null, -32700, 'Parse error'), 400);
  }

  const svc = serviceClient();

  // Discovery (initialize, ping, tools/list) works without a token so bridges
  // can hand-shake before the user has minted a PAT; tools/call always
  // authenticates.
  const entries = Array.isArray(payload) ? (payload as JsonRpcRequest[]) : [payload as JsonRpcRequest];
  const needsAuth = entries.some((entry) => !isPublicMethod(entry?.method ?? ''));

  let identity: McpIdentity | null = null;
  if (needsAuth) {
    try {
      identity = await resolveIdentity(req.headers, svc);
    } catch (error) {
      const failure = rpcErrorPayload(error);
      const id = Array.isArray(payload) ? null : (payload as JsonRpcRequest | null)?.id ?? null;
      return jsonResponse(rpcFailure(id, failure.code, failure.message, failure.data), 401);
    }
  }

  if (Array.isArray(payload)) {
    const responses = await Promise.all(
      payload.map((entry) => dispatch(entry as JsonRpcRequest, identity, svc)),
    );
    return jsonResponse(responses.filter((response) => response !== null));
  }

  const response = await dispatch(payload as JsonRpcRequest, identity, svc);
  if (response === null) return new Response(null, { status: 204, headers: corsHeaders });
  return jsonResponse(response);
});
