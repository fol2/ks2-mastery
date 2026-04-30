// shared/hero/stop-conditions.js
// Extracted from scripts/hero-pA2-cohort-smoke.mjs to break cross-phase coupling.
// Both pA2 and pA3 cohort smoke scripts import from here.

// NOT DETECTABLE FROM PROBE (manual verification required per S8):
// S8 #2: duplicate Camp debit (no per-debit field in probe; reconciliation gap is a proxy)
// S8 #4: claim without Worker-verified completion (command-level audit)
// S8 #5: Hero mutates subject state (architectural impossibility, verified by P1-P6)
// S8 #6: dead CTA (requires UI-level check; readiness-degraded is an indirect proxy)
// S8 #8: raw child content in telemetry (privacy validator is build-time gate, not runtime probe)
// S8 #10: rollback cannot hide surfaces (requires production rehearsal)
// S8 #11: stale request returns 500 (request-level monitoring)
// S8 #12: operators cannot explain task selection (human assessment)
// S8 #13: children directed to Camp before learning (UI review)
// S8 #14: support inspects non-existent tables (documentation review)

/**
 * Detect stop conditions from expanded probe fields.
 * Returns an array of { level: 'stop'|'warn'|'info', key: string, detail?: string }.
 */
export function detectStopConditions({ balance, balanceBucket, hasGap, health, readiness, overrideStatus }) {
  const conditions = [];

  // Bug 2 fix: check raw balance directly (balanceBucket never returns 'negative')
  if (typeof balance === 'number' && balance < 0) {
    conditions.push({ level: 'stop', key: 'negative-balance' });
  }

  // Reconciliation gap
  if (hasGap) {
    conditions.push({ level: 'stop', key: 'reconciliation-gap' });
  }

  // Bug 3: duplicate award prevention fired (dedup worked, but attempts exist)
  if (health && health.duplicateAwardPreventedCount > 0) {
    conditions.push({ level: 'warn', key: 'duplicate-award-prevented', detail: `count=${health.duplicateAwardPreventedCount}` });
  }

  // Readiness degraded (overall not 'ready')
  if (readiness && readiness.overall && readiness.overall !== 'ready') {
    const failedChecks = [];
    for (const [k, v] of Object.entries(readiness)) {
      if (k === 'overall') continue;
      if (v === false || v === 'fail' || v === 'missing') failedChecks.push(k);
    }
    conditions.push({ level: 'warn', key: 'readiness-degraded', detail: failedChecks.join(',') || readiness.overall });
  }

  // S8 #9: override exposes non-listed accounts - immediate stop per contract
  if (overrideStatus && overrideStatus.isInternalAccount === false) {
    conditions.push({ level: 'stop', key: 'override-not-internal' });
  }

  return conditions;
}
