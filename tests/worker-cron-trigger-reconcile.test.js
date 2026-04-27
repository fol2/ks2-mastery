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
import workerModule from '../worker/src/index.js';
import {
  runScheduledHandler,
  CRON_METRIC_SUCCESS_COUNTER,
  CRON_METRIC_LAST_SUCCESS_AT,
  CRON_METRIC_LAST_FAILURE_AT,
} from '../worker/src/cron/scheduled.js';
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

// I-RE-3 (re-review Important): the previous version of this test used a
// "fail every prepare()" DB proxy that also caused the failure-telemetry
// write to throw — so the `CRON_METRIC_LAST_FAILURE_AT` metric never
// landed and the test was silently asserting a reason string instead of
// the invariant we actually care about ("failure telemetry is written on
// reconciliation failure"). The fix is a selective Proxy that fails ONLY
// the reconcile SELECT paths but lets telemetry writes (plain UPSERTs
// against admin_kpi_metrics) and bootstrap writes succeed.
function makeReconcileFailOnlyDb(realDb) {
  return new Proxy(realDb, {
    get(target, prop, receiver) {
      if (prop !== 'prepare') return Reflect.get(target, prop, receiver);
      return (sql) => {
        // Fail the authoritative reconcile aggregation SELECT inside
        // `recomputeReconcilableCounters` — the GROUP BY COUNT over
        // ops_error_events is the first SQL path inside the reconcile
        // body (after the lock acquisition), so this fires the
        // reconcile-failure branch reliably. Telemetry writes go
        // through plain INSERT INTO admin_kpi_metrics ... ON CONFLICT
        // statements and are NOT matched by this regex, so they
        // succeed and land in the D1 shim.
        if (/SELECT\s+status,\s+COUNT\(\*\)[\s\S]+FROM\s+ops_error_events/i.test(sql)) {
          throw new Error('synthetic reconcile SELECT failure');
        }
        return target.prepare(sql);
      };
    },
  });
}

test('U11 scheduled handler writes failure telemetry when reconciliation SELECT throws', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    seedAdultAccount(db, { id: 'adult-admin', platformRole: 'admin' });
    const nowTs = 1_700_000_000_000;
    const envDb = makeReconcileFailOnlyDb(db);
    const env = { DB: envDb };
    const result = await runScheduledHandler({}, env, {}, { now: () => nowTs });
    assert.equal(result.ok, false, 'reconcile failure surfaces as ok=false');
    assert.match(String(result.reason || ''), /synthetic reconcile SELECT failure/);

    // The core invariant the old test missed: CRON_METRIC_LAST_FAILURE_AT
    // was written. Before the selective-proxy fix, the fail-every-prepare
    // proxy also broke `writeCronMetricTimestamp`, so the failure timestamp
    // never landed and this assertion would silently fail.
    const failureRow = metric(db, CRON_METRIC_LAST_FAILURE_AT);
    assert.ok(failureRow, 'CRON_METRIC_LAST_FAILURE_AT metric must land on reconcile failure');
    assert.equal(Number(failureRow.metric_count), nowTs);

    // And LAST_SUCCESS_AT must NOT be written — the reconcile arm failed.
    assert.equal(metric(db, CRON_METRIC_LAST_SUCCESS_AT), null, 'LAST_SUCCESS_AT must not land on reconcile failure');
  } finally {
    db.close();
  }
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

// ---------------------------------------------------------------------------
// C4 (Phase C reviewer): ks2-cron actor row is seeded as `platform_role =
// 'ops'`, NOT 'admin'. If the cron actor were an admin, a genuine human
// admin could demote themselves to a non-admin role because the
// `last_admin_required` guard in `updateManagedAccountRole` would treat
// ks2-cron as the remaining admin. The cron never needs role-manager
// privileges: reconciliation goes through the internal helper (bypasses
// every HTTP role gate) and retention sweeps never touch role management.
// ---------------------------------------------------------------------------
test('C4 ks2-cron actor row is seeded with platform_role=ops (not admin)', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    const env = { DB: db };
    const nowTs = 1_700_000_000_000;
    await runScheduledHandler({}, env, {}, { now: () => nowTs });
    const row = db.db.prepare(
      'SELECT id, platform_role FROM adult_accounts WHERE id = ?',
    ).get('ks2-cron');
    assert.ok(row, 'ks2-cron row was seeded');
    assert.equal(row.platform_role, 'ops');
  } finally {
    db.close();
  }
});

test('C4 ks2-cron actor bootstrap is idempotent — second run leaves role and row count intact', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    const env = { DB: db };
    const nowTs = 1_700_000_000_000;
    await runScheduledHandler({}, env, {}, { now: () => nowTs });
    await runScheduledHandler({}, env, {}, { now: () => nowTs + 60_000 });
    const rows = db.db.prepare(
      'SELECT platform_role FROM adult_accounts WHERE id = ?',
    ).all('ks2-cron');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].platform_role, 'ops');
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// I9 plan-scenario coverage — cron retention orchestration + failure
// telemetry paths (Phase C reviewer — test coverage gaps).
// ---------------------------------------------------------------------------

test('I9 retention orchestration — stale rows in three swept tables are purged by one scheduled run', async () => {
  const db = createMigratedSqliteD1Database();
  try {
    const nowTs = 1_700_000_000_000;
    const MS_IN_DAY = 24 * 60 * 60 * 1000;
    // Seed admin + stale data in each table.
    db.db.prepare(`
      INSERT INTO adult_accounts (
        id, email, display_name, platform_role, selected_learner_id,
        created_at, updated_at, repo_revision, account_type, demo_expires_at
      ) VALUES ('adult-admin', NULL, NULL, 'admin', NULL, 1, 1, 0, 'real', NULL)
    `).run();
    db.db.prepare(`
      INSERT INTO account_ops_metadata (
        account_id, ops_status, plan_label, tags_json, internal_notes,
        updated_at, updated_by_account_id, row_version, status_revision
      ) VALUES ('adult-admin', 'active', NULL, '[]', NULL, 1, NULL, 0, 5)
    `).run();
    // Stale non-admin mutation_receipt at 31 days (older than 30-day window).
    db.db.prepare(`
      INSERT INTO mutation_receipts (
        account_id, request_id, scope_type, scope_id, mutation_kind,
        request_hash, response_json, status_code, correlation_id, applied_at
      ) VALUES ('adult-admin', 'req-old', 'learner', 'adult-admin', 'parent.learner.update',
                'hash-x', '{}', 200, 'corr-x', ?)
    `).run(nowTs - 31 * MS_IN_DAY);
    // Stale request_limits entry (updated_at older than 24h).
    db.db.prepare(`
      INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
      VALUES ('old-bucket', ?, 0, ?)
    `).run(nowTs - 1000, nowTs - 25 * 60 * 60 * 1000);
    // Stale account_sessions row (expired + status_revision_at_issue=2 < current=5).
    db.db.prepare(`
      INSERT INTO account_sessions (
        id, account_id, session_hash, provider, created_at, expires_at,
        session_kind, status_revision_at_issue
      ) VALUES ('sess-stale', 'adult-admin', 'hash-s', 'local', 1, ?, 'real', 2)
    `).run(nowTs - 1000);

    const env = { DB: db };
    const result = await runScheduledHandler({}, env, {}, { now: () => nowTs });
    assert.equal(result.ok, true);
    assert.ok(result.retention, 'retention block present on result');
    assert.ok(result.retention.totalDeleted >= 3, 'at least 3 rows deleted across three tables');

    // Rows gone.
    assert.equal(db.db.prepare('SELECT COUNT(*) AS c FROM mutation_receipts WHERE request_id = ?').get('req-old').c, 0);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS c FROM request_limits WHERE limiter_key = ?').get('old-bucket').c, 0);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS c FROM account_sessions WHERE id = ?').get('sess-stale').c, 0);
  } finally {
    db.close();
  }
});

test('H1 retention failure — sweep throws but reconcile succeeds; RETENTION_LAST_FAILURE_AT is written and LAST_SUCCESS_AT is NOT', async () => {
  // Synthesise a DB wrapper that lets the reconcile arm succeed but makes
  // any retention DELETE throw. Verifies the H1 gating: LAST_SUCCESS_AT is
  // only written when BOTH arms succeed; the retention-specific failure
  // timestamp captures the sweep failure independently.
  const db = createMigratedSqliteD1Database();
  try {
    const nowTs = 1_700_000_000_000;
    db.db.prepare(`
      INSERT INTO adult_accounts (
        id, email, display_name, platform_role, selected_learner_id,
        created_at, updated_at, repo_revision, account_type, demo_expires_at
      ) VALUES ('adult-admin', NULL, NULL, 'admin', NULL, 1, 1, 0, 'real', NULL)
    `).run();

    // Wrap the DB so the first retention-DELETE throws. The prepare() wrap
    // is narrow — it only intercepts DELETE FROM mutation_receipts and
    // throws a synthetic error from the .run() invocation.
    const envDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'prepare') {
          return (sql) => {
            if (/^\s*DELETE FROM mutation_receipts/i.test(sql)) {
              return {
                bind() { return this; },
                async run() { throw new Error('synthetic retention sweep failure'); },
                async first() { return null; },
                async all() { return { results: [], meta: {} }; },
              };
            }
            return target.prepare(sql);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const env = { DB: envDb };
    const result = await runScheduledHandler({}, env, {}, { now: () => nowTs });
    // Reconcile succeeded → result.reconcile present; retention reports error.
    assert.ok(result.reconcile, 'reconcile arm completed');
    assert.ok(result.retention && typeof result.retention.error === 'string', 'retention reports error');
    assert.match(result.retention.error, /synthetic retention sweep failure/);
    assert.equal(result.ok, false, 'overall ok is false when retention fails (H1 gate)');

    // LAST_SUCCESS_AT is NOT written (H1 gate — only both arms succeeding advances it).
    const lastSuccess = db.db.prepare(`
      SELECT metric_count FROM admin_kpi_metrics WHERE metric_key = ?
    `).get(CRON_METRIC_LAST_SUCCESS_AT);
    assert.equal(lastSuccess, undefined, 'LAST_SUCCESS_AT not bumped on retention failure');

    // RETENTION_LAST_FAILURE_AT was written to mark the sweep failure.
    const retentionFailureRow = db.db.prepare(`
      SELECT metric_count FROM admin_kpi_metrics WHERE metric_key = ?
    `).get('capacity.cron.retention.last_failure_at');
    assert.ok(retentionFailureRow, 'RETENTION_LAST_FAILURE_AT metric is written');
    assert.equal(Number(retentionFailureRow.metric_count), nowTs);
  } finally {
    db.close();
  }
});
