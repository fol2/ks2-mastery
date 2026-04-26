// P1.5 Phase C (U11): retention sweeps driven by the daily cron. Each
// helper returns a plain `{ deleted }` object so the scheduled handler
// can aggregate, log, and surface per-sweep totals.
//
// Time constants live in this file so they are explicit at the grep level
// and cron + HTTP debug paths read from the same place.
//
// H1 (Phase C reviewer): every sweep is bounded by the same 5000-row cap.
// An unbounded DELETE on a table with millions of stale rows can choke
// the D1 request, produce multi-second lock contention with live traffic,
// and exhaust Worker CPU budget. The bounded sweep trims at most 5000
// rows per run; the cron fires daily with a fallback retry so a long
// backlog drains within a bounded number of cron cycles.

import { run } from '../d1.js';

// H1 (Phase C reviewer): admin.* receipts are retained 12× longer than
// generic writes because R23 pins the admin audit trail at 365 days.
// Non-admin receipts follow the original 30-day window.
export const MUTATION_RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// I7 (Phase C reviewer): admin-audit retention — 12 months.
export const ADMIN_MUTATION_RECEIPT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 365 days
export const MUTATION_RECEIPT_MAX_DELETE_BATCH = 5000;
export const REQUEST_LIMITS_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const REQUEST_LIMITS_MAX_DELETE_BATCH = 5000;
export const ACCOUNT_SESSIONS_MAX_DELETE_BATCH = 5000;

// Private copy of the repository's `isMissingTableError` so partial-deploy
// soft-fail stays local to the cron module (no new export surface).
function isMissingTableError(error, tableName) {
  const message = String(error?.message || '');
  return new RegExp(`no such table:\\s*${tableName}\\b`, 'i').test(message);
}

function swallowMissingTable(error, table) {
  if (isMissingTableError(error, table)) return { deleted: 0 };
  throw error;
}

/**
 * Prune stale mutation receipts (R23). Retention is split by kind:
 *   - `admin.*` mutation_kind rows: 365-day audit window.
 *   - Everything else: 30-day retention.
 * CAS-retry storms can grow `mutation_receipts` unbounded without this
 * sweep; H1 (Phase C) caps each run at 5000 rows so a long backlog
 * drains across a bounded number of cron cycles without ever issuing an
 * unbounded DELETE.
 */
export async function sweepMutationReceipts(db, now = Date.now()) {
  const nowTs = Math.max(0, Number(now) || 0);
  const nonAdminCutoff = nowTs - MUTATION_RECEIPT_RETENTION_MS;
  const adminCutoff = nowTs - ADMIN_MUTATION_RECEIPT_RETENTION_MS;
  try {
    const result = await run(db, `
      DELETE FROM mutation_receipts
      WHERE rowid IN (
        SELECT rowid FROM mutation_receipts
        WHERE (mutation_kind LIKE 'admin.%' AND applied_at < ?)
           OR (mutation_kind NOT LIKE 'admin.%' AND applied_at < ?)
        LIMIT ?
      )
    `, [adminCutoff, nonAdminCutoff, MUTATION_RECEIPT_MAX_DELETE_BATCH]);
    return { deleted: Math.max(0, Number(result?.meta?.changes) || 0) };
  } catch (error) {
    return swallowMissingTable(error, 'mutation_receipts');
  }
}

/**
 * Prune long-idle rate-limit buckets. Phase B's opportunistic 1% sweep
 * leaves long-tail rows behind; the deterministic bounded-batch delete
 * here closes that tail without risking an unbounded DELETE.
 *
 * I2 (Phase C reviewer): the predicate now filters on `updated_at` (the
 * last-use timestamp) rather than `window_started_at` (the window-start
 * timestamp). `idx_request_limits_updated` covers `updated_at` so the
 * bounded sub-select runs as an index scan rather than a full-table
 * scan. The semantic change is also safer — a bucket whose window
 * reset recently but was last written long ago is no longer
 * re-generation-churned by the sweep.
 */
export async function sweepRequestLimits(db, now = Date.now()) {
  const cutoff = Math.max(0, Number(now) || 0) - REQUEST_LIMITS_RETENTION_MS;
  try {
    const result = await run(db, `
      DELETE FROM request_limits
      WHERE rowid IN (
        SELECT rowid FROM request_limits
        WHERE updated_at < ?
        LIMIT ?
      )
    `, [cutoff, REQUEST_LIMITS_MAX_DELETE_BATCH]);
    return { deleted: Math.max(0, Number(result?.meta?.changes) || 0) };
  } catch (error) {
    return swallowMissingTable(error, 'request_limits');
  }
}

/**
 * Prune sessions orphaned by a `status_revision` bump. A session rendered
 * stale by revision-bump becomes unreachable in Phase D's require-session
 * compare, but unexpired rows linger until this sweep removes them. The
 * cron runs it as defence-in-depth for the U15 immediate-sweep path.
 *
 * Sessions are only deleted when BOTH conditions hold:
 *   - the session's `status_revision_at_issue` is below the account's
 *     current `status_revision` (so the session is server-invalidated);
 *   - `expires_at` is in the past (so pruning cannot race an in-flight
 *     request from that session).
 *
 * I4 (Phase C reviewer): the per-row correlated subquery was rewritten
 * as a bounded JOIN with a LIMIT 5000 inside the rowid selection so the
 * planner can use the `account_sessions(account_id)` index and so a
 * large backlog drains across multiple cron cycles instead of choking
 * the D1 request in a single unbounded DELETE.
 */
export async function sweepStaleSessions(db, now = Date.now()) {
  const nowTs = Math.max(0, Number(now) || 0);
  try {
    const result = await run(db, `
      DELETE FROM account_sessions
      WHERE rowid IN (
        SELECT s.rowid FROM account_sessions s
        JOIN account_ops_metadata aom ON aom.account_id = s.account_id
        WHERE s.expires_at < ?
          AND s.status_revision_at_issue < aom.status_revision
        LIMIT ?
      )
    `, [nowTs, ACCOUNT_SESSIONS_MAX_DELETE_BATCH]);
    return { deleted: Math.max(0, Number(result?.meta?.changes) || 0) };
  } catch (error) {
    // Either `account_sessions` or `account_ops_metadata` may be missing
    // on a partial deploy — soft-fail so the cron keeps the remainder.
    if (isMissingTableError(error, 'account_sessions')) return { deleted: 0 };
    if (isMissingTableError(error, 'account_ops_metadata')) return { deleted: 0 };
    throw error;
  }
}

/**
 * Run all three sweeps sequentially and return an aggregated summary.
 * A sweep failure aborts the remainder so the failure surfaces in the
 * cron's error telemetry; partial successes are reported via the
 * `completed` array.
 */
export async function runRetentionSweeps(db, now = Date.now()) {
  const completed = [];
  const mutation = await sweepMutationReceipts(db, now);
  completed.push({ sweep: 'mutation_receipts', ...mutation });
  const requestLimits = await sweepRequestLimits(db, now);
  completed.push({ sweep: 'request_limits', ...requestLimits });
  const sessions = await sweepStaleSessions(db, now);
  completed.push({ sweep: 'account_sessions', ...sessions });
  return {
    completed,
    totalDeleted: completed.reduce((sum, entry) => sum + entry.deleted, 0),
  };
}
