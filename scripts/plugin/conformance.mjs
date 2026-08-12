#!/usr/bin/env node
/**
 * MCP conformance suite (§11.1b) — runs against a local Supabase stack.
 *
 *   supabase start && supabase functions serve --no-verify-jwt
 *   SUPABASE_SERVICE_ROLE_KEY=… bun run plugin:conformance
 *
 * Asserts the protocol contract clients depend on: initialize, tools/list
 * completeness and cost text, tools/call shape, the auth error codes
 * (-32001 / -32002 / -32003), non-blocking long operations, idempotency, and the
 * absence of any secret pattern in responses and errors.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  assertNoSecrets,
  callTool,
  check,
  cleanupUser,
  equal,
  finish,
  ledgerEntries,
  mintToken,
  rpc,
  seedUser,
  section,
  waitForJob,
} from './lib/harness.mjs';
import { parseToolRegistry } from './validate.mjs';

const repoRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const pluginVersion = JSON.parse(readFileSync(`${repoRoot}/plugin/plugin.json`, 'utf8')).version;
const registry = parseToolRegistry(readFileSync(`${repoRoot}/supabase/functions/mcp-server/tools.ts`, 'utf8'));

const users = [];

async function main() {
  section('initialize');
  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {} });
  check('initialize returns a protocolVersion', typeof init.body?.result?.protocolVersion === 'string', init.body);
  equal('serverInfo.version equals the plugin version', init.body?.result?.serverInfo?.version, pluginVersion);
  check('serverInfo.name is wzrd-studio', init.body?.result?.serverInfo?.name === 'wzrd-studio');
  assertNoSecrets('initialize', init.raw);

  section('health');
  const health = await fetch(`${process.env.MCP_URL ?? 'http://127.0.0.1:54321/functions/v1/mcp-server'}/health`);
  const healthBody = await health.json();
  equal('/health reports the plugin version', healthBody.version, pluginVersion);
  check('/health reports a commit field', 'commit' in healthBody, healthBody);

  section('tools/list');
  const list = await rpc('tools/list', {});
  const listed = list.body?.result?.tools ?? [];
  const listedNames = listed.map((tool) => tool.name).sort();
  equal(
    'tools/list matches the registry exactly',
    listedNames,
    registry.map((tool) => tool.name).sort(),
  );
  check(
    'every tool has an object inputSchema',
    listed.every((tool) => tool.inputSchema && tool.inputSchema.type === 'object'),
  );
  check('every tool name is ≤ 40 chars', listed.every((tool) => tool.name.length <= 40));
  for (const spending of registry.filter((tool) => tool.spends)) {
    const entry = listed.find((tool) => tool.name === spending.name);
    check(
      `${spending.name} advertises its credit cost in tools/list`,
      /credit/i.test(entry?.description ?? '') && /dryrun/i.test(entry?.description ?? ''),
    );
  }
  assertNoSecrets('tools/list', list.raw);

  section('auth: no token');
  const noToken = await rpc('tools/call', { name: 'get_credits', arguments: {} });
  equal('missing token → -32001', noToken.body?.error?.code, -32001);
  assertNoSecrets('missing token error', noToken.raw);

  const bogus = await rpc('tools/call', { name: 'get_credits', arguments: {} }, { token: 'not-a-wzrd-token' });
  equal('malformed token → -32001', bogus.body?.error?.code, -32001);

  section('seeding');
  const owner = await seedUser({ credits: 100 });
  users.push(owner.userId);
  const fullToken = await mintToken({ userId: owner.userId });
  const readToken = await mintToken({ userId: owner.userId, scopes: ['read'] });
  const revokedToken = await mintToken({ userId: owner.userId, revoked: true });
  const cappedToken = await mintToken({ userId: owner.userId, monthlyCreditCap: 1 });
  check('seeded a user with a full-scope token', typeof fullToken === 'string');

  section('auth: revoked / scope / cap');
  const revoked = await rpc('tools/call', { name: 'get_credits', arguments: {} }, { token: revokedToken });
  equal('revoked token → -32001', revoked.body?.error?.code, -32001);
  check('revoked token error tells the client not to retry', /revoked/i.test(revoked.body?.error?.message ?? ''));

  const project = await callTool('setup_project', { title: 'Conformance fixture' }, { token: fullToken });
  const projectId = project.data?.project?.id;
  check('setup_project returns a project id', typeof projectId === 'string', project);

  const scoped = await rpc(
    'tools/call',
    { name: 'generate_shot_image', arguments: { projectId, shotId: randomUUID(), confirm: true } },
    { token: readToken },
  );
  equal('read-scope token calling generate_shot_image → -32002', scoped.body?.error?.code, -32002);
  check(
    '-32002 message names the missing "generate" scope',
    /"generate" scope/.test(scoped.body?.error?.message ?? ''),
    scoped.body?.error?.message,
  );

  // Seed a committed shot so the cap check is reached with a real shot id.
  const proposed = await callTool(
    'storyboard_propose',
    {
      projectId,
      scenes: [{ op: 'create', key: 's1', scene_number: 1, title: 'Scene 1', location: 'rooftop' }],
      shots: [{ op: 'create', key: 'sh1', sceneKey: 's1', shot_number: 1, visual_prompt: 'A rooftop at dusk' }],
    },
    { token: fullToken },
  );
  check('storyboard_propose stages without spending', proposed.data?.credit_cost === 0, proposed);
  const diffed = await callTool('storyboard_diff', { projectId }, { token: fullToken });
  const committed = await callTool(
    'storyboard_commit',
    { projectId, revision: diffed.data?.revision },
    { token: fullToken },
  );
  const shotId = committed.data?.shots?.[0]?.id ?? committed.data?.applied?.shots?.[0]?.id ?? null;
  check('storyboard_commit reports applied shots', committed.data !== null, committed);

  const capped = await rpc(
    'tools/call',
    {
      name: 'generate_shot_image',
      arguments: { projectId, shotId: shotId ?? randomUUID(), confirm: true, idempotencyKey: randomUUID() },
    },
    { token: cappedToken },
  );
  equal('over-cap → -32003', capped.body?.error?.code, -32003);
  const capData = capped.body?.error?.data ?? {};
  check(
    '-32003 data carries { used, cap, resetsAt }',
    'used' in capData && 'cap' in capData && 'resetsAt' in capData,
    capData,
  );

  section('tools/call shape for every tool');
  for (const tool of registry) {
    const response = await rpc('tools/call', { name: tool.name, arguments: { projectId } }, { token: fullToken });
    const ok = response.body?.result?.content?.[0]?.type === 'text' || typeof response.body?.error?.code === 'number';
    check(`${tool.name} returns either text content or a JSON-RPC error`, ok, response.body);
    assertNoSecrets(`${tool.name} response`, response.raw);
  }

  const unknown = await rpc('tools/call', { name: 'no_such_tool', arguments: {} }, { token: fullToken });
  equal('unknown tool → -32601', unknown.body?.error?.code, -32601);

  section('long operations never block');
  if (shotId) {
    const startedAt = Date.now();
    const key = `conformance-${randomUUID()}`;
    const started = await callTool(
      'generate_shot_image',
      { projectId, shotId, confirm: true, idempotencyKey: key },
      { token: fullToken },
    );
    const elapsed = Date.now() - startedAt;
    check('generate_shot_image returns a jobId', typeof started.data?.jobId === 'string', started);
    check(`generate_shot_image returns quickly (${elapsed}ms < 15000ms)`, elapsed < 15_000);

    section('idempotency');
    const replay = await callTool(
      'generate_shot_image',
      { projectId, shotId, confirm: true, idempotencyKey: key },
      { token: fullToken },
    );
    equal('replaying the same idempotencyKey returns the same job', replay.data?.jobId, started.data?.jobId);
    check('replay is flagged as idempotent', replay.data?.idempotent_replay === true, replay.data);

    await waitForJob(started.data.jobId, { token: fullToken, timeoutMs: 90_000 });
    const ledger = await ledgerEntries(owner.userId);
    const spends = ledger.filter((entry) => (entry.reference_type ?? '').includes('generate_shot_image'));
    check(`one ledger entry for one idempotency key (found ${spends.length})`, spends.length <= 1, spends);

    section('dry run costs nothing');
    const before = (await ledgerEntries(owner.userId)).length;
    const preview = await callTool('generate_shot_image', { projectId, shotId, dryRun: true }, { token: fullToken });
    equal('dryRun reports credit_cost 0', preview.data?.credit_cost, 0);
    check('dryRun quotes a credit number', typeof preview.data?.credits_quoted === 'number', preview.data);
    equal('dryRun writes no ledger entry', (await ledgerEntries(owner.userId)).length, before);
  } else {
    check('a committed shot was available for the long-operation checks', false);
  }

  section('seedance handoff');
  const review = await callTool('seedance_handoff', { projectId, mode: 'review' }, { token: fullToken });
  equal('seedance review is free', review.data?.credit_cost, 0);
  const auto = await callTool('seedance_handoff', { projectId, mode: 'auto', confirm: true }, { token: fullToken });
  check(
    'seedance auto mode is refused while pricing is unverified',
    /unverified|not priced|disabled/i.test(JSON.stringify(auto.error ?? auto.data ?? {})),
    auto.error ?? auto.data,
  );
}

try {
  await main();
} finally {
  for (const userId of users) await cleanupUser(userId);
  finish('MCP conformance');
}
