import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email,
  displayName,
  platformRole = 'parent',
  now = 1,
  accountType = 'real',
  demoExpiresAt = null,
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)
  `).run(id, email, displayName, platformRole, now, now, accountType, demoExpiresAt);
}

function insertAccountOpsMetadata(server, {
  accountId,
  opsStatus = 'active',
  planLabel = null,
  tagsJson = '[]',
  internalNotes = null,
  updatedAt,
  updatedByAccountId = null,
}) {
  server.DB.db.prepare(`
    INSERT INTO account_ops_metadata (
      account_id, ops_status, plan_label, tags_json, internal_notes,
      updated_at, updated_by_account_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(accountId, opsStatus, planLabel, tagsJson, internalNotes, updatedAt, updatedByAccountId);
}

function seedBaseAccounts(server, now) {
  seedAdultAccount(server, {
    id: 'adult-admin',
    email: 'admin@example.com',
    displayName: 'Admin User',
    platformRole: 'admin',
    now,
  });
  seedAdultAccount(server, {
    id: 'adult-ops',
    email: 'ops@example.com',
    displayName: 'Ops User',
    platformRole: 'ops',
    now,
  });
  seedAdultAccount(server, {
    id: 'adult-parent',
    email: 'parent@example.com',
    displayName: 'Parent User',
    platformRole: 'parent',
    now,
  });
}

test('GET /api/admin/accounts/search happy path — admin sees full email', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/accounts/search?q=example',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.results));
    assert.equal(payload.results.length, 3);
    // Admin sees full email addresses.
    const adminResult = payload.results.find((r) => r.id === 'adult-admin');
    assert.ok(adminResult);
    assert.equal(adminResult.email, 'admin@example.com');
  } finally {
    server.close();
  }
});

test('GET /api/admin/accounts/search — ops sees masked email', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);

    const response = await server.fetchAs(
      'adult-ops',
      'https://repo.test/api/admin/accounts/search?q=example',
      {},
      { 'x-ks2-dev-platform-role': 'ops' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.results.length, 3);
    // Ops sees masked email (last 6 chars prefixed with ***).
    const adminResult = payload.results.find((r) => r.id === 'adult-admin');
    assert.ok(adminResult);
    assert.equal(adminResult.email, '***le.com');
  } finally {
    server.close();
  }
});

test('GET /api/admin/accounts/search rejects query under 3 chars', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/accounts/search?q=ab',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.results.length, 0);
    assert.equal(payload.error, 'Query must be at least 3 characters.');
  } finally {
    server.close();
  }
});

test('GET /api/admin/accounts/search as parent returns 403', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);

    const response = await server.fetchAs(
      'adult-parent',
      'https://repo.test/api/admin/accounts/search?q=example',
      {},
      { 'x-ks2-dev-platform-role': 'parent' },
    );
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('GET /api/admin/accounts/search filters by ops_status', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);
    insertAccountOpsMetadata(server, {
      accountId: 'adult-parent',
      opsStatus: 'suspended',
      updatedAt: now,
    });

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/accounts/search?q=example&ops_status=suspended',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].id, 'adult-parent');
    assert.equal(payload.results[0].opsStatus, 'suspended');
  } finally {
    server.close();
  }
});

test('GET /api/admin/accounts/search filters by platform_role', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/accounts/search?q=example&platform_role=ops',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].id, 'adult-ops');
  } finally {
    server.close();
  }
});

test('GET /api/admin/accounts/search excludes demo accounts', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);
    seedAdultAccount(server, {
      id: 'demo-user',
      email: 'demo-example@test.com',
      displayName: 'Demo Example',
      platformRole: 'parent',
      now,
      accountType: 'demo',
      demoExpiresAt: now + 60_000,
    });

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/accounts/search?q=example',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    // Should only see the 3 real accounts, not the demo.
    assert.equal(payload.results.length, 3);
    assert.ok(!payload.results.find((r) => r.id === 'demo-user'));
  } finally {
    server.close();
  }
});
