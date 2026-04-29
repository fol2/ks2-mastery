import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyBalanceBucket,
  deriveHeroHealthIndicators,
} from '../worker/src/hero/analytics.js';

import { deriveReadinessChecks } from '../worker/src/hero/readiness.js';

// ── classifyBalanceBucket ───────────────────────────────────────────

describe('classifyBalanceBucket', () => {
  it('returns "0" for zero balance', () => {
    assert.equal(classifyBalanceBucket(0), '0');
  });

  it('returns "1-99" for balance 1', () => {
    assert.equal(classifyBalanceBucket(1), '1-99');
  });

  it('returns "1-99" for balance 99', () => {
    assert.equal(classifyBalanceBucket(99), '1-99');
  });

  it('returns "100-299" for balance 100', () => {
    assert.equal(classifyBalanceBucket(100), '100-299');
  });

  it('returns "100-299" for balance 299', () => {
    assert.equal(classifyBalanceBucket(299), '100-299');
  });

  it('returns "300-599" for balance 300', () => {
    assert.equal(classifyBalanceBucket(300), '300-599');
  });

  it('returns "300-599" for balance 599', () => {
    assert.equal(classifyBalanceBucket(599), '300-599');
  });

  it('returns "600-999" for balance 600', () => {
    assert.equal(classifyBalanceBucket(600), '600-999');
  });

  it('returns "600-999" for balance 999', () => {
    assert.equal(classifyBalanceBucket(999), '600-999');
  });

  it('returns "1000+" for balance 1000', () => {
    assert.equal(classifyBalanceBucket(1000), '1000+');
  });

  it('returns "1000+" for balance 5000', () => {
    assert.equal(classifyBalanceBucket(5000), '1000+');
  });

  it('returns "0" for negative balance', () => {
    assert.equal(classifyBalanceBucket(-10), '0');
  });

  it('returns "0" for NaN', () => {
    assert.equal(classifyBalanceBucket(NaN), '0');
  });

  it('returns "0" for non-number input', () => {
    assert.equal(classifyBalanceBucket('100'), '0');
  });
});

// ── deriveHeroHealthIndicators ──────────────────────────────────────

describe('deriveHeroHealthIndicators', () => {
  it('returns correct counts for healthy state', () => {
    const heroState = {
      economy: { balance: 450 },
      heroPool: {
        monsters: {
          glossbloom: { owned: true, stage: 4 },
          loomrill: { owned: true, stage: 2 },
          mirrane: { owned: false, stage: 0 },
        },
      },
    };
    const ledger = [
      { type: 'daily-completion-award', amount: 100 },
      { type: 'daily-completion-award', amount: 100, deduplicated: true },
      { type: 'monster-invite', amount: -150, staleWrite: true },
    ];

    const result = deriveHeroHealthIndicators(heroState, ledger);

    assert.equal(result.duplicateAwardPreventedCount, 1);
    assert.equal(result.staleWriteCount, 1);
    assert.equal(result.balanceBucket, '300-599');
    assert.equal(result.ledgerEntryCount, 3);
    assert.equal(result.fullyGrownMonsterCount, 1);
    assert.deepEqual(result.monsterDistribution, { glossbloom: 4, loomrill: 2 });
  });

  it('returns zero counts for empty state', () => {
    const result = deriveHeroHealthIndicators(null, null);

    assert.equal(result.duplicateAwardPreventedCount, 0);
    assert.equal(result.staleWriteCount, 0);
    assert.equal(result.balanceBucket, '0');
    assert.equal(result.ledgerEntryCount, 0);
    assert.equal(result.fullyGrownMonsterCount, 0);
    assert.deepEqual(result.monsterDistribution, {});
  });

  it('handles state with no monsters gracefully', () => {
    const heroState = { economy: { balance: 100 }, heroPool: null };
    const result = deriveHeroHealthIndicators(heroState, []);

    assert.equal(result.fullyGrownMonsterCount, 0);
    assert.deepEqual(result.monsterDistribution, {});
    assert.equal(result.balanceBucket, '100-299');
  });

  it('does not count unowned monsters in distribution', () => {
    const heroState = {
      economy: { balance: 0 },
      heroPool: {
        monsters: {
          glossbloom: { owned: false, stage: 0 },
          loomrill: { owned: true, stage: 3 },
        },
      },
    };
    const result = deriveHeroHealthIndicators(heroState, []);

    assert.equal(result.fullyGrownMonsterCount, 0);
    assert.deepEqual(result.monsterDistribution, { loomrill: 3 });
  });
});

// ── deriveReadinessChecks ───────────────────────────────────────────

describe('deriveReadinessChecks', () => {
  const allFlagsOn = {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
    HERO_MODE_PROGRESS_ENABLED: 'true',
    HERO_MODE_ECONOMY_ENABLED: 'true',
    HERO_MODE_CAMP_ENABLED: 'true',
  };

  const healthyState = {
    version: 3,
    economy: { balance: 200, ledger: [] },
    heroPool: { monsters: { glossbloom: { owned: true, stage: 2 } } },
  };

  it('returns overall "ready" when all flags on and state healthy', () => {
    const result = deriveReadinessChecks(healthyState, allFlagsOn);

    assert.equal(result.overall, 'ready');
    assert.equal(result.checks.length, 5);
    for (const check of result.checks) {
      assert.equal(check.status, 'pass', `Expected ${check.name} to pass`);
    }
  });

  it('returns overall "not_ready" when flags are missing', () => {
    const partialFlags = {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      // missing the rest
    };
    const result = deriveReadinessChecks(healthyState, partialFlags);

    assert.equal(result.overall, 'not_ready');
    const flagsCheck = result.checks.find(c => c.name === 'flagsConfigured');
    assert.equal(flagsCheck.status, 'fail');
    assert.ok(flagsCheck.detail.includes('HERO_MODE_CHILD_UI_ENABLED'));
    assert.ok(flagsCheck.detail.includes('HERO_MODE_PROGRESS_ENABLED'));
  });

  it('returns overall "not_started" when state is null', () => {
    const result = deriveReadinessChecks(null, allFlagsOn);

    assert.equal(result.overall, 'not_started');
    for (const check of result.checks) {
      assert.equal(check.status, 'not_started', `Expected ${check.name} to be not_started`);
    }
  });

  it('returns overall "not_started" when state is undefined', () => {
    const result = deriveReadinessChecks(undefined, allFlagsOn);

    assert.equal(result.overall, 'not_started');
  });

  it('fails economyHealthy when economy state is missing', () => {
    const state = { version: 3, heroPool: { monsters: {} } };
    const result = deriveReadinessChecks(state, allFlagsOn);

    const check = result.checks.find(c => c.name === 'economyHealthy');
    assert.equal(check.status, 'fail');
    assert.equal(result.overall, 'not_ready');
  });

  it('fails campHealthy when heroPool is missing', () => {
    const state = { version: 3, economy: { balance: 100, ledger: [] } };
    const result = deriveReadinessChecks(state, allFlagsOn);

    const check = result.checks.find(c => c.name === 'campHealthy');
    assert.equal(check.status, 'fail');
  });

  it('detects corruption: negative balance', () => {
    const corruptState = {
      version: 3,
      economy: { balance: -50, ledger: [] },
      heroPool: { monsters: {} },
    };
    const result = deriveReadinessChecks(corruptState, allFlagsOn);

    const noCorrupt = result.checks.find(c => c.name === 'noCorruptState');
    assert.equal(noCorrupt.status, 'fail');
    assert.ok(noCorrupt.detail.includes('negative-balance'));
  });

  it('detects corruption: null ledger entry', () => {
    const corruptState = {
      version: 3,
      economy: { balance: 100, ledger: [null, { type: 'daily-completion-award' }] },
      heroPool: { monsters: {} },
    };
    const result = deriveReadinessChecks(corruptState, allFlagsOn);

    const noCorrupt = result.checks.find(c => c.name === 'noCorruptState');
    assert.equal(noCorrupt.status, 'fail');
    assert.ok(noCorrupt.detail.includes('null-ledger-entry'));
  });
});

// ── Isolation: no analytics leak into child read model ──────────────

describe('analytics isolation from child read model', () => {
  it('analytics module exports do not include child-visible fields', () => {
    // The analytics module returns admin-only fields that must never appear
    // in the child-facing read model response. Verify the shape only contains
    // the documented admin-telemetry keys.
    const result = deriveHeroHealthIndicators(
      { economy: { balance: 500 }, heroPool: { monsters: {} } },
      [],
    );

    const allowedKeys = new Set([
      'duplicateAwardPreventedCount',
      'staleWriteCount',
      'balanceBucket',
      'ledgerEntryCount',
      'fullyGrownMonsterCount',
      'monsterDistribution',
    ]);

    const actualKeys = Object.keys(result);
    for (const key of actualKeys) {
      assert.ok(allowedKeys.has(key), `Unexpected key "${key}" in analytics output — must not leak into child model`);
    }

    // Ensure no child-model fields like 'tasks', 'quest', 'ui', 'economy', 'camp' present
    const childModelFields = ['tasks', 'quest', 'ui', 'economy', 'camp', 'dailyQuest', 'progress', 'launch'];
    for (const field of childModelFields) {
      assert.ok(!(field in result), `Child model field "${field}" found in analytics output`);
    }
  });
});
