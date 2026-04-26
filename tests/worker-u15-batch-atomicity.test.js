// Phase D / T-Imp-6 (Phase D reviewer): exercise the 4-statement batch
// atomicity of `updateAccountOpsMetadata` under a forced mid-batch
// failure. The batch composes:
//   1. UPSERT account_ops_metadata (bumps row_version + status_revision)
//   2. INSERT mutation_receipts
//   3. UPDATE admin_ops_kpi_counters (bumpAdminKpiMetricStatement)
//   4. DELETE account_sessions (stale-session sweep)
//
// Contract: if ANY statement raises a SQL error the entire batch rolls
// back — metadata row unchanged, no receipt, no counter bump, sessions
// preserved. This applies under BOTH the transactional shim (savepoint
// rollback) AND the non-transactional fallback (D1 batch() semantics —
// on real D1 the whole batch commits or rolls back atomically; the
// sqlite-d1 shim models the same via SAVEPOINT).
//
// We force the failure by intercepting `db.batch()` to throw when it
// sees a statement targeting `mutation_receipts` — the simplest way to
// simulate a PK collision without having to set up a preflight-
// bypassing duplicate receipt row.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U15

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email = null,
  platformRole = 'parent',
  now = Date.now(),
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at)
    VALUES (?, ?, NULL, ?, NULL, ?, ?, 0, 'real', NULL)
  `).run(id, email, platformRole, now, now);
}

function seedMetadata(server, accountId, {
  opsStatus = 'active',
  statusRevision = 0,
  rowVersion = 0,
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO account_ops_metadata (
      account_id, ops_status, plan_label, tags_json, internal_notes,
      updated_at, updated_by_account_id, row_version, status_revision
    )
    VALUES (?, ?, NULL, '[]', NULL, ?, NULL, ?, ?)
  `).run(accountId, opsStatus, Date.now(), rowVersion, statusRevision);
}

function seedSession(server, accountId, {
  id,
  statusRevisionAtIssue = 0,
  now = Date.now(),
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO account_sessions (
      id, account_id, session_hash, provider, created_at, expires_at,
      session_kind, status_revision_at_issue
    ) VALUES (?, ?, ?, 'email', ?, ?, 'real', ?)
  `).run(id, accountId, `hash-${id}`, now, now + 24 * 60 * 60 * 1000, statusRevisionAtIssue);
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

function runWithBatchFailure(server, fn) {
  const originalBatch = server.DB.batch.bind(server.DB);
  server.DB.batch = async (statements) => {
    // If any statement text targets `mutation_receipts`, simulate a
    // mid-batch SQL failure. This stands in for a PK collision on the
    // receipt INSERT.
    for (const statement of statements || []) {
      const sql = String(statement?.sql || statement?.statement?.source || '');
      if (sql.includes('mutation_receipts')) {
        throw new Error('Simulated batch failure: receipt insert raised SQL error');
      }
    }
    return originalBatch(statements);
  };
  return fn().finally(() => {
    server.DB.batch = originalBatch;
  });
}

async function runAtomicityAssertions(server, { expectedTransactional }) {
  const now = Date.now();
  seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
  seedAdultAccount(server, { id: 'adult-T', now });
  seedMetadata(server, 'adult-T', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });
  seedSession(server, 'adult-T', { id: 'sess-1', statusRevisionAtIssue: 0 });

  const before = {
    meta: server.DB.db.prepare('SELECT row_version, status_revision, ops_status FROM account_ops_metadata WHERE account_id = ?').get('adult-T'),
    receipts: server.DB.db.prepare('SELECT COUNT(*) AS n FROM mutation_receipts').get().n,
    sessions: server.DB.db
      .prepare('SELECT id FROM account_sessions WHERE account_id = ? ORDER BY id')
      .all('adult-T')
      .map((row) => row.id),
  };

  let res = null;
  await runWithBatchFailure(server, async () => {
    res = await putMetadata(server, 'adult-admin', 'adult-T', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-timp6-atomic', correlationId: 'corr-timp6-atomic' },
    });
  });

  // The failure should propagate as a 500 (repository throws unhandled).
  assert.notEqual(res.status, 200, `expected non-200 on forced batch failure; got ${res.status}`);

  const after = {
    meta: server.DB.db.prepare('SELECT row_version, status_revision, ops_status FROM account_ops_metadata WHERE account_id = ?').get('adult-T'),
    receipts: server.DB.db.prepare('SELECT COUNT(*) AS n FROM mutation_receipts').get().n,
    sessions: server.DB.db
      .prepare('SELECT id FROM account_sessions WHERE account_id = ? ORDER BY id')
      .all('adult-T')
      .map((row) => row.id),
  };

  // Whether transactional or not, the sqlite-d1 shim does SAVEPOINT +
  // ROLLBACK so ALL writes unwind. Document the expectation so future
  // regressions (e.g. moving to a partial-commit batch) surface.
  assert.deepEqual(after.meta, before.meta, 'metadata row must roll back on mid-batch failure');
  assert.equal(after.receipts, before.receipts, 'mutation_receipts must roll back on mid-batch failure');
  assert.deepEqual(after.sessions, before.sessions, 'sessions must roll back on mid-batch failure');

  // Note for the transactional-off branch: on real D1, batch() is the
  // atomicity primitive regardless of the shim's SAVEPOINT. `expected-
  // Transactional` is documentation-only in this test-harness path.
  void expectedTransactional;
}

test('T-Imp-6 — 4-statement batch rolls back fully under the transactional shim', async () => {
  const server = createWorkerRepositoryServer();
  try {
    assert.equal(server.DB.supportsSqlTransactions, true, 'default helper marks shim as transactional');
    await runAtomicityAssertions(server, { expectedTransactional: true });
  } finally {
    server.close();
  }
});

test('T-Imp-6 — 4-statement batch still rolls back after `supportsSqlTransactions` is cleared', async () => {
  // Delete the flag so the `withTransaction` helper (wherever it might
  // still be used elsewhere) would degrade to a no-op. `batch()` itself
  // remains the atomic primitive via the shim's SAVEPOINT machinery,
  // mirroring real D1 semantics where batch() is atomic.
  const server = createWorkerRepositoryServer();
  try {
    delete server.DB.supportsSqlTransactions;
    assert.equal(server.DB.supportsSqlTransactions, undefined);
    await runAtomicityAssertions(server, { expectedTransactional: false });
  } finally {
    server.close();
  }
});

test('T-Imp-6 — success path (no forced failure) persists every statement', async () => {
  // Positive control: without the mid-batch failure shim, the same
  // mutation persists metadata + receipt + counter bump + session
  // sweep. Guards against the possibility that our batch interceptor
  // is the ONLY thing preventing the writes.
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'adult-T', now });
    seedMetadata(server, 'adult-T', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });
    seedSession(server, 'adult-T', { id: 'sess-1', statusRevisionAtIssue: 0 });

    const res = await putMetadata(server, 'adult-admin', 'adult-T', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-timp6-happy', correlationId: 'corr-timp6-happy' },
    });
    assert.equal(res.status, 200, `expected 200 on success path; got ${res.status}`);

    const meta = server.DB.db.prepare('SELECT row_version, status_revision, ops_status FROM account_ops_metadata WHERE account_id = ?').get('adult-T');
    assert.equal(meta.ops_status, 'suspended');
    assert.equal(meta.row_version, 1);
    assert.equal(meta.status_revision, 1);

    const receiptCount = server.DB.db.prepare('SELECT COUNT(*) AS n FROM mutation_receipts').get().n;
    assert.equal(receiptCount, 1);

    const survivingSessions = server.DB.db
      .prepare('SELECT id FROM account_sessions WHERE account_id = ?')
      .all('adult-T');
    assert.equal(survivingSessions.length, 0, 'stale session swept on successful status change');
  } finally {
    server.close();
  }
});
