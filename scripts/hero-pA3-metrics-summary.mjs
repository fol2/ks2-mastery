#!/usr/bin/env node
// Hero Mode pA3 — Metrics summary (provenance-aware).
// Reads 9-column evidence file and Goal 6 extraction results,
// produces A3 metrics baseline with provenance-qualified confidence.
//
// Usage: node scripts/hero-pA3-metrics-summary.mjs \
//   [--output PATH] \
//   [--evidence PATH] \
//   [--telemetry PATH]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_EVIDENCE = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md');
const DEFAULT_TELEMETRY = resolve(__dirname, '../reports/hero/hero-pA3-telemetry-report.json');
const DEFAULT_OUTPUT = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA3-metrics-baseline.md');

// ── CLI argument parsing ────────────────────────────────────────────

export function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    evidence: DEFAULT_EVIDENCE,
    telemetry: DEFAULT_TELEMETRY,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--output') && argv[i + 1]) {
      args.output = resolve(argv[++i]);
    } else if (arg.startsWith('--output=')) {
      args.output = resolve(arg.slice('--output='.length));
    } else if ((arg === '--evidence') && argv[i + 1]) {
      args.evidence = resolve(argv[++i]);
    } else if (arg.startsWith('--evidence=')) {
      args.evidence = resolve(arg.slice('--evidence='.length));
    } else if ((arg === '--telemetry') && argv[i + 1]) {
      args.telemetry = resolve(argv[++i]);
    } else if (arg.startsWith('--telemetry=')) {
      args.telemetry = resolve(arg.slice('--telemetry='.length));
    }
  }

  return args;
}

// ── 9-column evidence table parsing ─────────────────────────────────

/**
 * Parse observation table rows from 9-column evidence markdown.
 * Expected: | Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |
 *
 * Source column values: real-production, staging, local, simulation, manual-note
 */
export function parseObservationTable(content) {
  const lines = content.split('\n');
  const observations = [];

  // 9-column pattern: Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status
  const tableRowPattern = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/;

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
        source: match[8].trim(),
        status: match[9].trim(),
      });
    }
  }

  return observations;
}

// ── Provenance separation ───────────────────────────────────────────

/**
 * Separate observations by provenance source.
 * Confidence is based on REAL production rows only.
 *
 * Five provenance types: real-production, staging, local, simulation, manual-note
 */
export function separateByProvenance(observations) {
  const real = observations.filter(o => o.source === 'real-production');
  const staging = observations.filter(o => o.source === 'staging');
  const local = observations.filter(o => o.source === 'local');
  const simulation = observations.filter(o => o.source === 'simulation');
  const manual = observations.filter(o => o.source === 'manual-note');
  const other = observations.filter(o =>
    o.source !== 'real-production' &&
    o.source !== 'staging' &&
    o.source !== 'local' &&
    o.source !== 'simulation' &&
    o.source !== 'manual-note'
  );

  return { real, staging, local, simulation, manual, other, total: observations.length };
}

// ── Confidence classification ───────────────────────────────────────

export function classifyConfidence(count) {
  if (count >= 100) return 'high';
  if (count >= 30) return 'medium';
  if (count >= 10) return 'low';
  return 'insufficient';
}

/**
 * Provenance-qualified confidence: based on real row count, not total.
 */
export function classifyProvenanceConfidence(realCount, totalCount) {
  const base = classifyConfidence(realCount);
  if (base === 'insufficient' && totalCount >= 10) {
    return 'insufficient-real (simulation-only data present)';
  }
  return base;
}

// ── Aggregation ─────────────────────────────────────────────────────

function computeDistribution(values) {
  const counts = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

export function aggregateMetrics(observations, provenance) {
  const realCount = provenance.real.length;
  const totalCount = observations.length;

  const readinessValues = observations.map(o => o.readiness);
  const readinessDistribution = computeDistribution(readinessValues);

  const balanceValues = observations.map(o => o.balanceBucket);
  const balanceDistribution = computeDistribution(balanceValues);

  const ledgerEntries = observations.map(o => o.ledgerEntries);
  const avgLedgerEntries = ledgerEntries.length > 0
    ? (ledgerEntries.reduce((a, b) => a + b, 0) / ledgerEntries.length).toFixed(1)
    : '0';

  const reconciliationValues = observations.map(o => o.reconciliation);
  const reconciliationDistribution = computeDistribution(reconciliationValues);

  const overrideValues = observations.map(o => o.override);
  const overrideDistribution = computeDistribution(overrideValues);

  const stopObservations = observations.filter(o => o.status.startsWith('STOP:'));
  const stopConditionTypes = {};
  for (const obs of stopObservations) {
    const conditions = obs.status.replace('STOP:', '').split(',');
    for (const c of conditions) {
      stopConditionTypes[c.trim()] = (stopConditionTypes[c.trim()] || 0) + 1;
    }
  }

  return {
    totalObservations: totalCount,
    realObservations: realCount,
    simulationObservations: provenance.simulation.length,
    manualObservations: provenance.manual.length,
    uniqueDateCount: [...new Set(observations.map(o => o.date))].length,
    uniqueLearnerCount: [...new Set(observations.map(o => o.learner))].length,
    provenanceConfidence: classifyProvenanceConfidence(realCount, totalCount),
    readiness: {
      distribution: readinessDistribution,
      confidence: classifyProvenanceConfidence(realCount, totalCount),
    },
    economy: {
      balanceDistribution,
      avgLedgerEntries,
      confidence: classifyProvenanceConfidence(realCount, totalCount),
    },
    reconciliation: {
      distribution: reconciliationDistribution,
      confidence: classifyProvenanceConfidence(realCount, totalCount),
    },
    override: {
      distribution: overrideDistribution,
      confidence: classifyProvenanceConfidence(realCount, totalCount),
    },
    stopConditions: stopConditionTypes,
    stopCount: stopObservations.length,
  };
}

// ── Telemetry integration ───────────────────────────────────────────

/**
 * Derive health-test dimensions from Goal 6 telemetry report (if available).
 */
export function deriveTelemetryDimensions(telemetryReport) {
  if (!telemetryReport || !telemetryReport.signals) {
    return {
      available: false,
      dimensions: [],
    };
  }

  const s = telemetryReport.signals;
  const dimensions = [];

  // Start rate health
  dimensions.push({
    dimension: 'Start rate',
    status: s.dailyCompletionRate?.sessionsStarted > 0 ? 'observable' : 'no-data',
    detail: `${s.dailyCompletionRate?.sessionsStarted || 0} sessions observed`,
  });

  // Completion rate health
  dimensions.push({
    dimension: 'Completion rate',
    status: s.dailyCompletionRate?.dailyCompleted > 0 ? 'observable' : 'no-data',
    detail: `${s.dailyCompletionRate?.value || 0} (${s.dailyCompletionRate?.dailyCompleted || 0}/${s.dailyCompletionRate?.sessionsStarted || 0})`,
  });

  // Duplicate prevention health
  dimensions.push({
    dimension: 'Duplicate prevention',
    status: s.coinAwards?.duplicatePreventionMeasurable === false ? 'not-observable-from-event-log' : 'observable',
    detail: 'Coin duplicate prevention is console-only signal',
  });

  // Economy integrity health
  const coinCount = s.coinAwards?.awardCount || 0;
  const campCount = (s.campEvents?.invited || 0) + (s.campEvents?.grown || 0);
  dimensions.push({
    dimension: 'Economy integrity',
    status: (coinCount + campCount) > 0 ? 'observable' : 'no-data',
    detail: `${coinCount} coin awards, ${campCount} camp spends`,
  });

  // Privacy compliance health
  dimensions.push({
    dimension: 'Privacy compliance',
    status: s.privacyCompliance?.passed ? 'passed' : 'failed',
    detail: `${s.privacyCompliance?.rowsChecked || 0} rows checked`,
  });

  return { available: true, dimensions };
}

// ── Health test assessment ───────────────────────────────────────────

export function assessHealthTests(metrics, telemetryDimensions) {
  const realCount = metrics.realObservations;
  const hasData = realCount >= 10;

  function classify(condition) {
    if (!hasData) return 'insufficient-data';
    return condition ? 'observed' : 'not-observed';
  }

  function distHas(distribution, key) {
    if (distribution[key] > 0) return true;
    const alt = key.includes('-') ? key.replace(/-/g, '_') : key.replace(/_/g, '-');
    return distribution[alt] > 0;
  }

  const probeTests = [
    {
      dimension: 'Clarity (learner knows what to do)',
      status: classify(
        distHas(metrics.readiness.distribution, 'ready') ||
        distHas(metrics.readiness.distribution, 'not-ready')
      ),
      source: 'probe',
    },
    {
      dimension: 'Completion (daily quest finishable)',
      status: classify(distHas(metrics.readiness.distribution, 'ready')),
      source: 'probe',
    },
    {
      dimension: 'Spam prevention (no duplicate awards)',
      status: classify(!(metrics.stopConditions['negative-balance'] > 0)),
      source: 'probe',
    },
    {
      dimension: 'Dead-ends (no blocked CTA)',
      status: classify(!(metrics.stopConditions['dead-cta'] > 0)),
      source: 'probe',
    },
    {
      dimension: 'Duplicate prevention (dedup working)',
      status: classify(!(metrics.stopConditions['duplicate-daily-award'] > 0)),
      source: 'probe',
    },
    {
      dimension: 'Privacy (no forbidden fields leaked)',
      status: classify(!(metrics.stopConditions['privacy-violation'] > 0)),
      source: 'probe',
    },
    {
      dimension: 'Mastery distortion (subject authority intact)',
      status: classify(distHas(metrics.reconciliation.distribution, 'no-gap')),
      source: 'probe',
    },
  ];

  // Add telemetry-derived dimensions
  const telemetryTests = [];
  if (telemetryDimensions && telemetryDimensions.available) {
    for (const dim of telemetryDimensions.dimensions) {
      telemetryTests.push({
        dimension: `[Telemetry] ${dim.dimension}`,
        status: dim.status,
        source: 'telemetry',
        detail: dim.detail,
      });
    }
  } else {
    // Telemetry not available — mark all as pending
    const pendingDims = ['Start rate', 'Completion rate', 'Duplicate prevention', 'Economy integrity', 'Privacy compliance'];
    for (const name of pendingDims) {
      telemetryTests.push({
        dimension: `[Telemetry] ${name}`,
        status: 'telemetry-pending',
        source: 'telemetry',
        detail: 'Goal 6 telemetry report not found',
      });
    }
  }

  return [...probeTests, ...telemetryTests];
}

// ── Output formatting ───────────────────────────────────────────────

function formatDistributionTable(distribution) {
  const entries = Object.entries(distribution).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return '| (no data) | 0 |\n';
  return entries.map(([value, count]) => `| ${value} | ${count} |`).join('\n');
}

export function generateBaselineDocument(metrics, telemetryDimensions, telemetryReport) {
  const today = new Date().toISOString().slice(0, 10);
  const healthTests = assessHealthTests(metrics, telemetryDimensions);

  let doc = `# Hero Mode pA3 — Metrics Baseline (Provenance-Aware)

**Generated:** ${today}
**Total observations:** ${metrics.totalObservations}
**Real-production observations:** ${metrics.realObservations}
**Simulation observations:** ${metrics.simulationObservations}
**Manual-inspection observations:** ${metrics.manualObservations}
**Provenance confidence:** ${metrics.provenanceConfidence}
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

  doc += `\n---\n\n## A3 Health Test Assessment\n\n`;
  doc += `| Dimension | Status | Source |\n|-----------|--------|--------|\n`;
  for (const test of healthTests) {
    doc += `| ${test.dimension} | ${test.status} | ${test.source} |\n`;
  }

  doc += `\n---\n\n## Provenance Notes\n\n`;
  doc += `- **real-production**: Observed from live internal cohort via ops probe\n`;
  doc += `- **staging**: Observed from staging environment (does not count towards confidence)\n`;
  doc += `- **local**: Generated from local development environment (does not count towards confidence)\n`;
  doc += `- **simulation**: Generated by test/simulation environment (does not count towards confidence)\n`;
  doc += `- **manual-note**: Human-verified via admin console or manual entry\n`;
  doc += `- Confidence classification is based on **real-production row count only**\n`;

  // Goal 6 telemetry section
  doc += `\n---\n\n## Goal 6 Telemetry Integration\n\n`;
  if (telemetryReport && telemetryReport.signals) {
    doc += `**Telemetry report available:** Yes\n`;
    doc += `**Total events analysed:** ${telemetryReport.totalEvents || 0}\n`;
    doc += `**Privacy validation:** ${telemetryReport.privacyValidation?.passed ? 'PASSED' : 'FAILED'}\n\n`;

    if (telemetryReport.unmeasurable && telemetryReport.unmeasurable.length > 0) {
      doc += `### Unmeasurable signals (require client-side telemetry)\n\n`;
      for (const u of telemetryReport.unmeasurable) {
        doc += `- **${u.signal}**: ${u.reason}\n`;
      }
    }
  } else {
    doc += `**Telemetry report available:** No\n`;
    doc += `All telemetry-derived dimensions are marked as \`telemetry-pending\`.\n`;
    doc += `Run \`node scripts/hero-pA3-telemetry-extract.mjs --db-path ...\` to generate.\n`;
  }

  doc += `\n---\n\n*Generated by hero-pA3-metrics-summary.mjs*\n`;

  return doc;
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  console.log('Hero Mode pA3 — Metrics Summary (Provenance-Aware)');
  console.log(`Evidence file: ${args.evidence}`);
  console.log(`Telemetry file: ${args.telemetry}`);
  console.log(`Output: ${args.output}`);
  console.log('---');

  // Read evidence file
  let observations = [];
  if (existsSync(args.evidence)) {
    const content = readFileSync(args.evidence, 'utf8');
    observations = parseObservationTable(content);
    console.log(`Parsed ${observations.length} observation(s) from evidence file.`);
  } else {
    console.log('Evidence file not found. Proceeding with empty observations.');
  }

  // Separate by provenance
  const provenance = separateByProvenance(observations);
  console.log(`Real: ${provenance.real.length}, Simulation: ${provenance.simulation.length}, Manual: ${provenance.manual.length}`);

  // Aggregate metrics
  const metrics = aggregateMetrics(observations, provenance);

  // Read telemetry report (if exists)
  let telemetryReport = null;
  if (existsSync(args.telemetry)) {
    try {
      telemetryReport = JSON.parse(readFileSync(args.telemetry, 'utf8'));
      console.log(`Loaded telemetry report: ${telemetryReport.totalEvents || 0} events.`);
    } catch (err) {
      console.log(`Failed to parse telemetry report: ${err.message}`);
    }
  } else {
    console.log('Telemetry report not found. Telemetry dimensions will be marked as pending.');
  }

  // Derive telemetry dimensions
  const telemetryDimensions = deriveTelemetryDimensions(telemetryReport);

  // Generate document
  const doc = generateBaselineDocument(metrics, telemetryDimensions, telemetryReport);

  // Write output
  const outputDir = dirname(args.output);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  writeFileSync(args.output, doc, 'utf8');
  console.log(`\nBaseline written to: ${args.output}`);
}

const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main();
}
