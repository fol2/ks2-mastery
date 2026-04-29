#!/usr/bin/env node
// Hero Mode pA2 — Internal cohort smoke script.
// Queries the admin ops probe for each cohort account and appends
// a dated observation record to the cohort evidence file.
//
// Usage: node scripts/hero-pA2-cohort-smoke.mjs [--probe-url URL] [--dry-run]
//        [--learner-ids id1,id2,...]
//
// In dry-run mode, prints the observation record without appending.

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_PATH = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md');

// ── CLI argument parsing ────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    probeUrl: 'http://localhost:8787/api/admin/hero/telemetry-probe',
    dryRun: false,
    learnerIds: ['placeholder-learner-1'],
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--probe-url' && argv[i + 1]) {
      args.probeUrl = argv[++i];
    } else if (arg.startsWith('--probe-url=')) {
      args.probeUrl = arg.slice('--probe-url='.length);
    } else if (arg === '--learner-ids' && argv[i + 1]) {
      args.learnerIds = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--learner-ids=')) {
      args.learnerIds = arg.slice('--learner-ids='.length).split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  return args;
}

// ── Probe fetching ──────────────────────────────────────────────────

async function fetchProbe(probeUrl, learnerId) {
  const url = `${probeUrl}?learnerId=${encodeURIComponent(learnerId)}&limit=5`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { error: `HTTP ${response.status}`, data: null };
    }
    const data = await response.json();
    return { error: null, data };
  } catch (err) {
    return { error: err.message, data: null };
  }
}

// ── Observation extraction ──────────────────────────────────────────

function extractObservation(learnerId, probeData) {
  const today = new Date().toISOString().slice(0, 10);

  if (!probeData || probeData.error) {
    return {
      date: today,
      learner: learnerId,
      readiness: 'error',
      balanceBucket: 'unknown',
      ledgerEntries: 0,
      reconciliation: 'unknown',
      override: 'unknown',
      status: probeData?.error || 'fetch-failed',
      stopConditions: [],
    };
  }

  const data = probeData.data || probeData;
  const readiness = data.readiness?.overall ?? 'not_started';
  const health = data.health ?? {};
  const reconciliation = data.reconciliation ?? {};
  const overrideStatus = data.overrideStatus ?? {};

  const balanceBucket = health.balanceBucket ?? 'unknown';
  const ledgerEntries = health.ledgerEntryCount ?? 0;
  const hasGap = reconciliation.hasGap ?? false;
  const overrideLabel = overrideStatus.active ? 'override-active' : 'no-override';

  // Stop condition detection
  const stopConditions = [];

  // Negative balance is a stop condition
  if (balanceBucket === 'negative' || balanceBucket === '<0') {
    stopConditions.push('negative-balance');
  }

  // Reconciliation gap is a stop condition
  if (hasGap) {
    stopConditions.push('reconciliation-gap');
  }

  const status = stopConditions.length > 0 ? `STOP:${stopConditions.join(',')}` : 'OK';

  return {
    date: today,
    learner: learnerId,
    readiness,
    balanceBucket,
    ledgerEntries,
    reconciliation: hasGap ? 'gap' : 'no-gap',
    override: overrideLabel,
    status,
    stopConditions,
  };
}

// ── Markdown formatting ─────────────────────────────────────────────

function formatObservationRow(obs) {
  return `| ${obs.date} | ${obs.learner} | ${obs.readiness} | ${obs.balanceBucket} | ${obs.ledgerEntries} | ${obs.reconciliation} | ${obs.override} | ${obs.status} |`;
}

function formatStopConditionRows(observations) {
  const rows = [];
  for (const obs of observations) {
    for (const condition of obs.stopConditions) {
      rows.push(`| ${condition} | Yes | ${obs.date} | Learner: ${obs.learner} |`);
    }
  }
  return rows;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  console.log(`Hero Mode pA2 — Cohort Smoke Script`);
  console.log(`Probe URL: ${args.probeUrl}`);
  console.log(`Learner IDs: ${args.learnerIds.join(', ')}`);
  console.log(`Dry run: ${args.dryRun}`);
  console.log('---');

  const observations = [];

  for (const learnerId of args.learnerIds) {
    const result = await fetchProbe(args.probeUrl, learnerId);
    const obs = extractObservation(learnerId, result);
    observations.push(obs);

    const row = formatObservationRow(obs);
    console.log(row);
  }

  // Summary
  console.log('---');
  console.log(`Checked: ${observations.length} learner(s)`);
  const stops = observations.filter(o => o.stopConditions.length > 0);
  if (stops.length > 0) {
    console.log(`STOP CONDITIONS DETECTED (${stops.length} learner(s)):`);
    for (const obs of stops) {
      console.log(`  - ${obs.learner}: ${obs.stopConditions.join(', ')}`);
    }
  } else {
    console.log('No stop conditions detected.');
  }

  // Append to evidence file if not dry-run
  if (!args.dryRun) {
    if (!existsSync(EVIDENCE_PATH)) {
      console.error(`Evidence file not found: ${EVIDENCE_PATH}`);
      console.error('Run in --dry-run mode or create the evidence template first.');
      process.exit(1);
    }

    const observationRows = observations.map(formatObservationRow).join('\n');
    const stopRows = formatStopConditionRows(observations);

    let appendContent = '\n' + observationRows + '\n';

    if (stopRows.length > 0) {
      // Note: stop condition rows are appended as comments for manual review
      appendContent += '\n<!-- Stop conditions detected:\n';
      appendContent += stopRows.join('\n') + '\n-->\n';
    }

    appendFileSync(EVIDENCE_PATH, appendContent, 'utf8');
    console.log(`\nAppended ${observations.length} observation(s) to ${EVIDENCE_PATH}`);
  } else {
    console.log('\n(Dry run — no file written)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
