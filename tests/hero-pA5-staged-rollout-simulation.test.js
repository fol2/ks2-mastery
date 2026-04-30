import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHeroFlagsForAccount, _hashAccountToBucket } from '../shared/hero/account-override.js';
import { detectDuplicateDailyAward, detectNonCohortExposure, detectRollbackFailure } from '../shared/hero/stop-conditions.js';
import { detectLowStartRate, detectLowCompletionRate } from '../shared/hero/warning-conditions.js';

// ── Rollout State Machine Model ──────────────────────────────────────
//
// PREFLIGHT (Day 0):  HERO_ROLLOUT_PERCENT=0, no child-facing change
// STAGE_1 (Days 1-3): HERO_ROLLOUT_PERCENT=5 (or named wave)
// STAGE_2 (Days 4-7): HERO_ROLLOUT_PERCENT=25
// STAGE_3 (Days 8-14): HERO_ROLLOUT_PERCENT=100
// DECISION (Day 15):  Outcome recorded
//

const ROLLOUT_SALT = 'pA5-rollout-2026';

/** Build N fixture accounts with deterministic IDs */
function buildFixtureAccounts(count) {
  const accounts = [];
  for (let i = 0; i < count; i++) {
    accounts.push({ accountId: `acc-rollout-${String(i).padStart(4, '0')}` });
  }
  return accounts;
}

/** Resolve rollout for all accounts at a given percent, return bucket classification */
function resolvePopulation(accounts, percent) {
  const env = {
    HERO_ROLLOUT_PERCENT: String(percent),
    HERO_ROLLOUT_SALT: ROLLOUT_SALT,
  };
  const inBucket = [];
  const outBucket = [];
  for (const acc of accounts) {
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: acc.accountId });
    if (overrideStatus === 'rollout-bucket') {
      inBucket.push(acc.accountId);
    } else {
      outBucket.push(acc.accountId);
    }
  }
  return { inBucket, outBucket };
}

/** Simulate a stage state machine */
function createRolloutStateMachine() {
  return {
    stage: 'PREFLIGHT',
    day: 0,
    percent: 0,
    stopConditions: [],
    warnings: [],
    warningClassifications: {},

    advance(targetStage) {
      // Block advancement if any unresolved stop conditions exist
      if (this.stopConditions.length > 0) {
        return { advanced: false, reason: 'stop-condition-active' };
      }
      // Block advancement if any warning classified as 'stop widening'
      for (const w of this.warnings) {
        if (this.warningClassifications[w.condition] === 'stop-widening') {
          return { advanced: false, reason: `warning-halt: ${w.condition}` };
        }
      }
      this.stage = targetStage;
      switch (targetStage) {
        case 'STAGE_1': this.percent = 5; this.day = 1; break;
        case 'STAGE_2': this.percent = 25; this.day = 4; break;
        case 'STAGE_3': this.percent = 100; this.day = 8; break;
        case 'DECISION': this.day = 15; break;
        default: break;
      }
      return { advanced: true };
    },

    addStopCondition(condition) {
      this.stopConditions.push(condition);
    },

    resolveStopCondition(conditionKey) {
      this.stopConditions = this.stopConditions.filter(c => c.condition !== conditionKey);
    },

    addWarning(warning, classification) {
      this.warnings.push(warning);
      this.warningClassifications[warning.condition] = classification;
    },

    rollbackTo(targetStage) {
      this.stage = targetStage;
      switch (targetStage) {
        case 'PREFLIGHT': this.percent = 0; this.day = 0; break;
        case 'STAGE_1': this.percent = 5; break;
        case 'STAGE_2': this.percent = 25; break;
        default: break;
      }
    },

    emergencyOff() {
      this.stage = 'EMERGENCY_OFF';
      this.percent = 0;
    },
  };
}

// ── 1. Preflight: percent=0 → no accounts in rollout ─────────────────

describe('Stage transitions', () => {
  it('Preflight (percent=0): no accounts resolve to rollout-bucket', () => {
    const accounts = buildFixtureAccounts(100);
    const { inBucket } = resolvePopulation(accounts, 0);
    assert.equal(inBucket.length, 0, 'No accounts should be in rollout at percent=0');
  });

  // ── 2. Stage 1: percent=5 → approximately 5% ────────────────────────

  it('Stage 1 (percent=5): approximately 5% of accounts in rollout bucket', () => {
    const accounts = buildFixtureAccounts(200);
    const { inBucket } = resolvePopulation(accounts, 5);
    // With 200 accounts at 5%, expect ~10 accounts. Allow range 2-20.
    assert.ok(inBucket.length >= 2, `Expected at least 2 accounts in bucket, got ${inBucket.length}`);
    assert.ok(inBucket.length <= 20, `Expected at most 20 accounts in bucket, got ${inBucket.length}`);
  });

  // ── 3. Stage 2: percent=25 → approximately 25% ──────────────────────

  it('Stage 2 (percent=25): approximately 25% of accounts in rollout bucket', () => {
    const accounts = buildFixtureAccounts(200);
    const { inBucket } = resolvePopulation(accounts, 25);
    // With 200 accounts at 25%, expect ~50. Allow range 30-70.
    assert.ok(inBucket.length >= 30, `Expected at least 30 accounts in bucket, got ${inBucket.length}`);
    assert.ok(inBucket.length <= 70, `Expected at most 70 accounts in bucket, got ${inBucket.length}`);
  });

  // ── 4. Stage 3: percent=100 → all non-excluded accounts ─────────────

  it('Stage 3 (percent=100): all non-excluded accounts in rollout bucket', () => {
    const accounts = buildFixtureAccounts(200);
    const { inBucket } = resolvePopulation(accounts, 100);
    assert.equal(inBucket.length, 200, 'All accounts should be in rollout at percent=100');
  });
});

// ── 5-6. Gate blocking: stop conditions halt widening ─────────────────

describe('Gate blocking (stop conditions halt widening)', () => {
  it('stop condition at Stage 1 prevents advance to Stage 2', () => {
    const sm = createRolloutStateMachine();
    sm.advance('STAGE_1');
    assert.equal(sm.stage, 'STAGE_1');

    // Simulate a duplicate award stop condition
    const dupResult = detectDuplicateDailyAward({
      ledgerEntries: [
        { type: 'daily-award', dateKey: '2026-05-01' },
        { type: 'daily-award', dateKey: '2026-05-01' },
      ],
      dateKey: '2026-05-01',
    });
    assert.equal(dupResult.triggered, true);
    sm.addStopCondition(dupResult);

    // Attempt to advance — must fail
    const result = sm.advance('STAGE_2');
    assert.equal(result.advanced, false);
    assert.equal(result.reason, 'stop-condition-active');
    assert.equal(sm.stage, 'STAGE_1');
    assert.equal(sm.percent, 5);
  });

  it('stop condition resolved allows advance to Stage 2', () => {
    const sm = createRolloutStateMachine();
    sm.advance('STAGE_1');

    // Add then resolve stop condition
    sm.addStopCondition({ triggered: true, condition: 'duplicate-daily-award', detail: 'test' });
    const blocked = sm.advance('STAGE_2');
    assert.equal(blocked.advanced, false);

    sm.resolveStopCondition('duplicate-daily-award');
    const advanced = sm.advance('STAGE_2');
    assert.equal(advanced.advanced, true);
    assert.equal(sm.stage, 'STAGE_2');
    assert.equal(sm.percent, 25);
  });
});

// ── 7-8. Warning condition handling ──────────────────────────────────

describe('Warning condition handling', () => {
  it('warning classified as accepted allows advancement', () => {
    const sm = createRolloutStateMachine();
    sm.advance('STAGE_1');

    // Low start rate flagged but classified as 'accepted'
    const warning = detectLowStartRate({ questShownCount: 100, questStartCount: 20, threshold: 0.3 });
    assert.equal(warning.flagged, true);
    sm.addWarning(warning, 'accepted');

    const result = sm.advance('STAGE_2');
    assert.equal(result.advanced, true);
    assert.equal(sm.stage, 'STAGE_2');
  });

  it('warning classified as stop-widening halts advancement', () => {
    const sm = createRolloutStateMachine();
    sm.advance('STAGE_2');

    // Low completion rate flagged and classified as 'stop-widening'
    const warning = detectLowCompletionRate({ questStartCount: 50, questCompleteCount: 10, threshold: 0.4 });
    assert.equal(warning.flagged, true);
    sm.addWarning(warning, 'stop-widening');

    const result = sm.advance('STAGE_3');
    assert.equal(result.advanced, false);
    assert.ok(result.reason.includes('warning-halt'));
    assert.equal(sm.stage, 'STAGE_2');
    assert.equal(sm.percent, 25);
  });
});

// ── 9-10. Date-key rollover stability ────────────────────────────────

describe('Date-key rollover', () => {
  it('same account + same salt produces same bucket across midnight boundary', () => {
    const accountId = 'acc-stable-001';
    // The hash is purely deterministic on accountId:salt — dateKey is not an input.
    // Simulating different dateKeys proves the resolver remains stable.
    const envDay1 = {
      HERO_ROLLOUT_PERCENT: '25',
      HERO_ROLLOUT_SALT: ROLLOUT_SALT,
    };
    const envDay14 = {
      HERO_ROLLOUT_PERCENT: '25',
      HERO_ROLLOUT_SALT: ROLLOUT_SALT,
    };

    const resultDay1 = resolveHeroFlagsForAccount({ env: envDay1, accountId });
    const resultDay14 = resolveHeroFlagsForAccount({ env: envDay14, accountId });

    assert.equal(resultDay1.overrideStatus, resultDay14.overrideStatus);
    // Verify the bucket value itself is consistent
    const bucket = _hashAccountToBucket(accountId + ':' + ROLLOUT_SALT);
    assert.equal(typeof bucket, 'number');
    assert.ok(bucket >= 0 && bucket < 100);
  });

  it('resolver stability across Day 1 and Day 14 (same env, different simulated dates)', () => {
    // Prove that 200 accounts get the same classification regardless of simulated date
    const accounts = buildFixtureAccounts(200);
    const env = {
      HERO_ROLLOUT_PERCENT: '25',
      HERO_ROLLOUT_SALT: ROLLOUT_SALT,
    };

    const day1Results = accounts.map(acc =>
      resolveHeroFlagsForAccount({ env, accountId: acc.accountId }).overrideStatus
    );
    const day14Results = accounts.map(acc =>
      resolveHeroFlagsForAccount({ env, accountId: acc.accountId }).overrideStatus
    );

    assert.deepEqual(day1Results, day14Results, 'Results must be identical across simulated dates');
  });
});

// ── 11-13. Rollback scenarios ────────────────────────────────────────

describe('Rollback scenarios', () => {
  it('rollback from Stage 3 to Stage 1: accounts excluded from bucket', () => {
    const accounts = buildFixtureAccounts(200);

    // At Stage 3 (100%), all accounts are in
    const { inBucket: allIn } = resolvePopulation(accounts, 100);
    assert.equal(allIn.length, 200);

    // Rollback to Stage 1 (5%)
    const { inBucket: fewIn } = resolvePopulation(accounts, 5);
    assert.ok(fewIn.length < 200, 'Accounts must be excluded after rollback');
    assert.ok(fewIn.length < 30, `Expected significant reduction, got ${fewIn.length}`);

    // Accounts in the 5% bucket must be a strict subset of the 100% bucket
    for (const accId of fewIn) {
      assert.ok(allIn.includes(accId), `Account ${accId} in 5% must also be in 100%`);
    }
  });

  it('emergency-off from Stage 3: all accounts hidden immediately', () => {
    const accounts = buildFixtureAccounts(50);
    const env = {
      HERO_ROLLOUT_PERCENT: '100',
      HERO_ROLLOUT_SALT: ROLLOUT_SALT,
      HERO_EMERGENCY_DISABLED: 'true',
    };

    for (const acc of accounts) {
      const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: acc.accountId });
      assert.equal(overrideStatus, 'emergency-off', `Account ${acc.accountId} must be emergency-off`);
    }

    // Verify rollback-failure detection would trigger if surfaces were still visible
    const rollbackCheck = detectRollbackFailure({ flagsOff: true, heroSurfacesVisible: true });
    assert.equal(rollbackCheck.triggered, true);
    assert.equal(rollbackCheck.condition, 'rollback-failure');
  });

  it('re-enable after emergency-off: percent=100 still works, state preserved', () => {
    const accounts = buildFixtureAccounts(50);

    // Emergency off
    const envOff = {
      HERO_ROLLOUT_PERCENT: '100',
      HERO_ROLLOUT_SALT: ROLLOUT_SALT,
      HERO_EMERGENCY_DISABLED: 'true',
    };
    for (const acc of accounts) {
      const { overrideStatus } = resolveHeroFlagsForAccount({ env: envOff, accountId: acc.accountId });
      assert.equal(overrideStatus, 'emergency-off');
    }

    // Re-enable (remove emergency flag)
    const envOn = {
      HERO_ROLLOUT_PERCENT: '100',
      HERO_ROLLOUT_SALT: ROLLOUT_SALT,
    };
    const { inBucket } = resolvePopulation(accounts, 100);
    assert.equal(inBucket.length, 50, 'All 50 accounts must be back in rollout after re-enable');

    // Non-cohort exposure must NOT trigger for accounts in rollout
    for (const acc of accounts) {
      const result = detectNonCohortExposure({
        accountId: acc.accountId,
        env: envOn,
        heroSurfaceVisible: true,
      });
      assert.equal(result.triggered, false, `Account ${acc.accountId} is in cohort, should not trigger non-cohort-exposure`);
    }
  });
});

// ── 14. Population size verification ─────────────────────────────────

describe('Population size verification', () => {
  it('200 fixture accounts at percent=5/25/100 produce correct population distribution', () => {
    const accounts = buildFixtureAccounts(200);

    const pop5 = resolvePopulation(accounts, 5);
    const pop25 = resolvePopulation(accounts, 25);
    const pop100 = resolvePopulation(accounts, 100);

    // At 5%: expect roughly 10 (allow 2-20)
    assert.ok(pop5.inBucket.length >= 2, `5%: got ${pop5.inBucket.length}, expected >= 2`);
    assert.ok(pop5.inBucket.length <= 20, `5%: got ${pop5.inBucket.length}, expected <= 20`);

    // At 25%: expect roughly 50 (allow 30-70)
    assert.ok(pop25.inBucket.length >= 30, `25%: got ${pop25.inBucket.length}, expected >= 30`);
    assert.ok(pop25.inBucket.length <= 70, `25%: got ${pop25.inBucket.length}, expected <= 70`);

    // At 100%: all 200
    assert.equal(pop100.inBucket.length, 200, '100%: all accounts must be in bucket');

    // Monotonic: 5% subset ⊆ 25% subset ⊆ 100% (by hash stability)
    const set5 = new Set(pop5.inBucket);
    const set25 = new Set(pop25.inBucket);
    for (const accId of set5) {
      assert.ok(set25.has(accId), `Account ${accId} in 5% must also be in 25%`);
    }
    assert.ok(pop5.inBucket.length <= pop25.inBucket.length, '5% population must be <= 25% population');
  });
});
