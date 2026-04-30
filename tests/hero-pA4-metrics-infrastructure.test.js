import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_LAUNCH_METRICS,
  REQUIRED_SAFETY_METRICS,
  validateMetricsMapping,
  formatExtractionRow,
  preCohortResult,
} from '../scripts/hero-pA4-metrics-validator.mjs';

import { ALL_HERO_METRICS } from '../shared/hero/metrics-contract.js';

// ── Launch metrics completeness ───────────────────────────────────────

describe('REQUIRED_LAUNCH_METRICS', () => {
  it('contains exactly 18 launch metrics', () => {
    assert.equal(REQUIRED_LAUNCH_METRICS.length, 18);
  });

  it('each metric has a unique id', () => {
    const ids = REQUIRED_LAUNCH_METRICS.map(m => m.id);
    assert.equal(new Set(ids).size, 18);
  });

  it('each metric has a non-empty name', () => {
    for (const m of REQUIRED_LAUNCH_METRICS) {
      assert.ok(m.name && m.name.length > 0, `Metric ${m.id} missing name`);
    }
  });

  it('each metric has a confidence classification (extractionSource)', () => {
    const validSources = ['server-extractable', 'client-only', 'derived'];
    for (const m of REQUIRED_LAUNCH_METRICS) {
      assert.ok(
        validSources.includes(m.extractionSource),
        `Metric ${m.id} has invalid extractionSource: '${m.extractionSource}'`,
      );
    }
  });

  it('server-extractable metrics have a queryPattern', () => {
    const serverMetrics = REQUIRED_LAUNCH_METRICS.filter(m => m.extractionSource === 'server-extractable');
    for (const m of serverMetrics) {
      assert.ok(m.queryPattern, `Server-extractable metric ${m.id} missing queryPattern`);
    }
  });

  it('client-only metrics have null queryPattern', () => {
    const clientMetrics = REQUIRED_LAUNCH_METRICS.filter(m => m.extractionSource === 'client-only');
    for (const m of clientMetrics) {
      assert.equal(m.queryPattern, null, `Client-only metric ${m.id} should have null queryPattern`);
    }
  });
});

// ── Safety metrics completeness ───────────────────────────────────────

describe('REQUIRED_SAFETY_METRICS', () => {
  it('contains exactly 10 safety metrics', () => {
    assert.equal(REQUIRED_SAFETY_METRICS.length, 10);
  });

  it('each metric has a unique id', () => {
    const ids = REQUIRED_SAFETY_METRICS.map(m => m.id);
    assert.equal(new Set(ids).size, 10);
  });

  it('each metric has a non-empty name', () => {
    for (const m of REQUIRED_SAFETY_METRICS) {
      assert.ok(m.name && m.name.length > 0, `Metric ${m.id} missing name`);
    }
  });

  it('each metric has a confidence classification (extractionSource)', () => {
    const validSources = ['server-extractable', 'client-only', 'derived'];
    for (const m of REQUIRED_SAFETY_METRICS) {
      assert.ok(
        validSources.includes(m.extractionSource),
        `Metric ${m.id} has invalid extractionSource: '${m.extractionSource}'`,
      );
    }
  });

  it('safety metrics with zero-tolerance have zeroTolerance: true', () => {
    // First 7 safety metrics must be zero-tolerance per §13.3
    const zeroToleranceIds = [
      'safety-01', 'safety-02', 'safety-03', 'safety-04',
      'safety-05', 'safety-06', 'safety-07',
    ];
    for (const id of zeroToleranceIds) {
      const metric = REQUIRED_SAFETY_METRICS.find(m => m.id === id);
      assert.ok(metric, `Safety metric ${id} not found`);
      assert.equal(metric.zeroTolerance, true, `Safety metric ${id} must have zeroTolerance: true`);
    }
  });

  it('non-zero-tolerance safety metrics have zeroTolerance: false', () => {
    const nonZeroIds = ['safety-08', 'safety-09', 'safety-10'];
    for (const id of nonZeroIds) {
      const metric = REQUIRED_SAFETY_METRICS.find(m => m.id === id);
      assert.ok(metric, `Safety metric ${id} not found`);
      assert.equal(metric.zeroTolerance, false, `Safety metric ${id} must have zeroTolerance: false`);
    }
  });
});

// ── validateMetricsMapping ────────────────────────────────────────────

describe('validateMetricsMapping', () => {
  it('returns valid: true when given the real metrics contract', () => {
    const result = validateMetricsMapping({ ALL_HERO_METRICS });
    assert.equal(result.valid, true);
  });

  it('returns 18 launch metrics in result', () => {
    const result = validateMetricsMapping({ ALL_HERO_METRICS });
    assert.equal(result.launchMetrics.length, 18);
  });

  it('returns 10 safety metrics in result', () => {
    const result = validateMetricsMapping({ ALL_HERO_METRICS });
    assert.equal(result.safetyMetrics.length, 10);
  });

  it('summary totals match', () => {
    const result = validateMetricsMapping({ ALL_HERO_METRICS });
    assert.equal(result.summary.total, 28);
    assert.equal(
      result.summary.serverExtractable + result.summary.clientOnly + result.summary.derived,
      28,
    );
  });

  it('each result metric has mapped: true', () => {
    const result = validateMetricsMapping({ ALL_HERO_METRICS });
    const allResults = [...result.launchMetrics, ...result.safetyMetrics];
    for (const m of allResults) {
      assert.equal(m.mapped, true, `Metric ${m.id} (${m.name}) not mapped`);
    }
  });

  it('reports unmapped metric when contract is empty', () => {
    const result = validateMetricsMapping({ ALL_HERO_METRICS: [] });
    // Metrics with canonicalMetric will fail; those with queryPattern or derived still pass
    const unmapped = [...result.launchMetrics, ...result.safetyMetrics].filter(m => !m.mapped);
    assert.ok(unmapped.length > 0, 'Expected some unmapped metrics with empty contract');
    assert.equal(result.valid, false);
  });

  it('each unmapped metric includes a reason', () => {
    const result = validateMetricsMapping({ ALL_HERO_METRICS: [] });
    const unmapped = [...result.launchMetrics, ...result.safetyMetrics].filter(m => !m.mapped);
    for (const m of unmapped) {
      assert.ok(m.reason, `Unmapped metric ${m.id} missing reason`);
    }
  });
});

// ── preCohortResult ───────────────────────────────────────────────────

describe('preCohortResult', () => {
  it('returns null value with explanation for metric not yet emitted', () => {
    const metric = REQUIRED_LAUNCH_METRICS[0];
    const result = preCohortResult(metric);
    assert.equal(result.value, null);
    assert.ok(result.explanation.includes(metric.name));
    assert.ok(result.explanation.includes('not yet emitted'));
  });

  it('includes extraction source in explanation', () => {
    const metric = REQUIRED_SAFETY_METRICS[0];
    const result = preCohortResult(metric);
    assert.ok(result.explanation.includes(metric.extractionSource));
  });
});

// ── formatExtractionRow (9-column provenance pattern) ─────────────────

describe('formatExtractionRow', () => {
  it('returns array with exactly 9 columns', () => {
    const metric = REQUIRED_LAUNCH_METRICS[5]; // task completion count
    const row = formatExtractionRow(metric, 42, 'cohort-alpha', 'high');
    assert.equal(row.length, 9);
  });

  it('columns match 9-column provenance pattern', () => {
    const metric = REQUIRED_LAUNCH_METRICS[5];
    const row = formatExtractionRow(metric, 42, 'cohort-alpha', 'high');
    assert.equal(row[0], metric.id);           // metricId
    assert.equal(row[1], metric.name);         // name
    assert.equal(row[2], 42);                  // value
    assert.equal(row[3], metric.extractionSource); // extractionSource
    assert.equal(row[4], metric.queryPattern); // queryPattern
    assert.equal(row[5], metric.canonicalMetric); // canonicalMetric
    assert.ok(row[6]);                         // timestamp (ISO string)
    assert.equal(row[7], 'cohort-alpha');      // cohortId
    assert.equal(row[8], 'high');              // confidence
  });

  it('handles null value for pre-cohort metric', () => {
    const metric = REQUIRED_LAUNCH_METRICS[2]; // client-only
    const row = formatExtractionRow(metric, null, 'cohort-beta', 'insufficient');
    assert.equal(row[2], null);
    assert.equal(row[4], null); // client-only has null queryPattern
    assert.equal(row[8], 'insufficient');
  });

  it('timestamp is a valid ISO date string', () => {
    const metric = REQUIRED_SAFETY_METRICS[0];
    const row = formatExtractionRow(metric, 0, 'cohort-gamma', 'high');
    const parsed = new Date(row[6]);
    assert.ok(!isNaN(parsed.getTime()), 'Timestamp must be valid ISO date');
  });
});

// ── Cross-reference with canonical metrics contract ───────────────────

describe('canonical metric cross-reference', () => {
  it('all referenced canonicalMetric names exist in ALL_HERO_METRICS', () => {
    const allMetrics = [...REQUIRED_LAUNCH_METRICS, ...REQUIRED_SAFETY_METRICS];
    const withCanonical = allMetrics.filter(m => m.canonicalMetric !== null);
    for (const m of withCanonical) {
      assert.ok(
        ALL_HERO_METRICS.includes(m.canonicalMetric),
        `Metric ${m.id} references '${m.canonicalMetric}' which is not in ALL_HERO_METRICS`,
      );
    }
  });

  it('metrics without canonicalMetric have alternative extraction (queryPattern, derived, or client-only)', () => {
    const allMetrics = [...REQUIRED_LAUNCH_METRICS, ...REQUIRED_SAFETY_METRICS];
    const withoutCanonical = allMetrics.filter(m => m.canonicalMetric === null);
    for (const m of withoutCanonical) {
      const hasAlternative = m.queryPattern !== null
        || m.extractionSource === 'derived'
        || m.extractionSource === 'client-only';
      assert.ok(
        hasAlternative,
        `Metric ${m.id} has no canonicalMetric and no alternative extraction path`,
      );
    }
  });
});
