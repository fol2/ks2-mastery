#!/usr/bin/env node
// P7 verification entry point — single command that runs ALL Punctuation QG P7 checks.
//
// Composes ALL P6 gates (18 logical) plus P7-specific gates (9) for a total of 27 logical gates
// across 10 top-level gates.
//
// Gate layout:
//   1.  P6 verification gates (18 logical — composing P5 -> P4 -> base)      [PRODUCTION]
//   2.  Direction-aware speech oracle tests                                    [PRODUCTION]
//   3.  Canonical depth-source drift test                                      [PRODUCTION]
//   4.  Depth-6 reviewer-pack CLI tests                                        [DEPTH-6-CANDIDATE]
//   5.  Reviewer-decision production gate                                      [PRODUCTION]
//   6.  Accepted-alternative + negative-case proof                             [PRODUCTION]
//   7.  Semantic explanation oracle                                             [PRODUCTION]
//   8.  Child-facing feedback trust                                            [PRODUCTION]
//   9.  Perceived-variety second pass                                           [DEPTH-6-CANDIDATE]
//   10. Depth-decision attestation                                             [DEPTH-6-CANDIDATE]
//
// Depth decision: production depth remains at 4.
// Rationale: P7 quality gates pass, but reviewer decisions are not yet fully
// populated for depth-6 candidates. The plan explicitly states: "Do not raise
// production depth merely because the capacity audit passes."

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
    name: 'P6 verification gates (18 logical)',
    command: 'node scripts/verify-punctuation-qg-p6.mjs',
    label: LABEL.PRODUCTION,
    logicalGates: 18,
  },
  {
    name: 'Direction-aware speech oracle tests',
    command: 'node --test tests/punctuation-speech-oracle-hardening.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Canonical depth-source drift test',
    command: 'node --test tests/punctuation-canonical-depth-source.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Depth-6 reviewer-pack CLI tests',
    command: 'node --test tests/punctuation-reviewer-pack-cli.test.js',
    label: LABEL.DEPTH6,
    logicalGates: 1,
  },
  {
    name: 'Reviewer-decision production gate',
    command: 'node --test tests/punctuation-reviewer-decision-gate.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Accepted-alternative + negative-case proof',
    command: 'node --test tests/punctuation-alternative-marking-proof.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Semantic explanation oracle',
    command: 'node --test tests/punctuation-semantic-explanation-lint.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Child-facing feedback trust',
    command: 'node --test tests/punctuation-feedback-trust.test.js',
    label: LABEL.PRODUCTION,
    logicalGates: 1,
  },
  {
    name: 'Perceived-variety second pass',
    command: 'node --test tests/punctuation-variety-session-simulation.test.js',
    label: LABEL.DEPTH6,
    logicalGates: 1,
  },
  {
    name: 'Depth-decision attestation',
    command: 'node --test tests/punctuation-depth-activation-gate.test.js',
    label: LABEL.DEPTH6,
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
  try {
    execSync(gate.command, { stdio: 'pipe', encoding: 'utf-8', timeout: 120_000 });
    results.push({ name: gate.name, status: 'PASS', label: gate.label });
    passed += 1;
  } catch (error) {
    const snippet = (error.stderr || error.stdout || '').slice(0, 300).split('\n')[0];
    results.push({ name: gate.name, status: 'FAIL', label: gate.label, error: snippet });
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
console.log('PUNCTUATION QG P7 VERIFICATION');
console.log('══════════════════════════════════════════════════════════════\n');

for (const result of results) {
  const marker = result.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${marker} ${result.label} ${result.name}`);
  if (result.status === 'FAIL' && result.error) {
    console.log(`    ${result.error}`);
  }
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log('  Measured counts:');
console.log(`    Top-level gates:    ${gates.length}`);
console.log(`    Logical gates:      ${totalLogicalGates} (P6: 18 composed + P7: 9 specific)`);
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
