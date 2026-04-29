import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExpandedProbeResponse,
  stripPrivacyFields,
  PRIVACY_STRIP_FIELDS,
} from '../worker/src/hero/telemetry-probe.js';

// ── Fixtures ────────────────────────────────────────────────────────

function makeBaseProbeResult(count = 3) {
  return {
    events: Array.from({ length: count }, (_, i) => ({
      id: `hero-evt-${i}`,
      learnerId: 'learner-1',
      subjectId: 'grammar',
      systemId: 'hero-mode',
      eventType: 'hero.task.completed',
      data: { questId: `q${i}`, taskId: `t${i}` },
      createdAt: 1714400000000 + i * 1000,
    })),
    count,
    probedAt: '2026-04-29T12:00:00.000Z',
  };
}

function makeFullHeroState({ balance = 500, ledger = [], monsters = {} } = {}) {
  return {
    version: 2,
    economy: {
      balance,
      ledger,
    },
    heroPool: {
      monsters,
      selectedMonsterId: null,
      recentActions: [],
    },
  };
}

function makeAllFlagsEnabled() {
  return {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
    HERO_MODE_PROGRESS_ENABLED: 'true',
    HERO_MODE_ECONOMY_ENABLED: 'true',
    HERO_MODE_CAMP_ENABLED: 'true',
  };
}

function makeOverrideStatus({ isInternal = false } = {}) {
  return {
    accountId: 'acc-admin-1',
    isInternalAccount: isInternal,
    effectiveFlags: makeAllFlagsEnabled(),
  };
}

// ── buildExpandedProbeResponse ─────────────────────────────────────

describe('buildExpandedProbeResponse', () => {
  it('happy path: returns events + readiness + health for valid learner state', () => {
    const probeResult = makeBaseProbeResult(2);
    const heroState = makeFullHeroState({
      balance: 300,
      ledger: [
        { type: 'daily_completion', amount: 100, createdAt: '2026-04-29T10:00:00.000Z' },
        { type: 'camp_spend', amount: -50, createdAt: '2026-04-29T11:00:00.000Z' },
      ],
      monsters: { 'fire-dragon': { owned: true, stage: 2 } },
    });

    const result = buildExpandedProbeResponse({
      probeResult,
      heroState,
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    assert.equal(result.ok, true);
    assert.equal(result.events.length, 2);
    assert.equal(result.count, 2);
    assert.equal(typeof result.probedAt, 'string');

    // Readiness present
    assert.ok(result.readiness);
    assert.ok(Array.isArray(result.readiness.checks));
    assert.equal(result.readiness.checks.length, 5);

    // Health present
    assert.ok(result.health);
    assert.equal(typeof result.health.ledgerEntryCount, 'number');
    assert.equal(typeof result.health.balanceBucket, 'string');

    // Reconciliation present
    assert.ok(result.reconciliation);
    assert.equal(typeof result.reconciliation.hasGap, 'boolean');

    // Spend pattern present
    assert.ok(result.spendPattern);
    assert.equal(typeof result.spendPattern.rapidSpend, 'boolean');
    assert.equal(typeof result.spendPattern.spendCountToday, 'number');

    // Override status present
    assert.ok(result.overrideStatus);
    assert.equal(result.overrideStatus.accountId, 'acc-admin-1');
  });

  it('readiness checks all pass for fully-configured Hero learner', () => {
    const heroState = makeFullHeroState({
      balance: 100,
      monsters: { 'fire-dragon': { owned: true, stage: 1 } },
    });

    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(1),
      heroState,
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    assert.equal(result.readiness.overall, 'ready');
    for (const check of result.readiness.checks) {
      assert.equal(check.status, 'pass', `Check "${check.name}" should pass`);
    }
  });

  it('no Hero state returns readiness not_started and safe health defaults', () => {
    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(0),
      heroState: null,
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    assert.equal(result.readiness.overall, 'not_started');
    for (const check of result.readiness.checks) {
      assert.equal(check.status, 'not_started');
    }

    // Health returns safe defaults
    assert.equal(result.health.ledgerEntryCount, 0);
    assert.equal(result.health.duplicateAwardPreventedCount, 0);
    assert.equal(result.health.staleWriteCount, 0);
    assert.equal(result.health.balanceBucket, '0');
    assert.equal(result.health.fullyGrownMonsterCount, 0);
  });

  it('learner with negative balance reports economyHealthy fail', () => {
    const heroState = makeFullHeroState({ balance: -50 });

    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(1),
      heroState,
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    const economyCheck = result.readiness.checks.find(c => c.name === 'economyHealthy');
    assert.equal(economyCheck.status, 'fail');
    assert.equal(result.readiness.overall, 'not_ready');
  });

  it('reconciliation gap detected reports hasGap: true', () => {
    // Ledger has 5 entries but probeResult.count is only 2 events
    const heroState = makeFullHeroState({
      balance: 200,
      ledger: [
        { type: 'daily_completion', amount: 100, createdAt: '2026-04-28T10:00:00.000Z' },
        { type: 'daily_completion', amount: 100, createdAt: '2026-04-27T10:00:00.000Z' },
        { type: 'camp_spend', amount: -50, createdAt: '2026-04-28T11:00:00.000Z' },
        { type: 'camp_spend', amount: -30, createdAt: '2026-04-27T11:00:00.000Z' },
        { type: 'daily_completion', amount: 100, createdAt: '2026-04-26T10:00:00.000Z' },
      ],
      monsters: { 'fire-dragon': { owned: true, stage: 1 } },
    });

    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(2), // only 2 events in event_log
      heroState,
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    assert.equal(result.reconciliation.hasGap, true);
    assert.equal(result.reconciliation.ledgerCount, 5);
    assert.equal(result.reconciliation.eventCount, 2);
    assert.equal(result.reconciliation.gap, 3);
  });

  it('override status correctly reports internal account', () => {
    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(1),
      heroState: makeFullHeroState(),
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus({ isInternal: true }),
    });

    assert.equal(result.overrideStatus.isInternalAccount, true);
    assert.equal(result.overrideStatus.accountId, 'acc-admin-1');
  });

  it('override status correctly reports non-internal account', () => {
    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(1),
      heroState: makeFullHeroState(),
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus({ isInternal: false }),
    });

    assert.equal(result.overrideStatus.isInternalAccount, false);
  });

  it('privacy stripping applies to expanded output', () => {
    const probeResult = {
      events: [
        {
          id: 'hero-evt-1',
          learnerId: 'learner-1',
          systemId: 'hero-mode',
          eventType: 'hero.task.completed',
          data: {
            questId: 'q1',
            rawAnswer: 'secret-child-answer',
            childFreeText: 'free-text-child',
          },
          createdAt: 1714400000000,
        },
      ],
      count: 1,
      probedAt: '2026-04-29T12:00:00.000Z',
    };

    const heroState = makeFullHeroState({ balance: 100 });

    const expanded = buildExpandedProbeResponse({
      probeResult,
      heroState,
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    // Apply privacy stripping as the route would
    const stripped = stripPrivacyFields(expanded);

    // Verify privacy fields are removed from nested event data
    assert.equal('rawAnswer' in stripped.events[0].data, false);
    assert.equal('childFreeText' in stripped.events[0].data, false);

    // Non-privacy fields remain
    assert.equal(stripped.events[0].data.questId, 'q1');
    assert.equal(stripped.ok, true);
    assert.ok(stripped.readiness);
    assert.ok(stripped.health);
  });

  it('handles undefined heroState gracefully (same as null)', () => {
    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(0),
      heroState: undefined,
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    assert.equal(result.readiness.overall, 'not_started');
    assert.equal(result.health.ledgerEntryCount, 0);
    assert.equal(result.reconciliation.ledgerCount, 0);
    assert.equal(result.reconciliation.hasGap, false);
  });

  it('spend pattern detects rapid spend when 3+ camp_spend on same day', () => {
    const heroState = makeFullHeroState({
      balance: 50,
      ledger: [
        { type: 'camp_spend', amount: -10, createdAt: '2026-04-29T09:00:00.000Z' },
        { type: 'camp_spend', amount: -10, createdAt: '2026-04-29T10:00:00.000Z' },
        { type: 'camp_spend', amount: -10, createdAt: '2026-04-29T11:00:00.000Z' },
        { type: 'daily_completion', amount: 100, createdAt: '2026-04-29T08:00:00.000Z' },
      ],
      monsters: { 'fire-dragon': { owned: true, stage: 1 } },
    });

    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(1),
      heroState,
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    assert.equal(result.spendPattern.rapidSpend, true);
    assert.equal(result.spendPattern.spendCountToday, 3);
  });

  it('no reconciliation gap when ledger count equals event count', () => {
    const heroState = makeFullHeroState({
      balance: 200,
      ledger: [
        { type: 'daily_completion', amount: 100, createdAt: '2026-04-29T10:00:00.000Z' },
        { type: 'daily_completion', amount: 100, createdAt: '2026-04-28T10:00:00.000Z' },
      ],
      monsters: {},
    });

    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(2), // event count matches ledger count
      heroState,
      resolvedFlags: makeAllFlagsEnabled(),
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    assert.equal(result.reconciliation.hasGap, false);
    assert.equal(result.reconciliation.gap, 0);
  });

  it('missing flags cause readiness failure', () => {
    const heroState = makeFullHeroState({
      balance: 100,
      monsters: { 'fire-dragon': { owned: true, stage: 1 } },
    });
    const partialFlags = {
      HERO_MODE_SHADOW_ENABLED: 'true',
      // Missing 5 other flags
    };

    const result = buildExpandedProbeResponse({
      probeResult: makeBaseProbeResult(1),
      heroState,
      resolvedFlags: partialFlags,
      dateKey: '2026-04-29',
      overrideStatus: makeOverrideStatus(),
    });

    const flagsCheck = result.readiness.checks.find(c => c.name === 'flagsConfigured');
    assert.equal(flagsCheck.status, 'fail');
    assert.equal(result.readiness.overall, 'not_ready');
  });
});
