// P1.5 Phase A (U2): admin-ops mutation-success cascade.
//
// A successful admin-ops mutation (account metadata save, error-event status
// transition) invalidates more than just its own panel — KPI counters move,
// activity-stream gets a new mutation receipt, and error-event totals may
// shift. The cascade fires the relevant narrow refreshes sequentially and
// fail-fast: if an earlier step fails, later steps are suppressed so the
// U1 banner on the first broken step is the signal the user sees.
//
// Extracted from main.js as a pure module so we can test it against
// mocked refresh functions without booting the app controller. main.js
// wires its real `refreshAdminOpsKpi` / `refreshAdminOpsActivity` /
// `refreshAdminOpsErrorEvents` into it.

/**
 * Run the admin-ops mutation-success cascade.
 *
 * @param {object} refreshers
 * @param {() => Promise<{ ok: boolean, reason?: string }>} refreshers.refreshKpi
 * @param {() => Promise<{ ok: boolean, reason?: string }>} refreshers.refreshActivity
 * @param {() => Promise<{ ok: boolean, reason?: string }>} [refreshers.refreshErrorEvents]
 * @param {object} [options]
 * @param {boolean} [options.includeErrorEvents=false]
 *   When true the cascade runs `refreshErrorEvents` before KPI + activity —
 *   used by the error-event status transition path so the totals chips
 *   update before the KPI counters re-read.
 * @returns {Promise<{ ok: boolean, stopped?: string, error?: any }>}
 */
export async function runAdminOpsRefreshCascade(refreshers, { includeErrorEvents = false } = {}) {
  if (includeErrorEvents && typeof refreshers.refreshErrorEvents === 'function') {
    const result = await refreshers.refreshErrorEvents();
    if (!result.ok && result.reason === 'error') {
      return { ok: false, stopped: 'errorEvents', error: result.error || null };
    }
  }
  const kpi = await refreshers.refreshKpi();
  if (!kpi.ok && kpi.reason === 'error') {
    return { ok: false, stopped: 'kpi', error: kpi.error || null };
  }
  const activity = await refreshers.refreshActivity();
  if (!activity.ok && activity.reason === 'error') {
    return { ok: false, stopped: 'activity', error: activity.error || null };
  }
  return { ok: true };
}
