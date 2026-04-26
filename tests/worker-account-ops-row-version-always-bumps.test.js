// Phase D / U15 coverage: `row_version` ALWAYS bumps on every successful
// UPSERT, even when only `plan_label` / `tags` / `internal_notes` change
// (no ops_status transition). This preserves the Phase C CAS invariant
// that every write is observable via row_version.
//
// Contract:
// - PATCH with only plan_label change → row_version += 1, status_revision unchanged.
// - PATCH with only tags change → row_version += 1, status_revision unchanged.
// - PATCH with only internal_notes change → row_version += 1, status_revision unchanged.
// - Three consecutive non-status PATCHes land row_version at 3 and leave
//   status_revision at 0 (never bumped).
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U15

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, { id, platformRole = 'parent' } = {}) {
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at)
    VALUES (?, NULL, NULL, ?, NULL, ?, ?, 0, 'real', NULL)
  `).run(id, platformRole, now, now);
}

function readCounters(server, accountId) {
  const row = server.DB.db.prepare(
    'SELECT row_version, status_revision, plan_label, internal_notes, tags_json FROM account_ops_metadata WHERE account_id = ?',
  ).get(accountId);
  if (!row) return null;
  return {
    rowVersion: Math.max(0, Number(row.row_version) || 0),
    statusRevision: Math.max(0, Number(row.status_revision) || 0),
    planLabel: row.plan_label,
    internalNotes: row.internal_notes,
    tagsJson: row.tags_json,
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

test('U15 row_version — three non-status PATCHes each bump row_version, status_revision stays at 0', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-parent' });

    // Fresh row.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-a', correlationId: 'corr-a' },
    });
    // Plan label change.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { planLabel: 'Pro' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-b', correlationId: 'corr-b' },
    });
    // Tags change.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { tags: ['one', 'two'] },
      expectedRowVersion: 2,
      mutation: { requestId: 'req-c', correlationId: 'corr-c' },
    });
    // Internal notes change.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { internalNotes: 'fourth update' },
      expectedRowVersion: 3,
      mutation: { requestId: 'req-d', correlationId: 'corr-d' },
    });

    const counters = readCounters(server, 'adult-parent');
    assert.equal(counters.rowVersion, 4);
    assert.equal(counters.statusRevision, 0);
    assert.equal(counters.planLabel, 'Pro');
    assert.equal(counters.internalNotes, 'fourth update');
  } finally {
    server.close();
  }
});

test('U15 row_version — active→active no-op with internal_notes change still bumps row_version', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-parent' });

    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active', internalNotes: 'first' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-a', correlationId: 'corr-a' },
    });
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active', internalNotes: 'second' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-b', correlationId: 'corr-b' },
    });

    const counters = readCounters(server, 'adult-parent');
    assert.equal(counters.rowVersion, 2);
    assert.equal(counters.statusRevision, 0);
    assert.equal(counters.internalNotes, 'second');
  } finally {
    server.close();
  }
});
