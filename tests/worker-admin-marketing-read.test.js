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

function seedMessage(server, {
  id,
  messageType = 'announcement',
  status = 'draft',
  title = 'Test',
  bodyText = 'Body.',
  severityToken = 'info',
  audience = 'internal',
  startsAt = null,
  endsAt = null,
  createdBy = 'adult-admin',
  updatedBy = 'adult-admin',
  publishedBy = null,
  createdAt = 1000,
  updatedAt = 1000,
  publishedAt = null,
  rowVersion = 0,
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO admin_marketing_messages (
      id, message_type, status, title, body_text, severity_token,
      audience, starts_at, ends_at,
      created_by, updated_by, published_by,
      created_at, updated_at, published_at, row_version
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, messageType, status, title, bodyText, severityToken,
    audience, startsAt, endsAt,
    createdBy, updatedBy, publishedBy,
    createdAt, updatedAt, publishedAt, rowVersion,
  );
}

async function listAdmin(server, as, role = 'admin') {
  return server.fetchAs(as, 'https://repo.test/api/admin/marketing/messages', {
    method: 'GET',
    headers: {
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': role,
    },
  });
}

async function getMessage(server, as, messageId, role = 'admin') {
  return server.fetchAs(as, `https://repo.test/api/admin/marketing/messages/${messageId}`, {
    method: 'GET',
    headers: {
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': role,
    },
  });
}

async function getActiveMessages(server, as) {
  return server.fetchAs(as, 'https://repo.test/api/ops/active-messages', {
    method: 'GET',
  });
}

test('U11 Marketing Read Routes', async (t) => {
  const server = createWorkerRepositoryServer();
  t.after(() => server.close());
  seedCore(server, 1000);

  await t.test('admin sees all messages', async () => {
    seedMessage(server, { id: 'msg-draft', status: 'draft', title: 'Draft' });
    seedMessage(server, { id: 'msg-sched', status: 'scheduled', title: 'Scheduled' });
    seedMessage(server, { id: 'msg-pub', status: 'published', title: 'Published' });
    seedMessage(server, { id: 'msg-paused', status: 'paused', title: 'Paused' });
    seedMessage(server, { id: 'msg-arch', status: 'archived', title: 'Archived' });

    const res = await listAdmin(server, 'adult-admin');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.messages.length, 5);
  });

  await t.test('ops sees only published and scheduled', async () => {
    const res = await listAdmin(server, 'adult-ops', 'ops');
    assert.equal(res.status, 200);
    const data = await res.json();
    const statuses = new Set(data.messages.map((m) => m.status));
    assert.ok(!statuses.has('draft'));
    assert.ok(!statuses.has('paused'));
    assert.ok(!statuses.has('archived'));
  });

  await t.test('parent cannot list admin messages', async () => {
    const res = await listAdmin(server, 'adult-parent', 'parent');
    assert.equal(res.status, 403);
  });

  await t.test('get single message by id', async () => {
    const res = await getMessage(server, 'adult-admin', 'msg-draft');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message.id, 'msg-draft');
    assert.equal(data.message.title, 'Draft');
  });

  await t.test('get non-existent message → 404', async () => {
    const res = await getMessage(server, 'adult-admin', 'msg-nonexistent');
    assert.equal(res.status, 404);
  });

  await t.test('active-messages returns only published within time window', async () => {
    const now = Date.now();
    // Published, within window
    seedMessage(server, {
      id: 'msg-active-1',
      status: 'published',
      title: 'Active now',
      bodyText: 'Active.',
      startsAt: now - 1000,
      endsAt: now + 60000,
      audience: 'all_signed_in',
      publishedBy: 'adult-admin',
      publishedAt: now - 1000,
    });
    // Published but expired (ends_at in the past)
    seedMessage(server, {
      id: 'msg-expired',
      status: 'published',
      title: 'Expired',
      bodyText: 'Expired.',
      startsAt: now - 20000,
      endsAt: now - 10000,
      audience: 'all_signed_in',
      publishedBy: 'adult-admin',
      publishedAt: now - 20000,
    });
    // Published, no time window (should appear)
    seedMessage(server, {
      id: 'msg-notimed',
      status: 'published',
      title: 'No window',
      bodyText: 'No window.',
      audience: 'internal',
      publishedBy: 'adult-admin',
      publishedAt: now - 5000,
    });
    // Draft — should NOT appear
    seedMessage(server, {
      id: 'msg-active-draft',
      status: 'draft',
      title: 'Draft not active',
      bodyText: 'Draft.',
    });

    const res = await getActiveMessages(server, 'adult-parent');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);

    const ids = data.messages.map((m) => m.title);
    assert.ok(ids.includes('Active now'), 'Should include active message');
    assert.ok(ids.includes('No window'), 'Should include no-window published message');
    assert.ok(!ids.includes('Expired'), 'Should NOT include expired message');
    assert.ok(!ids.includes('Draft not active'), 'Should NOT include draft message');
  });

  await t.test('active-messages returns safe fields only', async () => {
    const res = await getActiveMessages(server, 'adult-parent');
    assert.equal(res.status, 200);
    const data = await res.json();
    // Safe fields only — no id, no created_by, no audience, etc.
    for (const msg of data.messages) {
      assert.ok(typeof msg.title === 'string', 'has title');
      assert.ok(typeof msg.body_text === 'string', 'has body_text');
      assert.ok(typeof msg.severity_token === 'string', 'has severity_token');
      assert.ok(typeof msg.message_type === 'string', 'has message_type');
      // Must NOT have admin-only fields
      assert.equal(msg.id, undefined, 'should not have id');
      assert.equal(msg.created_by, undefined, 'should not have created_by');
      assert.equal(msg.updated_by, undefined, 'should not have updated_by');
      assert.equal(msg.audience, undefined, 'should not have audience');
      assert.equal(msg.status, undefined, 'should not have status');
      assert.equal(msg.row_version, undefined, 'should not have row_version');
    }
  });

  await t.test('active-messages does not include the "Published" message from earlier (no time window, seeded before now)', async () => {
    // msg-pub was seeded with no starts_at/ends_at and status 'published' but
    // with default timestamps. It should appear since no time window means always visible.
    const res = await getActiveMessages(server, 'adult-parent');
    const data = await res.json();
    const titles = data.messages.map((m) => m.title);
    assert.ok(titles.includes('Published'), 'Published message with no window should appear');
  });
});
