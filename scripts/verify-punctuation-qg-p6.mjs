#!/usr/bin/env node
// P6 verification entry point — single command that runs ALL Punctuation QG P6 checks.
//
// Composes ALL P5 gates (10) plus P6-specific gates (8) for a total of 18 gates.
//
// P6-specific gates:
//   11. Fixed-bank self-marking audit (current fixed items)
//   12. Apostrophe normalisation regression
//   13. Speech transfer fairness (reporting-before + after)
//   14. Generated explanation specificity (no generic fallback)
//   15. Edge-case matrix (14 skills)
//   16. Perceived-variety (strict mode)
//   17. Telemetry proof/smoke classification
//   18. Feedback redaction verification
//
// Depth decision (historical U10): P6 originally held production depth at 4.
// This verifier now composes the historical P6 gates under the current expanded
// runtime; current activation depth is owned by later P11 gates.

import { execSync } from 'node:child_process';

import { createPunctuationRuntimeManifest, PRODUCTION_DEPTH, CAPACITY_DEPTH } from '../shared/punctuation/generators.js';
import { PUNCTUATION_TELEMETRY_MANIFEST } from '../shared/punctuation/telemetry-manifest.js';

const EMITTED_EVENT_COUNT = Object.values(PUNCTUATION_TELEMETRY_MANIFEST)
  .filter((entry) => entry.status === 'emitted').length;
const TOTAL_EVENT_COUNT = Object.keys(PUNCTUATION_TELEMETRY_MANIFEST).length;
const PROOF_EVENT_COUNT = Object.values(PUNCTUATION_TELEMETRY_MANIFEST)
  .filter((entry) => entry.testLevel === 'proof').length;
const SMOKE_EVENT_COUNT = Object.values(PUNCTUATION_TELEMETRY_MANIFEST)
  .filter((entry) => entry.testLevel === 'smoke').length;
const runtimeManifest = createPunctuationRuntimeManifest({ generatedPerFamily: PRODUCTION_DEPTH });
const fixedItems = runtimeManifest.items.filter((item) => item.source === 'fixed').length;
const generatedItems = runtimeManifest.items.filter((item) => item.source === 'generated').length;

const gates = [
  {
    name: 'P5 verification gates (all 10)',
    command: 'node scripts/verify-punctuation-qg-p5.mjs',
  },
  {
    name: 'Fixed-bank self-marking audit (current fixed items)',
    command: 'node --test tests/punctuation-fixed-bank-selfmark.test.js',
  },
  {
    name: 'Apostrophe normalisation regression',
    command: 'node --test tests/punctuation-apostrophe-normalisation.test.js',
  },
  {
    name: 'Speech transfer fairness (reporting-before + after)',
    command: 'node --test tests/punctuation-speech-fairness.test.js',
  },
  {
    name: 'Generated explanation specificity (no generic fallback)',
    command: 'node --test tests/punctuation-explanation-specificity.test.js',
  },
  {
    name: 'Edge-case matrix (14 skills)',
    command: 'node --test tests/punctuation-edge-case-matrix.test.js',
  },
  {
    name: 'Perceived-variety (strict mode)',
    command: 'node --test tests/punctuation-perceived-variety.test.js',
  },
  {
    name: 'Telemetry proof/smoke classification',
    command: 'node --test tests/punctuation-telemetry-command-path.test.js',
  },
  {
    name: 'Feedback redaction verification',
    command: 'node --test tests/punctuation-feedback-redaction.test.js',
  },
];

let passed = 0;
let failed = 0;
const results = [];
const warnings = [];
const failedNames = [];

for (const gate of gates) {
  try {
    execSync(gate.command, { stdio: 'pipe', encoding: 'utf-8', timeout: 120_000 });
    results.push({ name: gate.name, status: 'PASS' });
    passed += 1;
  } catch (error) {
    const snippet = (error.stderr || error.stdout || '').slice(0, 300).split('\n')[0];
    results.push({ name: gate.name, status: 'FAIL', error: snippet });
    failedNames.push(gate.name);
    failed += 1;
  }
}

// ─── Known residual risks ────────────────────────────────────────────────────

if (PRODUCTION_DEPTH < 6) {
  warnings.push(
    `Production depth is ${PRODUCTION_DEPTH} (not yet raised to 6). Depth-6 raise requires human reviewer QA on generated candidates.`
  );
}

const reservedEvents = Object.entries(PUNCTUATION_TELEMETRY_MANIFEST)
  .filter(([, entry]) => entry.status === 'reserved')
  .map(([key]) => key);
if (reservedEvents.length > 0) {
  warnings.push(`Reserved telemetry events not yet emitted: ${reservedEvents.join(', ')}`);
}

// ─── Summary output ──────────────────────────────────────────────────────────

const runtimePool = runtimeManifest.items.length;

console.log('\n══════════════════════════════════════════════════════════════');
console.log('PUNCTUATION QG P6 VERIFICATION');
console.log('══════════════════════════════════════════════════════════════\n');

for (const result of results) {
  const marker = result.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${marker} ${result.name}`);
  if (result.status === 'FAIL' && result.error) {
    console.log(`    ${result.error}`);
  }
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log('  Measured counts:');
console.log(`    Total gates:        ${gates.length}`);
console.log(`    Passed:             ${passed}`);
console.log(`    Failed:             ${failed}`);
if (failedNames.length > 0) {
  console.log(`    Failed gates:       ${failedNames.join(', ')}`);
}
console.log(`    Production depth:   ${PRODUCTION_DEPTH}`);
console.log(`    Capacity depth:     ${CAPACITY_DEPTH}`);
console.log(`    Runtime pool:       ${runtimePool} items (${fixedItems} fixed + ${generatedItems} generated)`);
console.log(`    Telemetry events:   ${EMITTED_EVENT_COUNT}/${TOTAL_EVENT_COUNT} emitted (${PROOF_EVENT_COUNT} proof, ${SMOKE_EVENT_COUNT} smoke)`);
console.log('──────────────────────────────────────────────────────────────');

if (warnings.length > 0) {
  console.log('\n  Known residual risks:');
  for (const warning of warnings) {
    console.log(`    - ${warning}`);
  }
}

console.log('');

if (failed > 0) {
  process.exitCode = 1;
}
