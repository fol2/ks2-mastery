import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectLowStartRate,
  detectLowCompletionRate,
  detectRepeatedAbandonment,
  detectCampBeforeLearning,
  detectCoinMisunderstanding,
  detectTelemetryBlindSpots,
  detectSubjectDominance,
  detectSupportCluster,
  detectSlowPerformance,
  evaluateAllWarnings,
} from '../shared/hero/warning-conditions.js';

// ── 1. Low Start Rate ───────────────────────────────────────────────

describe('detectLowStartRate', () => {
  it('flags when start rate is below threshold', () => {
    const result = detectLowStartRate({ questShownCount: 100, questStartCount: 20, threshold: 0.3 });
    assert.equal(result.flagged, true);
    assert.equal(result.condition, 'low-start-rate');
    assert.equal(result.severity, 'warning');
    assert.ok(result.detail.includes('20.0%'));
    assert.ok(result.recommendation.length > 0);
  });

  it('does not flag when start rate meets threshold', () => {
    const result = detectLowStartRate({ questShownCount: 100, questStartCount: 30, threshold: 0.3 });
    assert.equal(result.flagged, false);
    assert.equal(result.condition, 'low-start-rate');
  });

  it('does not flag when start rate exceeds threshold', () => {
    const result = detectLowStartRate({ questShownCount: 100, questStartCount: 50, threshold: 0.3 });
    assert.equal(result.flagged, false);
  });

  it('handles null input gracefully', () => {
    assert.equal(detectLowStartRate(null).flagged, false);
    assert.equal(detectLowStartRate(undefined).flagged, false);
    assert.equal(detectLowStartRate({}).flagged, false);
  });

  it('handles zero questShownCount gracefully', () => {
    const result = detectLowStartRate({ questShownCount: 0, questStartCount: 0 });
    assert.equal(result.flagged, false);
  });
});

// ── 2. Low Completion Rate ──────────────────────────────────────────

describe('detectLowCompletionRate', () => {
  it('flags when completion rate is below threshold', () => {
    const result = detectLowCompletionRate({ questStartCount: 50, questCompleteCount: 15, threshold: 0.4 });
    assert.equal(result.flagged, true);
    assert.equal(result.condition, 'low-completion-rate');
    assert.equal(result.severity, 'warning');
    assert.ok(result.detail.includes('30.0%'));
  });

  it('does not flag when completion rate meets threshold', () => {
    const result = detectLowCompletionRate({ questStartCount: 50, questCompleteCount: 20, threshold: 0.4 });
    assert.equal(result.flagged, false);
    assert.equal(result.condition, 'low-completion-rate');
  });

  it('does not flag when completion rate exceeds threshold', () => {
    const result = detectLowCompletionRate({ questStartCount: 50, questCompleteCount: 40, threshold: 0.4 });
    assert.equal(result.flagged, false);
  });

  it('handles null input gracefully', () => {
    assert.equal(detectLowCompletionRate(null).flagged, false);
    assert.equal(detectLowCompletionRate(undefined).flagged, false);
    assert.equal(detectLowCompletionRate({}).flagged, false);
  });

  it('handles zero questStartCount gracefully', () => {
    const result = detectLowCompletionRate({ questStartCount: 0, questCompleteCount: 0 });
    assert.equal(result.flagged, false);
  });
});

// ── 3. Repeated Abandonment ─────────────────────────────────────────

describe('detectRepeatedAbandonment', () => {
  it('flags when abandonment points reach threshold', () => {
    const result = detectRepeatedAbandonment({ abandonmentPoints: 3, threshold: 3 });
    assert.equal(result.flagged, true);
    assert.equal(result.condition, 'repeated-abandonment');
    assert.equal(result.severity, 'warning');
    assert.ok(result.detail.includes('3'));
  });

  it('does not flag when abandonment points are below threshold', () => {
    const result = detectRepeatedAbandonment({ abandonmentPoints: 2, threshold: 3 });
    assert.equal(result.flagged, false);
    assert.equal(result.condition, 'repeated-abandonment');
  });

  it('flags when exceeding threshold', () => {
    const result = detectRepeatedAbandonment({ abandonmentPoints: 5, threshold: 3 });
    assert.equal(result.flagged, true);
  });

  it('handles null input gracefully', () => {
    assert.equal(detectRepeatedAbandonment(null).flagged, false);
    assert.equal(detectRepeatedAbandonment(undefined).flagged, false);
    assert.equal(detectRepeatedAbandonment({}).flagged, false);
  });

  it('handles non-numeric input gracefully', () => {
    assert.equal(detectRepeatedAbandonment({ abandonmentPoints: 'many' }).flagged, false);
  });
});

// ── 4. Camp Before Learning ─────────────────────────────────────────

describe('detectCampBeforeLearning', () => {
  it('flags when camp opens exceed ratio to quest starts', () => {
    const result = detectCampBeforeLearning({ campOpenCount: 20, questStartCount: 10, ratio: 0.5 });
    assert.equal(result.flagged, true);
    assert.equal(result.condition, 'camp-before-learning');
    assert.equal(result.severity, 'warning');
  });

  it('flags when children open Camp with zero quest starts', () => {
    const result = detectCampBeforeLearning({ campOpenCount: 5, questStartCount: 0 });
    assert.equal(result.flagged, true);
    assert.ok(result.detail.includes('0 quest starts'));
  });

  it('does not flag when ratio is at or below threshold', () => {
    const result = detectCampBeforeLearning({ campOpenCount: 5, questStartCount: 10, ratio: 0.5 });
    assert.equal(result.flagged, false);
    assert.equal(result.condition, 'camp-before-learning');
  });

  it('does not flag when ratio equals threshold exactly', () => {
    // ratio = 5/10 = 0.5, threshold = 0.5 → not flagged (> not >=)
    const result = detectCampBeforeLearning({ campOpenCount: 5, questStartCount: 10, ratio: 0.5 });
    assert.equal(result.flagged, false);
  });

  it('handles null input gracefully', () => {
    assert.equal(detectCampBeforeLearning(null).flagged, false);
    assert.equal(detectCampBeforeLearning(undefined).flagged, false);
    assert.equal(detectCampBeforeLearning({}).flagged, false);
  });
});

// ── 5. Coin Misunderstanding ────────────────────────────────────────

describe('detectCoinMisunderstanding', () => {
  it('flags when support reports mention coin keyword', () => {
    const result = detectCoinMisunderstanding({
      supportReports: [
        { text: 'My child spent real coins in the app?' },
        { text: 'Login issue' },
      ],
    });
    assert.equal(result.flagged, true);
    assert.equal(result.condition, 'coin-misunderstanding');
    assert.equal(result.severity, 'warning');
    assert.ok(result.detail.includes('1 support report'));
  });

  it('does not flag when no reports mention keyword', () => {
    const result = detectCoinMisunderstanding({
      supportReports: [
        { text: 'Login issue' },
        { text: 'App crashes on start' },
      ],
    });
    assert.equal(result.flagged, false);
    assert.equal(result.condition, 'coin-misunderstanding');
  });

  it('uses custom keyword when provided', () => {
    const result = detectCoinMisunderstanding({
      supportReports: [{ text: 'What is the payment for?' }],
      keyword: 'payment',
    });
    assert.equal(result.flagged, true);
    assert.ok(result.detail.includes('payment'));
  });

  it('handles null input gracefully', () => {
    assert.equal(detectCoinMisunderstanding(null).flagged, false);
    assert.equal(detectCoinMisunderstanding(undefined).flagged, false);
    assert.equal(detectCoinMisunderstanding({}).flagged, false);
  });

  it('handles empty support reports array', () => {
    assert.equal(detectCoinMisunderstanding({ supportReports: [] }).flagged, false);
  });
});

// ── 6. Telemetry Blind Spots ────────────────────────────────────────

describe('detectTelemetryBlindSpots', () => {
  it('flags when expected signals are missing from actual', () => {
    const result = detectTelemetryBlindSpots({
      expectedSignals: ['quest-start', 'quest-complete', 'camp-open'],
      actualSignals: ['quest-start'],
    });
    assert.equal(result.flagged, true);
    assert.equal(result.condition, 'telemetry-blind-spots');
    assert.equal(result.severity, 'warning');
    assert.ok(result.detail.includes('quest-complete'));
    assert.ok(result.detail.includes('camp-open'));
  });

  it('does not flag when all expected signals are present', () => {
    const result = detectTelemetryBlindSpots({
      expectedSignals: ['quest-start', 'quest-complete'],
      actualSignals: ['quest-start', 'quest-complete', 'camp-open'],
    });
    assert.equal(result.flagged, false);
    assert.equal(result.condition, 'telemetry-blind-spots');
  });

  it('does not flag when expected is empty', () => {
    const result = detectTelemetryBlindSpots({
      expectedSignals: [],
      actualSignals: ['quest-start'],
    });
    assert.equal(result.flagged, false);
  });

  it('handles null input gracefully', () => {
    assert.equal(detectTelemetryBlindSpots(null).flagged, false);
    assert.equal(detectTelemetryBlindSpots(undefined).flagged, false);
    assert.equal(detectTelemetryBlindSpots({}).flagged, false);
  });
});

// ── 7. Subject Dominance ────────────────────────────────────────────

describe('detectSubjectDominance', () => {
  it('flags when one subject exceeds dominance threshold', () => {
    const result = detectSubjectDominance({
      subjectMix: { spelling: 80, grammar: 10, punctuation: 10 },
      dominanceThreshold: 0.7,
    });
    assert.equal(result.flagged, true);
    assert.equal(result.condition, 'subject-dominance');
    assert.equal(result.severity, 'warning');
    assert.ok(result.detail.includes('spelling'));
    assert.ok(result.detail.includes('80.0%'));
  });

  it('does not flag when no subject reaches threshold', () => {
    const result = detectSubjectDominance({
      subjectMix: { spelling: 40, grammar: 35, punctuation: 25 },
      dominanceThreshold: 0.7,
    });
    assert.equal(result.flagged, false);
    assert.equal(result.condition, 'subject-dominance');
  });

  it('flags at exactly the threshold boundary', () => {
    // 70/100 = 0.7 which equals threshold → flagged (>=)
    const result = detectSubjectDominance({
      subjectMix: { spelling: 70, grammar: 30 },
      dominanceThreshold: 0.7,
    });
    assert.equal(result.flagged, true);
  });

  it('does not flag just below threshold', () => {
    // 69/100 = 0.69 < 0.7 → not flagged
    const result = detectSubjectDominance({
      subjectMix: { spelling: 69, grammar: 31 },
      dominanceThreshold: 0.7,
    });
    assert.equal(result.flagged, false);
  });

  it('handles null input gracefully', () => {
    assert.equal(detectSubjectDominance(null).flagged, false);
    assert.equal(detectSubjectDominance(undefined).flagged, false);
    assert.equal(detectSubjectDominance({}).flagged, false);
  });

  it('handles empty subjectMix', () => {
    assert.equal(detectSubjectDominance({ subjectMix: {} }).flagged, false);
  });
});

// ── 8. Support Cluster ──────────────────────────────────────────────

describe('detectSupportCluster', () => {
  it('flags when one category exceeds cluster threshold', () => {
    const result = detectSupportCluster({
      supportCategories: { billing: 60, technical: 30, other: 10 },
      clusterThreshold: 0.5,
    });
    assert.equal(result.flagged, true);
    assert.equal(result.condition, 'support-cluster');
    assert.equal(result.severity, 'warning');
    assert.ok(result.detail.includes('billing'));
    assert.ok(result.detail.includes('60.0%'));
  });

  it('does not flag when no category exceeds threshold', () => {
    const result = detectSupportCluster({
      supportCategories: { billing: 30, technical: 40, other: 30 },
      clusterThreshold: 0.5,
    });
    assert.equal(result.flagged, false);
    assert.equal(result.condition, 'support-cluster');
  });

  it('does not flag at exactly the threshold boundary', () => {
    // 50/100 = 0.5, threshold = 0.5 → not flagged (> not >=)
    const result = detectSupportCluster({
      supportCategories: { billing: 50, technical: 50 },
      clusterThreshold: 0.5,
    });
    assert.equal(result.flagged, false);
  });

  it('flags just above threshold', () => {
    // 51/100 = 0.51 > 0.5 → flagged
    const result = detectSupportCluster({
      supportCategories: { billing: 51, technical: 49 },
      clusterThreshold: 0.5,
    });
    assert.equal(result.flagged, true);
  });

  it('handles null input gracefully', () => {
    assert.equal(detectSupportCluster(null).flagged, false);
    assert.equal(detectSupportCluster(undefined).flagged, false);
    assert.equal(detectSupportCluster({}).flagged, false);
  });

  it('handles empty supportCategories', () => {
    assert.equal(detectSupportCluster({ supportCategories: {} }).flagged, false);
  });
});

// ── 9. Slow Performance ─────────────────────────────────────────────

describe('detectSlowPerformance', () => {
  it('flags when latency meets threshold', () => {
    const result = detectSlowPerformance({ latencyMs: 2000, threshold: 2000 });
    assert.equal(result.flagged, true);
    assert.equal(result.condition, 'slow-performance');
    assert.equal(result.severity, 'warning');
    assert.ok(result.detail.includes('2000ms'));
  });

  it('flags when latency exceeds threshold', () => {
    const result = detectSlowPerformance({ latencyMs: 3500, threshold: 2000 });
    assert.equal(result.flagged, true);
    assert.ok(result.detail.includes('3500ms'));
  });

  it('does not flag when latency is below threshold', () => {
    const result = detectSlowPerformance({ latencyMs: 1999, threshold: 2000 });
    assert.equal(result.flagged, false);
    assert.equal(result.condition, 'slow-performance');
  });

  it('does not flag when latency is well below threshold', () => {
    const result = detectSlowPerformance({ latencyMs: 500, threshold: 2000 });
    assert.equal(result.flagged, false);
  });

  it('handles null input gracefully', () => {
    assert.equal(detectSlowPerformance(null).flagged, false);
    assert.equal(detectSlowPerformance(undefined).flagged, false);
    assert.equal(detectSlowPerformance({}).flagged, false);
  });

  it('handles non-numeric latency gracefully', () => {
    assert.equal(detectSlowPerformance({ latencyMs: 'slow' }).flagged, false);
  });
});

// ── evaluateAllWarnings ─────────────────────────────────────────────

describe('evaluateAllWarnings', () => {
  it('returns only flagged results from mixed data', () => {
    const metrics = {
      // triggers low start rate (10/100 = 10% < 30%)
      questShownCount: 100,
      questStartCount: 10,
      questCompleteCount: 8,
      // triggers slow performance
      latencyMs: 3000,
      // does NOT trigger repeated abandonment (below default 3)
      abandonmentPoints: 1,
      // does NOT trigger camp-before-learning (5/10 = 0.5, not > 0.5)
      campOpenCount: 5,
      // does NOT trigger coin misunderstanding (no reports)
      supportReports: [],
      // does NOT trigger telemetry blind spots (all present)
      expectedSignals: ['quest-start'],
      actualSignals: ['quest-start'],
      // does NOT trigger subject dominance (balanced)
      subjectMix: { spelling: 40, grammar: 60 },
      // does NOT trigger support cluster (both at 50%, not > 50%)
      supportCategories: { billing: 50, technical: 50 },
    };
    const results = evaluateAllWarnings(metrics);
    // start rate = 10/100 = 10% < 30% → flagged
    // completion rate = 8/10 = 80% ≥ 40% → NOT flagged
    // slow-performance: 3000ms ≥ 2000ms → flagged
    // support-cluster: 50/100 = 50%, not > 50% → NOT flagged
    const conditions = results.map((r) => r.condition);
    assert.ok(conditions.includes('low-start-rate'));
    assert.ok(conditions.includes('slow-performance'));
    assert.ok(!conditions.includes('support-cluster'));
    assert.ok(!conditions.includes('repeated-abandonment'));
    // All results have flagged=true
    for (const r of results) {
      assert.equal(r.flagged, true);
      assert.equal(r.severity, 'warning');
    }
  });

  it('returns empty array when no conditions are flagged', () => {
    const metrics = {
      questShownCount: 100,
      questStartCount: 50,
      questCompleteCount: 40,
      abandonmentPoints: 0,
      campOpenCount: 10,
      latencyMs: 500,
      supportReports: [],
      expectedSignals: ['a'],
      actualSignals: ['a'],
      subjectMix: { spelling: 50, grammar: 50 },
      supportCategories: { billing: 50, technical: 50 },
    };
    const results = evaluateAllWarnings(metrics);
    assert.equal(results.length, 0);
  });

  it('returns empty array for null input', () => {
    assert.deepEqual(evaluateAllWarnings(null), []);
    assert.deepEqual(evaluateAllWarnings(undefined), []);
  });
});
