#!/usr/bin/env node
// One-command release gate for Punctuation QG.
// Composes: strict audit (depth 4), capacity audit (depth 8), golden marking,
// parity tests, read-model redaction, and reviewer report.
// Exits non-zero on any component failure.

import { execSync } from 'node:child_process';

const components = [
  {
    name: 'Strict audit (production depth 4)',
    command: 'node scripts/audit-punctuation-content.mjs --strict --generated-per-family 4',
  },
  {
    name: 'Capacity audit (depth 8)',
    command: 'node scripts/audit-punctuation-content.mjs --strict --generated-per-family 8 --min-signatures-per-family 8',
  },
  {
    name: 'Golden marking tests',
    command: 'node --test tests/punctuation-golden-marking.test.js',
  },
  {
    name: 'DSL parity tests',
    command: 'node --test tests/punctuation-dsl-conversion-parity.test.js',
  },
  {
    name: 'Read-model redaction tests',
    command: 'node --test tests/punctuation-read-model-redaction.test.js',
  },
  {
    name: 'Content audit tests',
    command: 'node --test tests/punctuation-content-audit.test.js',
  },
  {
    name: 'Reviewer report (require all DSL)',
    command: 'node scripts/audit-punctuation-content.mjs --reviewer-report --require-all-dsl',
  },
];

let passed = 0;
let failed = 0;
const results = [];

for (const component of components) {
  try {
    execSync(component.command, { stdio: 'pipe', encoding: 'utf-8' });
    results.push({ name: component.name, status: 'PASS' });
    passed += 1;
  } catch (error) {
    results.push({ name: component.name, status: 'FAIL', error: error.stderr?.slice(0, 200) || '' });
    failed += 1;
  }
}

console.log('\n══════════════════════════════════════════');
console.log('PUNCTUATION QG VERIFICATION SUMMARY');
console.log('══════════════════════════════════════════\n');

for (const result of results) {
  const marker = result.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${marker} ${result.name}`);
  if (result.status === 'FAIL' && result.error) {
    console.log(`    ${result.error.split('\n')[0]}`);
  }
}

console.log(`\n  Total: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exitCode = 1;
}
