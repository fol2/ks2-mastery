// shared/hero/stop-conditions.js
// ── pA4 §11 Stop Condition Guard Functions ────────────────────────────
//
// 13 pure detection functions — each takes relevant state/context and returns:
//   { triggered: boolean, condition: string, detail: string }
//
// Zero side effects. No I/O. Handles null/undefined gracefully.
//
// Legacy probe-based detectStopConditions (pA2/pA3) is preserved at the bottom.

import { validateMetricPrivacyRecursive } from './metrics-privacy.js';
import { resolveHeroFlagsForAccount } from './account-override.js';
import { HERO_FORBIDDEN_PRESSURE_VOCABULARY } from './hero-copy.js';

// ── 1. Raw Child Content ─────────────────────────────────────────────

/**
 * Detect raw child content in telemetry/logs/exports.
 * Uses the privacy validator from metrics-privacy.js.
 *
 * @param {unknown} payload — telemetry or log payload to scan
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectRawChildContent(payload) {
  if (payload == null || typeof payload !== 'object') {
    return { triggered: false, condition: 'raw-child-content', detail: '' };
  }
  const result = validateMetricPrivacyRecursive(payload);
  if (!result.valid) {
    return {
      triggered: true,
      condition: 'raw-child-content',
      detail: `forbidden fields: ${result.violations.join(', ')}`,
    };
  }
  return { triggered: false, condition: 'raw-child-content', detail: '' };
}

// ── 2. Non-Cohort Exposure ───────────────────────────────────────────

/**
 * Detect non-cohort accounts seeing Hero surfaces.
 * A non-cohort account (overrideStatus === 'none') must never see Hero UI.
 *
 * @param {{ accountId: string, env: object }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectNonCohortExposure({ accountId, env } = {}) {
  if (!accountId || !env) {
    return { triggered: false, condition: 'non-cohort-exposure', detail: '' };
  }
  const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
  if (overrideStatus === 'none') {
    return {
      triggered: true,
      condition: 'non-cohort-exposure',
      detail: `account ${accountId} is not in any cohort list`,
    };
  }
  return { triggered: false, condition: 'non-cohort-exposure', detail: '' };
}

// ── 3. Unauthorised Command ──────────────────────────────────────────

/**
 * Detect Hero command succeeding for a non-enabled account.
 * An account with overrideStatus 'none' must never execute Hero commands.
 *
 * @param {{ accountId: string, env: object }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectUnauthorisedCommand({ accountId, env } = {}) {
  if (!accountId || !env) {
    return { triggered: false, condition: 'unauthorised-command', detail: '' };
  }
  const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
  if (overrideStatus === 'none') {
    return {
      triggered: true,
      condition: 'unauthorised-command',
      detail: `account ${accountId} has no Hero enablement`,
    };
  }
  return { triggered: false, condition: 'unauthorised-command', detail: '' };
}

// ── 4. Duplicate Daily Award ─────────────────────────────────────────

/**
 * Detect duplicate daily coin award for the same dateKey.
 *
 * @param {{ ledgerEntries: Array, dateKey: string }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectDuplicateDailyAward({ ledgerEntries, dateKey } = {}) {
  if (!Array.isArray(ledgerEntries) || !dateKey) {
    return { triggered: false, condition: 'duplicate-daily-award', detail: '' };
  }
  const dailyAwards = ledgerEntries.filter(
    (e) => e && e.type === 'daily-award' && e.dateKey === dateKey
  );
  if (dailyAwards.length > 1) {
    return {
      triggered: true,
      condition: 'duplicate-daily-award',
      detail: `${dailyAwards.length} daily awards for dateKey=${dateKey}`,
    };
  }
  return { triggered: false, condition: 'duplicate-daily-award', detail: '' };
}

// ── 5. Duplicate Camp Debit ──────────────────────────────────────────

/**
 * Detect duplicate Camp debit for the same actionId.
 *
 * @param {{ ledgerEntries: Array, actionId: string }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectDuplicateCampDebit({ ledgerEntries, actionId } = {}) {
  if (!Array.isArray(ledgerEntries) || !actionId) {
    return { triggered: false, condition: 'duplicate-camp-debit', detail: '' };
  }
  const campDebits = ledgerEntries.filter(
    (e) => e && e.type === 'camp-debit' && e.actionId === actionId
  );
  if (campDebits.length > 1) {
    return {
      triggered: true,
      condition: 'duplicate-camp-debit',
      detail: `${campDebits.length} camp debits for actionId=${actionId}`,
    };
  }
  return { triggered: false, condition: 'duplicate-camp-debit', detail: '' };
}

// ── 6. Negative Balance ──────────────────────────────────────────────

/**
 * Detect negative balance.
 *
 * @param {{ balance: number }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectNegativeBalance({ balance } = {}) {
  if (typeof balance !== 'number') {
    return { triggered: false, condition: 'negative-balance', detail: '' };
  }
  if (balance < 0) {
    return {
      triggered: true,
      condition: 'negative-balance',
      detail: `balance=${balance}`,
    };
  }
  return { triggered: false, condition: 'negative-balance', detail: '' };
}

// ── 7. Claim Without Completion ──────────────────────────────────────

/**
 * Detect claim without Worker-verified completion evidence.
 *
 * @param {{ claimRecord: object, completionEvidence: object }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectClaimWithoutCompletion({ claimRecord, completionEvidence } = {}) {
  if (!claimRecord) {
    return { triggered: false, condition: 'claim-without-completion', detail: '' };
  }
  if (!completionEvidence || !completionEvidence.verified) {
    return {
      triggered: true,
      condition: 'claim-without-completion',
      detail: `claimId=${claimRecord.id || 'unknown'} has no verified completion`,
    };
  }
  return { triggered: false, condition: 'claim-without-completion', detail: '' };
}

// ── 8. Subject Mutation ──────────────────────────────────────────────

/**
 * Detect Hero commands that mutate subject Stars/mastery state.
 * Hero commands must be read-only with respect to subject state.
 *
 * @param {{ heroCommands: Array, subjectState: object }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectSubjectMutation({ heroCommands, subjectState } = {}) {
  if (!Array.isArray(heroCommands) || !subjectState) {
    return { triggered: false, condition: 'subject-mutation', detail: '' };
  }
  const mutators = heroCommands.filter((cmd) => cmd && cmd.mutatesSubject === true);
  if (mutators.length > 0) {
    return {
      triggered: true,
      condition: 'subject-mutation',
      detail: `${mutators.length} command(s) flagged mutatesSubject: ${mutators.map(c => c.name || 'unnamed').join(', ')}`,
    };
  }
  return { triggered: false, condition: 'subject-mutation', detail: '' };
}

// ── 9. Dead CTA ─────────────────────────────────────────────────────

/**
 * Detect child-visible primary CTA that is dead/unlaunchable.
 *
 * @param {{ readModel: object }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectDeadCTA({ readModel } = {}) {
  if (!readModel) {
    return { triggered: false, condition: 'dead-cta', detail: '' };
  }
  const { ctaVisible, ctaLaunchable } = readModel;
  if (ctaVisible && ctaLaunchable === false) {
    return {
      triggered: true,
      condition: 'dead-cta',
      detail: 'primary CTA is visible but not launchable',
    };
  }
  return { triggered: false, condition: 'dead-cta', detail: '' };
}

// ── 10. Rollback Failure ─────────────────────────────────────────────

/**
 * Detect rollback failure — flags are off but Hero surfaces remain visible.
 *
 * @param {{ flagsOff: boolean, heroSurfacesVisible: boolean }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectRollbackFailure({ flagsOff, heroSurfacesVisible } = {}) {
  if (typeof flagsOff !== 'boolean' || typeof heroSurfacesVisible !== 'boolean') {
    return { triggered: false, condition: 'rollback-failure', detail: '' };
  }
  if (flagsOff && heroSurfacesVisible) {
    return {
      triggered: true,
      condition: 'rollback-failure',
      detail: 'flags are off but Hero surfaces remain visible',
    };
  }
  return { triggered: false, condition: 'rollback-failure', detail: '' };
}

// ── 11. Repeated Errors ──────────────────────────────────────────────

/**
 * Detect repeated unexplained 500 errors (threshold = 3 in 5min window).
 *
 * @param {{ errorLog: Array, threshold?: number }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectRepeatedErrors({ errorLog, threshold = 3 } = {}) {
  if (!Array.isArray(errorLog)) {
    return { triggered: false, condition: 'repeated-errors', detail: '' };
  }
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  const recentErrors = errorLog.filter((e) => {
    if (!e || typeof e.timestamp !== 'number') return false;
    return (now - e.timestamp) <= WINDOW_MS && e.status === 500;
  });
  if (recentErrors.length >= threshold) {
    return {
      triggered: true,
      condition: 'repeated-errors',
      detail: `${recentErrors.length} 500 errors in 5min window (threshold=${threshold})`,
    };
  }
  return { triggered: false, condition: 'repeated-errors', detail: '' };
}

// ── 12. Untriageable Issue ───────────────────────────────────────────

/**
 * Detect issues that support cannot triage (missing required output fields).
 *
 * @param {{ errorOutput: object, requiredFields: string[] }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectUntriageableIssue({ errorOutput, requiredFields } = {}) {
  if (!errorOutput || !Array.isArray(requiredFields)) {
    return { triggered: false, condition: 'untriageable-issue', detail: '' };
  }
  const missing = requiredFields.filter((field) => !(field in errorOutput));
  if (missing.length > 0) {
    return {
      triggered: true,
      condition: 'untriageable-issue',
      detail: `missing fields: ${missing.join(', ')}`,
    };
  }
  return { triggered: false, condition: 'untriageable-issue', detail: '' };
}

// ── 13. Pressure Copy ────────────────────────────────────────────────

/**
 * Detect pressure/misleading copy in parent-facing or child-facing text.
 * Uses HERO_FORBIDDEN_PRESSURE_VOCABULARY from hero-copy.js.
 *
 * @param {{ copyText: string }} params
 * @returns {{ triggered: boolean, condition: string, detail: string }}
 */
export function detectPressureCopy({ copyText } = {}) {
  if (!copyText || typeof copyText !== 'string') {
    return { triggered: false, condition: 'pressure-copy', detail: '' };
  }
  const lower = copyText.toLowerCase();
  const matches = HERO_FORBIDDEN_PRESSURE_VOCABULARY.filter(
    (term) => lower.includes(term.toLowerCase())
  );
  if (matches.length > 0) {
    return {
      triggered: true,
      condition: 'pressure-copy',
      detail: `pressure terms found: ${matches.join(', ')}`,
    };
  }
  return { triggered: false, condition: 'pressure-copy', detail: '' };
}

// ── Legacy probe-based detector (pA2/pA3 compat) ────────────────────

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
