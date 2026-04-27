// U8 (P3): Worker-level tests for GET /api/admin/ops/request-denials.
//
// Test scenarios from the plan:
//   1. Happy path: denial read returns recent denials ordered by timestamp desc
//   2. Happy path: filter by reason returns only matching denials
//   3. Happy path: filter by route returns only matching denials
//   4. Happy path: admin sees masked account ID; ops sees no account linkage
//   5. Edge case: no denials in range -> empty state
//   6. Parent role cannot access the endpoint

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

function insertRequestDenial(server, {
  id,
  deniedAt,
  denialReason,
  routeName = null,
  accountId = null,
  learnerId = null,
  sessionIdLast8 = null,
  isDemo = 0,
  release = null,
  detailJson = null,
}) {
  server.DB.db.prepare(`
    INSERT INTO admin_request_denials (
      id, denied_at, denial_reason, route_name, account_id,
      learner_id, session_id_last8, is_demo, release, detail_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    deniedAt,
    denialReason,
    routeName,
    accountId,
    learnerId,
    sessionIdLast8,
    isDemo,
    release,
    detailJson,
  );
}

function seedAdminAndOps(server, now = 1_700_000_000_000) {
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

test('GET /api/admin/ops/request-denials returns recent denials ordered by denied_at DESC', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    insertRequestDenial(server, {
      id: 'deny-1',
      deniedAt: now - 3000,
      denialReason: 'account_suspended',
      routeName: '/api/bootstrap',
      accountId: 'adult-account-aaaa1111',
    });
    insertRequestDenial(server, {
      id: 'deny-2',
      deniedAt: now - 1000,
      denialReason: 'rate_limit_exceeded',
      routeName: '/api/subject/command',
      accountId: 'adult-account-bbbb2222',
    });
    insertRequestDenial(server, {
      id: 'deny-3',
      deniedAt: now - 2000,
      denialReason: 'csrf_rejection',
      routeName: '/api/admin/accounts/role',
      accountId: 'adult-account-cccc3333',
    });

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/ops/request-denials',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.generatedAt, 'number');
    assert.equal(Array.isArray(payload.entries), true);
    assert.equal(payload.entries.length, 3);

    // Ordered by denied_at DESC — deny-2 (most recent) first
    assert.equal(payload.entries[0].id, 'deny-2');
    assert.equal(payload.entries[1].id, 'deny-3');
    assert.equal(payload.entries[2].id, 'deny-1');

    // Fields present
    assert.equal(payload.entries[0].denialReason, 'rate_limit_exceeded');
    assert.equal(payload.entries[0].routeName, '/api/subject/command');
    assert.equal(typeof payload.entries[0].deniedAt, 'number');
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/request-denials filter by reason returns only matching', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    insertRequestDenial(server, {
      id: 'deny-a',
      deniedAt: now - 2000,
      denialReason: 'account_suspended',
      routeName: '/api/bootstrap',
    });
    insertRequestDenial(server, {
      id: 'deny-b',
      deniedAt: now - 1000,
      denialReason: 'rate_limit_exceeded',
      routeName: '/api/subject/command',
    });

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/ops/request-denials?reason=account_suspended',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].id, 'deny-a');
    assert.equal(payload.entries[0].denialReason, 'account_suspended');
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/request-denials filter by route returns only matching', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    insertRequestDenial(server, {
      id: 'deny-x',
      deniedAt: now - 2000,
      denialReason: 'csrf_rejection',
      routeName: '/api/admin/accounts/role',
    });
    insertRequestDenial(server, {
      id: 'deny-y',
      deniedAt: now - 1000,
      denialReason: 'rate_limit_exceeded',
      routeName: '/api/subject/command',
    });

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/ops/request-denials?route=subject',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].id, 'deny-y');
    assert.equal(payload.entries[0].routeName, '/api/subject/command');
  } finally {
    server.close();
  }
});

test('admin sees masked account ID (last 8); ops sees no account linkage', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    insertRequestDenial(server, {
      id: 'deny-acl-1',
      deniedAt: now - 1000,
      denialReason: 'account_suspended',
      routeName: '/api/bootstrap',
      accountId: 'adult-account-abcd1234',
    });

    // Admin request — should see masked account id (last 8 chars)
    const adminResponse = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/ops/request-denials',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const adminPayload = await adminResponse.json();

    assert.equal(adminResponse.status, 200);
    assert.equal(adminPayload.entries.length, 1);
    assert.equal(adminPayload.entries[0].accountIdMasked, 'abcd1234');

    // Ops request — should see null account id (no linkage)
    const opsResponse = await server.fetchAs(
      'adult-ops',
      'https://repo.test/api/admin/ops/request-denials',
      {},
      { 'x-ks2-dev-platform-role': 'ops' },
    );
    const opsPayload = await opsResponse.json();

    assert.equal(opsResponse.status, 200);
    assert.equal(opsPayload.entries.length, 1);
    assert.equal(opsPayload.entries[0].accountIdMasked, null);
    // Ops still sees reason + route
    assert.equal(opsPayload.entries[0].denialReason, 'account_suspended');
    assert.equal(opsPayload.entries[0].routeName, '/api/bootstrap');
  } finally {
    server.close();
  }
});

test('no denials in range returns empty entries array', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    // Insert a denial outside the requested time range
    insertRequestDenial(server, {
      id: 'deny-old',
      deniedAt: now - 100_000,
      denialReason: 'csrf_rejection',
      routeName: '/api/admin/accounts',
    });

    const response = await server.fetchAs(
      'adult-admin',
      `https://repo.test/api/admin/ops/request-denials?from=${now - 1000}&to=${now}`,
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.entries.length, 0);
  } finally {
    server.close();
  }
});

test('parent role cannot access denial log endpoint', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    const response = await server.fetchAs(
      'adult-parent',
      'https://repo.test/api/admin/ops/request-denials',
      {},
      { 'x-ks2-dev-platform-role': 'parent' },
    );

    // Parent should be rejected — either 403 or the admin hub access gate
    assert.ok(response.status >= 400, `Expected 4xx status, got ${response.status}`);
  } finally {
    server.close();
  }
});
