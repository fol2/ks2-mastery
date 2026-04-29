import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAttestationMetadata,
  assertAttestationRuntimeCount,
  PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS,
} from '../scripts/punctuation-production-smoke.mjs';
import { PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';
import { PUNCTUATION_RELEASE_ID } from '../shared/punctuation/content.js';

describe('Punctuation smoke attestation metadata', () => {
  it('smoke at depth 4 asserts 192 runtime items with correct release ID', () => {
    const attestation = buildAttestationMetadata({ environment: 'local' });
    assert.equal(attestation.runtimeItemCount, 192);
    assert.equal(attestation.releaseId, PUNCTUATION_RELEASE_ID);
    assert.equal(attestation.generatedDepth, PRODUCTION_DEPTH);
  });

  it('JSON output includes all attestation fields with correct types', () => {
    const attestation = buildAttestationMetadata({
      environment: 'staging',
      workerCommitSha: 'abc123def',
      authenticatedCoverage: true,
      adminHubCoverage: true,
    });

    assert.equal(typeof attestation.environment, 'string');
    assert.equal(attestation.environment, 'staging');
    assert.equal(typeof attestation.releaseId, 'string');
    assert.equal(typeof attestation.runtimeItemCount, 'number');
    assert.equal(typeof attestation.generatedDepth, 'number');
    assert.equal(typeof attestation.workerCommitSha, 'string');
    assert.equal(attestation.workerCommitSha, 'abc123def');
    assert.equal(typeof attestation.timestamp, 'string');
    assert.equal(typeof attestation.authenticatedCoverage, 'boolean');
    assert.equal(attestation.authenticatedCoverage, true);
    assert.equal(typeof attestation.adminHubCoverage, 'boolean');
    assert.equal(attestation.adminHubCoverage, true);
  });

  it('worker commit SHA null when not provided — field is null, smoke still passes', () => {
    const attestation = buildAttestationMetadata({ environment: 'local' });
    assert.equal(attestation.workerCommitSha, null);
    // Should not throw — null SHA is valid for local runs
    assertAttestationRuntimeCount(attestation);
  });

  it('runtime count mismatch triggers descriptive error', () => {
    const attestation = buildAttestationMetadata({ environment: 'local' });
    // Tamper with the count to simulate mismatch
    const tampered = { ...attestation, runtimeItemCount: 999 };
    assert.throws(
      () => assertAttestationRuntimeCount(tampered),
      (error) => {
        assert.match(error.message, /runtime count mismatch/i);
        assert.match(error.message, /expected 192/);
        assert.match(error.message, /got 999/);
        return true;
      },
    );
  });

  it('attestation timestamp is valid ISO 8601', () => {
    const attestation = buildAttestationMetadata({ environment: 'production' });
    const parsed = new Date(attestation.timestamp);
    assert.equal(Number.isNaN(parsed.getTime()), false, 'Timestamp is not a valid date');
    // ISO 8601 format check
    assert.match(attestation.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('attestation matches P2 release manifest expectations', () => {
    const attestation = buildAttestationMetadata({ environment: 'local' });
    assert.equal(
      attestation.runtimeItemCount,
      PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.runtimeItemCount,
    );
    assert.equal(
      attestation.releaseId,
      PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.releaseId,
    );
  });
});
