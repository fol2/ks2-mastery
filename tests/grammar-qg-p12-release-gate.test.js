/**
 * Grammar QG P12 — Release gate validation
 *
 * Ensures package.json production-release scripts reference
 * the P11 certification manifest and expected release tag.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));
const scripts = pkg.scripts;

describe('verify:grammar-qg-production-release gate', () => {
  const releaseScript = scripts['verify:grammar-qg-production-release'];

  it('references grammar-qg-p11-certification-manifest.json', () => {
    assert.ok(
      releaseScript.includes('grammar-qg-p11-certification-manifest.json'),
      `Expected production-release script to reference P11 manifest, got: ${releaseScript}`
    );
  });

  it('references --expected-release=grammar-qg-p11-2026-04-30', () => {
    assert.ok(
      releaseScript.includes('--expected-release=grammar-qg-p11-2026-04-30'),
      `Expected production-release script to target P11 release tag, got: ${releaseScript}`
    );
  });

  it('no active production-release script references P10 manifest as proof', () => {
    // The main production-release script must NOT reference the P10 manifest
    assert.ok(
      !releaseScript.includes('grammar-qg-p10-certification-manifest.json'),
      'Active production-release script must not reference P10 manifest as proof'
    );

    // Historical script is allowed to reference P10 — verify it exists
    const historicalScript = scripts['verify:grammar-qg-p10-production-release-historical'];
    assert.ok(
      historicalScript,
      'Historical P10 production-release script must exist'
    );
    assert.ok(
      historicalScript.includes('grammar-qg-p10-certification-manifest.json'),
      'Historical script should reference P10 manifest'
    );
  });
});
