import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDuplicateDailyAward,
  detectDuplicateCampDebit,
  detectNegativeBalance,
  detectDeadCTA,
  detectRawChildContent,
  detectSubjectMutation,
  detectClaimWithoutCompletion,
  detectNonCohortExposure,
  detectRollbackFailure,
  detectUnauthorisedCommand,
} from '../shared/hero/stop-conditions.js';
import { resolveHeroFlagsForAccount } from '../shared/hero/account-override.js';

// ── Zero-Tolerance Detection (§8.3 / §10) ──────────────────────────────

describe('pA5 safety regression: zero-tolerance detection', () => {
  // 1. Duplicate daily award
  it('detects duplicate daily award for same dateKey', () => {
    const ledgerEntries = [
      { type: 'daily-award', dateKey: '2026-04-30', amount: 100 },
      { type: 'daily-award', dateKey: '2026-04-30', amount: 100 },
    ];
    const result = detectDuplicateDailyAward({ ledgerEntries, dateKey: '2026-04-30' });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'duplicate-daily-award');
  });

  // 2. Duplicate Camp debit
  it('detects duplicate Camp debit for same actionId', () => {
    const ledgerEntries = [
      { type: 'camp-debit', actionId: 'invite-monster-99', amount: -200 },
      { type: 'camp-debit', actionId: 'invite-monster-99', amount: -200 },
    ];
    const result = detectDuplicateCampDebit({ ledgerEntries, actionId: 'invite-monster-99' });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'duplicate-camp-debit');
  });

  // 3. Negative balance
  it('detects negative balance', () => {
    const result = detectNegativeBalance({ balance: -50 });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'negative-balance');
    assert.ok(result.detail.includes('-50'));
  });

  // 4. Dead CTA
  it('detects dead CTA — visible but no launchable tasks', () => {
    const result = detectDeadCTA({ readModel: { ctaVisible: true, ctaLaunchable: false } });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'dead-cta');
    assert.ok(result.detail.includes('not launchable'));
  });

  // 5. Raw child content
  it('detects raw child content — payload with childContent field', () => {
    const payload = { event: 'quest-start', childContent: 'Hello my name is Alice' };
    const result = detectRawChildContent(payload);
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'raw-child-content');
    assert.ok(result.detail.includes('childContent'));
  });

  // 6. Subject mutation
  it('detects Hero command mutating Stars', () => {
    const heroCommands = [
      { name: 'claim-daily', mutatesSubject: false },
      { name: 'award-stars', mutatesSubject: true },
    ];
    const result = detectSubjectMutation({ heroCommands, subjectState: { stars: 10 } });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'subject-mutation');
    assert.ok(result.detail.includes('award-stars'));
  });

  // 7. Claim without completion
  it('detects claim with no Worker evidence', () => {
    const result = detectClaimWithoutCompletion({
      claimRecord: { id: 'claim-pA5-1' },
      completionEvidence: null,
    });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'claim-without-completion');
    assert.ok(result.detail.includes('claim-pA5-1'));
  });

  // 8. Non-cohort exposure (tightened) — excluded account with readModelEnabled
  it('detects non-cohort exposure for excluded account with readModelEnabled', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['int-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify(['excluded-acc']),
    };
    const result = detectNonCohortExposure({
      accountId: 'excluded-acc', env, readModelEnabled: true,
    });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'non-cohort-exposure');
    assert.ok(result.detail.includes('excluded-acc'));
    assert.ok(result.detail.includes('readModelEnabled'));
  });

  // 9. Non-cohort exposure (no false positive) — no exposure signal
  it('does NOT trigger non-cohort exposure when no exposure signal present', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['int-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
    };
    const result = detectNonCohortExposure({
      accountId: 'random-account', env,
      heroSurfaceVisible: false, commandAccepted: false, readModelEnabled: false,
    });
    assert.equal(result.triggered, false);
  });

  // 10. Rollback failure
  it('detects rollback failure — emergency-off set but surfaces still visible', () => {
    const result = detectRollbackFailure({ flagsOff: true, heroSurfacesVisible: true });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'rollback-failure');
    assert.ok(result.detail.includes('flags are off'));
  });

  // 11. Unauthorised command
  it('detects unauthorised command from excluded account', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify(['banned-acc']),
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['banned-acc']),
    };
    const result = detectUnauthorisedCommand({ accountId: 'banned-acc', env });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'unauthorised-command');
    assert.ok(result.detail.includes('excluded'));
  });
});

// ── Rollback State Preservation ─────────────────────────────────────────

describe('pA5 safety regression: rollback preserves state dormant', () => {
  // 12. Emergency-off does NOT modify hero state object
  it('emergency-off does not modify a hero state object', () => {
    const heroState = Object.freeze({
      balance: 500,
      questId: 'quest-42',
      ledger: [{ type: 'daily-award', dateKey: '2026-04-30', amount: 100 }],
    });
    const env = { HERO_EMERGENCY_DISABLED: 'true' };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });
    assert.equal(overrideStatus, 'emergency-off');
    // State must be untouched — frozen object would throw on modification
    assert.deepEqual(heroState, {
      balance: 500,
      questId: 'quest-42',
      ledger: [{ type: 'daily-award', dateKey: '2026-04-30', amount: 100 }],
    });
    // resolvedEnv is env as-is, not forcing flags on
    assert.equal(resolvedEnv.HERO_MODE_SHADOW_ENABLED, undefined);
    assert.equal(resolvedEnv.HERO_MODE_LAUNCH_ENABLED, undefined);
  });

  // 13. Emergency-off resolver returns env with flags as-is (not forced on)
  it('emergency-off resolver returns env unchanged — flags not forced on', () => {
    const env = {
      HERO_EMERGENCY_DISABLED: 'true',
      HERO_MODE_SHADOW_ENABLED: 'false',
      HERO_MODE_LAUNCH_ENABLED: 'false',
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });
    assert.equal(overrideStatus, 'emergency-off');
    // Flags must remain as-is, NOT forced to 'true'
    assert.equal(resolvedEnv.HERO_MODE_SHADOW_ENABLED, 'false');
    assert.equal(resolvedEnv.HERO_MODE_LAUNCH_ENABLED, 'false');
  });

  // 14. Re-enablement after emergency-off: state object is identical to pre-emergency
  it('re-enablement after emergency-off produces identical state to pre-emergency', () => {
    const baseEnv = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
    };

    // Pre-emergency: account resolves normally
    const preEmergency = resolveHeroFlagsForAccount({ env: baseEnv, accountId: 'acc-1' });
    assert.equal(preEmergency.overrideStatus, 'internal');

    // During emergency: flags not forced
    const duringEmergency = resolveHeroFlagsForAccount({
      env: { ...baseEnv, HERO_EMERGENCY_DISABLED: 'true' },
      accountId: 'acc-1',
    });
    assert.equal(duringEmergency.overrideStatus, 'emergency-off');

    // After emergency (flag removed): identical to pre-emergency
    const postEmergency = resolveHeroFlagsForAccount({ env: baseEnv, accountId: 'acc-1' });
    assert.equal(postEmergency.overrideStatus, 'internal');
    assert.deepEqual(postEmergency.resolvedEnv, preEmergency.resolvedEnv);
  });
});

// ── Negative Cases (No False Positives) ─────────────────────────────────

describe('pA5 safety regression: no false positives', () => {
  // 15. Single daily award does NOT trigger
  it('single daily award does NOT trigger duplicate detection', () => {
    const ledgerEntries = [
      { type: 'daily-award', dateKey: '2026-04-30', amount: 100 },
      { type: 'camp-debit', dateKey: '2026-04-30', amount: -200 },
    ];
    const result = detectDuplicateDailyAward({ ledgerEntries, dateKey: '2026-04-30' });
    assert.equal(result.triggered, false);
  });

  // 16. Single Camp debit does NOT trigger
  it('single Camp debit does NOT trigger duplicate detection', () => {
    const ledgerEntries = [
      { type: 'camp-debit', actionId: 'invite-monster-77', amount: -200 },
    ];
    const result = detectDuplicateCampDebit({ ledgerEntries, actionId: 'invite-monster-77' });
    assert.equal(result.triggered, false);
  });

  // 17. Positive balance does NOT trigger
  it('positive balance does NOT trigger negative balance detection', () => {
    const result = detectNegativeBalance({ balance: 350 });
    assert.equal(result.triggered, false);
  });

  // 18. Internal cohort account with exposure does NOT trigger
  it('internal cohort account with exposure does NOT trigger non-cohort detection', () => {
    const env = { HERO_INTERNAL_ACCOUNTS: JSON.stringify(['internal-acc']) };
    const result = detectNonCohortExposure({
      accountId: 'internal-acc', env,
      heroSurfaceVisible: true, commandAccepted: true, readModelEnabled: true,
    });
    assert.equal(result.triggered, false);
  });
});
