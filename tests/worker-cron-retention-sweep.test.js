// U11 coverage: retention sweeps (mutation_receipts, request_limits,
// account_sessions) invoked by the scheduled cron handler.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U11

import test from 'node:test';
import assert from 'node:assert/strict';

import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';
import {
  MUTATION_RECEIPT_RETENTION_MS,
  REQUEST_LIMITS_RETENTION_MS,
  sweepMutationReceipts,
  sweepRequestLimits,
  sweepStaleSessions,
  runRetentionSweeps,
} from '../worker/src/cron/retention-sweep.js';

function seedAdultAccount(db, {
  id,
  platformRole = 'parent',
  accountType = 'real',
  now = 1,
} = {}) {
  db.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, NULL, NULL, ?, NULL, ?, ?, 0, ?, NULL)
  `).run(id, platformRole, now, now, accountType);
}

function seedOpsMetadata(db, { accountId, now = 1, statusRevision = 0 }) {
  db.db.prepare(`
    INSERT INTO account_ops_metadata (
      account_id, ops_status, plan_label, tags_json, internal_notes,
      updated_at, updated_by_account_id, row_version, status_revision
    )
    VALUES (?, 'active', NULL, '[]', NULL, ?, NULL, 0, ?)
  `).run(accountId, now, statusRevision);
}

function seedSession(db, { id, accountId, expiresAt, revisionAtIssue = 0 }) {
  db.db.prepare(`
    INSERT INTO account_sessions (
      id, account_id, session_hash, provider, created_at, expires_at,
      session_kind, status_revision_at_issue
    )
    VALUES (?, ?, ?, 'local', 1, ?, 'real', ?)
  `).run(id, accountId, `hash-${id}`, expiresAt, revisionAtIssue);
}

function seedMutationReceipt(db, { requestId, appliedAt }) {
  // mutation_receipts rows require an adult_accounts row (FK CASCADE). Seed
  // the admin once so every seeded receipt can reference it.
  db.db.prepare(`
    INSERT OR IGNORE INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    ) VALUES ('adult-admin', NULL, NULL, 'admin', NULL, 1, 1, 0, 'real', NULL)
  `).run();
  db.db.prepare(`
    INSERT INTO mutation_receipts (
      account_id, request_id, scope_type, scope_id, mutation_kind,
      request_hash, response_json, status_code, correlation_id, applied_at
    )
    VALUES ('adult-admin', ?, 'platform', 'scope', 'admin.ops.reconcile_kpis',
            'hash-x', '{}', 200, 'corr-x', ?)
  `).run(requestId, appliedAt);
}

function seedRequestLimit(db, { limiterKey, windowStartedAt }) {
  db.db.prepare(`
    INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
    VALUES (?, ?, 0, ?)
  `).run(limiterKey, windowStartedAt, windowStartedAt);
}

function rowCount(db, sql, params = []) {
  return Number(db.db.prepare(sql).get(...params)?.count || 0);
}

test('U11 sweepMutationReceipts deletes rows older than the 30-day retention window', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    const now = 1_700_000_000_000;
    seedMutationReceipt(db, { requestId: 'req-old', appliedAt: now - MUTATION_RECEIPT_RETENTION_MS - 1 });
    seedMutationReceipt(db, { requestId: 'req-edge', appliedAt: now - MUTATION_RECEIPT_RETENTION_MS });
    seedMutationReceipt(db, { requestId: 'req-fresh', appliedAt: now - 1000 });

    const result = await sweepMutationReceipts(db, now);
    assert.equal(result.deleted, 1);
    const remaining = rowCount(db, 'SELECT COUNT(*) AS count FROM mutation_receipts');
    assert.equal(remaining, 2);
    const oldStillHere = rowCount(db, "SELECT COUNT(*) AS count FROM mutation_receipts WHERE request_id='req-old'");
    assert.equal(oldStillHere, 0);
  } finally {
    db.close();
  }
});

test('U11 sweepRequestLimits deletes buckets older than 24h and obeys the batch cap', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    const now = 1_700_000_000_000;
    seedRequestLimit(db, { limiterKey: 'old-a', windowStartedAt: now - REQUEST_LIMITS_RETENTION_MS - 1 });
    seedRequestLimit(db, { limiterKey: 'old-b', windowStartedAt: now - REQUEST_LIMITS_RETENTION_MS - 100_000 });
    seedRequestLimit(db, { limiterKey: 'fresh', windowStartedAt: now - 1000 });

    const result = await sweepRequestLimits(db, now);
    assert.equal(result.deleted, 2);
    const freshRemaining = rowCount(db, "SELECT COUNT(*) AS count FROM request_limits WHERE limiter_key='fresh'");
    assert.equal(freshRemaining, 1);
  } finally {
    db.close();
  }
});

test('U11 sweepStaleSessions removes expired sessions whose revision is below current', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    const now = 1_700_000_000_000;
    seedAdultAccount(db, { id: 'adult-a', now });
    seedOpsMetadata(db, { accountId: 'adult-a', now, statusRevision: 5 });
    // Stale: revisionAtIssue=2 < current=5, and expiresAt is in the past.
    seedSession(db, { id: 'sess-stale', accountId: 'adult-a', expiresAt: now - 1000, revisionAtIssue: 2 });
    // Stale but NOT expired — protected so we do not race an in-flight
    // request whose session revision was bumped server-side.
    seedSession(db, { id: 'sess-stale-live', accountId: 'adult-a', expiresAt: now + 1_000_000, revisionAtIssue: 2 });
    // Current revision — stays.
    seedSession(db, { id: 'sess-fresh', accountId: 'adult-a', expiresAt: now + 1_000_000, revisionAtIssue: 5 });

    const result = await sweepStaleSessions(db, now);
    assert.equal(result.deleted, 1);
    const remaining = db.db.prepare('SELECT id FROM account_sessions ORDER BY id ASC').all().map((row) => row.id);
    assert.deepEqual(remaining.sort(), ['sess-fresh', 'sess-stale-live']);
  } finally {
    db.close();
  }
});

test('U11 runRetentionSweeps aggregates per-sweep deletion counts', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    const now = 1_700_000_000_000;
    seedAdultAccount(db, { id: 'adult-a', now });
    seedOpsMetadata(db, { accountId: 'adult-a', now, statusRevision: 3 });
    seedMutationReceipt(db, { requestId: 'req-old', appliedAt: now - MUTATION_RECEIPT_RETENTION_MS - 1 });
    seedRequestLimit(db, { limiterKey: 'old', windowStartedAt: now - REQUEST_LIMITS_RETENTION_MS - 1 });
    seedSession(db, { id: 'sess-stale', accountId: 'adult-a', expiresAt: now - 1, revisionAtIssue: 0 });

    const result = await runRetentionSweeps(db, now);
    assert.equal(result.totalDeleted, 3);
    const byName = Object.create(null);
    for (const entry of result.completed) byName[entry.sweep] = entry.deleted;
    assert.equal(byName.mutation_receipts, 1);
    assert.equal(byName.request_limits, 1);
    assert.equal(byName.account_sessions, 1);
  } finally {
    db.close();
  }
});
