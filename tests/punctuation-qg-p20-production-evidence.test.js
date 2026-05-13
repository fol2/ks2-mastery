import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePunctuationQGP20LiveEvidence } from '../scripts/validate-punctuation-qg-p20-live-evidence.mjs';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LIVE_VALIDATOR = 'scripts/validate-punctuation-qg-p20-live-evidence.mjs';

function writeEvidenceFixture({
  releaseId = PUNCTUATION_CURRENT_RELEASE_ID,
  dashAcceptance = [
    { variant: 'spaced-hyphen', feedbackKind: 'success', acceptedAnswer: 'A - B' },
    { variant: 'en-dash', feedbackKind: 'success', acceptedAnswer: 'A – B' },
    { variant: 'em-dash', feedbackKind: 'success', acceptedAnswer: 'A — B' },
  ],
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'punctuation-p20-live-'));
  const smokePath = join(dir, 'smoke.json');
  const auditPath = join(dir, 'audit.json');
  writeFileSync(auditPath, JSON.stringify({
    status: 'PASS',
    releaseId: PUNCTUATION_CURRENT_RELEASE_ID,
  }), 'utf8');
  writeFileSync(smokePath, JSON.stringify({
    ok: true,
    origin: 'https://ks2.eugnel.uk',
    attestation: {
      environment: 'production',
      releaseId,
      runtimeItemCount: 15072,
      workerCommitSha: 'abc123',
      authenticatedCoverage: true,
      adminHubCoverage: true,
    },
    punctuation: {
      smartSix: { summaryTotal: 6, uniqueItems: 6, immediateRepeats: 0 },
      dashAcceptance,
    },
  }), 'utf8');
  return { smokePath, auditPath };
}

test('P20 live evidence validator accepts current-release production evidence shape', () => {
  const { smokePath, auditPath } = writeEvidenceFixture();

  const result = validatePunctuationQGP20LiveEvidence({ smokePath, auditPath });

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
});

test('P20 live evidence validator CLI keeps flag values out of the smoke path', () => {
  const impossibleReleaseId = 'punctuation-qg-p99-99999-2099-01-01';
  const result = spawnSync(process.execPath, [
    LIVE_VALIDATOR,
    '--expected-release-id',
    impossibleReleaseId,
    '--json',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(result.stdout);

  assert.notEqual(result.status, 0, 'release mismatch should fail while preserving the default smoke path');
  assert.equal(parsed.smokePath, 'reports/punctuation/punctuation-qg-p20-production-smoke.json');
  assert.equal(parsed.expectedReleaseId, impossibleReleaseId);
});

test('P20 live evidence validator rejects stale P20 smoke for the current release', () => {
  const { smokePath, auditPath } = writeEvidenceFixture({
    releaseId: 'punctuation-qg-p20-15072-2026-05-04',
  });

  const result = validatePunctuationQGP20LiveEvidence({ smokePath, auditPath });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), new RegExp(`production smoke releaseId=punctuation-qg-p20-15072-2026-05-04, expected ${PUNCTUATION_CURRENT_RELEASE_ID}`));
});

test('P20 live evidence validator requires persisted dash acceptance outcomes', () => {
  const { smokePath, auditPath } = writeEvidenceFixture({
    dashAcceptance: [
      { variant: 'spaced-hyphen', feedbackKind: 'success', acceptedAnswer: 'A - B' },
      { variant: 'en-dash', feedbackKind: 'error', acceptedAnswer: 'A - B' },
      { variant: 'em-dash', feedbackKind: 'success' },
    ],
  });

  const result = validatePunctuationQGP20LiveEvidence({ smokePath, auditPath });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /dashAcceptance\.en-dash\.feedbackKind=error, expected success/);
  assert.match(result.failures.join('\n'), /dashAcceptance\.em-dash\.acceptedAnswer missing/);
});
