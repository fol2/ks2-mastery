/**
 * Cron scheduled handler — extracted from index.js so the Worker entry
 * point exports only the workerd-required surface: `default { fetch,
 * scheduled }` + the `LearnerLock` Durable Object class.
 *
 * All cron metric constants, telemetry helpers, and the
 * `runScheduledHandler` entrypoint live here. index.js imports and
 * delegates to `runScheduledHandler`; tests import directly from this
 * module.
 */

import { reconcileAdminKpiMetricsInternal } from '../repository.js';
import { runRetentionSweeps } from './retention-sweep.js';
import { run } from '../d1.js';

// U11: capacity-telemetry metric keys for cron success / failure.
// Surfaced on the admin dashboard; failure timestamp being ahead of the
// success timestamp triggers a warn banner.
export const CRON_METRIC_SUCCESS_COUNTER = 'capacity.cron.reconcile.success';
export const CRON_METRIC_LAST_SUCCESS_AT = 'capacity.cron.reconcile.last_success_at';
export const CRON_METRIC_LAST_FAILURE_AT = 'capacity.cron.reconcile.last_failure_at';
// H1 (Phase C reviewer): separate telemetry channel for the retention
// sweep arm. A sweep failure used to be a console.error-only path, which
// meant the admin dashboard showed the reconciliation arm green while
// `mutation_receipts` / `request_limits` overflowed silently. The
// retention-specific metric lets the banner light up on either arm.
export const CRON_METRIC_RETENTION_LAST_FAILURE_AT = 'capacity.cron.retention.last_failure_at';

async function bumpCronMetricCounter(db, key, now) {
  try {
    await run(db, `
      INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(metric_key) DO UPDATE SET
        metric_count = admin_kpi_metrics.metric_count + 1,
        updated_at = ?
    `, [key, now, now]);
  } catch (error) {
    // I5 (Phase C reviewer): distinct structured event so operators can
    // grep for "telemetry write failed" separately from "cron itself
    // failed". When this fires, the dashboard's success/failure banner
    // may lag one cycle; the next run reconciles.
    console.error('[ks2-cron]', JSON.stringify({
      event: 'cron.telemetry.write_failed',
      channel: 'counter',
      key,
      reason: error?.message || String(error),
    }));
  }
}

async function writeCronMetricTimestamp(db, key, now) {
  try {
    await run(db, `
      INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(metric_key) DO UPDATE SET
        metric_count = ?,
        updated_at = ?
    `, [key, now, now, now, now]);
  } catch (error) {
    // I5 (Phase C reviewer): same distinct structured event.
    console.error('[ks2-cron]', JSON.stringify({
      event: 'cron.telemetry.write_failed',
      channel: 'timestamp',
      key,
      reason: error?.message || String(error),
    }));
  }
}

/**
 * U11 scheduled handler.
 *
 * Runs reconciliation through the shared internal helper (bypasses HTTP);
 * if reconciliation succeeds, runs retention sweeps. Success/failure is
 * published to `admin_kpi_metrics` keyed on `capacity.cron.reconcile.*` so
 * the admin dashboard surfaces cron health without a separate query.
 * Collisions with a manual HTTP reconciliation are logged as informational
 * (not escalated to failure telemetry).
 */
const CRON_ACTOR_ACCOUNT_ID = 'ks2-cron';

async function ensureCronActorAccount(db, nowTs) {
  // `mutation_receipts.account_id` has an FK to `adult_accounts`. Cron runs
  // pre-seed a minimal system row so every reconciliation receipt resolves
  // its FK cleanly. Idempotent via `INSERT OR IGNORE`.
  //
  // C4 (Phase C reviewer fix): the cron actor is seeded with `platform_role
  // = 'ops'` — NOT `'admin'`. An `admin` cron actor counts toward the
  // `last_admin_required` invariant in `updateManagedAccountRole`, letting
  // a genuine human admin demote themselves to a non-admin role with the
  // cron row providing the "last admin" cover. `ops` is an existing role
  // with admin-hub VIEW access (see `canViewAdminHub`) but NOT
  // `canManageAccountRoles`, which exactly matches the cron's needs: the
  // reconciliation path calls `reconcileAdminKpiMetricsInternal` directly
  // and bypasses every HTTP-layer role gate; retention sweeps never touch
  // role management; the `mutation_receipts` FK only requires the
  // `adult_accounts.id` row to exist, independent of role.
  try {
    await run(db, `
      INSERT OR IGNORE INTO adult_accounts (
        id, email, display_name, platform_role, selected_learner_id,
        created_at, updated_at, repo_revision, account_type, demo_expires_at
      )
      VALUES (?, NULL, 'Cron', 'ops', NULL, ?, ?, 0, 'real', NULL)
    `, [CRON_ACTOR_ACCOUNT_ID, nowTs, nowTs]);
  } catch (error) {
    console.error('[ks2-cron] actor-account bootstrap failed', error?.message);
  }
}

export async function runScheduledHandler(event, env, ctx, {
  now = Date.now,
  uuid = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `cron-${Math.random().toString(36).slice(2)}-${Date.now()}`),
} = {}) {
  const nowTs = typeof now === 'function' ? now() : Date.now();
  const requestId = `cron-reconcile-${uuid()}`;
  const correlationId = requestId;
  const db = env?.DB;
  if (!db) {
    console.error('[ks2-cron] DB binding is missing; scheduled handler aborted');
    return { ok: false, reason: 'db_missing' };
  }

  try {
    await ensureCronActorAccount(db, nowTs);
    const reconcileResult = await reconcileAdminKpiMetricsInternal(db, {
      actorAccountId: CRON_ACTOR_ACCOUNT_ID,
      requestId,
      correlationId,
      clientComputed: null,
      nowTs,
    });
    // H1 (Phase C reviewer): a retention-sweep failure was previously
    // swallowed into console.error only while the reconcile arm still
    // marked LAST_SUCCESS_AT — the dashboard then stayed green while
    // `mutation_receipts` / `request_limits` silently overflowed.
    // Now the sweep arm has its own failure metric
    // (CRON_METRIC_RETENTION_LAST_FAILURE_AT) AND the overall success
    // gate bumps LAST_SUCCESS_AT only when BOTH arms succeed.
    let retention = null;
    let retentionError = null;
    try {
      retention = await runRetentionSweeps(db, nowTs);
    } catch (sweepError) {
      retentionError = sweepError;
      const reason = String(sweepError?.message || sweepError);
      retention = { error: reason };
      await writeCronMetricTimestamp(db, CRON_METRIC_RETENTION_LAST_FAILURE_AT, nowTs);
      console.error('[ks2-cron]', JSON.stringify({
        event: 'cron.retention.failure',
        requestId,
        nowTs,
        reason,
      }));
    }
    await bumpCronMetricCounter(db, CRON_METRIC_SUCCESS_COUNTER, nowTs);
    if (!retentionError) {
      await writeCronMetricTimestamp(db, CRON_METRIC_LAST_SUCCESS_AT, nowTs);
    }
    console.log('[ks2-cron]', JSON.stringify({
      event: retentionError ? 'cron.reconcile.partial' : 'cron.reconcile.success',
      requestId,
      nowTs,
      retention,
    }));
    return {
      ok: !retentionError,
      requestId,
      nowTs,
      reconcile: reconcileResult,
      retention,
      ...(retentionError ? { reason: `retention_sweep_failed: ${String(retentionError?.message || retentionError)}` } : {}),
    };
  } catch (error) {
    const code = typeof error?.extra?.code === 'string' ? error.extra.code : null;
    if (code === 'reconcile_in_progress') {
      // Collision with a manual HTTP reconciliation — informational only.
      console.log('[ks2-cron]', JSON.stringify({
        event: 'cron.reconcile.collision',
        requestId,
        nowTs,
        message: 'manual reconciliation in flight; cron skipped',
      }));
      return { ok: true, skipped: 'reconcile_in_progress', requestId, nowTs };
    }
    await writeCronMetricTimestamp(db, CRON_METRIC_LAST_FAILURE_AT, nowTs);
    console.error('[ks2-cron]', JSON.stringify({
      event: 'cron.reconcile.failure',
      requestId,
      nowTs,
      reason: error?.message || String(error),
    }));
    return { ok: false, requestId, nowTs, reason: error?.message || String(error) };
  }
}
