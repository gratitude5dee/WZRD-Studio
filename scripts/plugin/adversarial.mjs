#!/usr/bin/env node
/**
 * Adversarial suite (§11.1 adversarial pass) — the four ways an agent or a client
 * can hurt a user, scripted:
 *
 *   1. a 50-shot render request must gate: pricing it is free, and only an
 *      explicit non-dryRun call can spend;
 *   2. a revoked token must produce one clean error, with no retry storm;
 *   3. an interrupted generation must leave no orphaned credit hold;
 *   4. a cross-user projectId must be denied by RLS without leaking existence.
 *
 *   supabase start
 *   WZRD_MOCK_GENERATION=1 supabase functions serve --no-verify-jwt
 *   SUPABASE_SERVICE_ROLE_KEY=… bun run plugin:adversarial
 */
import { randomUUID } from 'node:crypto';
import {
  MCP_URL,
  callTool,
  check,
  cleanupUser,
  creditsUsed,
  equal,
  finish,
  ledgerEntries,
  mintToken,
  openHolds,
  rpc,
  seedProject as seedProjectRow,
  seedUser,
  section,
  waitForJob,
} from './lib/harness.mjs';

const users = [];

async function seedProject(userId, token, { shots = 3, title = 'Adversarial fixture' } = {}) {
  const projectId = await seedProjectRow(userId, { title });
  await callTool(
    'storyboard_propose',
    {
      projectId,
      scenes: [{ op: 'create', key: 's1', scene_number: 1, title: 'Scene 1', location: 'warehouse' }],
      shots: Array.from({ length: shots }, (_, index) => ({
        op: 'create',
        key: `sh${index + 1}`,
        sceneKey: 's1',
        shot_number: index + 1,
        visual_prompt: `Warehouse shot ${index + 1}, handheld`,
      })),
    },
    { token },
  );
  const diff = await callTool('storyboard_diff', { projectId }, { token });
  const commit = await callTool('storyboard_commit', { projectId, revision: diff.data.revision }, { token });
  return { projectId, shots: commit.data?.shots ?? [] };
}

async function main() {
  section('1. a 50-shot request gates before spending');
  const big = await seedUser({ credits: 500 });
  users.push(big.userId);
  const bigToken = await mintToken({ userId: big.userId });
  const bigScoped = await seedProject(big.userId, bigToken, { shots: 50, title: 'Fifty shots' });
  const bigProject = bigScoped.projectId;
  const { data: bigScene } = await callTool('get_storyboard', { projectId: bigProject }, { token: bigToken });
  const sceneId = bigScoped.shots[0]?.scene_id ?? bigScene?.scenes?.[0]?.id;

  const usedBefore = await creditsUsed(big.userId);
  const ledgerBefore = (await ledgerEntries(big.userId)).length;

  const preview = await callTool('generate_scene_images', { projectId: bigProject, sceneId, dryRun: true }, { token: bigToken });
  check(
    'dryRun quotes the 50-shot total without spending',
    typeof preview.data?.credits === 'number' && preview.data.credits >= 50,
    preview.data ?? preview.error,
  );
  check(
    'the quote breakdown states the shot count',
    /50 shot/.test(JSON.stringify(preview.data?.breakdown ?? [])),
    preview.data?.breakdown,
  );
  equal('nothing was spent by the quote', await creditsUsed(big.userId), usedBefore);
  equal('no ledger entry was written by the quote', (await ledgerEntries(big.userId)).length, ledgerBefore);
  equal('no credit hold was created by the quote', (await openHolds(big.userId)).length, 0);

  section('2. a revoked token errors cleanly, with no retry storm');
  const revokedToken = await mintToken({ userId: big.userId, revoked: true });
  const attempts = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const started = Date.now();
    const response = await rpc('tools/call', { name: 'get_credits', arguments: {} }, { token: revokedToken });
    attempts.push({ code: response.body?.error?.code, ms: Date.now() - started });
  }
  check('every attempt returns -32001', attempts.every((attempt) => attempt.code === -32001), attempts);
  check(
    'each attempt fails fast (no internal retry loop)',
    attempts.every((attempt) => attempt.ms < 5000),
    attempts,
  );
  const revokedResponse = await rpc('tools/call', { name: 'get_credits', arguments: {} }, { token: revokedToken });
  check(
    'the error tells the client to mint a new token instead of retrying',
    /revoked|mint a new/i.test(revokedResponse.body?.error?.message ?? ''),
    revokedResponse.body?.error,
  );

  section('3. an interrupted generation leaves no orphaned hold');
  const interrupted = await seedUser({ credits: 100 });
  users.push(interrupted.userId);
  const interruptedToken = await mintToken({ userId: interrupted.userId });
  const { projectId, shots } = await seedProject(interrupted.userId, interruptedToken, { shots: 1, title: 'Interrupted' });

  // Abort the HTTP request mid-flight: the server must still settle the hold.
  const controller = new AbortController();
  const key = `adversarial-${randomUUID()}`;
  const request = fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${interruptedToken}` },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'generate_shot_image',
        arguments: { projectId, shotId: shots[0].id, idempotencyKey: key },
      },
    }),
    signal: controller.signal,
  }).catch(() => null);
  setTimeout(() => controller.abort(), 150);
  await request;

  // Poll for the invariant with a bounded budget instead of one fixed sleep,
  // so a slow settle is retried and a genuine orphan still fails the suite.
  let holds = await openHolds(interrupted.userId);
  const holdDeadline = Date.now() + 60_000;
  while (holds.length > 0 && Date.now() < holdDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    holds = await openHolds(interrupted.userId);
  }
  check(`no hold is left in 'held' after an aborted request (found ${holds.length})`, holds.length === 0, holds);

  // A failing generation must release rather than charge.
  const failing = await callTool(
    'generate_shot_image',
    { projectId, shotId: randomUUID(), idempotencyKey: `adversarial-fail-${randomUUID()}` },
    { token: interruptedToken },
  );
  if (failing.data?.jobId) {
    const settled = await waitForJob(failing.data.jobId, { token: interruptedToken, timeoutMs: 60_000 });
    equal('a generation for a missing shot fails', settled.job?.status, 'failed');
    check('the failed job charged 0 credits', !settled.job?.credits, settled.job);
    equal('the failed job left no open hold', (await openHolds(interrupted.userId)).length, 0);
  } else {
    check('a generation for a missing shot is rejected', Boolean(failing.error), failing);
  }

  section("4. a cross-user projectId is denied without leaking existence");
  const outsider = await seedUser({ credits: 10 });
  users.push(outsider.userId);
  const outsiderToken = await mintToken({ userId: outsider.userId });
  const denied = await callTool('get_timeline', { projectId }, { token: outsiderToken });
  const deniedText = JSON.stringify(denied.error ?? denied.data ?? {});
  check('cross-user read is denied', Boolean(denied.error), denied);
  check('the denial reads as "not found", never "forbidden"', /not_found|not found/i.test(deniedText), deniedText);
  check('the denial leaks no project content', !/warehouse/i.test(deniedText), deniedText);

  const deniedSpend = await callTool(
    'generate_shot_image',
    { projectId, shotId: shots[0].id, idempotencyKey: randomUUID() },
    { token: outsiderToken },
  );
  check('cross-user spend is denied', Boolean(deniedSpend.error), deniedSpend);
  equal('the denied spend charged nothing', await creditsUsed(outsider.userId), 0);
}

try {
  await main();
} finally {
  for (const userId of users) await cleanupUser(userId);
  finish('Adversarial');
}
