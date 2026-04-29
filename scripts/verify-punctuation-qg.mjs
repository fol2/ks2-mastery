#!/usr/bin/env node
// One-command release gate for Punctuation QG.
// Composes: strict audit (depth 4), capacity audit (depth 8), golden marking,
// parity tests, read-model redaction, and reviewer report.
// Exits non-zero on any component failure.
//
// Flags:
//   --depth 6   Run full pipeline at depth 6 (capacity raise verification)

import { execSync } from 'node:child_process';

const depthArg = process.argv.includes('--depth')
  ? Number(process.argv[process.argv.indexOf('--depth') + 1])
  : null;
const requestedDepth = depthArg === 6 ? 6 : null;

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
  {
    name: 'Learning-health report (strict, synthetic fixture)',
    command: 'node scripts/punctuation-qg-health-report.mjs --strict --fixture synthetic',
  },
];

if (requestedDepth === 6) {
  components.push(
    {
      name: 'Depth-6 audit (capacity raise verification)',
      command: 'node scripts/audit-punctuation-content.mjs --strict --generated-per-family 6 --min-signatures-per-family 6',
    },
    {
      name: 'Depth-6 duplicate stem review (no unreviewed clusters)',
      command: 'node --test tests/punctuation-duplicate-review.test.js',
    },
    {
      name: 'Depth-6 runtime count assertion (242 items)',
      command: `node -e "import { createPunctuationGeneratedItems } from './shared/punctuation/generators.js'; import { PUNCTUATION_CONTENT_MANIFEST } from './shared/punctuation/content.js'; const gen = createPunctuationGeneratedItems({ perFamily: 6 }); const total = 92 + gen.length; if (total !== 242) { console.error('Expected 242 items, got ' + total); process.exit(1); } console.log('Depth-6 runtime count: ' + total + ' items (92 fixed + ' + gen.length + ' generated)');" --input-type=module`,
    },
  );
}

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
console.log(`PUNCTUATION QG VERIFICATION SUMMARY${requestedDepth ? ` (depth ${requestedDepth})` : ''}`);
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
