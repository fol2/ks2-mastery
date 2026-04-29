#!/usr/bin/env node
// P5 verification entry point — single command that runs ALL Punctuation QG P5 checks.
//
// Vocabulary (precise):
//   "declared" telemetry      — event exists in the manifest
//   "emitted" telemetry       — event has status: emitted (actively fired)
//   "manifest coverage"       — structural completeness of the content manifest
//   "command-path coverage"   — tests that exercise the full Worker command path
//   "model-answer validation" — golden marking tests proving accept/reject correctness
//   "production depth"        — current active depth for generated items
//   "capacity depth"          — maximum audited depth (safe to raise to)
//   "source validation"       — local manifest + marking verification
//   "deployed production validation" — live Worker smoke against running environment
//   "current behaviour"       — tests asserting today's contract
//   "future-ready fields"     — fields tested for presence/absence for forward compat

import { execSync } from 'node:child_process';

import { PRODUCTION_DEPTH, CAPACITY_DEPTH } from '../shared/punctuation/generators.js';
import { PUNCTUATION_TELEMETRY_MANIFEST } from '../shared/punctuation/telemetry-manifest.js';

const EMITTED_EVENT_COUNT = Object.values(PUNCTUATION_TELEMETRY_MANIFEST)
  .filter((entry) => entry.status === 'emitted').length;
const TOTAL_EVENT_COUNT = Object.keys(PUNCTUATION_TELEMETRY_MANIFEST).length;

const gates = [
  {
    name: 'P4 release gates (strict + capacity audit, golden marking, DSL parity, redaction)',
    command: 'node scripts/verify-punctuation-qg.mjs',
  },
  {
    name: 'Golden marking validation (25/25 families)',
    command: 'node --test tests/punctuation-golden-marking.test.js',
  },
  {
    name: 'Telemetry command-path tests (declared vs emitted events)',
    command: 'node --test tests/punctuation-telemetry-command-path.test.js',
  },
  {
    name: 'Learning-health report (strict + synthetic fixture)',
    command: 'node scripts/punctuation-qg-health-report.mjs --strict --fixture synthetic',
  },
  {
    name: 'Mixed-review integration test (recentModes scheduling)',
    command: 'node --test tests/punctuation-mixed-review.test.js',
  },
  {
    name: 'Sibling-retry lifecycle test (loop-breaker guard)',
    command: 'node --test tests/punctuation-sibling-retry-lifecycle.test.js',
  },
  {
    name: 'Support evidence test (future-ready field exclusion)',
    command: 'node --test tests/punctuation-support-evidence.test.js',
  },
  {
    name: 'Duplicate stem review (depth-gated cluster decisions)',
    command: 'node --test tests/punctuation-duplicate-review.test.js',
  },
  {
    name: 'Production smoke — source validation (local attestation)',
    command: 'node --test tests/punctuation-smoke-attestation.test.js',
  },
  {
    name: 'Capacity raise mechanism (depth-6 verification path)',
    command: 'node --test tests/punctuation-capacity-raise.test.js',
  },
];

let passed = 0;
let failed = 0;
const results = [];
const warnings = [];

for (const gate of gates) {
  try {
    execSync(gate.command, { stdio: 'pipe', encoding: 'utf-8', timeout: 120_000 });
    results.push({ name: gate.name, status: 'PASS' });
    passed += 1;
  } catch (error) {
    const snippet = (error.stderr || error.stdout || '').slice(0, 300).split('\n')[0];
    results.push({ name: gate.name, status: 'FAIL', error: snippet });
    failed += 1;
  }
}

// ─── Known residual risks ────────────────────────────────────────────────────

if (PRODUCTION_DEPTH < 6) {
  warnings.push('Production depth is 4 (not yet raised to 6). Depth-6 raise is gated on P5 completion.');
}

const reservedEvents = Object.entries(PUNCTUATION_TELEMETRY_MANIFEST)
  .filter(([, entry]) => entry.status === 'reserved')
  .map(([key]) => key);
if (reservedEvents.length > 0) {
  warnings.push(`Reserved telemetry events not yet emitted: ${reservedEvents.join(', ')}`);
}

// ─── Summary output ──────────────────────────────────────────────────────────

const runtimeItems = 92 + 25 * PRODUCTION_DEPTH;

console.log('\n══════════════════════════════════════════════════════════════');
console.log('PUNCTUATION QG P5 VERIFICATION');
console.log('══════════════════════════════════════════════════════════════\n');

for (const result of results) {
  const marker = result.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${marker} ${result.name}`);
  if (result.status === 'FAIL' && result.error) {
    console.log(`    ${result.error}`);
  }
}

console.log('');
console.log(`  P5 verification: ${passed}/${gates.length} gates passed | production depth: ${PRODUCTION_DEPTH} | runtime: ${runtimeItems} | emitted events: ${EMITTED_EVENT_COUNT}/${TOTAL_EVENT_COUNT}`);

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
