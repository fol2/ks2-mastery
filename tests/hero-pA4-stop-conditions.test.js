import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectRawChildContent,
  detectNonCohortExposure,
  detectUnauthorisedCommand,
  detectDuplicateDailyAward,
  detectDuplicateCampDebit,
  detectNegativeBalance,
  detectClaimWithoutCompletion,
  detectSubjectMutation,
  detectDeadCTA,
  detectRollbackFailure,
  detectRepeatedErrors,
  detectUntriageableIssue,
  detectPressureCopy,
} from '../shared/hero/stop-conditions.js';

// ── 1. Raw Child Content ─────────────────────────────────────────────

describe('detectRawChildContent', () => {
  it('triggers when payload contains forbidden privacy field', () => {
    const payload = { event: 'spell-attempt', rawAnswer: 'cat' };
    const result = detectRawChildContent(payload);
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'raw-child-content');
    assert.ok(result.detail.includes('rawAnswer'));
  });

  it('does not trigger for clean payload', () => {
    const payload = { event: 'spell-attempt', score: 5, unit: 'u3' };
    const result = detectRawChildContent(payload);
    assert.equal(result.triggered, false);
    assert.equal(result.condition, 'raw-child-content');
  });

  it('triggers for nested forbidden field at arbitrary depth', () => {
    const payload = { meta: { nested: { childFreeText: 'hello' } } };
    const result = detectRawChildContent(payload);
    assert.equal(result.triggered, true);
    assert.ok(result.detail.includes('childFreeText'));
  });

  it('handles null input gracefully', () => {
    const result = detectRawChildContent(null);
    assert.equal(result.triggered, false);
  });

  it('handles undefined input gracefully', () => {
    const result = detectRawChildContent(undefined);
    assert.equal(result.triggered, false);
  });
});

// ── 2. Non-Cohort Exposure ───────────────────────────────────────────

describe('detectNonCohortExposure', () => {
  it('triggers when account is in no cohort list', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['int-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
    };
    const result = detectNonCohortExposure({ accountId: 'random-account', env });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'non-cohort-exposure');
    assert.ok(result.detail.includes('random-account'));
  });

  it('does not trigger for internal cohort account', () => {
    const env = { HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']) };
    const result = detectNonCohortExposure({ accountId: 'acc-1', env });
    assert.equal(result.triggered, false);
  });

  it('does not trigger for external cohort account', () => {
    const env = { HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']) };
    const result = detectNonCohortExposure({ accountId: 'ext-1', env });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectNonCohortExposure(undefined).triggered, false);
    assert.equal(detectNonCohortExposure({}).triggered, false);
    assert.equal(detectNonCohortExposure({ accountId: null, env: null }).triggered, false);
  });
});

// ── 3. Unauthorised Command ──────────────────────────────────────────

describe('detectUnauthorisedCommand', () => {
  it('triggers when account has no Hero enablement', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['int-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
    };
    const result = detectUnauthorisedCommand({ accountId: 'hacker-account', env });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'unauthorised-command');
  });

  it('does not trigger for enabled account', () => {
    const env = { HERO_INTERNAL_ACCOUNTS: JSON.stringify(['valid-acc']) };
    const result = detectUnauthorisedCommand({ accountId: 'valid-acc', env });
    assert.equal(result.triggered, false);
  });

  it('does not trigger for global-enabled account', () => {
    const env = { HERO_MODE_SHADOW_ENABLED: 'true' };
    const result = detectUnauthorisedCommand({ accountId: 'any-acc', env });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectUnauthorisedCommand(undefined).triggered, false);
    assert.equal(detectUnauthorisedCommand({}).triggered, false);
  });
});

// ── 4. Duplicate Daily Award ─────────────────────────────────────────

describe('detectDuplicateDailyAward', () => {
  it('triggers when two daily awards exist for the same dateKey', () => {
    const ledgerEntries = [
      { type: 'daily-award', dateKey: '2026-04-30', amount: 100 },
      { type: 'daily-award', dateKey: '2026-04-30', amount: 100 },
    ];
    const result = detectDuplicateDailyAward({ ledgerEntries, dateKey: '2026-04-30' });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'duplicate-daily-award');
    assert.ok(result.detail.includes('2'));
  });

  it('does not trigger for a single daily award', () => {
    const ledgerEntries = [
      { type: 'daily-award', dateKey: '2026-04-30', amount: 100 },
      { type: 'camp-debit', dateKey: '2026-04-30', amount: -200 },
    ];
    const result = detectDuplicateDailyAward({ ledgerEntries, dateKey: '2026-04-30' });
    assert.equal(result.triggered, false);
  });

  it('does not trigger for different dateKeys', () => {
    const ledgerEntries = [
      { type: 'daily-award', dateKey: '2026-04-29', amount: 100 },
      { type: 'daily-award', dateKey: '2026-04-30', amount: 100 },
    ];
    const result = detectDuplicateDailyAward({ ledgerEntries, dateKey: '2026-04-30' });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectDuplicateDailyAward(undefined).triggered, false);
    assert.equal(detectDuplicateDailyAward({}).triggered, false);
    assert.equal(detectDuplicateDailyAward({ ledgerEntries: null, dateKey: null }).triggered, false);
  });
});

// ── 5. Duplicate Camp Debit ──────────────────────────────────────────

describe('detectDuplicateCampDebit', () => {
  it('triggers when two camp debits share the same actionId', () => {
    const ledgerEntries = [
      { type: 'camp-debit', actionId: 'invite-monster-42', amount: -200 },
      { type: 'camp-debit', actionId: 'invite-monster-42', amount: -200 },
    ];
    const result = detectDuplicateCampDebit({ ledgerEntries, actionId: 'invite-monster-42' });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'duplicate-camp-debit');
  });

  it('does not trigger for a single camp debit', () => {
    const ledgerEntries = [
      { type: 'camp-debit', actionId: 'invite-monster-42', amount: -200 },
    ];
    const result = detectDuplicateCampDebit({ ledgerEntries, actionId: 'invite-monster-42' });
    assert.equal(result.triggered, false);
  });

  it('does not trigger for different actionIds', () => {
    const ledgerEntries = [
      { type: 'camp-debit', actionId: 'invite-monster-42', amount: -200 },
      { type: 'camp-debit', actionId: 'invite-monster-43', amount: -200 },
    ];
    const result = detectDuplicateCampDebit({ ledgerEntries, actionId: 'invite-monster-42' });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectDuplicateCampDebit(undefined).triggered, false);
    assert.equal(detectDuplicateCampDebit({}).triggered, false);
    assert.equal(detectDuplicateCampDebit({ ledgerEntries: [], actionId: null }).triggered, false);
  });
});

// ── 6. Negative Balance ──────────────────────────────────────────────

describe('detectNegativeBalance', () => {
  it('triggers when balance is negative', () => {
    const result = detectNegativeBalance({ balance: -1 });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'negative-balance');
    assert.ok(result.detail.includes('-1'));
  });

  it('does not trigger for zero balance', () => {
    const result = detectNegativeBalance({ balance: 0 });
    assert.equal(result.triggered, false);
  });

  it('does not trigger for positive balance', () => {
    const result = detectNegativeBalance({ balance: 500 });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectNegativeBalance(undefined).triggered, false);
    assert.equal(detectNegativeBalance({}).triggered, false);
    assert.equal(detectNegativeBalance({ balance: null }).triggered, false);
    assert.equal(detectNegativeBalance({ balance: 'not-a-number' }).triggered, false);
  });
});

// ── 7. Claim Without Completion ──────────────────────────────────────

describe('detectClaimWithoutCompletion', () => {
  it('triggers when claimRecord exists but completionEvidence is missing', () => {
    const result = detectClaimWithoutCompletion({
      claimRecord: { id: 'claim-1' },
      completionEvidence: null,
    });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'claim-without-completion');
    assert.ok(result.detail.includes('claim-1'));
  });

  it('triggers when completionEvidence exists but not verified', () => {
    const result = detectClaimWithoutCompletion({
      claimRecord: { id: 'claim-2' },
      completionEvidence: { verified: false },
    });
    assert.equal(result.triggered, true);
  });

  it('does not trigger when completionEvidence is verified', () => {
    const result = detectClaimWithoutCompletion({
      claimRecord: { id: 'claim-3' },
      completionEvidence: { verified: true, taskId: 't-1' },
    });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectClaimWithoutCompletion(undefined).triggered, false);
    assert.equal(detectClaimWithoutCompletion({}).triggered, false);
    assert.equal(detectClaimWithoutCompletion({ claimRecord: null }).triggered, false);
  });
});

// ── 8. Subject Mutation ──────────────────────────────────────────────

describe('detectSubjectMutation', () => {
  it('triggers when a Hero command is flagged as mutating subject state', () => {
    const heroCommands = [
      { name: 'claim-daily', mutatesSubject: false },
      { name: 'complete-task', mutatesSubject: true },
    ];
    const result = detectSubjectMutation({ heroCommands, subjectState: { stars: 5 } });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'subject-mutation');
    assert.ok(result.detail.includes('complete-task'));
  });

  it('does not trigger when no commands mutate subject', () => {
    const heroCommands = [
      { name: 'claim-daily', mutatesSubject: false },
      { name: 'refresh-quest', mutatesSubject: false },
    ];
    const result = detectSubjectMutation({ heroCommands, subjectState: { stars: 5 } });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectSubjectMutation(undefined).triggered, false);
    assert.equal(detectSubjectMutation({}).triggered, false);
    assert.equal(detectSubjectMutation({ heroCommands: null, subjectState: null }).triggered, false);
  });
});

// ── 9. Dead CTA ─────────────────────────────────────────────────────

describe('detectDeadCTA', () => {
  it('triggers when CTA is visible but not launchable', () => {
    const result = detectDeadCTA({ readModel: { ctaVisible: true, ctaLaunchable: false } });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'dead-cta');
    assert.ok(result.detail.includes('not launchable'));
  });

  it('does not trigger when CTA is visible and launchable', () => {
    const result = detectDeadCTA({ readModel: { ctaVisible: true, ctaLaunchable: true } });
    assert.equal(result.triggered, false);
  });

  it('does not trigger when CTA is not visible', () => {
    const result = detectDeadCTA({ readModel: { ctaVisible: false, ctaLaunchable: false } });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectDeadCTA(undefined).triggered, false);
    assert.equal(detectDeadCTA({}).triggered, false);
    assert.equal(detectDeadCTA({ readModel: null }).triggered, false);
  });
});

// ── 10. Rollback Failure ─────────────────────────────────────────────

describe('detectRollbackFailure', () => {
  it('triggers when flags are off but surfaces remain visible', () => {
    const result = detectRollbackFailure({ flagsOff: true, heroSurfacesVisible: true });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'rollback-failure');
    assert.ok(result.detail.includes('flags are off'));
  });

  it('does not trigger when flags are off and surfaces are hidden', () => {
    const result = detectRollbackFailure({ flagsOff: true, heroSurfacesVisible: false });
    assert.equal(result.triggered, false);
  });

  it('does not trigger when flags are on (normal operation)', () => {
    const result = detectRollbackFailure({ flagsOff: false, heroSurfacesVisible: true });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectRollbackFailure(undefined).triggered, false);
    assert.equal(detectRollbackFailure({}).triggered, false);
    assert.equal(detectRollbackFailure({ flagsOff: null, heroSurfacesVisible: null }).triggered, false);
  });
});

// ── 11. Repeated Errors ──────────────────────────────────────────────

describe('detectRepeatedErrors', () => {
  it('triggers when 3+ 500 errors occur within 5min window', () => {
    const now = Date.now();
    const errorLog = [
      { timestamp: now - 60_000, status: 500 },
      { timestamp: now - 30_000, status: 500 },
      { timestamp: now - 10_000, status: 500 },
    ];
    const result = detectRepeatedErrors({ errorLog });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'repeated-errors');
    assert.ok(result.detail.includes('3'));
  });

  it('does not trigger when fewer than threshold errors in window', () => {
    const now = Date.now();
    const errorLog = [
      { timestamp: now - 60_000, status: 500 },
      { timestamp: now - 30_000, status: 500 },
    ];
    const result = detectRepeatedErrors({ errorLog });
    assert.equal(result.triggered, false);
  });

  it('does not trigger when errors are outside 5min window', () => {
    const now = Date.now();
    const errorLog = [
      { timestamp: now - 600_000, status: 500 },
      { timestamp: now - 500_000, status: 500 },
      { timestamp: now - 400_000, status: 500 },
    ];
    const result = detectRepeatedErrors({ errorLog });
    assert.equal(result.triggered, false);
  });

  it('does not count non-500 errors', () => {
    const now = Date.now();
    const errorLog = [
      { timestamp: now - 60_000, status: 500 },
      { timestamp: now - 30_000, status: 404 },
      { timestamp: now - 10_000, status: 429 },
    ];
    const result = detectRepeatedErrors({ errorLog });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectRepeatedErrors(undefined).triggered, false);
    assert.equal(detectRepeatedErrors({}).triggered, false);
    assert.equal(detectRepeatedErrors({ errorLog: null }).triggered, false);
  });
});

// ── 12. Untriageable Issue ───────────────────────────────────────────

describe('detectUntriageableIssue', () => {
  it('triggers when required fields are missing from error output', () => {
    const errorOutput = { message: 'something failed' };
    const requiredFields = ['message', 'accountId', 'requestId', 'timestamp'];
    const result = detectUntriageableIssue({ errorOutput, requiredFields });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'untriageable-issue');
    assert.ok(result.detail.includes('accountId'));
    assert.ok(result.detail.includes('requestId'));
    assert.ok(result.detail.includes('timestamp'));
  });

  it('does not trigger when all required fields are present', () => {
    const errorOutput = { message: 'err', accountId: 'a1', requestId: 'r1', timestamp: 123 };
    const requiredFields = ['message', 'accountId', 'requestId', 'timestamp'];
    const result = detectUntriageableIssue({ errorOutput, requiredFields });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectUntriageableIssue(undefined).triggered, false);
    assert.equal(detectUntriageableIssue({}).triggered, false);
    assert.equal(detectUntriageableIssue({ errorOutput: null, requiredFields: null }).triggered, false);
  });
});

// ── 13. Pressure Copy ────────────────────────────────────────────────

describe('detectPressureCopy', () => {
  it('triggers when copy contains forbidden pressure vocabulary', () => {
    const result = detectPressureCopy({ copyText: 'Buy now and unlock treasure!' });
    assert.equal(result.triggered, true);
    assert.equal(result.condition, 'pressure-copy');
    assert.ok(result.detail.includes('buy now'));
    assert.ok(result.detail.includes('treasure'));
  });

  it('triggers for case-insensitive match', () => {
    const result = detectPressureCopy({ copyText: "DON'T MISS OUT on this Limited Time deal" });
    assert.equal(result.triggered, true);
    assert.ok(result.detail.includes("don't miss out"));
    assert.ok(result.detail.includes('limited time'));
    assert.ok(result.detail.includes('deal'));
  });

  it('does not trigger for clean non-pressure copy', () => {
    const result = detectPressureCopy({ copyText: 'Your Hero Quest is ready. Complete today\'s task to continue.' });
    assert.equal(result.triggered, false);
  });

  it('handles null/undefined input gracefully', () => {
    assert.equal(detectPressureCopy(undefined).triggered, false);
    assert.equal(detectPressureCopy({}).triggered, false);
    assert.equal(detectPressureCopy({ copyText: null }).triggered, false);
    assert.equal(detectPressureCopy({ copyText: '' }).triggered, false);
  });
});
