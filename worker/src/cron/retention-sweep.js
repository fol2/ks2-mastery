// P1.5 Phase C (U11): retention sweeps driven by the daily cron. Each
// helper returns a plain `{ deleted }` object so the scheduled handler
// can aggregate, log, and surface per-sweep totals.
//
// Time constants live in this file so they are explicit at the grep level
// and cron + HTTP debug paths read from the same place.

import { run } from '../d1.js';

export const MUTATION_RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const REQUEST_LIMITS_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const REQUEST_LIMITS_MAX_DELETE_BATCH = 5000;

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
 * Prune stale mutation receipts (R23: retention ~30 days). CAS-retry storms
 * can grow `mutation_receipts` unbounded without this sweep.
 */
export async function sweepMutationReceipts(db, now = Date.now()) {
  const cutoff = Math.max(0, Number(now) || 0) - MUTATION_RECEIPT_RETENTION_MS;
  try {
    const result = await run(db, `
      DELETE FROM mutation_receipts WHERE applied_at < ?
    `, [cutoff]);
    return { deleted: Math.max(0, Number(result?.meta?.changes) || 0) };
  } catch (error) {
    return swallowMissingTable(error, 'mutation_receipts');
  }
}

/**
 * Prune long-idle rate-limit buckets. Phase B's opportunistic 1% sweep
 * leaves long-tail rows behind; the deterministic bounded-batch delete
 * here closes that tail without risking an unbounded DELETE.
 */
export async function sweepRequestLimits(db, now = Date.now()) {
  const cutoff = Math.max(0, Number(now) || 0) - REQUEST_LIMITS_RETENTION_MS;
  try {
    const result = await run(db, `
      DELETE FROM request_limits
      WHERE window_started_at < ?
        AND rowid IN (
          SELECT rowid FROM request_limits
          WHERE window_started_at < ?
          LIMIT ?
        )
    `, [cutoff, cutoff, REQUEST_LIMITS_MAX_DELETE_BATCH]);
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
 */
export async function sweepStaleSessions(db, now = Date.now()) {
  const nowTs = Math.max(0, Number(now) || 0);
  try {
    const result = await run(db, `
      DELETE FROM account_sessions
      WHERE expires_at < ?
        AND account_id IN (
          SELECT account_id FROM account_ops_metadata
        )
        AND status_revision_at_issue < (
          SELECT status_revision FROM account_ops_metadata aom
          WHERE aom.account_id = account_sessions.account_id
        )
    `, [nowTs]);
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
