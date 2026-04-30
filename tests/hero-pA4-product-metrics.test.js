import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateStartRate,
  calculateCompletionRate,
  calculateReturnRate,
  analyseSubjectMix,
  analyseTaskIntentMix,
  detectAbandonmentPoints,
  detectRewardFarming,
  analyseCampUsage,
  buildProductSignalsSummary,
} from '../shared/hero/product-signals.js';

import { generateProductSignalsReport } from '../scripts/hero-pA4-product-metrics.mjs';

// ── Start Rate ──────────────────────────────────────────────────────

describe('calculateStartRate', () => {
  it('10 shown, 7 started → 0.7', () => {
    const result = calculateStartRate({ questShownCount: 10, questStartCount: 7 });
    assert.equal(result, 0.7);
  });

  it('zero shown → 0', () => {
    assert.equal(calculateStartRate({ questShownCount: 0, questStartCount: 5 }), 0);
  });

  it('null input → 0', () => {
    assert.equal(calculateStartRate(), 0);
  });

  it('caps at 1 if startCount exceeds shownCount', () => {
    assert.equal(calculateStartRate({ questShownCount: 5, questStartCount: 10 }), 1);
  });
});

// ── Completion Rate ─────────────────────────────────────────────────

describe('calculateCompletionRate', () => {
  it('7 started, 5 completed → ~0.714', () => {
    const result = calculateCompletionRate({ questStartCount: 7, dailyCompleteCount: 5 });
    assert.ok(Math.abs(result - 5 / 7) < 0.001);
  });

  it('zero started → 0', () => {
    assert.equal(calculateCompletionRate({ questStartCount: 0, dailyCompleteCount: 3 }), 0);
  });

  it('undefined input → 0', () => {
    assert.equal(calculateCompletionRate(), 0);
  });
});

// ── Return Rate ─────────────────────────────────────────────────────

describe('calculateReturnRate', () => {
  it('5 learner-days, 3 returned → 0.6', () => {
    const result = calculateReturnRate({ activeLearnerDays: 5, returnNextDayCount: 3 });
    assert.equal(result, 0.6);
  });

  it('zero learner-days → 0', () => {
    assert.equal(calculateReturnRate({ activeLearnerDays: 0, returnNextDayCount: 2 }), 0);
  });

  it('null input → 0', () => {
    assert.equal(calculateReturnRate(), 0);
  });
});

// ── Subject Mix ─────────────────────────────────────────────────────

describe('analyseSubjectMix', () => {
  it('balanced: spelling=4, grammar=3, punctuation=3 → imbalanced=false', () => {
    const result = analyseSubjectMix({
      taskCompletions: { spelling: 4, grammar: 3, punctuation: 3 },
    });
    assert.equal(result.imbalanced, false);
    assert.equal(result.dominantSubject, null);
    assert.ok(Math.abs(result.distribution.spelling - 0.4) < 0.001);
    assert.ok(Math.abs(result.distribution.grammar - 0.3) < 0.001);
    assert.ok(Math.abs(result.distribution.punctuation - 0.3) < 0.001);
  });

  it('imbalanced: spelling=8, grammar=1, punctuation=1 → imbalanced=true, dominant=spelling', () => {
    const result = analyseSubjectMix({
      taskCompletions: { spelling: 8, grammar: 1, punctuation: 1 },
    });
    assert.equal(result.imbalanced, true);
    assert.equal(result.dominantSubject, 'spelling');
    assert.ok(result.distribution.spelling === 0.8);
  });

  it('single-subject learner: spelling=10 → NOT an error (valid state)', () => {
    const result = analyseSubjectMix({
      taskCompletions: { spelling: 10 },
    });
    // Single subject is not considered imbalanced — there is nothing to compare
    assert.equal(result.imbalanced, false);
    assert.equal(result.dominantSubject, null);
    assert.equal(result.distribution.spelling, 1);
  });

  it('empty input → neutral', () => {
    const result = analyseSubjectMix({});
    assert.equal(result.imbalanced, false);
    assert.deepEqual(result.distribution, {});
  });
});

// ── Task Intent Mix ─────────────────────────────────────────────────

describe('analyseTaskIntentMix', () => {
  it('balanced intents', () => {
    const result = analyseTaskIntentMix({
      taskCompletions: { practice: 5, review: 3, strengthen: 2 },
    });
    assert.equal(result.balanced, true);
    assert.equal(result.distribution.practice, 5);
    assert.equal(result.distribution.review, 3);
    assert.equal(result.distribution.strengthen, 2);
  });

  it('unbalanced intents (one intent >80%)', () => {
    const result = analyseTaskIntentMix({
      taskCompletions: { practice: 9, review: 1, strengthen: 0 },
    });
    assert.equal(result.balanced, false);
  });

  it('null input → neutral', () => {
    const result = analyseTaskIntentMix();
    assert.equal(result.balanced, true);
    assert.deepEqual(result.distribution, {});
  });
});

// ── Reward Farming Detection ────────────────────────────────────────

describe('detectRewardFarming', () => {
  it('4 claims within 2 minutes → detected=true', () => {
    const base = 1000000;
    const timestamps = [base, base + 30000, base + 60000, base + 90000]; // 0s, 30s, 60s, 90s
    const result = detectRewardFarming({ claimTimestamps: timestamps, threshold: 3, windowMs: 300000 });
    assert.equal(result.detected, true);
    assert.ok(result.instances.length > 0);
    assert.ok(result.instances[0].count >= 3);
  });

  it('3 claims spread over 30 minutes → detected=false', () => {
    const base = 1000000;
    const timestamps = [base, base + 600000, base + 1800000]; // 0m, 10m, 30m
    const result = detectRewardFarming({ claimTimestamps: timestamps, threshold: 3, windowMs: 300000 });
    assert.equal(result.detected, false);
    assert.deepEqual(result.instances, []);
  });

  it('empty timestamps → not detected', () => {
    const result = detectRewardFarming({ claimTimestamps: [] });
    assert.equal(result.detected, false);
  });

  it('null input → not detected', () => {
    const result = detectRewardFarming();
    assert.equal(result.detected, false);
  });

  it('exactly threshold claims at boundary → detected=true', () => {
    const base = 1000000;
    // 3 claims within exactly 300000ms (threshold=3, windowMs=300000)
    const timestamps = [base, base + 150000, base + 300000];
    const result = detectRewardFarming({ claimTimestamps: timestamps, threshold: 3, windowMs: 300000 });
    assert.equal(result.detected, true);
  });
});

// ── Abandonment Points ──────────────────────────────────────────────

describe('detectAbandonmentPoints', () => {
  it('various drop-off points counted correctly', () => {
    const sessions = [
      { abandonedAtStep: 'after-first-task' },
      { abandonedAtStep: 'after-first-task' },
      { abandonedAtStep: 'after-second-task' },
      { abandonedAtStep: null }, // completed
      { abandonedAtStep: null }, // completed
    ];
    const result = detectAbandonmentPoints({ questSessions: sessions });
    assert.equal(result.length, 2);
    assert.equal(result[0].step, 'after-first-task');
    assert.equal(result[0].count, 2);
    assert.ok(Math.abs(result[0].percentage - 0.4) < 0.001);
    assert.equal(result[1].step, 'after-second-task');
    assert.equal(result[1].count, 1);
  });

  it('no abandonment → empty array', () => {
    const sessions = [
      { abandonedAtStep: null },
      { abandonedAtStep: null },
    ];
    const result = detectAbandonmentPoints({ questSessions: sessions });
    assert.deepEqual(result, []);
  });

  it('empty input → empty array', () => {
    assert.deepEqual(detectAbandonmentPoints({}), []);
    assert.deepEqual(detectAbandonmentPoints(), []);
  });
});

// ── Camp Usage ──────────────────────────────────────────────────────

describe('analyseCampUsage', () => {
  it('events categorised correctly', () => {
    const events = [
      { type: 'open' },
      { type: 'open' },
      { type: 'invite' },
      { type: 'grow' },
      { type: 'grow' },
      { type: 'grow' },
      { type: 'insufficient' },
      { type: 'open', afterCompletion: true },
    ];
    const result = analyseCampUsage({ campEvents: events });
    assert.equal(result.openCount, 3);
    assert.equal(result.inviteCount, 1);
    assert.equal(result.growCount, 3);
    assert.equal(result.insufficientCount, 1);
    assert.equal(result.usageAfterCompletion, true);
  });

  it('no afterCompletion events → usageAfterCompletion=false', () => {
    const events = [{ type: 'open' }, { type: 'invite' }];
    const result = analyseCampUsage({ campEvents: events });
    assert.equal(result.usageAfterCompletion, false);
  });

  it('empty events → neutral', () => {
    const result = analyseCampUsage({ campEvents: [] });
    assert.equal(result.openCount, 0);
    assert.equal(result.inviteCount, 0);
    assert.equal(result.growCount, 0);
    assert.equal(result.insufficientCount, 0);
    assert.equal(result.usageAfterCompletion, false);
  });

  it('null input → neutral', () => {
    const result = analyseCampUsage();
    assert.equal(result.openCount, 0);
  });
});

// ── Empty/Null Input → Graceful Zero Values ─────────────────────────

describe('graceful null handling', () => {
  it('buildProductSignalsSummary with null → all zeroes', () => {
    const result = buildProductSignalsSummary(null);
    assert.equal(result.startRate, 0);
    assert.equal(result.completionRate, 0);
    assert.equal(result.returnRate, 0);
    assert.equal(result.subjectMix.imbalanced, false);
    assert.equal(result.rewardFarming.detected, false);
    assert.equal(result.campUsage.openCount, 0);
  });

  it('buildProductSignalsSummary with undefined → all zeroes', () => {
    const result = buildProductSignalsSummary(undefined);
    assert.equal(result.startRate, 0);
    assert.equal(result.completionRate, 0);
  });

  it('buildProductSignalsSummary with empty object → all zeroes', () => {
    const result = buildProductSignalsSummary({});
    assert.equal(result.startRate, 0);
    assert.equal(result.completionRate, 0);
    assert.equal(result.returnRate, 0);
  });
});

// ── buildProductSignalsSummary with diverse cohort ───────────────────

describe('buildProductSignalsSummary — diverse cohort', () => {
  it('produces complete output from realistic data', () => {
    const cohortData = {
      questShownCount: 100,
      questStartCount: 75,
      dailyCompleteCount: 50,
      activeLearnerDays: 200,
      returnNextDayCount: 120,
      subjectCompletions: { spelling: 40, grammar: 35, punctuation: 25 },
      taskIntentCompletions: { practice: 50, review: 30, strengthen: 20 },
      questSessions: [
        { abandonedAtStep: 'after-first-task' },
        { abandonedAtStep: 'after-first-task' },
        { abandonedAtStep: 'after-second-task' },
        { abandonedAtStep: null },
        { abandonedAtStep: null },
        { abandonedAtStep: null },
      ],
      claimTimestamps: [1000, 500000, 1000000, 1500000, 2000000],
      campEvents: [
        { type: 'open' },
        { type: 'invite' },
        { type: 'grow' },
        { type: 'open', afterCompletion: true },
      ],
    };

    const result = buildProductSignalsSummary(cohortData);

    // Funnel rates
    assert.equal(result.startRate, 0.75);
    assert.ok(Math.abs(result.completionRate - 50 / 75) < 0.001);
    assert.equal(result.returnRate, 0.6);

    // Subject mix
    assert.equal(result.subjectMix.imbalanced, false);
    assert.ok(Math.abs(result.subjectMix.distribution.spelling - 0.4) < 0.001);

    // Task intent
    assert.equal(result.taskIntentMix.balanced, true);
    assert.equal(result.taskIntentMix.distribution.practice, 50);

    // Abandonment
    assert.ok(result.abandonmentPoints.length > 0);
    assert.equal(result.abandonmentPoints[0].step, 'after-first-task');

    // No farming (claims spread over 2000s)
    assert.equal(result.rewardFarming.detected, false);

    // Camp usage
    assert.equal(result.campUsage.openCount, 2);
    assert.equal(result.campUsage.inviteCount, 1);
    assert.equal(result.campUsage.growCount, 1);
    assert.equal(result.campUsage.usageAfterCompletion, true);
  });
});

// ── generateProductSignalsReport ────────────────────────────────────

describe('generateProductSignalsReport', () => {
  it('produces titled report with all sections', () => {
    const report = generateProductSignalsReport({
      cohortId: 'test-cohort-01',
      questShownCount: 20,
      questStartCount: 15,
      dailyCompleteCount: 10,
      activeLearnerDays: 30,
      returnNextDayCount: 18,
      subjectCompletions: { spelling: 5, grammar: 5, punctuation: 5 },
      taskIntentCompletions: { practice: 5, review: 5, strengthen: 5 },
      questSessions: [],
      claimTimestamps: [],
      campEvents: [],
    });

    assert.ok(report.title.includes('pA4'));
    assert.equal(report.cohortId, 'test-cohort-01');
    assert.ok(report.generatedAt);
    assert.equal(report.funnelRates.startRate, 0.75);
    assert.ok(Math.abs(report.funnelRates.completionRate - 10 / 15) < 0.001);
    assert.equal(report.funnelRates.returnRate, 0.6);
    assert.equal(report.subjectMix.imbalanced, false);
    assert.equal(report.taskIntentMix.balanced, true);
    assert.deepEqual(report.abandonmentPoints, []);
    assert.equal(report.rewardFarming.detected, false);
    assert.equal(report.verdict.healthy, true);
    assert.deepEqual(report.verdict.flags, []);
  });

  it('flags low rates and farming in verdict', () => {
    const base = 1000;
    const report = generateProductSignalsReport({
      questShownCount: 100,
      questStartCount: 10,      // 10% start rate → low
      dailyCompleteCount: 2,    // 20% completion → low
      activeLearnerDays: 50,
      returnNextDayCount: 5,    // 10% return → low
      subjectCompletions: { spelling: 9, grammar: 1, punctuation: 0 },
      taskIntentCompletions: { practice: 8, review: 1, strengthen: 1 },
      questSessions: [],
      claimTimestamps: [base, base + 10, base + 20, base + 30], // farming
      campEvents: [],
    });

    assert.equal(report.verdict.healthy, false);
    assert.ok(report.verdict.flags.includes('low-start-rate'));
    assert.ok(report.verdict.flags.includes('low-completion-rate'));
    assert.ok(report.verdict.flags.includes('low-return-rate'));
    assert.ok(report.verdict.flags.includes('subject-imbalanced'));
    assert.ok(report.verdict.flags.includes('reward-farming-detected'));
  });
});
