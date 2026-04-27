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

function seedLearner(server, { id, name, yearGroup = '3', createdAt, updatedAt }) {
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at)
    VALUES (?, ?, ?, 'blue', 'improve', 15, ?, ?)
  `).run(id, name, yearGroup, createdAt, updatedAt);
}

function seedMembership(server, { accountId, learnerId, role = 'owner', now = 1 }) {
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(accountId, learnerId, role, now, now);
}

function insertMutationReceipt(server, {
  accountId,
  requestId,
  scopeType,
  scopeId,
  mutationKind,
  response = { ok: true },
  statusCode = 200,
  correlationId = null,
  appliedAt,
  requestHash = 'hash',
}) {
  server.DB.db.prepare(`
    INSERT INTO mutation_receipts (
      account_id, request_id, scope_type, scope_id, mutation_kind,
      request_hash, response_json, status_code, correlation_id, applied_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    accountId,
    requestId,
    scopeType,
    scopeId,
    mutationKind,
    requestHash,
    JSON.stringify(response),
    statusCode,
    correlationId,
    appliedAt,
  );
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

test('GET /api/admin/accounts/:id/detail happy path — admin sees full detail', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);
    seedLearner(server, {
      id: 'learner-1',
      name: 'Child One',
      yearGroup: '4',
      createdAt: now,
      updatedAt: now,
    });
    seedMembership(server, {
      accountId: 'adult-parent',
      learnerId: 'learner-1',
      role: 'owner',
      now,
    });
    insertMutationReceipt(server, {
      accountId: 'adult-parent',
      requestId: 'req-1',
      scopeType: 'account',
      scopeId: 'adult-parent',
      mutationKind: 'account.update',
      appliedAt: now,
    });
    insertAccountOpsMetadata(server, {
      accountId: 'adult-parent',
      opsStatus: 'active',
      planLabel: 'Standard',
      tagsJson: JSON.stringify(['vip']),
      internalNotes: 'Admin-only note',
      updatedAt: now,
      updatedByAccountId: 'adult-admin',
    });

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/accounts/adult-parent/detail',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);

    // Account summary
    assert.equal(payload.account.id, 'adult-parent');
    assert.equal(payload.account.email, 'parent@example.com');
    assert.equal(payload.account.platformRole, 'parent');

    // Learners
    assert.equal(payload.learners.length, 1);
    assert.equal(payload.learners[0].id, 'learner-1');
    assert.equal(payload.learners[0].displayName, 'Child One');
    assert.equal(payload.learners[0].yearGroup, '4');
    assert.equal(payload.learners[0].membershipRole, 'owner');

    // Recent mutations
    assert.equal(payload.recentMutations.length, 1);
    assert.equal(payload.recentMutations[0].requestId, 'req-1');

    // Ops metadata — admin sees internal notes.
    assert.equal(payload.opsMetadata.opsStatus, 'active');
    assert.equal(payload.opsMetadata.planLabel, 'Standard');
    assert.deepEqual(payload.opsMetadata.tags, ['vip']);
    assert.equal(payload.opsMetadata.internalNotes, 'Admin-only note');
  } finally {
    server.close();
  }
});

test('GET /api/admin/accounts/:id/detail — ops sees masked email and no internal notes', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);
    insertAccountOpsMetadata(server, {
      accountId: 'adult-parent',
      opsStatus: 'suspended',
      internalNotes: 'Secret ops note',
      updatedAt: now,
    });

    const response = await server.fetchAs(
      'adult-ops',
      'https://repo.test/api/admin/accounts/adult-parent/detail',
      {},
      { 'x-ks2-dev-platform-role': 'ops' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);

    // Ops sees masked email.
    assert.equal(payload.account.email, '***le.com');

    // Ops sees null internal notes.
    assert.equal(payload.opsMetadata.internalNotes, null);
    assert.equal(payload.opsMetadata.opsStatus, 'suspended');

    // Ops sees empty denials array.
    assert.deepEqual(payload.recentDenials, []);
  } finally {
    server.close();
  }
});

test('GET /api/admin/accounts/:id/detail as parent returns 403', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);

    const response = await server.fetchAs(
      'adult-parent',
      'https://repo.test/api/admin/accounts/adult-parent/detail',
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

test('GET /api/admin/accounts/:id/detail returns 404 for unknown account', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedBaseAccounts(server, now);

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/accounts/nonexistent-id/detail',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.code, 'account_not_found');
  } finally {
    server.close();
  }
});
