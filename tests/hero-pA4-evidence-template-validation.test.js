import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EVIDENCE_PATH = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA4-external-cohort-evidence.md');
const METRICS_PATH = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA4-metrics-summary.md');

const evidence = readFileSync(EVIDENCE_PATH, 'utf-8');
const metrics = readFileSync(METRICS_PATH, 'utf-8');

// ─── Evidence Template: Column Headers ─────────────────────────────────────────

describe('Hero pA4 Evidence Template — 9-column provenance format', () => {
  const requiredColumns = [
    'Date',
    'Source',
    'Account',
    'Learner',
    'Signal',
    'Value',
    'Provenance',
    'Confidence',
    'Notes',
  ];

  it('has all 9 column headers in the observation log', () => {
    for (const col of requiredColumns) {
      assert.ok(
        evidence.includes(`| ${col}`),
        `Missing column header: ${col}`
      );
    }
  });

  it('has exactly 9 columns in the header row', () => {
    const headerLine = evidence
      .split('\n')
      .find((line) => line.includes('| Date |') && line.includes('| Notes |'));
    assert.ok(headerLine, 'Cannot find header row with Date and Notes');
    const columns = headerLine.split('|').filter((c) => c.trim().length > 0);
    assert.equal(columns.length, 9, `Expected 9 columns, found ${columns.length}`);
  });
});

// ─── Evidence Template: Provenance Values ──────────────────────────────────────

describe('Hero pA4 Evidence Template — provenance values', () => {
  const provenanceValues = ['real-production', 'operator-verified', 'system-generated'];

  for (const pv of provenanceValues) {
    it(`mentions provenance value: ${pv}`, () => {
      assert.ok(
        evidence.includes(pv),
        `Missing provenance value: ${pv}`
      );
    });
  }

  it('states that real-production rows count toward certification gates', () => {
    assert.ok(
      evidence.includes("provenance='real-production' count toward certification gates"),
      'Missing certification gate rule for real-production provenance'
    );
  });
});

// ─── Evidence Template: Source Values ──────────────────────────────────────────

describe('Hero pA4 Evidence Template — source values', () => {
  const sourceValues = ['external-cohort', 'operator-check', 'telemetry-extract', 'support-report'];

  for (const sv of sourceValues) {
    it(`mentions source value: ${sv}`, () => {
      assert.ok(
        evidence.includes(sv),
        `Missing source value: ${sv}`
      );
    });
  }
});

// ─── Evidence Template: Confidence Values ──────────────────────────────────────

describe('Hero pA4 Evidence Template — confidence values', () => {
  const confidenceValues = ['high', 'medium', 'low'];

  for (const cv of confidenceValues) {
    it(`mentions confidence value: ${cv}`, () => {
      assert.ok(
        evidence.includes(`- \`${cv}\``),
        `Missing confidence value: ${cv}`
      );
    });
  }
});

// ─── Metrics Summary: Launch Metrics (18 items, §13.1) ─────────────────────────

describe('Hero pA4 Metrics Summary — 18 launch metrics (§13.1)', () => {
  const launchMetrics = [
    'Cohort accounts enabled',
    'Active learner count',
    'Hero Quest shown count',
    'Hero Quest start count',
    'Hero task start count',
    'Hero task completion count',
    'Hero daily completion count',
    'Claim success count',
    'Claim rejection count',
    'Coin award count',
    'Duplicate prevention count',
    'Camp open count',
    'Camp invite count',
    'Camp grow count',
    'Camp insufficient count',
    'Rollback-hidden checks',
    'Non-cohort exposure checks',
    'Hero route error count',
  ];

  it('contains all 18 launch metric names', () => {
    const missing = launchMetrics.filter((m) => !metrics.includes(m));
    assert.deepEqual(missing, [], `Missing launch metrics: ${missing.join(', ')}`);
  });

  it('has exactly 18 launch metric rows', () => {
    // Count rows between Section 1 header and Section 2 header
    const section1Start = metrics.indexOf('## Section 1:');
    const section2Start = metrics.indexOf('## Section 2:');
    const section1Content = metrics.slice(section1Start, section2Start);
    // Count table data rows (lines starting with | that are not header or separator)
    const rows = section1Content
      .split('\n')
      .filter((line) => line.startsWith('|') && !line.includes('Metric') && !line.includes('---'));
    assert.equal(rows.length, 18, `Expected 18 launch metric rows, found ${rows.length}`);
  });
});

// ─── Metrics Summary: Product Metrics (11 items, §13.2) ────────────────────────

describe('Hero pA4 Metrics Summary — 11 product metrics (§13.2)', () => {
  const productMetrics = [
    'Start rate',
    'Daily completion rate',
    'Next-day return rate',
    'Subject mix distribution',
    'Task intent mix',
    'Abandonment points',
    'Support/confusion reports',
    'Extra subject practice after cap',
    'Camp usage after completion',
    'Reward farming indicators',
    'Camp open/invite/grow ratio',
  ];

  it('contains all 11 product metric key phrases', () => {
    const missing = productMetrics.filter((m) => !metrics.includes(m));
    assert.deepEqual(missing, [], `Missing product metrics: ${missing.join(', ')}`);
  });

  it('has exactly 11 product metric rows', () => {
    const section2Start = metrics.indexOf('## Section 2:');
    const section3Start = metrics.indexOf('## Section 3:');
    const section2Content = metrics.slice(section2Start, section3Start);
    const rows = section2Content
      .split('\n')
      .filter((line) => line.startsWith('|') && !line.includes('Metric') && !line.includes('---'));
    assert.equal(rows.length, 11, `Expected 11 product metric rows, found ${rows.length}`);
  });
});

// ─── Metrics Summary: Safety Metrics (10 items, §13.3) ─────────────────────────

describe('Hero pA4 Metrics Summary — 10 safety metrics (§13.3)', () => {
  const safetyMetrics = [
    'Duplicate daily award count',
    'Duplicate Camp debit count',
    'Negative balance count',
    'Dead CTA count',
    'Claim-without-completion count',
    'Non-cohort exposure count',
    'Raw child content violation count',
    'Subject Star/mastery drift',
    'Hero route 4xx/5xx rates',
    'Rollback rehearsal result',
  ];

  it('contains all 10 safety metric key phrases', () => {
    const missing = safetyMetrics.filter((m) => !metrics.includes(m));
    assert.deepEqual(missing, [], `Missing safety metrics: ${missing.join(', ')}`);
  });

  it('has exactly 10 safety metric rows', () => {
    const section3Start = metrics.indexOf('## Section 3:');
    const section4Start = metrics.indexOf('## Section 4:');
    const section3Content = metrics.slice(section3Start, section4Start);
    const rows = section3Content
      .split('\n')
      .filter((line) => line.startsWith('|') && !line.includes('Metric') && !line.includes('---'));
    assert.equal(rows.length, 10, `Expected 10 safety metric rows, found ${rows.length}`);
  });

  it('each safety metric has a target value', () => {
    const section3Start = metrics.indexOf('## Section 3:');
    const section4Start = metrics.indexOf('## Section 4:');
    const section3Content = metrics.slice(section3Start, section4Start);
    const rows = section3Content
      .split('\n')
      .filter((line) => line.startsWith('|') && !line.includes('Metric') && !line.includes('---'));

    for (const row of rows) {
      const cells = row.split('|').filter((c) => c.trim().length > 0);
      // cells[0] = Metric name, cells[1] = Target
      assert.ok(cells.length >= 2, `Row has fewer than 2 cells: ${row}`);
      const target = cells[1].trim();
      assert.ok(
        target.length > 0,
        `Safety metric missing target value: ${cells[0].trim()}`
      );
    }
  });
});

// ─── No Missing Metrics ────────────────────────────────────────────────────────

describe('Hero pA4 Metrics Summary — completeness check', () => {
  it('total metric count is 39 (18 + 11 + 10)', () => {
    // Count all data rows across sections 1-3
    const section1Start = metrics.indexOf('## Section 1:');
    const section4Start = metrics.indexOf('## Section 4:');
    const metricsContent = metrics.slice(section1Start, section4Start);
    const allRows = metricsContent
      .split('\n')
      .filter((line) => line.startsWith('|') && !line.includes('Metric') && !line.includes('---') && !line.includes('Target'));
    assert.equal(allRows.length, 39, `Expected 39 total metric rows, found ${allRows.length}`);
  });
});
