import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validatePunctuationQGP20LiveEvidence } from '../scripts/validate-punctuation-qg-p20-live-evidence.mjs';

test('P20 production smoke certifies deployed punctuation heavy-play release', () => {
  const result = validatePunctuationQGP20LiveEvidence();
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
});

test('P20 live evidence validator requires persisted dash acceptance outcomes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'punctuation-p20-live-'));
  const smokePath = join(dir, 'smoke.json');
  const auditPath = join(dir, 'audit.json');
  writeFileSync(auditPath, JSON.stringify({ status: 'PASS' }), 'utf8');
  writeFileSync(smokePath, JSON.stringify({
    ok: true,
    origin: 'https://ks2.eugnel.uk',
    attestation: {
      environment: 'production',
      releaseId: 'punctuation-qg-p20-15072-2026-05-04',
      runtimeItemCount: 15072,
      workerCommitSha: 'abc123',
      authenticatedCoverage: true,
      adminHubCoverage: true,
    },
    punctuation: {
      smartSix: { summaryTotal: 6, uniqueItems: 6, immediateRepeats: 0 },
      dashAcceptance: [
        { variant: 'spaced-hyphen', feedbackKind: 'success', acceptedAnswer: 'A - B' },
        { variant: 'en-dash', feedbackKind: 'error', acceptedAnswer: 'A - B' },
        { variant: 'em-dash', feedbackKind: 'success' },
      ],
    },
  }), 'utf8');

  const result = validatePunctuationQGP20LiveEvidence({ smokePath, auditPath });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /dashAcceptance\.en-dash\.feedbackKind=error, expected success/);
  assert.match(result.failures.join('\n'), /dashAcceptance\.em-dash\.acceptedAnswer missing/);
});
