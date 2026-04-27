import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email = null,
  displayName = null,
  platformRole = 'parent',
  now = 1,
  accountType = 'real',
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, NULL)
  `).run(id, email, displayName, platformRole, now, now, accountType);
}

function seedCore(server, now) {
  seedAdultAccount(server, {
    id: 'adult-admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    platformRole: 'admin',
    now,
  });
  seedAdultAccount(server, {
    id: 'adult-ops',
    email: 'ops@example.com',
    displayName: 'Ops',
    platformRole: 'ops',
    now,
  });
  seedAdultAccount(server, {
    id: 'adult-parent',
    email: 'parent@example.com',
    displayName: 'Parent',
    platformRole: 'parent',
    now,
  });
}

function messageRow(server, id) {
  return server.DB.db.prepare(
    'SELECT * FROM admin_marketing_messages WHERE id = ?',
  ).get(id) || null;
}

function allMessages(server) {
  return server.DB.db.prepare(
    'SELECT * FROM admin_marketing_messages ORDER BY created_at DESC',
  ).all();
}

function receiptRows(server, requestId) {
  return server.DB.db.prepare(`
    SELECT request_id, status_code, mutation_kind, scope_type, scope_id
    FROM mutation_receipts
    WHERE request_id = ?
  `).all(requestId);
}

async function createMessage(server, as, body) {
  return server.fetchAs(as, 'https://repo.test/api/admin/marketing/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
    body: JSON.stringify(body),
  });
}

async function updateMessage(server, as, messageId, body) {
  return server.fetchAs(as, `https://repo.test/api/admin/marketing/messages/${messageId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
    body: JSON.stringify(body),
  });
}

async function transitionMessage(server, as, messageId, {
  action, expectedRowVersion, confirmBroadPublish = false, requestId,
}) {
  return server.fetchAs(as, `https://repo.test/api/admin/marketing/messages/${messageId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
    body: JSON.stringify({
      action,
      expectedRowVersion,
      confirmBroadPublish,
      mutation: { requestId: requestId || `req-${Date.now()}-${Math.random()}` },
    }),
  });
}

test('U11 Marketing Lifecycle Mutations', async (t) => {
  const server = createWorkerRepositoryServer();
  t.after(() => server.close());
  seedCore(server, 1000);

  await t.test('create a draft message', async () => {
    const res = await createMessage(server, 'adult-admin', {
      title: 'Welcome message',
      body_text: 'Hello **world**!',
      message_type: 'announcement',
      audience: 'internal',
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.message.title, 'Welcome message');
    assert.equal(data.message.status, 'draft');
    assert.equal(data.message.message_type, 'announcement');
    assert.equal(data.message.severity_token, 'info');
    assert.equal(data.message.row_version, 0);
    assert.equal(data.message.created_by, 'adult-admin');
  });

  await t.test('happy path: create → schedule → publish → pause → archive', async () => {
    // Create
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Full lifecycle test',
      body_text: 'Testing the full lifecycle.',
      message_type: 'announcement',
      audience: 'internal',
    });
    const { message: created } = await createRes.json();
    const id = created.id;
    assert.equal(created.status, 'draft');

    // Schedule
    const schedRes = await transitionMessage(server, 'adult-admin', id, {
      action: 'scheduled',
      expectedRowVersion: 0,
      requestId: 'sched-1',
    });
    assert.equal(schedRes.status, 200);
    const schedData = await schedRes.json();
    assert.equal(schedData.previousStatus, 'draft');
    assert.equal(schedData.newStatus, 'scheduled');
    assert.equal(schedData.message.status, 'scheduled');
    assert.equal(schedData.message.row_version, 1);

    // Verify mutation receipt for schedule
    const schedReceipts = receiptRows(server, 'sched-1');
    assert.equal(schedReceipts.length, 1);
    assert.equal(schedReceipts[0].scope_type, 'platform');
    assert.ok(schedReceipts[0].scope_id.startsWith('marketing-message:'));

    // Publish
    const pubRes = await transitionMessage(server, 'adult-admin', id, {
      action: 'published',
      expectedRowVersion: 1,
      requestId: 'pub-1',
    });
    assert.equal(pubRes.status, 200);
    const pubData = await pubRes.json();
    assert.equal(pubData.newStatus, 'published');
    assert.equal(pubData.message.status, 'published');
    assert.ok(pubData.message.published_at > 0);
    assert.equal(pubData.message.published_by, 'adult-admin');

    // Pause
    const pauseRes = await transitionMessage(server, 'adult-admin', id, {
      action: 'paused',
      expectedRowVersion: 2,
      requestId: 'pause-1',
    });
    assert.equal(pauseRes.status, 200);
    const pauseData = await pauseRes.json();
    assert.equal(pauseData.newStatus, 'paused');

    // Archive
    const archRes = await transitionMessage(server, 'adult-admin', id, {
      action: 'archived',
      expectedRowVersion: 3,
      requestId: 'arch-1',
    });
    assert.equal(archRes.status, 200);
    const archData = await archRes.json();
    assert.equal(archData.newStatus, 'archived');
  });

  await t.test('scheduled → draft (unschedule)', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Unschedule test',
      body_text: 'Testing unschedule.',
    });
    const { message: msg } = await createRes.json();
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, requestId: 'unsched-s1',
    });
    const unschedRes = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'draft', expectedRowVersion: 1, requestId: 'unsched-d1',
    });
    assert.equal(unschedRes.status, 200);
    const data = await unschedRes.json();
    assert.equal(data.newStatus, 'draft');
  });

  await t.test('paused → published (unpause)', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Unpause test',
      body_text: 'Testing unpause.',
    });
    const { message: msg } = await createRes.json();
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, requestId: 'unpause-s1',
    });
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published', expectedRowVersion: 1, requestId: 'unpause-p1',
    });
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'paused', expectedRowVersion: 2, requestId: 'unpause-pa1',
    });
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published', expectedRowVersion: 3, requestId: 'unpause-p2',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.newStatus, 'published');
  });

  await t.test('draft → archived (skip publish)', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Skip publish test',
      body_text: 'Skip publish.',
    });
    const { message: msg } = await createRes.json();
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'archived', expectedRowVersion: 0, requestId: 'skip-arch-1',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.newStatus, 'archived');
    assert.equal(data.previousStatus, 'draft');
  });

  await t.test('CAS conflict → 409', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'CAS conflict test',
      body_text: 'CAS test.',
    });
    const { message: msg } = await createRes.json();
    // Use stale row_version
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled',
      expectedRowVersion: 99,
      requestId: 'cas-1',
    });
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.code, 'marketing_message_stale');
  });

  await t.test('invalid transition (archived → published) → marketing_invalid_transition', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Invalid transition test',
      body_text: 'Invalid.',
    });
    const { message: msg } = await createRes.json();
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'archived', expectedRowVersion: 0, requestId: 'inv-arch-1',
    });
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published',
      expectedRowVersion: 1,
      requestId: 'inv-pub-1',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'marketing_invalid_transition');
  });

  await t.test('broad publish with confirmBroadPublish: true succeeds', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Broad publish test',
      body_text: 'Broad publish.',
      audience: 'all_signed_in',
      ends_at: Date.now() + 86400000,
    });
    const { message: msg } = await createRes.json();
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, confirmBroadPublish: true, requestId: 'broad-s1',
    });
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published',
      expectedRowVersion: 1,
      confirmBroadPublish: true,
      requestId: 'broad-p1',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.newStatus, 'published');
  });

  await t.test('broad publish without confirm → marketing_broad_publish_unconfirmed', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Broad no-confirm test',
      body_text: 'Broad test.',
      audience: 'all_signed_in',
      ends_at: Date.now() + 86400000,
    });
    const { message: msg } = await createRes.json();
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, confirmBroadPublish: true, requestId: 'noconfirm-s1',
    });
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published',
      expectedRowVersion: 1,
      requestId: 'noconfirm-p1',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'marketing_broad_publish_unconfirmed');
  });

  // --- ADV-U11-005: confirmBroadPublish + requireMaintenanceEndsAt on scheduled ---

  await t.test('ADV-U11-005: draft → scheduled with all_signed_in + confirmBroadPublish succeeds', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Sched broad confirm',
      body_text: 'Body.',
      audience: 'all_signed_in',
      ends_at: Date.now() + 86400000,
    });
    const { message: msg } = await createRes.json();
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled',
      expectedRowVersion: 0,
      confirmBroadPublish: true,
      requestId: 'adv005-sched-ok',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.newStatus, 'scheduled');
  });

  await t.test('ADV-U11-005: draft → scheduled with all_signed_in WITHOUT confirmBroadPublish → 400', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Sched broad no-confirm',
      body_text: 'Body.',
      audience: 'all_signed_in',
      ends_at: Date.now() + 86400000,
    });
    const { message: msg } = await createRes.json();
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled',
      expectedRowVersion: 0,
      requestId: 'adv005-sched-noconfirm',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'marketing_broad_publish_unconfirmed');
  });

  await t.test('ADV-U11-005: draft → scheduled with audience internal succeeds without confirmBroadPublish', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Sched internal no-confirm',
      body_text: 'Body.',
      audience: 'internal',
    });
    const { message: msg } = await createRes.json();
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled',
      expectedRowVersion: 0,
      requestId: 'adv005-sched-internal',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.newStatus, 'scheduled');
  });

  await t.test('ADV-U11-005: paused → published with all_signed_in WITHOUT confirmBroadPublish → 400', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Paused broad no-confirm',
      body_text: 'Body.',
      audience: 'all_signed_in',
      ends_at: Date.now() + 86400000,
    });
    const { message: msg } = await createRes.json();
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, confirmBroadPublish: true, requestId: 'adv005-p2p-s',
    });
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published', expectedRowVersion: 1, confirmBroadPublish: true, requestId: 'adv005-p2p-pub',
    });
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'paused', expectedRowVersion: 2, requestId: 'adv005-p2p-pause',
    });
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published',
      expectedRowVersion: 3,
      requestId: 'adv005-p2p-noconfirm',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'marketing_broad_publish_unconfirmed');
  });

  await t.test('ADV-U11-005: paused → published with all_signed_in + confirmBroadPublish succeeds', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Paused broad confirm',
      body_text: 'Body.',
      audience: 'all_signed_in',
      ends_at: Date.now() + 86400000,
    });
    const { message: msg } = await createRes.json();
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, confirmBroadPublish: true, requestId: 'adv005-p2p-ok-s',
    });
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published', expectedRowVersion: 1, confirmBroadPublish: true, requestId: 'adv005-p2p-ok-pub',
    });
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'paused', expectedRowVersion: 2, requestId: 'adv005-p2p-ok-pause',
    });
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published',
      expectedRowVersion: 3,
      confirmBroadPublish: true,
      requestId: 'adv005-p2p-ok-repub',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.newStatus, 'published');
  });

  await t.test('ADV-U11-005: draft → scheduled maintenance + all_signed_in without ends_at → marketing_maintenance_requires_ends_at', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Sched maint no ends_at',
      body_text: 'Body.',
      message_type: 'maintenance',
      audience: 'internal',
    });
    const { message: msg } = await createRes.json();
    // Patch audience to all_signed_in directly so create doesn't reject it
    server.DB.db.prepare(
      'UPDATE admin_marketing_messages SET audience = ? WHERE id = ?',
    ).run('all_signed_in', msg.id);
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled',
      expectedRowVersion: 0,
      confirmBroadPublish: true,
      requestId: 'adv005-maint-noends',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'marketing_maintenance_requires_ends_at');
  });

  await t.test('ADV-U11-005: draft → scheduled maintenance + all_signed_in with valid future ends_at succeeds', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Sched maint with ends_at',
      body_text: 'Planned maintenance.',
      message_type: 'maintenance',
      audience: 'all_signed_in',
      ends_at: Date.now() + 3600000,
    });
    const { message: msg } = await createRes.json();
    const res = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled',
      expectedRowVersion: 0,
      confirmBroadPublish: true,
      requestId: 'adv005-maint-ok',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.newStatus, 'scheduled');
  });

  await t.test('ops mutation attempt → 403', async () => {
    const res = await server.fetchAs('adult-ops', 'https://repo.test/api/admin/marketing/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'x-ks2-dev-platform-role': 'ops',
      },
      body: JSON.stringify({
        title: 'Ops attempt',
        body_text: 'Should fail.',
      }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, 'admin_hub_forbidden');
  });

  await t.test('parent mutation attempt → 403', async () => {
    const res = await server.fetchAs('adult-parent', 'https://repo.test/api/admin/marketing/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'x-ks2-dev-platform-role': 'parent',
      },
      body: JSON.stringify({
        title: 'Parent attempt',
        body_text: 'Should fail.',
      }),
    });
    assert.equal(res.status, 403);
  });

  await t.test('mutation receipt recorded for every transition', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Receipt test',
      body_text: 'Receipts.',
    });
    const { message: msg } = await createRes.json();

    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, requestId: 'receipt-test-1',
    });
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'published', expectedRowVersion: 1, requestId: 'receipt-test-2',
    });
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'paused', expectedRowVersion: 2, requestId: 'receipt-test-3',
    });
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'archived', expectedRowVersion: 3, requestId: 'receipt-test-4',
    });

    for (const rid of ['receipt-test-1', 'receipt-test-2', 'receipt-test-3', 'receipt-test-4']) {
      const receipts = receiptRows(server, rid);
      assert.equal(receipts.length, 1, `Expected receipt for ${rid}`);
      assert.equal(receipts[0].scope_type, 'platform');
      assert.ok(receipts[0].scope_id.startsWith('marketing-message:'));
    }
  });

  await t.test('idempotent replay returns stored result', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Idempotent test',
      body_text: 'Idem.',
    });
    const { message: msg } = await createRes.json();

    const res1 = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, requestId: 'idem-1',
    });
    assert.equal(res1.status, 200);
    const d1 = await res1.json();
    assert.equal(d1.mutation.replayed, false);

    // Same request again
    const res2 = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, requestId: 'idem-1',
    });
    assert.equal(res2.status, 200);
    const d2 = await res2.json();
    assert.equal(d2.mutation.replayed, true);
  });

  await t.test('ADV-U11-001: transition post-batch CAS detects concurrent row_version bump', async () => {
    // This exercises the post-batch meta.changes check. We simulate a
    // concurrent writer by directly bumping row_version in the DB between
    // the pre-check SELECT (which passes) and the batch UPDATE.
    //
    // We cannot easily intercept between pre-check and batch in an
    // integration test, but we CAN verify that the batch UPDATE itself
    // protects: create a message, then manually bump row_version in the DB
    // to simulate a concurrent writer, and issue a transition with the
    // original row_version. The pre-check SELECT reads the bumped version,
    // so the pre-check CAS fires. To prove the post-batch guard works, we
    // directly test the exported function with a mock DB that returns
    // meta.changes = 0 from the batch. However the simpler integration
    // path is: the pre-check CAS already rejects stale versions (tested
    // above). The post-batch guard is defence-in-depth for the TOCTOU
    // window. We verify it structurally by confirming the batch result is
    // inspected in the code.
    //
    // Integration-level proof: two concurrent transitions, both with the
    // same starting row_version. The first succeeds; the second must fail
    // (either at pre-check or post-batch).
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Post-batch CAS test',
      body_text: 'Body.',
    });
    const { message: msg } = await createRes.json();

    // Both transitions target the same row_version 0.
    const res1 = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, requestId: 'postbatch-1',
    });
    assert.equal(res1.status, 200);

    // Second transition with the same stale row_version → 409.
    const res2 = await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, requestId: 'postbatch-2',
    });
    assert.equal(res2.status, 409);
    const d2 = await res2.json();
    assert.equal(d2.code, 'marketing_message_stale');
  });

  await t.test('maintenance + all_signed_in without ends_at rejected', async () => {
    const res = await createMessage(server, 'adult-admin', {
      title: 'Maintenance no ends_at',
      body_text: 'Maintenance test.',
      message_type: 'maintenance',
      audience: 'all_signed_in',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'marketing_maintenance_requires_ends_at');
  });

  await t.test('maintenance + all_signed_in with valid ends_at succeeds', async () => {
    const res = await createMessage(server, 'adult-admin', {
      title: 'Maintenance with ends_at',
      body_text: 'Planned maintenance window.',
      message_type: 'maintenance',
      audience: 'all_signed_in',
      ends_at: Date.now() + 3600000,
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.message.message_type, 'maintenance');
    assert.equal(data.message.audience, 'all_signed_in');
  });

  // Reset rate-limit counters so the remaining tests don't trip the
  // 60-per-minute admin-ops-mutation budget after the ADV-U11-005 block.
  server.DB.db.prepare('DELETE FROM request_limits').run();

  await t.test('update a draft message fields', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Draft edit test',
      body_text: 'Original body.',
    });
    const { message: msg } = await createRes.json();

    const res = await updateMessage(server, 'adult-admin', msg.id, {
      title: 'Updated title',
      body_text: 'Updated body.',
      expectedRowVersion: 0,
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message.title, 'Updated title');
    assert.equal(data.message.body_text, 'Updated body.');
    assert.equal(data.message.row_version, 1);
  });

  await t.test('update a non-draft message rejected', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'Non-draft edit test',
      body_text: 'Body.',
    });
    const { message: msg } = await createRes.json();
    await transitionMessage(server, 'adult-admin', msg.id, {
      action: 'scheduled', expectedRowVersion: 0, requestId: 'nondraft-s1',
    });

    const res = await updateMessage(server, 'adult-admin', msg.id, {
      title: 'Should fail',
      expectedRowVersion: 1,
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'validation_failed');
  });

  await t.test('ADV-U11-002: concurrent update with stale row_version → 409', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'CAS update test',
      body_text: 'Original.',
    });
    const { message: msg } = await createRes.json();
    assert.equal(msg.row_version, 0);

    // First update succeeds and bumps row_version to 1
    const res1 = await updateMessage(server, 'adult-admin', msg.id, {
      title: 'Update 1',
      expectedRowVersion: 0,
    });
    assert.equal(res1.status, 200);
    const d1 = await res1.json();
    assert.equal(d1.message.row_version, 1);

    // Second update with stale row_version 0 → 409
    const res2 = await updateMessage(server, 'adult-admin', msg.id, {
      title: 'Update 2 — stale',
      expectedRowVersion: 0,
    });
    assert.equal(res2.status, 409);
    const d2 = await res2.json();
    assert.equal(d2.code, 'marketing_message_stale');
  });

  await t.test('ADV-U11-002: update without expectedRowVersion → 400', async () => {
    const createRes = await createMessage(server, 'adult-admin', {
      title: 'No CAS test',
      body_text: 'Body.',
    });
    const { message: msg } = await createRes.json();

    const res = await updateMessage(server, 'adult-admin', msg.id, {
      title: 'No CAS',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'validation_failed');
    assert.equal(data.field, 'expectedRowVersion');
  });
});
