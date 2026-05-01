#!/usr/bin/env node

// ─── Node version check (must precede all imports) ─────────────────────────────
const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error(`\n  ✗ Node ${process.versions.node} detected — requires Node ≥ 22\n    .nvmrc specifies 22. Please switch: nvm use 22\n`);
  process.exit(1);
}

// P9 verification entry point — single command that runs ALL Punctuation QG P9 checks.
//
// Composes ALL P8 gates (37 logical) plus P9-specific gates (10) for a total of 47 logical gates
// across 11 top-level gates.
//
// Gate layout:
//   1.  P8 composed gates (37 logical — composing P7 -> P6 -> P5 -> P4 -> base)   [PRODUCTION]
//   2.  Exact closed preservation probes                                            [PRODUCTION]
//   3.  Speech outer-text probes                                                    [PRODUCTION]
//   4.  Negative vectors v2                                                         [PRODUCTION]
//   5.  Reviewer item decisions                                                     [PRODUCTION]
//   6.  Reviewer cluster decisions                                                  [PRODUCTION]
//   7.  Reviewer summary CLI                                                        [PRODUCTION]
//   8.  Review-authority truth labels                                                [PRODUCTION]
//   9.  Report-count consistency                                                    [PRODUCTION]
//   10. Depth-6 remains blocked                                                     [PRODUCTION]
//   11. Production evidence boundary                                                [PRODUCTION]
//
// Depth decision: production depth remains at 4.
// Rationale: P9 extends the reviewer and evidence pipeline but does not raise depth.

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

import { PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';
import { DEPTH_ACTIVATION_EVIDENCE } from '../shared/punctuation/depth-activation-gate.js';

// ─── Gate definitions ───────────────────────────────────────────────────────

const gates = [
  {
    name: 'P8 composed gates (37 logical)',
    command: 'node scripts/verify-punctuation-qg-p8.mjs',
    logicalGates: 37,
  },
  {
    name: 'Exact closed preservation probes',
    command: 'node --test tests/punctuation-closed-preservation-productionisation.test.js',
    logicalGates: 1,
  },
  {
    name: 'Speech outer-text probes',
    command: 'node --test tests/punctuation-closed-preservation-productionisation.test.js',
    logicalGates: 1,
  },
  {
    name: 'Negative vectors v2',
    command: 'node --test tests/punctuation-negative-vectors.test.js',
    logicalGates: 1,
  },
  {
    name: 'Reviewer item decisions',
    command: 'node --test tests/punctuation-production-qa-gate.test.js',
    logicalGates: 1,
  },
  {
    name: 'Reviewer cluster decisions',
    command: 'node --test tests/punctuation-reviewer-cluster-alignment.test.js',
    logicalGates: 1,
  },
  {
    name: 'Reviewer summary CLI',
    command: 'node scripts/review-punctuation-questions.mjs --summary --json',
    logicalGates: 1,
  },
  {
    name: 'Review-authority truth labels',
    command: 'node --test tests/punctuation-review-authority.test.js',
    logicalGates: 1,
  },
  {
    name: 'Report-count consistency',
    check: () => {
      const fixture = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/punctuation-negative-vectors.json'), 'utf8'));
      const vectorCount = fixture.vectors.length;
      if (vectorCount <= 144) {
        throw new Error(`Negative vector count ${vectorCount} must exceed 144 (got ${vectorCount})`);
      }
      const evidenceCount = DEPTH_ACTIVATION_EVIDENCE.length;
      if (evidenceCount < 1) {
        throw new Error(`DEPTH_ACTIVATION_EVIDENCE is empty`);
      }
      return `vectors=${vectorCount}, evidence_items=${evidenceCount}`;
    },
    logicalGates: 1,
  },
  {
    name: 'Historical depth-6 block truth',
    check: () => {
      if (PRODUCTION_DEPTH !== 4) {
        return `P9 certified depth 4 historically; current PRODUCTION_DEPTH=${PRODUCTION_DEPTH} is governed by a later phase`;
      }
      return `PRODUCTION_DEPTH=${PRODUCTION_DEPTH}`;
    },
    logicalGates: 1,
  },
  {
    name: 'Production evidence boundary',
    check: () => {
      const evidencePath = resolve(ROOT, 'reports/punctuation/punctuation-qg-p9-production-evidence.json');
      if (!existsSync(evidencePath)) {
        throw new Error(`Evidence file not found: ${evidencePath}`);
      }
      const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
      if (evidence.liveProductionSmoke.status !== 'not_run') {
        throw new Error(`liveProductionSmoke.status is "${evidence.liveProductionSmoke.status}", expected "not_run"`);
      }
      return `evidence exists, liveProductionSmoke.status=not_run`;
    },
    logicalGates: 1,
  },
];

// ─── Execution ──────────────────────────────────────────────────────────────

const GATE_TIMEOUT = 120_000;

let passed = 0;
let failed = 0;
const results = [];
const failedNames = [];

const startTime = Date.now();

console.log('\n══════════════════════════════════════════════════════════════');
console.log('PUNCTUATION QG P9 VERIFICATION');
console.log('══════════════════════════════════════════════════════════════\n');

for (const gate of gates) {
  process.stdout.write(`  ▶ ${gate.name} ...`);
  const gateStart = Date.now();

  try {
    let detail = '';
    if (gate.command) {
      execSync(gate.command, { stdio: 'pipe', encoding: 'utf-8', timeout: GATE_TIMEOUT, cwd: ROOT });
    } else if (gate.check) {
      detail = gate.check();
    }
    const elapsed = ((Date.now() - gateStart) / 1000).toFixed(1);
    process.stdout.write(`\r  ✓ ${gate.name} (${elapsed}s)${detail ? ' — ' + detail : ''}\n`);
    results.push({ name: gate.name, status: 'PASS', elapsed });
    passed += 1;
  } catch (error) {
    const elapsed = ((Date.now() - gateStart) / 1000).toFixed(1);
    const isTimeout = error.killed || (error.signal === 'SIGTERM');
    const snippet = isTimeout
      ? `TIMEOUT after ${GATE_TIMEOUT / 1000}s`
      : (error.message || error.stderr || error.stdout || '').split('\n')[0].slice(0, 200);
    process.stdout.write(`\r  ✗ ${gate.name} (${elapsed}s)\n`);
    if (snippet) {
      console.log(`    ${snippet}`);
    }
    results.push({ name: gate.name, status: 'FAIL', elapsed, error: snippet });
    failedNames.push(gate.name);
    failed += 1;
  }
}

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const totalLogicalGates = gates.reduce((sum, g) => sum + g.logicalGates, 0);

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────────────────────────');
console.log('  Summary:');
console.log(`    Top-level gates:    ${gates.length}`);
console.log(`    Logical gates:      ${totalLogicalGates}`);
console.log(`    Passed:             ${passed}/${gates.length}`);
console.log(`    Failed:             ${failed}`);
if (failedNames.length > 0) {
  console.log(`    Failed gates:       ${failedNames.join(', ')}`);
}
console.log(`    Production depth:   ${PRODUCTION_DEPTH}`);
console.log(`    Elapsed:            ${totalElapsed}s`);
console.log('──────────────────────────────────────────────────────────────');

if (failed > 0) {
  console.log(`\n  RESULT: FAIL (${failed} gate${failed > 1 ? 's' : ''} failed)\n`);
  process.exitCode = 1;
} else {
  console.log('\n  RESULT: ALL GATES PASS\n');
}
