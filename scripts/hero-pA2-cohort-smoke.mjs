#!/usr/bin/env node
// Hero Mode pA2 — Internal cohort smoke script.
// Queries the admin ops probe for each cohort account and appends
// a dated observation record to the cohort evidence file.
//
// Usage: node scripts/hero-pA2-cohort-smoke.mjs [--probe-url URL] [--dry-run]
//        [--learner-ids id1,id2,...]
//
// In dry-run mode, prints the observation record without appending.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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

// ── Stop condition detection (pure, exported for testing) ───────────

// NOT DETECTABLE FROM PROBE (manual verification required):
// - claim without Worker-verified completion (command-level audit)
// - Hero mutates subject state (architectural impossibility, verified by P1-P6)
// - stale request returns 500 (request monitoring)
// - operators cannot explain task selection (human assessment)
// - children directed to Camp before learning (UI review)
// - support inspects non-existent tables (documentation review)

/**
 * Detect stop conditions from expanded probe fields.
 * Returns an array of { level: 'stop'|'warn'|'info', key: string, detail?: string }.
 */
export function detectStopConditions({ balance, balanceBucket, hasGap, health, readiness, overrideStatus }) {
  const conditions = [];

  // Bug 2 fix: check raw balance directly (balanceBucket never returns 'negative')
  if (typeof balance === 'number' && balance < 0) {
    conditions.push({ level: 'stop', key: 'negative-balance' });
  }

  // Reconciliation gap
  if (hasGap) {
    conditions.push({ level: 'stop', key: 'reconciliation-gap' });
  }

  // Bug 3: duplicate award prevention fired (dedup worked, but attempts exist)
  if (health && health.duplicateAwardPreventedCount > 0) {
    conditions.push({ level: 'warn', key: 'duplicate-award-prevented', detail: `count=${health.duplicateAwardPreventedCount}` });
  }

  // Readiness degraded (overall not 'ready')
  if (readiness && readiness.overall && readiness.overall !== 'ready') {
    const failedChecks = [];
    for (const [k, v] of Object.entries(readiness)) {
      if (k === 'overall') continue;
      if (v === false || v === 'fail' || v === 'missing') failedChecks.push(k);
    }
    conditions.push({ level: 'warn', key: 'readiness-degraded', detail: failedChecks.join(',') || readiness.overall });
  }

  // Override mismatch: if override exists but isInternalAccount is false
  if (overrideStatus && overrideStatus.isInternalAccount === false) {
    conditions.push({ level: 'warn', key: 'override-not-internal' });
  }

  return conditions;
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
  const balance = health.balance ?? null;
  const ledgerEntries = health.ledgerEntryCount ?? 0;
  const hasGap = reconciliation.hasGap ?? false;
  // Bug 1 fix: overrideStatus has { accountId, isInternalAccount, effectiveFlags }
  const overrideLabel = overrideStatus.isInternalAccount ? 'override-active' : 'no-override';

  // Stop condition detection
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
      const detail = condition.detail ? ` (${condition.detail})` : '';
      rows.push(`| ${condition.key}${detail} | Yes | ${obs.date} | Learner: ${obs.learner} [${condition.level}] |`);
    }
  }
  return rows;
}

// ── File insertion (Bug 4 fix) ─────────────────────────────────────

/**
 * Insert observation rows into the Observation Log table, just before the
 * Stop Conditions section. If stop condition rows are present, append them
 * as a comment below the Stop Conditions table.
 */
export function insertIntoObservationLog(content, observationRows, stopRows) {
  // Find the end of the Observation Log table:
  // It ends just before "## Stop Conditions"
  const stopConditionsIdx = content.indexOf('## Stop Conditions');
  if (stopConditionsIdx === -1) {
    // Fallback: look for end of the observation log header row
    const headerPattern = '|------|---------|-----------|';
    const headerIdx = content.indexOf(headerPattern);
    if (headerIdx === -1) {
      // Last resort: append to end
      return content + '\n' + observationRows + '\n';
    }
    // Find end of that line
    const lineEnd = content.indexOf('\n', headerIdx);
    const insertAt = lineEnd === -1 ? content.length : lineEnd + 1;
    return content.slice(0, insertAt) + observationRows + '\n' + content.slice(insertAt);
  }

  // Insert observation rows just before "## Stop Conditions" (with a blank line)
  const insertAt = stopConditionsIdx;
  let result = content.slice(0, insertAt) + observationRows + '\n\n' + content.slice(insertAt);

  // If there are stop rows, append as visible entries to the Stop Conditions table
  if (stopRows.length > 0) {
    // Find end of the Stop Conditions table (last |-prefixed line)
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

  // Bug 4 fix: insert into Observation Log table, not EOF
  if (!args.dryRun) {
    if (!existsSync(EVIDENCE_PATH)) {
      console.error(`Evidence file not found: ${EVIDENCE_PATH}`);
      console.error('Run in --dry-run mode or create the evidence template first.');
      process.exit(1);
    }

    const content = readFileSync(EVIDENCE_PATH, 'utf8');
    const observationRows = observations.map(formatObservationRow).join('\n');
    const stopRows = formatStopConditionRows(observations);

    // Insert observation rows into the Observation Log table
    const updated = insertIntoObservationLog(content, observationRows, stopRows);
    writeFileSync(EVIDENCE_PATH, updated, 'utf8');
    console.log(`\nInserted ${observations.length} observation(s) into ${EVIDENCE_PATH}`);
  } else {
    console.log('\n(Dry run — no file written)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
