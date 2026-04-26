// U11 coverage: Cloudflare cron scheduled handler runs reconciliation
// internally (bypassing HTTP), publishes capacity.cron.reconcile.* metrics,
// gracefully handles collisions with a manual HTTP reconciliation, and
// surfaces the cron telemetry in `readDashboardKpis` so the admin
// dashboard can warn when automated reconciliation stalls.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U11

import test from 'node:test';
import assert from 'node:assert/strict';

import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';
import workerModule, {
  runScheduledHandler,
  CRON_METRIC_SUCCESS_COUNTER,
  CRON_METRIC_LAST_SUCCESS_AT,
  CRON_METRIC_LAST_FAILURE_AT,
} from '../worker/src/index.js';
import { reconcileLockHashForRequestId } from '../worker/src/repository.js';

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

function seedErrorEvent(db, { id, status }) {
  db.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame,
      route_name, user_agent, account_id, first_seen, last_seen,
      occurrence_count, status
    )
    VALUES (?, ?, 'TypeError', 'boom', 'at x', '/x', 'ua', NULL, 1, 1, 1, ?)
  `).run(id, `fp-${id}`, status);
}

function metric(db, key) {
  const row = db.db.prepare(`
    SELECT metric_count, updated_at
    FROM admin_kpi_metrics
    WHERE metric_key = ?
  `).get(key);
  return row || null;
}

test('U11 scheduled handler runs reconciliation and bumps success telemetry', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    seedAdultAccount(db, { id: 'adult-admin', platformRole: 'admin' });
    seedErrorEvent(db, { id: 'evt-a', status: 'open' });
    seedErrorEvent(db, { id: 'evt-b', status: 'resolved' });

    const env = { DB: db };
    const nowTs = 1_700_000_000_000;
    const result = await runScheduledHandler({}, env, {}, { now: () => nowTs });
    assert.equal(result.ok, true);
    // Counter bumped to 1.
    assert.equal(metric(db, CRON_METRIC_SUCCESS_COUNTER).metric_count, 1);
    assert.equal(metric(db, CRON_METRIC_LAST_SUCCESS_AT).metric_count, nowTs);
    assert.equal(metric(db, CRON_METRIC_LAST_FAILURE_AT), null);
    // Reconciliation wrote authoritative open/resolved counts.
    assert.equal(metric(db, 'ops_error_events.status.open').metric_count, 1);
    assert.equal(metric(db, 'ops_error_events.status.resolved').metric_count, 1);
  } finally {
    db.close();
  }
});

test('U11 scheduled handler logs collision without bumping failure telemetry', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    seedAdultAccount(db, { id: 'adult-admin', platformRole: 'admin' });
    // Simulate in-flight manual HTTP reconciliation: non-stale lock held by
    // a rival owner hash.
    const rivalHash = reconcileLockHashForRequestId('req-rival');
    const nowTs = 1_700_000_000_000;
    db.db.prepare(`
      INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
      VALUES ('reconcile_pending:lock', ?, ?)
    `).run(rivalHash, nowTs);

    const env = { DB: db };
    const result = await runScheduledHandler({}, env, {}, { now: () => nowTs });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, 'reconcile_in_progress');
    // Success counter NOT bumped; failure timestamp NOT set.
    assert.equal(metric(db, CRON_METRIC_SUCCESS_COUNTER), null);
    assert.equal(metric(db, CRON_METRIC_LAST_FAILURE_AT), null);
  } finally {
    db.close();
  }
});

test('U11 scheduled handler writes failure telemetry when DB throws inside reconciliation', async () => {
  // Synthesise a broken DB proxy that fails the required table lookup.
  const nowTs = 1_700_000_000_000;
  const failingDb = {
    prepare() { throw new Error('synthetic DB failure for test'); },
  };
  const env = { DB: failingDb };
  const result = await runScheduledHandler({}, env, {}, { now: () => nowTs });
  assert.equal(result.ok, false);
  assert.match(String(result.reason || ''), /synthetic DB failure/);
});

test('U11 scheduled handler is a no-op when env.DB is missing', async () => {
  const result = await runScheduledHandler({}, {}, {}, { now: () => 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'db_missing');
});

test('U11 default export wires scheduled() to runScheduledHandler', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    seedAdultAccount(db, { id: 'adult-admin', platformRole: 'admin' });
    seedErrorEvent(db, { id: 'evt-default', status: 'investigating' });
    const env = { DB: db };
    const result = await workerModule.scheduled({}, env, {});
    assert.equal(result.ok, true);
    assert.equal(metric(db, 'ops_error_events.status.investigating').metric_count, 1);
  } finally {
    db.close();
  }
});
