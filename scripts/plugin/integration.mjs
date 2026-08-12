#!/usr/bin/env node
/**
 * Golden-path integration suite (§11.1c) — seeded user, mocked generation
 * provider, **real** credit ledger.
 *
 *   supabase start
 *   WZRD_MOCK_GENERATION=1 supabase functions serve --no-verify-jwt
 *   SUPABASE_SERVICE_ROLE_KEY=… bun run plugin:integration
 *
 * Sequence: setup_project → propose/diff ×3 at 0 credits → commit →
 * generate_shot_image dryRun at 0 credits → generate_shot_image at exactly the
 * catalog price, once → seedance_handoff review at 0 credits with a complete
 * packet → export_video at the catalog price.
 *
 * Every ledger delta is asserted against the catalog. Quoted-vs-charged drift
 * fails the suite: it is a release blocker, not a warning.
 */
import { randomUUID } from 'node:crypto';
import {
  admin,
  callTool,
  check,
  cleanupUser,
  creditsUsed,
  equal,
  finish,
  ledgerEntries,
  mintToken,
  openHolds,
  seedUser,
  section,
  waitForJob,
} from './lib/harness.mjs';

const DEFAULT_MODEL = 'gmi/seedream-5.0-lite';
const EXPECTED_IMAGE_CREDITS = 2;
const users = [];

async function main() {
  section('seed');
  const { userId } = await seedUser({ credits: 500 });
  users.push(userId);
  const token = await mintToken({ userId });

  section('setup_project (free)');
  let used = await creditsUsed(userId);
  const created = await callTool('setup_project', { title: 'Golden path', aspectRatio: '16:9' }, { token });
  const projectId = created.data?.project?.id;
  check('project created', typeof projectId === 'string', created);
  check('deep link points at the timeline tab', (created.data?.deep_link ?? '').includes('?tab=timeline'), created.data);
  equal('setup_project spends nothing', await creditsUsed(userId), used);

  section('storyboard propose/diff ×3 (free)');
  const beforeStoryboard = (await ledgerEntries(userId)).length;
  let revision = 0;
  for (let round = 1; round <= 3; round += 1) {
    const propose = await callTool(
      'storyboard_propose',
      {
        projectId,
        scenes: [
          { op: 'create', key: 's1', scene_number: 1, title: 'Rooftop', location: 'rooftop', lighting: 'dusk' },
          { op: 'create', key: 's2', scene_number: 2, title: 'Stairwell', location: 'stairwell', lighting: 'fluorescent' },
          { op: 'create', key: 's3', scene_number: 3, title: 'Rooftop return', location: 'rooftop', lighting: 'night' },
        ],
        shots: [
          { op: 'create', key: 'a', sceneKey: 's1', shot_number: 1, visual_prompt: `Mara on the rooftop, wide, round ${round}` },
          { op: 'create', key: 'b', sceneKey: 's2', shot_number: 2, visual_prompt: 'Mara descends the stairwell, medium' },
          { op: 'create', key: 'c', sceneKey: 's3', shot_number: 3, visual_prompt: 'Mara back on the rooftop at night, wide' },
        ],
      },
      { token },
    );
    equal(`round ${round}: propose costs 0 credits`, propose.data?.credit_cost, 0);
    const diff = await callTool('storyboard_diff', { projectId }, { token });
    equal(`round ${round}: diff costs 0 credits`, diff.data?.credit_cost, 0);
    check(`round ${round}: diff renders a markdown table`, typeof diff.data?.table === 'string', diff.data);
    revision = diff.data?.revision ?? revision;
  }
  equal('propose/diff wrote no ledger entries', (await ledgerEntries(userId)).length, beforeStoryboard);
  equal('propose/diff spent no credits', await creditsUsed(userId), used);

  section('storyboard_commit (free)');
  const commit = await callTool('storyboard_commit', { projectId, revision }, { token });
  const shots = commit.data?.shots ?? [];
  equal('commit costs 0 credits', commit.data?.credit_cost, 0);
  check('commit wrote 3 shots', shots.length === 3, commit.data);
  check('commit derived continuity edges', (commit.data?.continuity_edges ?? 0) > 0, commit.data);
  equal('commit bumped the revision', commit.data?.revision, revision + 1);

  const stale = await callTool('storyboard_commit', { projectId, revision }, { token });
  check('a stale revision is rejected', /revision_mismatch/.test(JSON.stringify(stale.error ?? {})), stale.error);

  section('continuity graph: scene 3 resolves scene 1');
  const review = await callTool('seedance_handoff', { projectId, mode: 'review' }, { token });
  equal('seedance review is free', review.data?.credit_cost, 0);
  const packets = review.data?.packets ?? [];
  equal('one packet per shot', packets.length, 3);
  const third = packets[2];
  const first = packets[0];
  check(
    'shot 3 continues from shot 1 (same location), not shot 2',
    third?.continuityFrame?.predecessorShotId === first?.shotId,
    { resolved: third?.continuityFrame, expected: first?.shotId },
  );
  check(
    'every reference slot is populated or explicitly null with a reason',
    packets.every(
      (packet) =>
        packet.settingRef &&
        (packet.settingRef.value !== null || typeof packet.settingRef.reason === 'string') &&
        packet.styleAnchor &&
        (packet.styleAnchor.value !== null || typeof packet.styleAnchor.reason === 'string') &&
        packet.continuityFrame &&
        (packet.continuityFrame.value !== null || typeof packet.continuityFrame.reason === 'string'),
    ),
    packets.map((packet) => ({ shot: packet.shotNumber, setting: packet.settingRef, style: packet.styleAnchor })),
  );

  section('generate_shot_image dryRun (free)');
  const shotId = shots[0].id;
  const preview = await callTool('generate_shot_image', { projectId, shotId, dryRun: true }, { token });
  equal('dryRun costs 0 credits', preview.data?.credit_cost, 0);
  equal(`dryRun quotes the catalog price (${EXPECTED_IMAGE_CREDITS})`, preview.data?.credits_quoted, EXPECTED_IMAGE_CREDITS);
  equal('dryRun spends nothing', await creditsUsed(userId), used);

  section('generate_shot_image without confirmation');
  const unconfirmed = await callTool('generate_shot_image', { projectId, shotId }, { token });
  check(
    'an unconfirmed spend is gated',
    /confirmation_required/.test(JSON.stringify(unconfirmed.error ?? {})),
    unconfirmed.error,
  );
  equal('the gated call spent nothing', await creditsUsed(userId), used);

  section('generate_shot_image confirmed — exactly the catalog price, once');
  const key = `integration-${randomUUID()}`;
  const spend = await callTool(
    'generate_shot_image',
    { projectId, shotId, model: DEFAULT_MODEL, confirm: true, idempotencyKey: key },
    { token },
  );
  check('returns a jobId immediately', typeof spend.data?.jobId === 'string', spend);
  equal('charged credits equal the quote', spend.data?.credits_charged, preview.data?.credits_quoted);

  const settled = await waitForJob(spend.data.jobId, { token, timeoutMs: 120_000 });
  equal('job succeeded', settled.job?.status, 'succeeded');
  equal('job charged exactly the catalog price', settled.job?.credits_charged, EXPECTED_IMAGE_CREDITS);

  const afterGenerate = await creditsUsed(userId);
  equal(`ledger delta is exactly ${EXPECTED_IMAGE_CREDITS} credits`, afterGenerate - used, EXPECTED_IMAGE_CREDITS);
  used = afterGenerate;
  equal('no credit hold is left open', (await openHolds(userId)).length, 0);

  const replay = await callTool(
    'generate_shot_image',
    { projectId, shotId, model: DEFAULT_MODEL, confirm: true, idempotencyKey: key },
    { token },
  );
  equal('replaying the idempotency key returns the same job', replay.data?.jobId, spend.data?.jobId);
  equal('replaying the idempotency key charges nothing extra', await creditsUsed(userId), used);

  section('export_video at the catalog price');
  const exportPreview = await callTool('export_video', { projectId, dryRun: true }, { token });
  if (exportPreview.error) {
    // Catalog-strict billing: with no priced export row the tool must refuse and
    // spend nothing, rather than inventing a price.
    check(
      'export_video refuses cleanly when no verified catalog price exists',
      /unpriced_operation/.test(JSON.stringify(exportPreview.error)),
      exportPreview.error,
    );
    equal('the refusal spent nothing', await creditsUsed(userId), used);
  } else {
    const catalogId = exportPreview.data?.catalog_id;
    const { data: row } = await admin.from('ai_model_catalog').select('credits').eq('id', catalogId).maybeSingle();
    equal('export quote equals the catalog credits', exportPreview.data?.credits_quoted, row?.credits);
    const exported = await callTool(
      'export_video',
      { projectId, confirm: true, idempotencyKey: `integration-export-${randomUUID()}` },
      { token },
    );
    const exportJob = await waitForJob(exported.data.jobId, { token, timeoutMs: 180_000 });
    equal(
      'export charged exactly the quoted catalog price',
      (await creditsUsed(userId)) - used,
      exportJob.job?.status === 'succeeded' ? exportPreview.data.credits_quoted : 0,
    );
    equal('no credit hold is left open after export', (await openHolds(userId)).length, 0);
  }

  section('timeline visibility');
  const timeline = await callTool('get_timeline', { projectId }, { token });
  check('the generated frame is on the timeline', (timeline.data?.shots ?? []).some((shot) => shot.image_url), timeline.data);
  check('timeline returns the web deep link', (timeline.data?.deep_link ?? '').includes('?tab=timeline'));
}

try {
  await main();
} finally {
  for (const userId of users) await cleanupUser(userId);
  finish('Golden-path integration');
}
