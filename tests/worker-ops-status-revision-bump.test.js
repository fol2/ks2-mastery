// Phase D / U15 coverage: status_revision bumps only when ops_status
// transitions to a different value. Active→active no-op leaves
// status_revision unchanged but still bumps row_version.
//
// Contract:
// - active (row_version=0, status_revision=0) → suspended → status_revision=1, row_version=1.
// - suspended → suspended (no-op) → status_revision unchanged, row_version still bumps.
// - suspended → active → status_revision=2, row_version=2.
// - active → active with plan_label change → status_revision unchanged, row_version bumps.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U15

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, { id, email = null, platformRole = 'parent' } = {}) {
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at)
    VALUES (?, ?, NULL, ?, NULL, ?, ?, 0, 'real', NULL)
  `).run(id, email, platformRole, now, now);
}

function readCounters(server, accountId) {
  const row = server.DB.db.prepare(
    'SELECT row_version, status_revision, ops_status FROM account_ops_metadata WHERE account_id = ?',
  ).get(accountId);
  if (!row) return null;
  return {
    rowVersion: Math.max(0, Number(row.row_version) || 0),
    statusRevision: Math.max(0, Number(row.status_revision) || 0),
    opsStatus: row.ops_status,
  };
}

async function putMetadata(server, actor, targetAccountId, body) {
  return server.fetchAs(actor, `https://repo.test/api/admin/accounts/${encodeURIComponent(targetAccountId)}/ops-metadata`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
    body: JSON.stringify(body),
  });
}

test('U15 revision — active→suspended bumps status_revision by 1 and row_version by 1', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-second-admin', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-parent', platformRole: 'parent' });

    // Fresh-row active → nothing written yet.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-a', correlationId: 'corr-a' },
    });
    let counters = readCounters(server, 'adult-parent');
    assert.equal(counters.rowVersion, 1);
    assert.equal(counters.statusRevision, 0); // fresh row default
    assert.equal(counters.opsStatus, 'active');

    // active → suspended bumps both counters.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-b', correlationId: 'corr-b' },
    });
    counters = readCounters(server, 'adult-parent');
    assert.equal(counters.rowVersion, 2);
    assert.equal(counters.statusRevision, 1);
    assert.equal(counters.opsStatus, 'suspended');
  } finally {
    server.close();
  }
});

test('U15 revision — suspended→suspended no-op bumps row_version but NOT status_revision', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-second-admin', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-parent', platformRole: 'parent' });

    // Seed a row at suspended, statusRevision=1, rowVersion=1.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-a', correlationId: 'corr-a' },
    });
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-b', correlationId: 'corr-b' },
    });

    // suspended → suspended with a plan_label change: row_version +1,
    // status_revision unchanged.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended', planLabel: 'Ops-hold' },
      expectedRowVersion: 2,
      mutation: { requestId: 'req-c', correlationId: 'corr-c' },
    });
    const counters = readCounters(server, 'adult-parent');
    assert.equal(counters.rowVersion, 3);
    assert.equal(counters.statusRevision, 1);
  } finally {
    server.close();
  }
});

test('U15 revision — active→suspended→active bumps status_revision twice', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-second-admin', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-parent', platformRole: 'parent' });

    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-a', correlationId: 'corr-a' },
    });
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-b', correlationId: 'corr-b' },
    });
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 2,
      mutation: { requestId: 'req-c', correlationId: 'corr-c' },
    });
    const counters = readCounters(server, 'adult-parent');
    assert.equal(counters.rowVersion, 3);
    assert.equal(counters.statusRevision, 2);
  } finally {
    server.close();
  }
});

test('U15 revision — plan_label-only change bumps row_version but not status_revision', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-parent', platformRole: 'parent' });

    // Fresh row.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active', planLabel: 'Trial' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-a', correlationId: 'corr-a' },
    });
    // Change only plan_label.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { planLabel: 'Enterprise' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-b', correlationId: 'corr-b' },
    });
    const counters = readCounters(server, 'adult-parent');
    assert.equal(counters.rowVersion, 2);
    assert.equal(counters.statusRevision, 0);
    assert.equal(counters.opsStatus, 'active');
  } finally {
    server.close();
  }
});
