// P7 Unit 5: buildBusinessKpiModel — pure logic test.
//
// Verifies the display model builder handles full data, empty/null input,
// and partial failures (some sections null) correctly.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildBusinessKpiModel } from '../src/platform/hubs/admin-business-kpi.js';

// ---------------------------------------------------------------------------
// Null / empty input
// ---------------------------------------------------------------------------

describe('buildBusinessKpiModel with null or empty input', () => {
  it('returns empty model for null', () => {
    const result = buildBusinessKpiModel(null);
    assert.deepEqual(result.sections, []);
    assert.equal(result.refreshedAt, null);
    assert.equal(result.hasData, false);
  });

  it('returns empty model for undefined', () => {
    const result = buildBusinessKpiModel(undefined);
    assert.deepEqual(result.sections, []);
    assert.equal(result.hasData, false);
  });

  it('returns empty model for empty object', () => {
    const result = buildBusinessKpiModel({});
    assert.deepEqual(result.sections, []);
    assert.equal(result.hasData, false);
  });

  it('returns empty model for non-object primitives', () => {
    assert.equal(buildBusinessKpiModel(42).hasData, false);
    assert.equal(buildBusinessKpiModel('string').hasData, false);
    assert.equal(buildBusinessKpiModel(true).hasData, false);
  });
});

// ---------------------------------------------------------------------------
// Full data
// ---------------------------------------------------------------------------

describe('buildBusinessKpiModel with full data', () => {
  const fullData = {
    accounts: { real: 150, demo: 30, total: 180 },
    activation: { day1: 12, day7: 45, day30: 100 },
    retention: { newThisWeek: 8, returnedIn7d: 25, returnedIn30d: 60 },
    conversion: { demoStarts: 20, resets: 5, conversions: 10, rate7d: 15.5, rate30d: 12.3 },
    subjectEngagement: { spelling: 200, grammar: 150, punctuation: 80 },
    supportFriction: { repeatedErrors: 3, denials: 2, paymentHolds: 1, suspendedAccounts: 0, unresolvedIncidents: 0 },
    refreshedAt: '2026-04-29T10:00:00.000Z',
  };

  it('returns hasData true', () => {
    const result = buildBusinessKpiModel(fullData);
    assert.equal(result.hasData, true);
  });

  it('returns correct refreshedAt', () => {
    const result = buildBusinessKpiModel(fullData);
    assert.equal(result.refreshedAt, '2026-04-29T10:00:00.000Z');
  });

  it('produces 6 sections', () => {
    const result = buildBusinessKpiModel(fullData);
    assert.equal(result.sections.length, 6);
  });

  it('accounts section has real/demo/total metrics with correct scopes', () => {
    const result = buildBusinessKpiModel(fullData);
    const accountsSection = result.sections.find((s) => s.key === 'accounts');
    assert.ok(accountsSection);
    assert.equal(accountsSection.metrics.length, 3);
    assert.equal(accountsSection.metrics[0].scope, 'real');
    assert.equal(accountsSection.metrics[0].value, 150);
    assert.equal(accountsSection.metrics[1].scope, 'demo');
    assert.equal(accountsSection.metrics[1].value, 30);
    assert.equal(accountsSection.metrics[2].scope, 'both');
    assert.equal(accountsSection.metrics[2].value, 180);
  });

  it('activation section metrics are all scoped to real', () => {
    const result = buildBusinessKpiModel(fullData);
    const section = result.sections.find((s) => s.key === 'activation');
    assert.ok(section);
    for (const m of section.metrics) {
      assert.equal(m.scope, 'real');
    }
  });

  it('retention section metrics are all scoped to real', () => {
    const result = buildBusinessKpiModel(fullData);
    const section = result.sections.find((s) => s.key === 'retention');
    assert.ok(section);
    for (const m of section.metrics) {
      assert.equal(m.scope, 'real');
    }
  });

  it('conversion section has % suffix on rate metrics', () => {
    const result = buildBusinessKpiModel(fullData);
    const section = result.sections.find((s) => s.key === 'conversion');
    assert.ok(section);
    const rate7d = section.metrics.find((m) => m.label.includes('7d'));
    const rate30d = section.metrics.find((m) => m.label.includes('30d'));
    assert.equal(rate7d.suffix, '%');
    assert.equal(rate30d.suffix, '%');
    assert.equal(rate7d.value, 15.5);
    assert.equal(rate30d.value, 12.3);
  });

  it('subject engagement section maps subject keys to labelled metrics', () => {
    const result = buildBusinessKpiModel(fullData);
    const section = result.sections.find((s) => s.key === 'subjectEngagement');
    assert.ok(section);
    assert.equal(section.metrics.length, 3);
    const spellingMetric = section.metrics.find((m) => m.label.includes('Spelling'));
    assert.equal(spellingMetric.value, 200);
    assert.equal(spellingMetric.scope, 'real');
  });

  it('support friction section exposes all 5 friction indicators', () => {
    const result = buildBusinessKpiModel(fullData);
    const section = result.sections.find((s) => s.key === 'supportFriction');
    assert.ok(section);
    assert.equal(section.metrics.length, 5);
    const holds = section.metrics.find((m) => m.label.includes('Payment'));
    assert.equal(holds.value, 1);
    assert.equal(holds.scope, 'real');
  });
});

// ---------------------------------------------------------------------------
// Partial failures (some sections null)
// ---------------------------------------------------------------------------

describe('buildBusinessKpiModel with partial failures', () => {
  it('omits null sections from output', () => {
    const data = {
      accounts: { real: 10, demo: 2, total: 12 },
      activation: null,
      retention: null,
      conversion: { demoStarts: 5, resets: 1, conversions: 2, rate7d: 10, rate30d: 8 },
      subjectEngagement: null,
      supportFriction: null,
      refreshedAt: '2026-04-29T11:00:00.000Z',
    };
    const result = buildBusinessKpiModel(data);
    assert.equal(result.hasData, true);
    assert.equal(result.sections.length, 2);
    assert.ok(result.sections.find((s) => s.key === 'accounts'));
    assert.ok(result.sections.find((s) => s.key === 'conversion'));
    assert.equal(result.sections.find((s) => s.key === 'activation'), undefined);
  });

  it('handles all sections null — returns hasData false', () => {
    const data = {
      accounts: null,
      activation: null,
      retention: null,
      conversion: null,
      subjectEngagement: null,
      supportFriction: null,
      refreshedAt: '2026-04-29T11:00:00.000Z',
    };
    const result = buildBusinessKpiModel(data);
    assert.equal(result.hasData, false);
    assert.equal(result.sections.length, 0);
    assert.equal(result.refreshedAt, '2026-04-29T11:00:00.000Z');
  });

  it('subject engagement with empty object produces no section', () => {
    const data = {
      accounts: { real: 5, demo: 1, total: 6 },
      subjectEngagement: {},
    };
    const result = buildBusinessKpiModel(data);
    assert.equal(result.sections.find((s) => s.key === 'subjectEngagement'), undefined);
  });

  it('subject engagement with only one subject produces that metric', () => {
    const data = {
      subjectEngagement: { grammar: 42 },
    };
    const result = buildBusinessKpiModel(data);
    const section = result.sections.find((s) => s.key === 'subjectEngagement');
    assert.ok(section);
    assert.equal(section.metrics.length, 1);
    assert.equal(section.metrics[0].value, 42);
  });
});
