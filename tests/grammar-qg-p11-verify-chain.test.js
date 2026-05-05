/**
 * Grammar QG P11 U10 — Verify Chain Contract
 *
 * Validates that:
 * 1. verify:grammar-qg-p11 exists in package.json
 * 2. verify:grammar-qg-p11 chains verify:grammar-qg-p10 first
 * 3. verify:grammar-qg-production-release exists
 * 4. verify:grammar-qg-production-release includes the semantic audit
 * 5. verify:grammar-qg-production-release chains through p14, which chains p11
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const packageJson = JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, 'package.json'), 'utf8'));
const scripts = packageJson.scripts || {};

// ---------------------------------------------------------------------------
// 1. verify:grammar-qg-p11 exists and chains p10
// ---------------------------------------------------------------------------

describe('P11 U10 Verify Chain: verify:grammar-qg-p11', () => {
  it('verify:grammar-qg-p11 script exists in package.json', () => {
    assert.ok('verify:grammar-qg-p11' in scripts, 'Missing script: verify:grammar-qg-p11');
  });

  it('verify:grammar-qg-p11 starts with "npm run verify:grammar-qg-p10"', () => {
    const cmd = scripts['verify:grammar-qg-p11'] || '';
    assert.ok(
      cmd.startsWith('npm run verify:grammar-qg-p10'),
      `verify:grammar-qg-p11 must chain p10 first. Actual: "${cmd}"`,
    );
  });

  it('verify:grammar-qg-p11 includes p11 test files via node --test', () => {
    const cmd = scripts['verify:grammar-qg-p11'] || '';
    assert.ok(
      cmd.includes('node --test') && cmd.includes('grammar-qg-p11-'),
      `verify:grammar-qg-p11 must run p11 tests. Actual: "${cmd}"`,
    );
  });

  it('verify:grammar-qg-p11 chains with && (fail-fast)', () => {
    const cmd = scripts['verify:grammar-qg-p11'] || '';
    assert.ok(
      cmd.includes('&&'),
      `verify:grammar-qg-p11 must use && for fail-fast chaining. Actual: "${cmd}"`,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. verify:grammar-qg-production-release exists and includes semantic audit
// ---------------------------------------------------------------------------

describe('P11 U10 Verify Chain: verify:grammar-qg-production-release', () => {
  it('verify:grammar-qg-production-release script exists in package.json', () => {
    assert.ok('verify:grammar-qg-production-release' in scripts, 'Missing script: verify:grammar-qg-production-release');
  });

  it('verify:grammar-qg-production-release chains the active p14 release gate first', () => {
    const cmd = scripts['verify:grammar-qg-production-release'] || '';
    assert.ok(
      cmd.startsWith('npm run verify:grammar-qg-p14'),
      `verify:grammar-qg-production-release must chain p14 first. Actual: "${cmd}"`,
    );
  });

  it('verify:grammar-qg-p14 chains p11 first', () => {
    const cmd = scripts['verify:grammar-qg-p14'] || '';
    assert.ok(
      cmd.startsWith('npm run verify:grammar-qg-p11'),
      `verify:grammar-qg-p14 must chain p11 first. Actual: "${cmd}"`,
    );
  });

  it('verify:grammar-qg-production-release includes the semantic audit', () => {
    const cmd = scripts['verify:grammar-qg-production-release'] || '';
    const p14Cmd = scripts['verify:grammar-qg-p14'] || '';
    assert.ok(
      cmd.includes('audit:grammar-qg:semantic') || p14Cmd.includes('audit:grammar-qg:semantic'),
      `verify:grammar-qg-production-release must include the semantic audit directly or through p14. Actual: "${cmd}" / "${p14Cmd}"`,
    );
  });

  it('verify:grammar-qg-production-release includes the certification evidence validator', () => {
    const cmd = scripts['verify:grammar-qg-production-release'] || '';
    assert.ok(
      cmd.includes('validate-grammar-qg-certification-evidence'),
      `verify:grammar-qg-production-release must include the certification evidence validator. Actual: "${cmd}"`,
    );
  });

  it('verify:grammar-qg-production-release checks manual expansion generated source freshness', () => {
    const cmd = scripts['verify:grammar-qg-production-release'] || '';
    assert.ok(
      cmd.includes('generate-grammar-manual-expansion.mjs --check'),
      `verify:grammar-qg-production-release must byte-check manual expansion generated source freshness. Actual: "${cmd}"`,
    );
  });

  it('verify:grammar-qg-production-release references the certification manifest', () => {
    const cmd = scripts['verify:grammar-qg-production-release'] || '';
    // P20 supersedes P19: the gate now references the P20 manifest.
    assert.ok(
      cmd.includes('grammar-qg-p20-certification-manifest.json'),
      `verify:grammar-qg-production-release must reference the P20 manifest. Actual: "${cmd}"`,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Chain ordering integrity
// ---------------------------------------------------------------------------

describe('P11 U10 Verify Chain: ordering integrity', () => {
  it('p11 chains p10 which chains p9 (transitive)', () => {
    const p11Cmd = scripts['verify:grammar-qg-p11'] || '';
    const p10Cmd = scripts['verify:grammar-qg-p10'] || '';
    assert.ok(p11Cmd.includes('verify:grammar-qg-p10'), 'p11 must chain p10');
    assert.ok(p10Cmd.includes('verify:grammar-qg-p9'), 'p10 must chain p9');
  });

  it('production-release chains p14, which chains p11 and p10 (no skipping)', () => {
    const releaseCmd = scripts['verify:grammar-qg-production-release'] || '';
    const p14Cmd = scripts['verify:grammar-qg-p14'] || '';
    assert.ok(releaseCmd.includes('verify:grammar-qg-p14'), 'production-release must chain p14');
    assert.ok(p14Cmd.includes('verify:grammar-qg-p11'), 'p14 must chain p11');
    // p14 transitively chains p11 → p10 → p9 → p8 → ... → base
  });
});
