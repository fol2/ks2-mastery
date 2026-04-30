#!/usr/bin/env node
// Hero Mode pA3 — Internal cohort smoke script (provenance-aware).
// Queries the admin ops probe for each cohort account and appends
// a 9-column observation record (with Source provenance) to the
// cohort evidence file.
//
// Usage: node scripts/hero-pA3-cohort-smoke.mjs [--probe-url URL] [--dry-run]
//        [--learner-ids id1,id2,...] [--source real-production|staging|local|simulation|manual-note]
//
// In dry-run mode, prints the observation record without appending.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectStopConditions } from '../shared/hero/stop-conditions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_PATH = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md');

const VALID_SOURCES = ['real-production', 'staging', 'local', 'simulation', 'manual-note'];

const EVIDENCE_TEMPLATE = `# Hero Mode pA3 — Internal Cohort Evidence

## Observation Log

| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |
|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|

## Stop Conditions

| Condition | Observed | Date | Details |
|-----------|----------|------|---------|
| Negative balance | No | | |
| Reconciliation gap | No | | |
`;

// ── CLI argument parsing ────────────────────────────────────────────

export function parseArgs(argv) {
  const args = {
    probeUrl: 'http://localhost:8787/api/admin/hero/telemetry-probe',
    dryRun: false,
    learnerIds: ['placeholder-learner-1'],
    source: 'real-production',
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
    } else if (arg === '--source' && argv[i + 1]) {
      args.source = argv[++i].trim().toLowerCase();
    } else if (arg.startsWith('--source=')) {
      args.source = arg.slice('--source='.length).trim().toLowerCase();
    }
  }

  // Validate source
  if (!VALID_SOURCES.includes(args.source)) {
    args.source = 'real-production';
  }

  return args;
}

// ── Probe fetching ──────────────────────────────────────────────────

export async function fetchProbe(probeUrl, learnerId) {
  const url = `${probeUrl}?learnerId=${encodeURIComponent(learnerId)}&limit=5`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      return { error: `HTTP ${response.status}`, data: null };
    }
    const data = await response.json();
    return { error: null, data };
  } catch (err) {
    clearTimeout(timer);
    return { error: err.name === 'AbortError' ? 'Timeout after 15s' : err.message, data: null };
  }
}

// ── Observation extraction (9-column, provenance-aware) ─────────────

export function extractObservation(learnerId, probeData, source) {
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
      source: 'manual-note',
      status: `ERROR:fetch-failed`,
      stopConditions: [],
    };
  }

  const data = probeData.data || probeData;
  const readiness = data.readiness?.overall ?? 'not_started';
  const health = data.health ?? {};
  const reconciliation = data.reconciliation ?? {};
  const overrideStatus = data.overrideStatus ?? {};

  const balanceBucket = health.balanceBucket ?? 'unknown';
  const balance = health.balance ?? null;
  const ledgerEntries = health.ledgerEntryCount ?? 0;
  const hasGap = reconciliation.hasGap ?? false;
  const overrideLabel = overrideStatus.isInternalAccount ? 'override-active' : 'no-override';

  // Stop condition detection (reuses pA2 logic)
  const stopConditions = detectStopConditions({ balance, balanceBucket, hasGap, health, readiness: data.readiness, overrideStatus });

  const stops = stopConditions.filter(c => c.level === 'stop');
  const warns = stopConditions.filter(c => c.level === 'warn');
  const status = stops.length > 0
    ? `STOP:${stops.map(c => c.key).join(',')}`
    : warns.length > 0
      ? `WARN:${warns.map(c => c.key).join(',')}`
      : 'OK';

  return {
    date: today,
    learner: learnerId,
    readiness,
    balanceBucket,
    ledgerEntries,
    reconciliation: hasGap ? 'gap' : 'no-gap',
    override: overrideLabel,
    source,
    status,
    stopConditions,
  };
}

// ── Markdown formatting (9-column) ─────────────────────────────────

export function formatObservationRow(obs) {
  return `| ${obs.date} | ${obs.learner} | ${obs.readiness} | ${obs.balanceBucket} | ${obs.ledgerEntries} | ${obs.reconciliation} | ${obs.override} | ${obs.source} | ${obs.status} |`;
}

function formatStopConditionRows(observations) {
  const rows = [];
  for (const obs of observations) {
    for (const condition of obs.stopConditions) {
      const detail = condition.detail ? ` (${condition.detail})` : '';
      rows.push(`| ${condition.key}${detail} | Yes | ${obs.date} | Learner: ${obs.learner} [${condition.level}] |`);
    }
  }
  return rows;
}

// ── File insertion ────────────────────────────────────────────────

export function insertIntoObservationLog(content, observationRows, stopRows) {
  const stopConditionsIdx = content.indexOf('## Stop Conditions');
  if (stopConditionsIdx === -1) {
    const headerPattern = '|------|---------|-----------|';
    const headerIdx = content.indexOf(headerPattern);
    if (headerIdx === -1) {
      return content + '\n' + observationRows + '\n';
    }
    const lineEnd = content.indexOf('\n', headerIdx);
    const insertAt = lineEnd === -1 ? content.length : lineEnd + 1;
    return content.slice(0, insertAt) + observationRows + '\n' + content.slice(insertAt);
  }

  const insertAt = stopConditionsIdx;
  let result = content.slice(0, insertAt) + observationRows + '\n\n' + content.slice(insertAt);

  if (stopRows.length > 0) {
    const stopSection = result.indexOf('## Stop Conditions');
    const afterStopSection = result.slice(stopSection);
    const lines = afterStopSection.split('\n');
    let lastTableRowIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('|')) lastTableRowIdx = i;
    }
    if (lastTableRowIdx !== -1) {
      lines.splice(lastTableRowIdx + 1, 0, ...stopRows);
      result = result.slice(0, stopSection) + lines.join('\n');
    }
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  console.log(`Hero Mode pA3 — Cohort Smoke Script (provenance-aware)`);
  console.log(`Probe URL: ${args.probeUrl}`);
  console.log(`Learner IDs: ${args.learnerIds.join(', ')}`);
  console.log(`Source: ${args.source}`);
  console.log(`Dry run: ${args.dryRun}`);
  console.log('---');

  const observations = [];

  for (const learnerId of args.learnerIds) {
    const result = await fetchProbe(args.probeUrl, learnerId);
    const obs = extractObservation(learnerId, result, args.source);
    observations.push(obs);

    const row = formatObservationRow(obs);
    console.log(row);
  }

  // Summary
  console.log('---');
  console.log(`Checked: ${observations.length} learner(s)`);
  const withConditions = observations.filter(o => o.stopConditions.length > 0);
  if (withConditions.length > 0) {
    console.log(`STOP CONDITIONS DETECTED (${withConditions.length} learner(s)):`);
    for (const obs of withConditions) {
      for (const c of obs.stopConditions) {
        console.log(`  - ${obs.learner}: [${c.level}] ${c.key}${c.detail ? ` (${c.detail})` : ''}`);
      }
    }
  } else {
    console.log('No stop conditions detected.');
  }

  if (!args.dryRun) {
    let content;

    // If evidence file doesn't exist, create it with the 9-column header
    if (!existsSync(EVIDENCE_PATH)) {
      const dir = dirname(EVIDENCE_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      content = EVIDENCE_TEMPLATE;
      const initTmpPath = EVIDENCE_PATH + '.tmp';
      writeFileSync(initTmpPath, content, 'utf8');
      renameSync(initTmpPath, EVIDENCE_PATH);
      console.log(`\nCreated evidence file: ${EVIDENCE_PATH}`);
    } else {
      content = readFileSync(EVIDENCE_PATH, 'utf8');
    }

    const observationRows = observations.map(formatObservationRow).join('\n');
    const stopRows = formatStopConditionRows(observations);

    const updated = insertIntoObservationLog(content, observationRows, stopRows);
    const tmpPath = EVIDENCE_PATH + '.tmp';
    writeFileSync(tmpPath, updated, 'utf8');
    renameSync(tmpPath, EVIDENCE_PATH);
    console.log(`Inserted ${observations.length} observation(s) into ${EVIDENCE_PATH}`);
  } else {
    console.log('\n(Dry run — no file written)');
  }
}

// Only run main when invoked directly (not when imported for testing)
const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(0);
  });
}
