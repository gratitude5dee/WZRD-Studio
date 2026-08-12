/**
 * Shared harness for the plugin test suites (conformance, integration, adversarial).
 *
 * Talks to a local Supabase stack (`supabase start` + `supabase functions serve`)
 * with the service-role key: seeds users, credits, and personal access tokens,
 * calls the MCP server over JSON-RPC, and reads the real credit ledger so every
 * assertion is made against actual rows rather than mocks.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '';
export const MCP_URL = process.env.MCP_URL ?? `${SUPABASE_URL}/functions/v1/mcp-server`;

if (!SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required (see docs/plugin/testing.md).');
}

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const TOKEN_PREFIX = 'wzrd_pat_';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

// ── assertions ──────────────────────────────────────────────────────────────

const results = { passed: 0, failed: 0, failures: [] };

export function check(label, condition, detail) {
  if (condition) {
    results.passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    results.failed += 1;
    results.failures.push(label);
    console.error(`  ✗ ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

export function equal(label, actual, expected) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}

export function section(title) {
  console.log(`\n${title}`);
}

export function finish(suiteName) {
  console.log(
    `\n${suiteName}: ${results.passed} passed, ${results.failed} failed${
      results.failed > 0 ? `\nfailures:\n  - ${results.failures.join('\n  - ')}` : ''
    }`,
  );
  if (results.failed > 0) process.exit(1);
}

// ── JSON-RPC ────────────────────────────────────────────────────────────────

let rpcId = 0;

export async function rpc(method, params, { token } = {}) {
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body, raw: text };
}

/** Call a tool and return { error, data, raw } with the text payload parsed. */
export async function callTool(name, args, { token } = {}) {
  const response = await rpc('tools/call', { name, arguments: args }, { token });
  if (response.body?.error) return { error: response.body.error, data: null, raw: response.raw };
  const text = response.body?.result?.content?.[0]?.text;
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { text };
  }
  return { error: null, data, raw: response.raw };
}

// ── seeding ─────────────────────────────────────────────────────────────────

export async function seedUser({ credits = 100 } = {}) {
  const email = `plugin-harness+${randomUUID()}@wzrd.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const userId = data.user.id;

  await admin
    .from('user_credits')
    .upsert({ user_id: userId, total_credits: credits, used_credits: 0 }, { onConflict: 'user_id' });

  return { userId, email };
}

export async function mintToken({
  userId,
  scopes = ['read', 'generate', 'billing'],
  dailyCreditCap = 500,
  revoked = false,
  expiresAt = null,
}) {
  const token = `${TOKEN_PREFIX}${randomUUID().replace(/-/g, '')}`;
  const { error } = await admin.from('wzrd_api_tokens').insert({
    user_id: userId,
    name: `harness-${scopes.join('-')}`,
    token_hash: sha256(token),
    token_prefix: token.slice(0, 16),
    scopes,
    daily_credit_cap: dailyCreditCap,
    revoked_at: revoked ? new Date().toISOString() : null,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`mintToken failed: ${error.message}`);
  return token;
}

/**
 * Clear a user's request-rate buckets (not the daily credit spend). The suites
 * fire calls far faster than a real agent, so without this they trip the
 * 60 req/min guard mid-run and fail on rate limiting instead of the behavior
 * under test. The over-cap and rate-limit cases still exercise the guard.
 */
export async function resetRateLimit(userId) {
  const { data: tokens } = await admin.from('wzrd_api_tokens').select('id').eq('user_id', userId);
  const ids = (tokens ?? []).map((row) => row.id);
  if (!ids.length) return;
  await admin.from('wzrd_api_token_usage').delete().in('token_id', ids).in('bucket', ['minute', 'hour']);
}

/**
 * Insert a bare project row directly. Fixture setup for suites that are not
 * exercising `setup_project` itself, which runs the full generation pipeline.
 */
export async function seedProject(userId, { title = 'Harness fixture' } = {}) {
  const { data, error } = await admin
    .from('projects')
    .insert({ user_id: userId, title })
    .select('id')
    .single();
  if (error) throw new Error(`seedProject failed: ${error.message}`);
  return data.id;
}

export async function seedScene(projectId, { sceneNumber = 1, title = 'Scene 1', location = null } = {}) {
  const { data, error } = await admin
    .from('scenes')
    .insert({ project_id: projectId, scene_number: sceneNumber, title, location })
    .select('id')
    .single();
  if (error) throw new Error(`seedScene failed: ${error.message}`);
  return data.id;
}

export async function seedShot(projectId, sceneId, { shotNumber = 1, visualPrompt = 'A rooftop at dusk' } = {}) {
  const { data, error } = await admin
    .from('shots')
    .insert({ project_id: projectId, scene_id: sceneId, shot_number: shotNumber, visual_prompt: visualPrompt })
    .select('id')
    .single();
  if (error) throw new Error(`seedShot failed: ${error.message}`);
  return data.id;
}

export async function ledgerEntries(userId) {
  const { data } = await admin
    .from('credit_transactions')
    .select('id,amount,transaction_type,reference_type,reference_id,idempotency_key,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function creditsUsed(userId) {
  const { data } = await admin.from('user_credits').select('total_credits,used_credits').eq('user_id', userId).maybeSingle();
  return Number(data?.used_credits ?? 0);
}

export async function openHolds(userId) {
  const { data } = await admin
    .from('credit_holds')
    .select('id,status,amount,created_at')
    .eq('user_id', userId)
    .eq('status', 'held');
  return data ?? [];
}

export async function catalogCredits(modelIds) {
  const { data } = await admin.from('ai_model_catalog').select('id,credits,pricing,pricing_text,enabled').in('id', modelIds);
  return data ?? [];
}

export async function waitForJob(jobId, { token, timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const { data, error } = await callTool('get_job', { jobId }, { token });
    if (error) return { error };
    last = data;
    if (data?.status === 'succeeded' || data?.status === 'failed') return { job: data };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { job: last, timedOut: true };
}

export async function cleanupUser(userId) {
  await admin.from('projects').delete().eq('user_id', userId);
  await admin.from('wzrd_mcp_jobs').delete().eq('user_id', userId);
  await admin.from('wzrd_api_tokens').delete().eq('user_id', userId);
  await admin.auth.admin.deleteUser(userId).catch(() => {});
}

/** Secret patterns that must never appear in an MCP response. */
export const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/,
  /\bsk-[A-Za-z0-9]{16,}\b/,
];

export function assertNoSecrets(label, payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  const leaked = SECRET_PATTERNS.find((pattern) => pattern.test(text));
  check(`${label}: leaks no service/page key pattern`, !leaked, leaked ? String(leaked) : undefined);
}
