'use strict';

// ── Hero Analytics — economy/camp reconciliation utilities (P6 U6+U8) ─
// Pure functions. No database access, no React, no Worker globals.

// ── Balance Bucket Classification ─────────────────────────────────────

/**
 * Classify a coin balance into a named bucket for telemetry aggregation.
 * Boundaries: 0, 1-99, 100-299, 300-599, 600-999, 1000+
 * @param {number} balance
 * @returns {string}
 */
export function classifyBalanceBucket(balance) {
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return '0';
  if (balance <= 0) return '0';
  if (balance < 100) return '1-99';
  if (balance < 300) return '100-299';
  if (balance < 600) return '300-599';
  if (balance < 1000) return '600-999';
  return '1000+';
}

// ── Hero Health Indicators ────────────────────────────────────────────

/**
 * Derive health indicators from hero state and ledger for admin telemetry.
 * Pure function — inspects state only, no writes.
 * @param {Object|null} heroState
 * @param {Array|null} ledger
 * @returns {{ duplicateAwardPreventedCount: number, staleWriteCount: number, balanceBucket: string, ledgerEntryCount: number, fullyGrownMonsterCount: number, monsterDistribution: Object }}
 */
export function deriveHeroHealthIndicators(heroState, ledger) {
  const safeLedger = Array.isArray(ledger) ? ledger : [];
  const safeState = heroState && typeof heroState === 'object' ? heroState : {};

  const balance = safeState.economy?.balance ?? 0;
  const monsters = safeState.heroPool?.monsters ?? {};

  // Ledger-derived counts
  const duplicateAwardPreventedCount = safeLedger.filter(e => e && e.deduplicated).length;
  const staleWriteCount = safeLedger.filter(e => e && e.staleWrite).length;

  // Monster distribution: only owned monsters, mapped to stage
  const monsterDistribution = {};
  let fullyGrownMonsterCount = 0;
  for (const [id, m] of Object.entries(monsters)) {
    if (!m || !m.owned) continue;
    monsterDistribution[id] = m.stage ?? 0;
    if (m.stage >= 4) fullyGrownMonsterCount++;
  }

  return {
    duplicateAwardPreventedCount,
    staleWriteCount,
    balanceBucket: classifyBalanceBucket(balance),
    ledgerEntryCount: safeLedger.length,
    fullyGrownMonsterCount,
    monsterDistribution,
  };
}

// ── Reconciliation Gap ────────────────────────────────────────────────

/**
 * Derive the reconciliation gap between ledger entries and event log count.
 * A positive gap means events were lost (ledger has more entries than event_log).
 * @param {Array} ledgerEntries — the ledger array (or any array with .length)
 * @param {number} eventLogCount — count of event_log rows for this learner
 * @returns {{ ledgerCount: number, eventCount: number, gap: number, hasGap: boolean }}
 */
export function deriveReconciliationGap(ledgerEntries, eventLogCount) {
  const ledgerCount = Array.isArray(ledgerEntries) ? ledgerEntries.length : 0;
  const eventCount = typeof eventLogCount === 'number' ? eventLogCount : 0;
  const gap = ledgerCount - eventCount;
  return {
    ledgerCount,
    eventCount,
    gap,
    hasGap: gap !== 0,
  };
}

// ── Spend Pattern Classification ──────────────────────────────────────

/**
 * Classify recent spend patterns for economy health telemetry.
 * @param {Array<{ createdAt: number, type: string }>} recentActions — action records
 * @param {string} dateKey — the current date key (YYYY-MM-DD) to filter today's spends
 * @param {number} [balance=0] — current balance for hoarding score
 * @returns {{ rapidSpend: boolean, spendCountToday: number, hoardingScore: number }}
 */
export function classifySpendPattern(recentActions, dateKey, balance = 0) {
  const actions = Array.isArray(recentActions) ? recentActions : [];

  // Count spends that match today's dateKey
  const spendCountToday = actions.filter(a => {
    if (!a || !a.createdAt) return false;
    // Derive dateKey from createdAt timestamp (ISO date portion)
    const actionDate = typeof a.createdAt === 'string'
      ? a.createdAt.slice(0, 10)
      : new Date(a.createdAt).toISOString().slice(0, 10);
    return actionDate === dateKey;
  }).length;

  // rapidSpend = 3+ spends in same dateKey
  const rapidSpend = spendCountToday >= 3;

  // hoardingScore: simplified — balance / 1000
  const hoardingScore = balance < 300 ? 0 : balance / 1000;

  return {
    rapidSpend,
    spendCountToday,
    hoardingScore,
  };
}
