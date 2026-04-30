import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArgs,
  parseObservationTable,
  separateByProvenance,
  classifyConfidence,
  classifyProvenanceConfidence,
  aggregateMetrics,
  deriveTelemetryDimensions,
  assessHealthTests,
  generateBaselineDocument,
} from '../scripts/hero-pA3-metrics-summary.mjs';

// ── Test data factories ─────────────────────────────────────────────

function makeRow(overrides = {}) {
  return {
    date: overrides.date || '2026-04-28',
    learner: overrides.learner || 'learner-1',
    source: overrides.source || 'real-production',
    readiness: overrides.readiness || 'ready',
    balanceBucket: overrides.balanceBucket || '100-299',
    ledgerEntries: overrides.ledgerEntries ?? 5,
    reconciliation: overrides.reconciliation || 'no-gap',
    override: overrides.override || 'internal',
    status: overrides.status || 'ok',
  };
}

function makeTelemetryReport(overrides = {}) {
  return {
    extractedAt: '2026-04-28T12:00:00Z',
    totalEvents: overrides.totalEvents ?? 50,
    signals: {
      dailyCompletionRate: { sessionsStarted: 20, dailyCompleted: 15, value: 0.75, confidence: 'low' },
      coinAwards: { awardCount: 10, totalCoins: 1000, duplicatePreventionMeasurable: false, confidence: 'low' },
      campEvents: { invited: 3, grown: 2, confidence: 'insufficient' },
      privacyCompliance: { passed: true, rowsChecked: 50 },
      ...overrides.signals,
    },
    privacyValidation: { passed: true, rowsChecked: 50 },
    unmeasurable: overrides.unmeasurable || [
      { signal: 'questShown', reason: 'Client-side only' },
    ],
    ...(overrides.extra || {}),
  };
}

// ── parseArgs ───────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('parses --output, --evidence, --telemetry', () => {
    const args = parseArgs(['node', 'script', '--output', './out.md', '--evidence', './ev.md', '--telemetry', './tel.json']);
    assert.ok(args.output.endsWith('out.md'));
    assert.ok(args.evidence.endsWith('ev.md'));
    assert.ok(args.telemetry.endsWith('tel.json'));
  });

  it('uses defaults when no args provided', () => {
    const args = parseArgs(['node', 'script']);
    assert.ok(args.output.includes('hero-pA3-metrics-baseline.md'));
    assert.ok(args.evidence.includes('hero-pA3-internal-cohort-evidence.md'));
    assert.ok(args.telemetry.includes('hero-pA3-telemetry-report.json'));
  });
});

// ── 9-column parsing ────────────────────────────────────────────────

describe('parseObservationTable (9-column)', () => {
  it('parses valid 9-column row with Source at position 8', () => {
    const content = `# Evidence
| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |
|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|
| 2026-04-28 | learner-1 | ready | 100-299 | 5 | no-gap | internal | real-production | ok |
| 2026-04-28 | learner-2 | not-ready | 0 | 0 | gap-detected | internal | simulation | ok |
`;
    const rows = parseObservationTable(content);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].source, 'real-production');
    assert.equal(rows[0].readiness, 'ready');
    assert.equal(rows[1].source, 'simulation');
    assert.equal(rows[1].readiness, 'not-ready');
  });

  it('ignores header/separator rows', () => {
    const content = `| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |
|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|
| 2026-04-28 | learner-1 | ready | 100-299 | 5 | no-gap | internal | real-production | ok |`;
    const rows = parseObservationTable(content);
    assert.equal(rows.length, 1);
  });

  it('returns empty array for non-matching content', () => {
    const content = `# Some other doc\nNo table here.`;
    const rows = parseObservationTable(content);
    assert.deepEqual(rows, []);
  });
});

// ── Provenance separation ───────────────────────────────────────────

describe('separateByProvenance', () => {
  it('separates all 5 provenance types correctly', () => {
    const observations = [
      makeRow({ source: 'real-production' }),
      makeRow({ source: 'real-production', learner: 'learner-2' }),
      makeRow({ source: 'staging', learner: 'learner-3' }),
      makeRow({ source: 'local', learner: 'learner-4' }),
      makeRow({ source: 'simulation' }),
      makeRow({ source: 'simulation' }),
      makeRow({ source: 'manual-note', learner: 'learner-5' }),
    ];
    const p = separateByProvenance(observations);
    assert.equal(p.real.length, 2);
    assert.equal(p.staging.length, 1);
    assert.equal(p.local.length, 1);
    assert.equal(p.simulation.length, 2);
    assert.equal(p.manual.length, 1);
    assert.equal(p.other.length, 0);
    assert.equal(p.total, 7);
  });

  it('handles unknown source in other bucket', () => {
    const observations = [makeRow({ source: 'mystery' })];
    const p = separateByProvenance(observations);
    assert.equal(p.other.length, 1);
  });
});

// ── Confidence classification ───────────────────────────────────────

describe('classifyProvenanceConfidence', () => {
  it('5 real + 10 total = insufficient-real with note', () => {
    const c = classifyProvenanceConfidence(5, 15);
    assert.ok(c.includes('insufficient'));
    assert.ok(c.includes('simulation'));
  });

  it('10 real = low (regardless of total)', () => {
    const c = classifyProvenanceConfidence(10, 50);
    assert.equal(c, 'low');
  });

  it('30 real = medium', () => {
    assert.equal(classifyProvenanceConfidence(30, 30), 'medium');
  });

  it('100 real = high', () => {
    assert.equal(classifyProvenanceConfidence(100, 200), 'high');
  });

  it('0 real + 5 total = insufficient (no simulation note under 10 total)', () => {
    const c = classifyProvenanceConfidence(0, 5);
    assert.equal(c, 'insufficient');
  });
});

// ── aggregateMetrics ────────────────────────────────────────────────

describe('aggregateMetrics', () => {
  it('correctly computes provenance-aware metrics', () => {
    const observations = [
      makeRow({ source: 'real-production' }),
      makeRow({ source: 'real-production', learner: 'learner-2' }),
      makeRow({ source: 'simulation' }),
    ];
    const provenance = separateByProvenance(observations);
    const m = aggregateMetrics(observations, provenance);

    assert.equal(m.totalObservations, 3);
    assert.equal(m.realObservations, 2);
    assert.equal(m.simulationObservations, 1);
    assert.equal(m.uniqueLearnerCount, 2);
  });

  it('detects stop conditions', () => {
    const observations = [
      makeRow({ status: 'STOP:negative-balance,privacy-violation' }),
      makeRow({ status: 'ok' }),
    ];
    const provenance = separateByProvenance(observations);
    const m = aggregateMetrics(observations, provenance);

    assert.equal(m.stopCount, 1);
    assert.equal(m.stopConditions['negative-balance'], 1);
    assert.equal(m.stopConditions['privacy-violation'], 1);
  });
});

// ── deriveTelemetryDimensions ───────────────────────────────────────

describe('deriveTelemetryDimensions', () => {
  it('returns available:true with dimensions from telemetry report', () => {
    const report = makeTelemetryReport();
    const td = deriveTelemetryDimensions(report);

    assert.equal(td.available, true);
    assert.equal(td.dimensions.length, 5);
    const names = td.dimensions.map(d => d.dimension);
    assert.ok(names.includes('Start rate'));
    assert.ok(names.includes('Privacy compliance'));
  });

  it('returns available:false when report is null', () => {
    const td = deriveTelemetryDimensions(null);
    assert.equal(td.available, false);
  });

  it('returns available:false when report has no signals', () => {
    const td = deriveTelemetryDimensions({ extractedAt: '...', signals: null });
    assert.equal(td.available, false);
  });

  it('privacy dimension shows passed status', () => {
    const report = makeTelemetryReport();
    const td = deriveTelemetryDimensions(report);
    const privacy = td.dimensions.find(d => d.dimension === 'Privacy compliance');
    assert.equal(privacy.status, 'passed');
  });
});

// ── assessHealthTests ───────────────────────────────────────────────

describe('assessHealthTests', () => {
  it('includes telemetry-pending when telemetry not available', () => {
    const observations = Array.from({ length: 12 }, (_, i) => makeRow({ learner: `l-${i}` }));
    const provenance = separateByProvenance(observations);
    const metrics = aggregateMetrics(observations, provenance);
    const td = deriveTelemetryDimensions(null);
    const tests = assessHealthTests(metrics, td);

    const telemetryTests = tests.filter(t => t.source === 'telemetry');
    assert.ok(telemetryTests.length > 0);
    for (const t of telemetryTests) {
      assert.equal(t.status, 'telemetry-pending');
    }
  });

  it('includes telemetry dimensions when report available', () => {
    const observations = Array.from({ length: 12 }, (_, i) => makeRow({ learner: `l-${i}` }));
    const provenance = separateByProvenance(observations);
    const metrics = aggregateMetrics(observations, provenance);
    const td = deriveTelemetryDimensions(makeTelemetryReport());
    const tests = assessHealthTests(metrics, td);

    const telemetryTests = tests.filter(t => t.source === 'telemetry');
    assert.ok(telemetryTests.length === 5);
    const privacyTest = telemetryTests.find(t => t.dimension.includes('Privacy'));
    assert.equal(privacyTest.status, 'passed');
  });

  it('probe tests report insufficient-data when real count < 10', () => {
    const observations = [makeRow()]; // only 1 real observation
    const provenance = separateByProvenance(observations);
    const metrics = aggregateMetrics(observations, provenance);
    const td = deriveTelemetryDimensions(null);
    const tests = assessHealthTests(metrics, td);

    const probeTests = tests.filter(t => t.source === 'probe');
    for (const t of probeTests) {
      assert.equal(t.status, 'insufficient-data');
    }
  });
});

// ── generateBaselineDocument ────────────────────────────────────────

describe('generateBaselineDocument', () => {
  it('produces readable markdown output', () => {
    const observations = [makeRow(), makeRow({ learner: 'learner-2', source: 'simulation' })];
    const provenance = separateByProvenance(observations);
    const metrics = aggregateMetrics(observations, provenance);
    const td = deriveTelemetryDimensions(null);
    const doc = generateBaselineDocument(metrics, td, null);

    assert.ok(doc.includes('# Hero Mode pA3'));
    assert.ok(doc.includes('Provenance-Aware'));
    assert.ok(doc.includes('Real-production observations:'));
    assert.ok(doc.includes('telemetry-pending'));
    assert.ok(doc.includes('hero-pA3-metrics-summary.mjs'));
  });

  it('includes Goal 6 telemetry section when report available', () => {
    const observations = [makeRow()];
    const provenance = separateByProvenance(observations);
    const metrics = aggregateMetrics(observations, provenance);
    const report = makeTelemetryReport();
    const td = deriveTelemetryDimensions(report);
    const doc = generateBaselineDocument(metrics, td, report);

    assert.ok(doc.includes('Telemetry report available:** Yes'));
    assert.ok(doc.includes('Privacy validation:** PASSED'));
    assert.ok(doc.includes('Unmeasurable signals'));
  });

  it('handles missing telemetry report gracefully', () => {
    const observations = [makeRow()];
    const provenance = separateByProvenance(observations);
    const metrics = aggregateMetrics(observations, provenance);
    const td = deriveTelemetryDimensions(null);
    const doc = generateBaselineDocument(metrics, td, null);

    assert.ok(doc.includes('Telemetry report available:** No'));
    assert.ok(doc.includes('telemetry-pending'));
  });
});

// ── Round-trip integration: smoke output format is parseable by metrics-summary ──

describe('round-trip: smoke script output parseable by metrics-summary', () => {
  it('formatObservationRow output is parseable by parseObservationTable', async () => {
    const { formatObservationRow } = await import('../scripts/hero-pA3-cohort-smoke.mjs');

    const obs = {
      date: '2026-04-30',
      learner: 'round-trip-learner',
      readiness: 'ready',
      balanceBucket: '300-599',
      ledgerEntries: 7,
      reconciliation: 'no-gap',
      override: 'override-active',
      source: 'real-production',
      status: 'OK',
    };

    const row = formatObservationRow(obs);
    const content = `| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |\n|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|\n${row}`;
    const parsed = parseObservationTable(content);

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].date, '2026-04-30');
    assert.equal(parsed[0].learner, 'round-trip-learner');
    assert.equal(parsed[0].readiness, 'ready');
    assert.equal(parsed[0].balanceBucket, '300-599');
    assert.equal(parsed[0].ledgerEntries, 7);
    assert.equal(parsed[0].reconciliation, 'no-gap');
    assert.equal(parsed[0].override, 'override-active');
    assert.equal(parsed[0].source, 'real-production');
    assert.equal(parsed[0].status, 'OK');
  });

  it('all 5 provenance types round-trip correctly', async () => {
    const { formatObservationRow } = await import('../scripts/hero-pA3-cohort-smoke.mjs');

    const sources = ['real-production', 'staging', 'local', 'simulation', 'manual-note'];
    const rows = sources.map((source, i) => formatObservationRow({
      date: `2026-04-${String(25 + i).padStart(2, '0')}`,
      learner: `learner-${i}`,
      readiness: 'ready',
      balanceBucket: '100-299',
      ledgerEntries: i + 1,
      reconciliation: 'no-gap',
      override: 'no-override',
      source,
      status: 'OK',
    }));

    const content = `| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |\n|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|\n${rows.join('\n')}`;
    const parsed = parseObservationTable(content);

    assert.equal(parsed.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(parsed[i].source, sources[i]);
    }

    const provenance = separateByProvenance(parsed);
    assert.equal(provenance.real.length, 1);
    assert.equal(provenance.staging.length, 1);
    assert.equal(provenance.local.length, 1);
    assert.equal(provenance.simulation.length, 1);
    assert.equal(provenance.manual.length, 1);
  });
});
