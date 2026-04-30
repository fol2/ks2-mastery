// Pure read-only telemetry probe for Hero Mode pA1 operational verification.
// Returns last-N events from the event_log D1 table (system_id='hero-mode')
// with privacy re-validation. No writes, no state mutations.

import {
  PRIVACY_FORBIDDEN_FIELDS,
  stripPrivacyFields,
} from '../../../shared/hero/metrics-privacy.js';
import { deriveReadinessChecks } from './readiness.js';
import {
  deriveHeroHealthIndicators,
  deriveReconciliationGap,
  classifySpendPattern,
} from './analytics.js';

/**
 * Re-export for backwards compatibility.
 * @deprecated Use PRIVACY_FORBIDDEN_FIELDS from shared/hero/metrics-privacy.js
 */
const PRIVACY_STRIP_FIELDS = PRIVACY_FORBIDDEN_FIELDS;

/**
 * Probe hero telemetry events from the D1 event_log table.
 *
 * @param {Object} params
 * @param {Object} params.db — D1 database binding (env.DB)
 * @param {number} [params.limit=20] — max events to return (capped at 100)
 * @returns {Promise<{ events: Array, count: number, probedAt: string }>}
 */
export async function probeHeroTelemetry({ db, limit = 20, learnerId = null } = {}) {
  const probedAt = new Date().toISOString();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  if (!db) {
    return { events: [], count: 0, probedAt };
  }

  let rows;
  try {
    const query = learnerId
      ? `SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
         FROM event_log
         WHERE system_id = 'hero-mode' AND learner_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      : `SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
         FROM event_log
         WHERE system_id = 'hero-mode'
         ORDER BY created_at DESC, id DESC
         LIMIT ?`;
    const stmt = learnerId
      ? db.prepare(query).bind(learnerId, safeLimit)
      : db.prepare(query).bind(safeLimit);
    const result = await stmt.all();
    rows = result?.results || [];
  } catch {
    // Table may not exist on pre-migration deploys — return empty gracefully
    return { events: [], count: 0, probedAt };
  }

  const events = rows.map((row) => {
    let parsedData = null;
    try {
      parsedData = row.event_json ? JSON.parse(row.event_json) : null;
    } catch {
      parsedData = null;
    }

    const event = {
      id: row.id,
      learnerId: row.learner_id,
      subjectId: row.subject_id,
      systemId: row.system_id,
      eventType: row.event_type,
      data: parsedData,
      createdAt: row.created_at,
    };

    return stripPrivacyFields(event);
  });

  return { events, count: events.length, probedAt };
}

// ── Expanded probe response builder (pA2 U4) ─────────────────────────
// Composes readiness, health, reconciliation, and spend-pattern indicators
// from hero state for a specific learner. Pure function — no DB access.

/**
 * Build expanded probe response for a specific learner.
 *
 * @param {Object} params
 * @param {Object} params.probeResult — base probe result from probeHeroTelemetry
 * @param {Object|null} params.heroState — normalised hero progress state
 * @param {Object} params.resolvedFlags — env-like object with resolved Hero flags
 * @param {string} params.dateKey — current date key (YYYY-MM-DD)
 * @param {Object} params.overrideStatus — override status for the queried learner
 * @param {number|null} [params.learnerEventCount] — learner-specific event count for reconciliation
 * @returns {Object} expanded probe response (before privacy stripping)
 */
export function buildExpandedProbeResponse({
  probeResult,
  heroState,
  resolvedFlags,
  dateKey,
  overrideStatus,
  learnerEventCount,
}) {
  const safeState = heroState && typeof heroState === 'object' ? heroState : null;
  const ledger = safeState?.economy?.ledger ?? null;

  // Derive readiness checks
  const readiness = deriveReadinessChecks(safeState, resolvedFlags);

  // Derive health indicators (add raw balance for pA2 stop-condition detection)
  const health = deriveHeroHealthIndicators(safeState, ledger);
  health.balance = safeState?.economy?.balance ?? 0;

  // Derive reconciliation gap (ledger vs event_log count).
  // Use learner-specific event count when available (pA2 U4 fix),
  // falling back to system-wide probeResult.count for backwards compat.
  const reconciliation = deriveReconciliationGap(ledger, learnerEventCount ?? probeResult.count);

  // Derive spend pattern for today
  const campSpends = Array.isArray(ledger)
    ? ledger.filter(e => e && e.type === 'camp_spend')
    : [];
  const spendPattern = classifySpendPattern(
    campSpends,
    dateKey,
    safeState?.economy?.balance ?? 0,
  );

  return {
    ok: true,
    ...probeResult,
    readiness,
    health,
    reconciliation,
    spendPattern,
    overrideStatus,
  };
}

export { PRIVACY_STRIP_FIELDS, stripPrivacyFields };
