import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductSignalsSummary,
  calculateStartRate,
  calculateCompletionRate,
  calculateReturnRate,
  analyseSubjectMix,
  analyseTaskIntentMix,
  detectAbandonmentPoints,
  detectRewardFarming,
  analyseCampUsage,
} from '../shared/hero/product-signals.js';

import {
  detectDuplicateDailyAward,
  detectDuplicateCampDebit,
  detectNegativeBalance,
  detectDeadCTA,
  detectClaimWithoutCompletion,
  detectRawChildContent,
  detectSubjectMutation,
  detectNonCohortExposure,
  detectRollbackFailure,
  detectRepeatedErrors,
} from '../shared/hero/stop-conditions.js';

import {
  REQUIRED_LAUNCH_METRICS,
  REQUIRED_SAFETY_METRICS,
} from '../scripts/hero-pA4-metrics-validator.mjs';

// ── Simulated cohort data for comprehensive tests ───────────────────

const SIMULATED_COHORT = Object.freeze({
  questShownCount: 200,
  questStartCount: 80,
  dailyCompleteCount: 48,
  activeLearnerDays: 150,
  returnNextDayCount: 97,
  subjectCompletions: { spelling: 30, grammar: 25, punctuation: 25 },
  taskIntentCompletions: { practice: 40, review: 20, strengthen: 20 },
  questSessions: [
    { abandonedAtStep: 'task-select' },
    { abandonedAtStep: 'task-select' },
    { abandonedAtStep: 'task-run' },
    { abandonedAtStep: null },
    { abandonedAtStep: null },
    { abandonedAtStep: null },
  ],
  claimTimestamps: [1000, 2000, 3000, 50000, 100000],
  campEvents: [
    { type: 'open', afterCompletion: false },
    { type: 'invite', afterCompletion: true },
    { type: 'grow', afterCompletion: true },
    { type: 'insufficient', afterCompletion: false },
  ],
});

// ── §8.2 Product Metrics — 10 required ──────────────────────────────

describe('hero-pA5 metrics sanity — product signals', () => {
  it('buildProductSignalsSummary returns all 10 product metrics', () => {
    const summary = buildProductSignalsSummary(SIMULATED_COHORT);

    // All 10 product metric fields exist
    assert.equal(typeof summary.startRate, 'number');
    assert.equal(typeof summary.completionRate, 'number');
    assert.equal(typeof summary.returnRate, 'number');
    assert.equal(typeof summary.subjectMix, 'object');
    assert.equal(typeof summary.taskIntentMix, 'object');
    assert.ok(Array.isArray(summary.abandonmentPoints));
    assert.equal(typeof summary.rewardFarming, 'object');
    assert.equal(typeof summary.campUsage, 'object');

    // Sub-fields for distribution metrics
    assert.equal(typeof summary.subjectMix.imbalanced, 'boolean');
    assert.equal(typeof summary.taskIntentMix.balanced, 'boolean');
  });

  it('calculateStartRate: 100 shown, 40 started => 0.4', () => {
    const rate = calculateStartRate({ questShownCount: 100, questStartCount: 40 });
    assert.equal(rate, 0.4);
  });

  it('calculateCompletionRate: 40 started, 24 completed => 0.6', () => {
    const rate = calculateCompletionRate({ questStartCount: 40, dailyCompleteCount: 24 });
    assert.equal(rate, 0.6);
  });

  it('calculateReturnRate: 100 exposed day 1, 65 returned day 2 => 0.65', () => {
    const rate = calculateReturnRate({ activeLearnerDays: 100, returnNextDayCount: 65 });
    assert.equal(rate, 0.65);
  });

  it('analyseSubjectMix detects imbalance when one subject > 70%', () => {
    const result = analyseSubjectMix({
      taskCompletions: { spelling: 80, grammar: 10, punctuation: 10 },
    });
    assert.equal(result.imbalanced, true);
    assert.equal(result.dominantSubject, 'spelling');
  });

  it('analyseSubjectMix reports balanced when distribution is even', () => {
    const result = analyseSubjectMix({
      taskCompletions: { spelling: 34, grammar: 33, punctuation: 33 },
    });
    assert.equal(result.imbalanced, false);
    assert.equal(result.dominantSubject, null);
  });

  it('detectAbandonmentPoints returns sorted array of abandonment steps', () => {
    const result = detectAbandonmentPoints({
      questSessions: [
        { abandonedAtStep: 'task-select' },
        { abandonedAtStep: 'task-select' },
        { abandonedAtStep: 'task-run' },
        { abandonedAtStep: null },
      ],
    });
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
    // Sorted descending by count
    assert.equal(result[0].step, 'task-select');
    assert.equal(result[0].count, 2);
    assert.equal(result[1].step, 'task-run');
    assert.equal(result[1].count, 1);
  });

  it('detectRewardFarming detects rapid claims within 5-minute window', () => {
    const now = Date.now();
    const result = detectRewardFarming({
      claimTimestamps: [now, now + 1000, now + 2000, now + 3000],
      threshold: 3,
      windowMs: 300000,
    });
    assert.equal(result.detected, true);
    assert.ok(result.instances.length > 0);
  });

  it('analyseCampUsage detects camp-before-learning pattern', () => {
    const result = analyseCampUsage({
      campEvents: [
        { type: 'open', afterCompletion: false },
        { type: 'invite', afterCompletion: false },
      ],
    });
    assert.equal(result.openCount, 1);
    assert.equal(result.inviteCount, 1);
    // usageAfterCompletion is false when no event has afterCompletion=true
    assert.equal(result.usageAfterCompletion, false);
  });
});

// ── §8.1 Launch Metrics — 14 required ───────────────────────────────

describe('hero-pA5 metrics sanity — launch metric classification', () => {
  it('all 14 launch metrics are classified without overclaiming event derivability', () => {
    // The pA5 contract requires 14 launch metrics. The pA4 validator defines
    // 18 (a superset). We verify the 14 required pA5 metrics exist within.
    const PA5_REQUIRED_LAUNCH_NAMES = [
      'eligible learner count',
      'exposed account count',
      'Hero Quest shown count',
      'Hero Quest start count',
      'Hero task start count',
      'Hero task completion count',
      'daily Hero Quest completion count',
      'claim success count',
      'claim rejection count',
      'coin award count',
      'Camp open count',
      'Camp invite/grow count',
      'route 4xx count',
      'route 5xx count',
    ];

    // Map each pA5 metric to a launch metric in the validated set
    const PA5_TO_PA4_MAPPING = {
      'eligible learner count': 'launch-01',
      'exposed account count': 'launch-02',
      'Hero Quest shown count': 'launch-03',
      'Hero Quest start count': 'launch-04',
      'Hero task start count': 'launch-05',
      'Hero task completion count': 'launch-06',
      'daily Hero Quest completion count': 'launch-07',
      'claim success count': 'launch-08',
      'claim rejection count': 'launch-09',
      'coin award count': 'launch-10',
      'Camp open count': 'launch-12',
      'Camp invite/grow count': 'launch-13',
      'route 4xx count': 'launch-18',
      'route 5xx count': 'launch-18',
    };

    for (const name of PA5_REQUIRED_LAUNCH_NAMES) {
      const mappedId = PA5_TO_PA4_MAPPING[name];
      assert.ok(mappedId, `pA5 launch metric "${name}" has a mapping`);
      const metric = REQUIRED_LAUNCH_METRICS.find(m => m.id === mappedId);
      assert.ok(metric, `pA4 metric ${mappedId} exists for "${name}"`);
      // Each metric has either a real query pattern or an explicit source
      // classification. not-observable-yet metrics must not pretend to have an
      // event_log query.
      assert.ok(
        metric.queryPattern || metric.extractionSource,
        `metric ${mappedId} is classified (has queryPattern or extractionSource)`,
      );
      if (metric.extractionSource === 'not-observable-yet') {
        assert.equal(metric.queryPattern, null, `metric ${mappedId} must not invent an event query`);
      }
    }

    const claimRejection = REQUIRED_LAUNCH_METRICS.find(m => m.id === 'launch-09');
    assert.equal(claimRejection.extractionSource, 'not-observable-yet');
    assert.equal(claimRejection.queryPattern, null);
    assert.match(claimRejection.description, /not persisted/i);
  });
});

// ── §8.3 Safety Metrics — 10 required ───────────────────────────────

describe('hero-pA5 metrics sanity — safety stop-condition functions', () => {
  it('all 10 safety metrics map to callable stop-condition functions', () => {
    const SAFETY_FUNCTIONS = [
      { name: 'duplicate daily award', fn: detectDuplicateDailyAward },
      { name: 'duplicate Camp debit', fn: detectDuplicateCampDebit },
      { name: 'negative balance', fn: detectNegativeBalance },
      { name: 'dead CTA', fn: detectDeadCTA },
      { name: 'claim without Worker-verified completion', fn: detectClaimWithoutCompletion },
      { name: 'raw child content', fn: detectRawChildContent },
      { name: 'Hero command mutating Stars/mastery', fn: detectSubjectMutation },
      { name: 'exposure to excluded accounts', fn: detectNonCohortExposure },
      { name: 'rollback failure', fn: detectRollbackFailure },
      { name: 'production 5xx spike attributable to Hero', fn: detectRepeatedErrors },
    ];

    assert.equal(SAFETY_FUNCTIONS.length, 10, 'exactly 10 safety metrics');

    for (const { name, fn } of SAFETY_FUNCTIONS) {
      assert.equal(typeof fn, 'function', `${name} maps to a callable function`);
      // Each function returns a structured result when called with empty/safe input
      const result = fn({});
      assert.equal(typeof result.triggered, 'boolean', `${name} returns { triggered: boolean }`);
      assert.equal(typeof result.condition, 'string', `${name} returns { condition: string }`);
    }
  });
});

// ── Edge cases ──────────────────────────────────────────────────────

describe('hero-pA5 metrics sanity — edge cases', () => {
  it('empty cohort data returns zeroes/nulls, not errors', () => {
    const summary = buildProductSignalsSummary({});

    assert.equal(summary.startRate, 0);
    assert.equal(summary.completionRate, 0);
    assert.equal(summary.returnRate, 0);
    assert.deepEqual(summary.subjectMix, { distribution: {}, imbalanced: false, dominantSubject: null });
    assert.deepEqual(summary.taskIntentMix, { distribution: {}, balanced: true });
    assert.deepEqual(summary.abandonmentPoints, []);
    assert.equal(summary.rewardFarming.detected, false);
    assert.equal(summary.campUsage.openCount, 0);
  });

  it('partial cohort (some learners never started) handles gracefully', () => {
    // Only questShownCount provided, no starts
    const summary = buildProductSignalsSummary({
      questShownCount: 50,
      questStartCount: 0,
      dailyCompleteCount: 0,
      activeLearnerDays: 0,
      returnNextDayCount: 0,
      subjectCompletions: {},
      taskIntentCompletions: {},
      questSessions: [],
      claimTimestamps: [],
      campEvents: [],
    });

    assert.equal(summary.startRate, 0);
    assert.equal(summary.completionRate, 0);
    assert.equal(summary.returnRate, 0);
    assert.deepEqual(summary.abandonmentPoints, []);
    assert.equal(summary.rewardFarming.detected, false);
  });
});
