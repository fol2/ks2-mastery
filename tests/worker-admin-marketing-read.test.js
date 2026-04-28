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
    // Published, no time window, audience=all_signed_in (should appear)
    seedMessage(server, {
      id: 'msg-notimed',
      status: 'published',
      title: 'No window',
      bodyText: 'No window.',
      audience: 'all_signed_in',
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

  await t.test('ADV-U11-003: internal-audience published message excluded from public endpoint', async () => {
    // msg-pub was seeded earlier with status='published' but audience='internal'
    // (the default). After ADV-U11-003, audience='internal' messages are
    // excluded from the public active-messages endpoint.
    const res = await getActiveMessages(server, 'adult-parent');
    const data = await res.json();
    const titles = data.messages.map((m) => m.title);
    assert.ok(!titles.includes('Published'), 'Published message with audience=internal should NOT appear on public endpoint');
  });

  await t.test('ADV-U11-003: active-messages filters by audience=all_signed_in', async () => {
    const now = Date.now();
    // Published, audience=all_signed_in, within window → should appear
    seedMessage(server, {
      id: 'msg-audience-public',
      status: 'published',
      title: 'Public announcement',
      bodyText: 'For everyone.',
      audience: 'all_signed_in',
      startsAt: now - 1000,
      endsAt: now + 60000,
      publishedBy: 'adult-admin',
      publishedAt: now - 1000,
    });
    // Published, audience=internal, within window → should NOT appear
    seedMessage(server, {
      id: 'msg-audience-internal',
      status: 'published',
      title: 'Internal only',
      bodyText: 'Staff only.',
      audience: 'internal',
      startsAt: now - 1000,
      endsAt: now + 60000,
      publishedBy: 'adult-admin',
      publishedAt: now - 1000,
    });
    // Published, audience=demo, within window → should NOT appear
    seedMessage(server, {
      id: 'msg-audience-demo',
      status: 'published',
      title: 'Demo only',
      bodyText: 'Demo.',
      audience: 'demo',
      startsAt: now - 1000,
      endsAt: now + 60000,
      publishedBy: 'adult-admin',
      publishedAt: now - 1000,
    });

    const res = await getActiveMessages(server, 'adult-parent');
    assert.equal(res.status, 200);
    const data = await res.json();
    const titles = data.messages.map((m) => m.title);
    assert.ok(titles.includes('Public announcement'), 'all_signed_in message should appear');
    assert.ok(!titles.includes('Internal only'), 'internal audience should be excluded');
    assert.ok(!titles.includes('Demo only'), 'demo audience should be excluded');
  });

  await t.test('ADV-U11-008: ops cannot read draft message by ID', async () => {
    seedMessage(server, {
      id: 'msg-ops-draft-hidden',
      status: 'draft',
      title: 'Hidden Draft',
      bodyText: 'Not for ops.',
    });
    const res = await getMessage(server, 'adult-ops', 'msg-ops-draft-hidden', 'ops');
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.code, 'not_found');
  });

  await t.test('ADV-U11-008: ops cannot read paused message by ID', async () => {
    seedMessage(server, {
      id: 'msg-ops-paused-hidden',
      status: 'paused',
      title: 'Hidden Paused',
      bodyText: 'Not for ops.',
    });
    const res = await getMessage(server, 'adult-ops', 'msg-ops-paused-hidden', 'ops');
    assert.equal(res.status, 404);
  });

  await t.test('ADV-U11-008: ops cannot read archived message by ID', async () => {
    seedMessage(server, {
      id: 'msg-ops-archived-hidden',
      status: 'archived',
      title: 'Hidden Archived',
      bodyText: 'Not for ops.',
    });
    const res = await getMessage(server, 'adult-ops', 'msg-ops-archived-hidden', 'ops');
    assert.equal(res.status, 404);
  });

  await t.test('ADV-U11-008: ops CAN read published message by ID', async () => {
    seedMessage(server, {
      id: 'msg-ops-pub-visible',
      status: 'published',
      title: 'Ops visible published',
      bodyText: 'Ops can see this.',
      publishedBy: 'adult-admin',
      publishedAt: 1000,
    });
    const res = await getMessage(server, 'adult-ops', 'msg-ops-pub-visible', 'ops');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message.title, 'Ops visible published');
  });

  await t.test('ADV-U11-008: ops CAN read scheduled message by ID', async () => {
    seedMessage(server, {
      id: 'msg-ops-sched-visible',
      status: 'scheduled',
      title: 'Ops visible scheduled',
      bodyText: 'Ops can see this.',
    });
    const res = await getMessage(server, 'adult-ops', 'msg-ops-sched-visible', 'ops');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message.title, 'Ops visible scheduled');
  });

  await t.test('ADV-U11-008: admin CAN read draft message by ID', async () => {
    const res = await getMessage(server, 'adult-admin', 'msg-ops-draft-hidden');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message.title, 'Hidden Draft');
  });
});

test('active-messages soft-fails open when the marketing table is not migrated', async () => {
  const server = createWorkerRepositoryServer();
  try {
    server.DB.db.exec('DROP TABLE admin_marketing_messages;');
    const res = await getActiveMessages(server, 'adult-parent');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.deepEqual(data.messages, []);
  } finally {
    server.close();
  }
});

test('admin marketing list soft-fails open when the marketing table is not migrated', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, 1000);
    server.DB.db.exec('DROP TABLE admin_marketing_messages;');

    const adminRes = await listAdmin(server, 'adult-admin');
    assert.equal(adminRes.status, 200);
    const adminData = await adminRes.json();
    assert.equal(adminData.ok, true);
    assert.deepEqual(adminData.messages, []);

    const opsRes = await listAdmin(server, 'adult-ops', 'ops');
    assert.equal(opsRes.status, 200);
    const opsData = await opsRes.json();
    assert.equal(opsData.ok, true);
    assert.deepEqual(opsData.messages, []);

    const parentRes = await listAdmin(server, 'adult-parent', 'parent');
    assert.equal(parentRes.status, 403);
  } finally {
    server.close();
  }
});

test('admin marketing detail hides missing marketing table as not found', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, 1000);
    server.DB.db.exec('DROP TABLE admin_marketing_messages;');

    const res = await getMessage(server, 'adult-admin', 'msg-any');
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.code, 'not_found');
  } finally {
    server.close();
  }
});
