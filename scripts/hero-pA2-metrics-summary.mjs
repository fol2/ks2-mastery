#!/usr/bin/env node
// Hero Mode pA2 — Metrics baseline summary.
// Reads cohort evidence file, aggregates observations, and produces
// a structured metrics baseline document.
//
// Usage: node scripts/hero-pA2-metrics-summary.mjs [--output PATH]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_PATH = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md');
const DEFAULT_OUTPUT = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA2-metrics-baseline.md');

// ── CLI argument parsing ────────────────────────────────────────────

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      args.output = resolve(argv[++i]);
    } else if (arg.startsWith('--output=')) {
      args.output = resolve(arg.slice('--output='.length));
    }
  }

  return args;
}

// ── Evidence file parsing ───────────────────────────────────────────

/**
 * Parse observation table rows from the evidence markdown file.
 * Expected format:
 * | Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Status |
 */
function parseObservationTable(content) {
  const lines = content.split('\n');
  const observations = [];

  // Find lines that match the observation table row pattern
  // Must start with | and contain at least 7 pipes (8 columns)
  const tableRowPattern = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/;

  for (const line of lines) {
    const match = line.match(tableRowPattern);
    if (match) {
      observations.push({
        date: match[1],
        learner: match[2].trim(),
        readiness: match[3].trim(),
        balanceBucket: match[4].trim(),
        ledgerEntries: parseInt(match[5].trim(), 10) || 0,
        reconciliation: match[6].trim(),
        override: match[7].trim(),
        status: match[8].trim(),
      });
    }
  }

  return observations;
}

// ── Aggregation functions ───────────────────────────────────────────

function computeDistribution(values) {
  const counts = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

function classifyConfidence(count) {
  if (count >= 100) return 'high';
  if (count >= 30) return 'medium';
  if (count >= 10) return 'low';
  return 'insufficient';
}

function aggregateMetrics(observations) {
  const totalObservations = observations.length;
  const uniqueDates = [...new Set(observations.map(o => o.date))];
  const uniqueLearners = [...new Set(observations.map(o => o.learner))];

  // Metric family 1: Readiness
  const readinessValues = observations.map(o => o.readiness);
  const readinessDistribution = computeDistribution(readinessValues);

  // Metric family 2: Economy health (balance bucket + ledger)
  const balanceValues = observations.map(o => o.balanceBucket);
  const balanceDistribution = computeDistribution(balanceValues);
  const ledgerEntries = observations.map(o => o.ledgerEntries);
  const avgLedgerEntries = ledgerEntries.length > 0
    ? (ledgerEntries.reduce((a, b) => a + b, 0) / ledgerEntries.length).toFixed(1)
    : '0';

  // Metric family 3: Reconciliation
  const reconciliationValues = observations.map(o => o.reconciliation);
  const reconciliationDistribution = computeDistribution(reconciliationValues);

  // Metric family 4: Override status
  const overrideValues = observations.map(o => o.override);
  const overrideDistribution = computeDistribution(overrideValues);

  // Stop conditions
  const stopObservations = observations.filter(o => o.status.startsWith('STOP:'));
  const stopConditionTypes = {};
  for (const obs of stopObservations) {
    const conditions = obs.status.replace('STOP:', '').split(',');
    for (const c of conditions) {
      stopConditionTypes[c.trim()] = (stopConditionTypes[c.trim()] || 0) + 1;
    }
  }

  return {
    totalObservations,
    uniqueDateCount: uniqueDates.length,
    uniqueLearnerCount: uniqueLearners.length,
    uniqueDates,
    uniqueLearners,
    readiness: {
      count: readinessValues.length,
      confidence: classifyConfidence(readinessValues.length),
      distribution: readinessDistribution,
    },
    economy: {
      count: balanceValues.length,
      confidence: classifyConfidence(balanceValues.length),
      balanceDistribution,
      avgLedgerEntries,
    },
    reconciliation: {
      count: reconciliationValues.length,
      confidence: classifyConfidence(reconciliationValues.length),
      distribution: reconciliationDistribution,
    },
    override: {
      count: overrideValues.length,
      confidence: classifyConfidence(overrideValues.length),
      distribution: overrideDistribution,
    },
    stopConditions: stopConditionTypes,
    stopCount: stopObservations.length,
  };
}

// ── A2 health test assessment ───────────────────────────────────────

function assessHealthTests(metrics) {
  const totalObs = metrics.totalObservations;
  const hasData = totalObs >= 10;

  // Classify each dimension
  function classify(condition) {
    if (!hasData) return 'insufficient-data';
    return condition ? 'observed' : 'not-observed';
  }

  return [
    {
      dimension: 'Clarity (learner knows what to do)',
      status: classify(
        metrics.readiness.distribution['ready'] > 0 ||
        metrics.readiness.distribution['not_ready'] > 0
      ),
    },
    {
      dimension: 'Completion (daily quest finishable)',
      status: classify(
        metrics.readiness.distribution['ready'] > 0
      ),
    },
    {
      dimension: 'Spam prevention (no duplicate awards)',
      status: classify(
        !(metrics.stopConditions['negative-balance'] > 0)
      ),
    },
    {
      dimension: 'Dead-ends (no blocked CTA)',
      status: classify(
        !(metrics.stopConditions['dead-cta'] > 0)
      ),
    },
    {
      dimension: 'Duplicate prevention (dedup working)',
      status: classify(
        !(metrics.stopConditions['duplicate-daily-award'] > 0)
      ),
    },
    {
      dimension: 'Privacy (no forbidden fields leaked)',
      status: classify(
        !(metrics.stopConditions['privacy-violation'] > 0)
      ),
    },
    {
      dimension: 'Mastery distortion (subject authority intact)',
      status: classify(
        metrics.reconciliation.distribution['no-gap'] > 0
      ),
    },
  ];
}

// ── Output formatting ───────────────────────────────────────────────

function formatDistributionTable(distribution) {
  const entries = Object.entries(distribution).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return '| (no data) | 0 |\n';
  return entries.map(([value, count]) => `| ${value} | ${count} |`).join('\n');
}

function generateBaselineDocument(metrics) {
  const today = new Date().toISOString().slice(0, 10);
  const healthTests = assessHealthTests(metrics);

  let doc = `# Hero Mode pA2 — Metrics Baseline

**Generated:** ${today}
**Total observations:** ${metrics.totalObservations}
**Unique date keys:** ${metrics.uniqueDateCount}
**Unique learners:** ${metrics.uniqueLearnerCount}

---

## 1. Readiness (confidence: ${metrics.readiness.confidence})

| Value | Count |
|-------|-------|
${formatDistributionTable(metrics.readiness.distribution)}

---

## 2. Economy Health (confidence: ${metrics.economy.confidence})

**Average ledger entries:** ${metrics.economy.avgLedgerEntries}

| Balance Bucket | Count |
|----------------|-------|
${formatDistributionTable(metrics.economy.balanceDistribution)}

---

## 3. Reconciliation (confidence: ${metrics.reconciliation.confidence})

| Value | Count |
|-------|-------|
${formatDistributionTable(metrics.reconciliation.distribution)}

---

## 4. Override Status (confidence: ${metrics.override.confidence})

| Value | Count |
|-------|-------|
${formatDistributionTable(metrics.override.distribution)}

---

## Stop Conditions Summary

`;

  if (metrics.stopCount === 0) {
    doc += `No stop conditions observed across ${metrics.totalObservations} observation(s).\n`;
  } else {
    doc += `**${metrics.stopCount} observation(s) triggered stop conditions:**\n\n`;
    doc += `| Condition | Count |\n|-----------|-------|\n`;
    for (const [cond, count] of Object.entries(metrics.stopConditions)) {
      doc += `| ${cond} | ${count} |\n`;
    }
  }

  doc += `\n---\n\n## A2 Health Test Assessment\n\n`;
  doc += `| Dimension | Status |\n|-----------|--------|\n`;
  for (const test of healthTests) {
    doc += `| ${test.dimension} | ${test.status} |\n`;
  }

  doc += `\n---\n\n*Generated by hero-pA2-metrics-summary.mjs*\n`;

  return doc;
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  console.log('Hero Mode pA2 — Metrics Summary');
  console.log(`Evidence file: ${EVIDENCE_PATH}`);
  console.log(`Output: ${args.output}`);
  console.log('---');

  // Read evidence file
  if (!existsSync(EVIDENCE_PATH)) {
    console.log('Evidence file not found. Creating empty baseline with insufficient data.');
    const emptyMetrics = aggregateMetrics([]);
    const doc = generateBaselineDocument(emptyMetrics);
    const outputDir = dirname(args.output);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    writeFileSync(args.output, doc, 'utf8');
    console.log(`Written to: ${args.output}`);
    return;
  }

  const content = readFileSync(EVIDENCE_PATH, 'utf8');
  const observations = parseObservationTable(content);

  console.log(`Parsed ${observations.length} observation(s) from evidence file.`);

  if (observations.length === 0) {
    console.log('No observations found. Baseline will report insufficient data.');
  }

  // Aggregate metrics
  const metrics = aggregateMetrics(observations);

  console.log(`Unique dates: ${metrics.uniqueDateCount}`);
  console.log(`Unique learners: ${metrics.uniqueLearnerCount}`);
  console.log(`Stop conditions: ${metrics.stopCount}`);

  // Generate and write output
  const doc = generateBaselineDocument(metrics);
  const outputDir = dirname(args.output);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  writeFileSync(args.output, doc, 'utf8');
  console.log(`\nBaseline written to: ${args.output}`);
}

main();
