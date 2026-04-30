#!/usr/bin/env node

// ─── Node version check (must precede all imports) ─────────────────────────────
const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error(`\n  ✗ Node ${process.versions.node} detected — requires Node ≥ 22\n    .nvmrc specifies 22. Please switch: nvm use 22\n`);
  process.exit(1);
}

// P8 verification entry point — single command that runs ALL Punctuation QG P8 checks.
//
// Composes ALL P7 gates (27 logical) plus P8-specific gates (10) for a total of 37 logical gates
// across 11 top-level gates.
//
// Gate layout:
//   1.  P7 verification gates (27 logical — composing P6 -> P5 -> P4 -> base)   [PRODUCTION]
//   2.  Closed-item preservation oracle tests                                    [PRODUCTION]
//   3.  Speech reporting-clause enforcement tests                                [PRODUCTION]
//   4.  Meaningful transfer-sentence tests                                       [PRODUCTION]
//   5.  Fixed-bank negative vector tests                                         [PRODUCTION]
//   6.  Reviewer pack v3 schema tests                                            [PRODUCTION]
//   7.  Fixed explanation semantic lint                                           [PRODUCTION]
//   8.  Production human QA gate                                                 [PRODUCTION]
//   9.  Feedback specificity tests                                               [PRODUCTION]
//   10. Depth-6 quality-readiness gate                                           [DEPTH-6-CANDIDATE]
//   11. Production QA decisions (real fixture)                                    [PRODUCTION]
//
// Depth decision: production depth remains at 4.
// Rationale: P8 quality gates pass across all 37 logical gates, but depth-6 raise
// requires full reviewer-decision population plus human sign-off on all generated
// candidates. The plan explicitly states: "Do not raise production depth merely
// because the capacity audit passes."

import { execSync } from 'node:child_process';

import { PRODUCTION_DEPTH, CAPACITY_DEPTH } from '../shared/punctuation/generators.js';
import { PUNCTUATION_TELEMETRY_MANIFEST } from '../shared/punctuation/telemetry-manifest.js';

const FIXED_BANK_COUNT = 92;
const GENERATED_PER_DEPTH = 25;

const EMITTED_EVENT_COUNT = Object.values(PUNCTUATION_TELEMETRY_MANIFEST)
  .filter((entry) => entry.status === 'emitted').length;
const TOTAL_EVENT_COUNT = Object.keys(PUNCTUATION_TELEMETRY_MANIFEST).length;

// ─── Classification labels ──────────────────────────────────────────────────

const LABEL = Object.freeze({
  PRODUCTION: '[PRODUCTION]',
  DEPTH6: '[DEPTH-6-CANDIDATE]',
  WARNING: '[WARNING]',
});

// ─── Gate definitions ───────────────────────────────────────────────────────

const gates = [
  {
    name: 'P7 verification gates (27 logical)',
    command: 'node scripts/verify-punctuation-qg-p7.mjs',
    label: LABEL.PRODUCTION,
    logicalGates: 27,
  },
  {
    name: 'Closed-item preservation oracle tests',
    command: 'node --test tests/punctuation-preservation-oracle.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Speech reporting-clause enforcement tests',
    command: 'node --test tests/punctuation-reporting-clause-enforcement.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Meaningful transfer-sentence tests',
    command: 'node --test tests/punctuation-meaningful-transfer.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Fixed-bank negative vector tests',
    command: 'node --test tests/punctuation-negative-vectors.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Reviewer pack v3 schema tests',
    command: 'node --test tests/punctuation-reviewer-pack-v3.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Fixed explanation semantic lint',
    command: 'node --test tests/punctuation-explanation-qa.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Production human QA gate',
    command: 'node --test tests/punctuation-production-qa-gate.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Feedback specificity tests',
    command: 'node --test tests/punctuation-feedback-specificity.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Depth-6 quality-readiness gate',
    command: 'node --test tests/punctuation-depth6-readiness-p8.test.js',
    label: LABEL.DEPTH6,
    logicalGates: 1,
  },
  {
    name: 'Production QA decisions (real fixture)',
    command: 'node -e "import { loadReviewerDecisions, evaluateProductionGate } from \'./shared/punctuation/reviewer-decisions.js\'; import { PUNCTUATION_ITEMS, PUNCTUATION_CONTENT_MANIFEST } from \'./shared/punctuation/content.js\'; import { createPunctuationGeneratedItems, PRODUCTION_DEPTH } from \'./shared/punctuation/generators.js\'; const gen=createPunctuationGeneratedItems({manifest:PUNCTUATION_CONTENT_MANIFEST,seed:PUNCTUATION_CONTENT_MANIFEST.releaseId||\'punctuation\',perFamily:PRODUCTION_DEPTH}); const ids=[...PUNCTUATION_ITEMS.map(i=>i.id),...gen.map(i=>i.id)]; const {data}=loadReviewerDecisions(\'tests/fixtures/punctuation-reviewer-decisions.json\'); const r=evaluateProductionGate(data,ids); if(!r.pass){console.error(\'Production QA gate FAILED:\',JSON.stringify(r.blockers.slice(0,5)));process.exit(1);} console.log(\'Production QA: \'+r.stats.approved+\'/\'+r.stats.total+\' approved\');"',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
];

// ─── Execution ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];
const warnings = [];
const failedNames = [];

const startTime = Date.now();

for (const gate of gates) {
  const gateStart = Date.now();
  try {
    execSync(gate.command, { stdio: 'pipe', encoding: 'utf-8', timeout: 120_000 });
    const gateElapsed = ((Date.now() - gateStart) / 1000).toFixed(1);
    results.push({ name: gate.name, status: 'PASS', label: gate.label, elapsed: gateElapsed });
    passed += 1;
  } catch (error) {
    const gateElapsed = ((Date.now() - gateStart) / 1000).toFixed(1);
    const snippet = (error.stderr || error.stdout || '').slice(0, 300).split('\n')[0];
    results.push({ name: gate.name, status: 'FAIL', label: gate.label, error: snippet, elapsed: gateElapsed });
    failedNames.push(gate.name);
    failed += 1;
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// ─── Known residual risks ───────────────────────────────────────────────────

if (PRODUCTION_DEPTH < 6) {
  warnings.push(
    `Production depth is ${PRODUCTION_DEPTH} (not yet raised to 6). Depth-6 raise requires reviewer decisions on all generated candidates.`
  );
}

const reservedEvents = Object.entries(PUNCTUATION_TELEMETRY_MANIFEST)
  .filter(([, entry]) => entry.status === 'reserved')
  .map(([key]) => key);
if (reservedEvents.length > 0) {
  warnings.push(`Reserved telemetry events not yet emitted: ${reservedEvents.join(', ')}`);
}

// ─── Depth-6 readiness assessment ──────────────────────────────────────────

const depth6Gates = results.filter((r) => r.label === LABEL.DEPTH6);
const depth6Passing = depth6Gates.filter((r) => r.status === 'PASS');
const depth6Blockers = depth6Gates.filter((r) => r.status === 'FAIL').map((r) => r.name);
const depth6Ready = depth6Blockers.length === 0 && PRODUCTION_DEPTH >= 6;

// ─── Counts ─────────────────────────────────────────────────────────────────

const totalLogicalGates = gates.reduce((sum, g) => sum + g.logicalGates, 0);
const productionGates = gates.filter((g) => g.label === LABEL.PRODUCTION);
const depth6CandidateGates = gates.filter((g) => g.label === LABEL.DEPTH6);
const runtimePool = FIXED_BANK_COUNT + GENERATED_PER_DEPTH * PRODUCTION_DEPTH;

// ─── Summary output ─────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════');
console.log('PUNCTUATION QG P8 VERIFICATION');
console.log('══════════════════════════════════════════════════════════════\n');

for (const result of results) {
  const marker = result.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${marker} ${result.label} ${result.name} (${result.elapsed}s)`);
  if (result.status === 'FAIL' && result.error) {
    console.log(`    ${result.error}`);
  }
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log('  Measured counts:');
console.log(`    Top-level gates:    ${gates.length}`);
console.log(`    Logical gates:      ${totalLogicalGates} (P7: 27 composed + P8: 10 specific)`);
console.log(`    Passed:             ${passed}/${gates.length}`);
console.log(`    Failed:             ${failed}`);
if (failedNames.length > 0) {
  console.log(`    Failed gates:       ${failedNames.join(', ')}`);
}
console.log(`    Production gates:   ${productionGates.length}`);
console.log(`    Depth-6 candidates: ${depth6CandidateGates.length}`);
console.log(`    Production depth:   ${PRODUCTION_DEPTH}`);
console.log(`    Capacity depth:     ${CAPACITY_DEPTH}`);
console.log(`    Runtime pool:       ${runtimePool} items (${FIXED_BANK_COUNT} fixed + ${GENERATED_PER_DEPTH * PRODUCTION_DEPTH} generated)`);
console.log(`    Telemetry events:   ${EMITTED_EVENT_COUNT}/${TOTAL_EVENT_COUNT} emitted`);
console.log(`    Elapsed:            ${elapsed}s`);
console.log('──────────────────────────────────────────────────────────────');

if (warnings.length > 0) {
  console.log('\n  Accepted risks:');
  for (const warning of warnings) {
    console.log(`    - ${warning}`);
  }
}

// ─── Depth decision ─────────────────────────────────────────────────────────

console.log('\n═══ DEPTH DECISION ═══');
console.log(`  Production depth: ${PRODUCTION_DEPTH}`);
console.log(`  Depth-6 readiness: ${depth6Ready ? 'READY' : 'BLOCKED'}`);
if (depth6Blockers.length > 0) {
  console.log(`  Blockers: ${depth6Blockers.join(', ')}`);
}
if (!depth6Ready) {
  console.log(`  Recommendation: Keep production depth at ${PRODUCTION_DEPTH} (reviewer decisions not yet populated)`);
} else {
  console.log('  Recommendation: Depth-6 activation is available pending human sign-off');
}

console.log('');

if (failed > 0) {
  process.exitCode = 1;
}
