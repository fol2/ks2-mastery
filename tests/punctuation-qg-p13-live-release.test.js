import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertCleanGitTree,
  assertCommitShaMatchesHead,
  predeployCommandForDeploy,
} from '../scripts/deploy-punctuation-qg-p13-live.mjs';
import {
  assertSupportedP13LiveSmokeOptions,
} from '../scripts/punctuation-qg-p13-live-smoke.mjs';
import {
  expectedPunctuationQGP13LiveManifest,
  validatePunctuationQGP13LiveEvidence,
  PUNCTUATION_QG_P13_LIVE_PHASE,
} from '../scripts/validate-punctuation-qg-p13-live-evidence.mjs';
import {
  resolvePredeployEvidenceOut,
} from '../scripts/verify-punctuation-qg-p13-predeploy.mjs';

test('P13 predeploy source exposes the P12 3000+ pool that P13 will serve live', () => {
  const expected = expectedPunctuationQGP13LiveManifest();
  assert.equal(expected.phase, PUNCTUATION_QG_P13_LIVE_PHASE);
  assert.equal(expected.contentReleaseId, 'punctuation-qg-p12-3000-2026-05-02');
  assert.equal(expected.productionDepth, 100);
  assert.equal(expected.fixedItems, 512);
  assert.equal(expected.generatedItems, 2800);
  assert.equal(expected.runtimeItems, 3312);
  assert.equal(expected.generatedFamilies, 28);
  assert.equal(expected.templatesPerFamilyMin, 100);
  assert.equal(expected.templatesPerFamilyMax, 100);
});

test('P13 live evidence validator accepts a six-question production smoke artefact with deployment identity', () => {
  const expected = expectedPunctuationQGP13LiveManifest();
  const sample = {
    ok: true,
    origin: 'https://ks2.eugnel.uk',
    accountId: 'demo-sample',
    learnerId: 'learner-demo-sample',
    attestation: {
      environment: 'production',
      releasePhase: PUNCTUATION_QG_P13_LIVE_PHASE,
      releaseId: expected.contentReleaseId,
      runtimeItemCount: expected.runtimeItems,
      generatedDepth: expected.productionDepth,
      workerCommitSha: '2f8bb7d2542e5368202e2e8705af9a32588a4ef1',
      timestamp: '2026-05-02T00:00:00.000Z',
      authenticatedCoverage: true,
      adminHubCoverage: false,
    },
    punctuation: {
      productionObserved: {
        releaseId: expected.contentReleaseId,
        runtimeItems: expected.runtimeItems,
        publishedRewardUnits: expected.publishedRewardUnits,
      },
      localReleaseManifestExpectation: {
        fixedItems: expected.fixedItems,
        generatedItems: expected.generatedItems,
        generatedPerFamily: expected.productionDepth,
        runtimeItems: expected.runtimeItems,
        publishedRewardUnits: expected.publishedRewardUnits,
      },
      smartSix: {
        summaryTotal: 6,
        uniqueItems: 6,
        immediateRepeats: 0,
        generatedSeen: 3,
        fixedSeen: 3,
        modes: ['choose', 'fix', 'insert'],
        skillIds: ['sentence_endings'],
        items: Array.from({ length: 6 }, (_, index) => ({
          itemId: `sample-${index + 1}`,
          source: index % 2 === 0 ? 'generated' : 'fixed',
          mode: index % 3 === 0 ? 'choose' : index % 3 === 1 ? 'insert' : 'fix',
          skillIds: ['sentence_endings'],
        })),
      },
      parentHubEvidence: {
        hasEvidence: true,
        attempts: 6,
        accuracyPercent: 100,
        progressSnapshotsHasPunctuation: true,
        redactionChecks: {
          punctuationEvidence: true,
          progressSnapshots: true,
          misconceptionPatterns: true,
        },
        sessionModes: ['smart'],
      },
    },
    spelling: {
      progressTotal: 1,
      hasPromptToken: true,
      redactionChecks: {
        rawWordHidden: true,
        rawSentenceHidden: true,
        promptTokenReturned: true,
      },
    },
  };
  const result = validatePunctuationQGP13LiveEvidence(sample);
  assert.equal(result.ok, true, result.errors.join('; '));
});

test('P13 live evidence validator rejects missing deployed identity and missing Spelling regression evidence', () => {
  const expected = expectedPunctuationQGP13LiveManifest();
  const result = validatePunctuationQGP13LiveEvidence({
    ok: true,
    origin: 'https://ks2.eugnel.uk',
    attestation: {
      environment: 'production',
      releasePhase: PUNCTUATION_QG_P13_LIVE_PHASE,
      releaseId: expected.contentReleaseId,
      runtimeItemCount: expected.runtimeItems,
      generatedDepth: expected.productionDepth,
      timestamp: '2026-05-02T00:00:00.000Z',
      authenticatedCoverage: true,
      adminHubCoverage: false,
    },
    punctuation: {
      productionObserved: {
        releaseId: expected.contentReleaseId,
        runtimeItems: expected.runtimeItems,
        publishedRewardUnits: expected.publishedRewardUnits,
      },
      localReleaseManifestExpectation: {
        fixedItems: expected.fixedItems,
        generatedItems: expected.generatedItems,
        generatedPerFamily: expected.productionDepth,
        runtimeItems: expected.runtimeItems,
        publishedRewardUnits: expected.publishedRewardUnits,
      },
      smartSix: {
        summaryTotal: 6,
        uniqueItems: 6,
        immediateRepeats: 0,
        generatedSeen: 1,
        items: Array.from({ length: 6 }, (_, index) => ({
          itemId: `sample-${index + 1}`,
          source: 'generated',
          mode: 'insert',
          skillIds: ['speech'],
        })),
      },
      parentHubEvidence: {
        hasEvidence: true,
        attempts: 6,
        progressSnapshotsHasPunctuation: true,
        redactionChecks: {
          punctuationEvidence: true,
          progressSnapshots: true,
          misconceptionPatterns: true,
        },
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /workerCommitSha|spelling\.progressTotal|spelling\.hasPromptToken/);
});

test('P13 deploy identity guard refuses dirty trees and mismatched commit SHAs', () => {
  assert.doesNotThrow(() => assertCleanGitTree(''));
  assert.throws(
    () => assertCleanGitTree(' M scripts/deploy-punctuation-qg-p13-live.mjs\n'),
    /clean committed tree/,
  );
  assert.doesNotThrow(() => assertCommitShaMatchesHead('abc123', 'abc123'));
  assert.throws(
    () => assertCommitShaMatchesHead('abc123', 'def456'),
    /does not match the current clean checkout HEAD/,
  );
  assert.match(predeployCommandForDeploy(), /--out \/tmp\/ks2-punctuation-qg-p13-predeploy-evidence\.json/);
  assert.doesNotMatch(predeployCommandForDeploy(), /reports\/punctuation\/punctuation-qg-p13-predeploy-evidence\.json/);
});

test('P13 predeploy verifier can write deploy-wrapper evidence outside the worktree', () => {
  assert.match(
    resolvePredeployEvidenceOut(['node', 'script', '--out', '/tmp/ks2-p13-predeploy.json']),
    /\/tmp\/ks2-p13-predeploy\.json$/,
  );
  assert.match(
    resolvePredeployEvidenceOut(['node', 'script']),
    /reports\/punctuation\/punctuation-qg-p13-predeploy-evidence\.json$/,
  );
});

test('P13 live smoke cannot claim Admin Hub coverage without fetching Admin Hub evidence', () => {
  assert.doesNotThrow(() => assertSupportedP13LiveSmokeOptions({ adminHubCoverage: false }));
  assert.throws(
    () => assertSupportedP13LiveSmokeOptions({ adminHubCoverage: true }),
    /cannot claim Admin Hub coverage/,
  );

  const expected = expectedPunctuationQGP13LiveManifest();
  const result = validatePunctuationQGP13LiveEvidence({
    ok: true,
    origin: 'https://ks2.eugnel.uk',
    attestation: {
      environment: 'production',
      releasePhase: PUNCTUATION_QG_P13_LIVE_PHASE,
      releaseId: expected.contentReleaseId,
      runtimeItemCount: expected.runtimeItems,
      generatedDepth: expected.productionDepth,
      workerCommitSha: '2f8bb7d2542e5368202e2e8705af9a32588a4ef1',
      timestamp: '2026-05-02T00:00:00.000Z',
      authenticatedCoverage: true,
      adminHubCoverage: true,
    },
    punctuation: {
      productionObserved: {
        releaseId: expected.contentReleaseId,
        runtimeItems: expected.runtimeItems,
        publishedRewardUnits: expected.publishedRewardUnits,
      },
      localReleaseManifestExpectation: {
        fixedItems: expected.fixedItems,
        generatedItems: expected.generatedItems,
        generatedPerFamily: expected.productionDepth,
        runtimeItems: expected.runtimeItems,
        publishedRewardUnits: expected.publishedRewardUnits,
      },
      smartSix: {
        summaryTotal: 6,
        uniqueItems: 6,
        immediateRepeats: 0,
        generatedSeen: 1,
        items: Array.from({ length: 6 }, (_, index) => ({
          itemId: `sample-${index + 1}`,
          source: 'generated',
          mode: 'insert',
          skillIds: ['speech'],
        })),
      },
      parentHubEvidence: {
        hasEvidence: true,
        attempts: 6,
        progressSnapshotsHasPunctuation: true,
        redactionChecks: {
          punctuationEvidence: true,
          progressSnapshots: true,
          misconceptionPatterns: true,
        },
      },
    },
    spelling: {
      progressTotal: 1,
      hasPromptToken: true,
      redactionChecks: {
        rawWordHidden: true,
        rawSentenceHidden: true,
        promptTokenReturned: true,
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /adminHubEvidence/);
});

test('P13 package scripts write and validate the same live smoke artefact', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(
    packageJson.scripts['smoke:production:punctuation:p13'],
    /--out reports\/punctuation\/punctuation-qg-p13-production-smoke\.json/,
  );
  assert.match(
    packageJson.scripts['verify:punctuation-qg:p13-live'],
    /reports\/punctuation\/punctuation-qg-p13-production-smoke\.json/,
  );
});

test('P13 live evidence validator CLI has no null-worker-identity bypass', () => {
  const source = readFileSync(new URL('../scripts/validate-punctuation-qg-p13-live-evidence.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('--allow-null-worker-identity'), false);
});

test('P13 live evidence validator rejects P11 one-item / 1268-item artefacts', () => {
  const result = validatePunctuationQGP13LiveEvidence({
    ok: true,
    origin: 'https://ks2.eugnel.uk',
    attestation: {
      environment: 'production',
      releasePhase: PUNCTUATION_QG_P13_LIVE_PHASE,
      releaseId: 'punctuation-qg-p11-2026-05-01',
      runtimeItemCount: 1268,
      generatedDepth: 40,
      workerCommitSha: '2f8bb7d2542e5368202e2e8705af9a32588a4ef1',
      timestamp: '2026-05-01T22:20:29.625Z',
      authenticatedCoverage: true,
      adminHubCoverage: false,
    },
    punctuation: {
      productionObserved: {
        releaseId: 'punctuation-qg-p11-2026-05-01',
        runtimeItems: 1268,
        publishedRewardUnits: 14,
      },
      localReleaseManifestExpectation: {
        fixedItems: 148,
        generatedItems: 1120,
        generatedPerFamily: 40,
        runtimeItems: 1268,
        publishedRewardUnits: 14,
      },
      smartSix: {
        summaryTotal: 1,
        uniqueItems: 1,
        immediateRepeats: 0,
        generatedSeen: 1,
        items: [{ itemId: 'old', source: 'generated', mode: 'insert', skillIds: ['speech'] }],
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /1268|summaryTotal=1|punctuation-qg-p11/);
});
