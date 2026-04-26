import { createWorkerApp } from './app.js';
import { json } from './http.js';
import { applySecurityHeaders } from './security-headers.js';
import { reconcileAdminKpiMetricsInternal } from './repository.js';
import { runRetentionSweeps } from './cron/retention-sweep.js';
import { run } from './d1.js';

/**
 * Apply the security wrapper defensively. If `wrap` (by default
 * `applySecurityHeaders`) throws, return the underlying response unchanged
 * so the Worker never emits a 1101 just because header composition failed.
 *
 * Exported so tests can drive the throw path with a stubbed wrapper
 * (review reliability-1).
 *
 * @param {Response} response
 * @param {{ path?: string }} options
 * @param {(response: Response, options: { path?: string }) => Response} [wrap]
 * @returns {Response}
 */
export function applySecurityHeadersSafely(response, options, wrap = applySecurityHeaders) {
  try {
    return wrap(response, options);
  } catch (error) {
    console.error('[ks2-security-headers] wrapper failed', error?.message);
    return response;
  }
}

export class LearnerLock {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ ok: true, durableObject: 'LearnerLock' });
    }
    return json({
      ok: false,
      status: 'not_implemented',
      message: 'LearnerLock remains a future coordination hook for per-learner mutation serialisation.',
    }, 501);
  }
}

const app = createWorkerApp();

// U11: capacity-telemetry metric keys for cron success / failure.
// Surfaced on the admin dashboard; failure timestamp being ahead of the
// success timestamp triggers a warn banner.
export const CRON_METRIC_SUCCESS_COUNTER = 'capacity.cron.reconcile.success';
export const CRON_METRIC_LAST_SUCCESS_AT = 'capacity.cron.reconcile.last_success_at';
export const CRON_METRIC_LAST_FAILURE_AT = 'capacity.cron.reconcile.last_failure_at';

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
    console.error('[ks2-cron] metric counter write failed', error?.message);
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
    console.error('[ks2-cron] metric timestamp write failed', error?.message);
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
    // Retention sweeps are defence-in-depth; do not abort telemetry if
    // they throw mid-stream — log and continue marking reconciliation
    // itself as a success.
    let retention = null;
    try {
      retention = await runRetentionSweeps(db, nowTs);
    } catch (sweepError) {
      console.error('[ks2-cron] retention sweep failed', sweepError?.message);
      retention = { error: String(sweepError?.message || sweepError) };
    }
    await bumpCronMetricCounter(db, CRON_METRIC_SUCCESS_COUNTER, nowTs);
    await writeCronMetricTimestamp(db, CRON_METRIC_LAST_SUCCESS_AT, nowTs);
    console.log('[ks2-cron]', JSON.stringify({
      event: 'cron.reconcile.success',
      requestId,
      nowTs,
      retention,
    }));
    return { ok: true, requestId, nowTs, reconcile: reconcileResult, retention };
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

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    // U6: single wrap site per plan KTD F-01. Every Worker-generated
    // response (JSON, 302 redirect, 404 plaintext, TTS binary, ASSETS
    // pass-through) flows through applySecurityHeaders here. Do NOT add a
    // second wrap inside http.js::json() — that would double-set headers
    // and make the single-source-of-truth guarantee harder to reason about.
    //
    // Reliability (review reliability-1): if applySecurityHeaders itself
    // throws (unexpected non-Response input, malformed headers bag), we
    // prefer to surface the underlying response than emit a Worker 1101.
    // Availability beats header strictness at the edge.
    const { pathname } = new URL(request.url);
    return applySecurityHeadersSafely(response, { path: pathname });
  },

  /**
   * Cloudflare Cron Trigger entrypoint. Fires per `wrangler.jsonc`
   * `[triggers] crons` entries — daily primary + fallback retry one hour
   * later so a crashed/locked primary recovers without waiting 24h.
   */
  async scheduled(event, env, ctx) {
    return runScheduledHandler(event, env, ctx);
  },
};
