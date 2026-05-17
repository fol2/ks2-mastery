import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DECISION_IMPORT_REVIEWER_PACK_ONLY,
  auditSecureVocabularySource,
  buildSecureVocabularyArtifacts,
} from '../scripts/spelling-secure-vocabulary-source.mjs';
import { verifySecureVocabularyRelease } from '../scripts/verify-spelling-secure-vocabulary-release.mjs';

function writeFixture(records, approvalOverrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ks2-secure-vocabulary-'));
  const sourceJsonlPath = join(dir, 'source.jsonl');
  const sourceJsonl = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
  const sourceJsonlSha256 = createHash('sha256').update(sourceJsonl).digest('hex');
  writeFileSync(sourceJsonlPath, sourceJsonl, 'utf8');

  const approvalPath = join(dir, 'approval.json');
  const approval = {
    artifactId: 'ks2-spelling-secure-vocabulary-source-v1',
    decision: DECISION_IMPORT_REVIEWER_PACK_ONLY,
    reviewerName: 'James',
    reviewerRole: 'Owner/adult reviewer',
    reviewTimestamp: '2026-05-17T12:15:41+01:00',
    sourceJsonlSha256,
    ...approvalOverrides,
  };
  writeFileSync(approvalPath, JSON.stringify(approval, null, 2), 'utf8');

  return { sourceJsonlPath, approvalPath, sourceJsonlSha256 };
}

function sourceRecord(overrides = {}) {
  return {
    adultReviewRequiredBeforeNewSecurePromotion: true,
    advisories: [],
    coverageTier: 'secure_extension_candidate',
    normalisedWord: 'ability',
    patternTags: ['suffix-ity'],
    recommendedPool: 'secure_extension_candidate',
    recordId: 'sv1-0001',
    reviewStatus: 'candidate_source_supplied_not_adult_approved',
    sourceBucket: 'school_academic_secure',
    sourceNote: 'Approved source fixture.',
    word: 'ability',
    yearBand: 'Y3-Y6',
    ...overrides,
  };
}

test('secure vocabulary source audit passes for an approved exact source hash', () => {
  const fixture = writeFixture([
    sourceRecord(),
    sourceRecord({
      coverageTier: 'current_statutory_core',
      normalisedWord: 'accident',
      recommendedPool: 'core',
      recordId: 'current-0001',
      reviewStatus: 'already_in_current_published_spelling_snapshot',
      word: 'accident',
      yearBand: 'Years 3-4',
    }),
  ]);

  const report = auditSecureVocabularySource(fixture);

  assert.equal(report.ok, true);
  assert.equal(report.source.sourceJsonlSha256, fixture.sourceJsonlSha256);
  assert.equal(report.approval.importReviewerPackAllowed, true);
  assert.equal(report.approval.securePromotionAllowed, false);
  assert.equal(report.counts.taxonomyTier['secure-extension'], 1);
  assert.equal(report.counts.taxonomyTier['statutory-core'], 1);
});

test('secure vocabulary source audit blocks pending approval and hash mismatch', () => {
  const fixture = writeFixture([sourceRecord()], {
    decision: 'PENDING',
    sourceJsonlSha256: '0000',
  });

  const report = auditSecureVocabularySource(fixture);

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.issues.map((entry) => entry.code).sort(),
    ['source_approval_pending', 'source_hash_mismatch'].sort()
  );
});

test('review-pack build emits metadata that passes the B3w release gate', () => {
  const fixture = writeFixture([
    sourceRecord(),
    sourceRecord({
      advisories: ['adult_review_context_sensitivity'],
      normalisedWord: 'monarchy',
      recordId: 'sv1-0002',
      sourceBucket: 'geography_history_secure',
      word: 'monarchy',
      yearBand: 'Y5-Y6 or extension after adult review',
    }),
  ]);

  const artifacts = buildSecureVocabularyArtifacts(fixture);
  const report = verifySecureVocabularyRelease({
    auditedSource: artifacts.auditedSource,
    reviewPack: artifacts.reviewPack,
  });

  assert.equal(artifacts.importPlan.writes, false);
  assert.equal(artifacts.reviewPack.words.length, 2);
  assert.equal(report.ok, true);
  assert.equal(report.checkedReviewPackWords, 2);
  assert.equal(artifacts.reviewPack.words[0].reviewStatus, 'approved');
  assert.equal(artifacts.reviewPack.words[0].reviewer, 'James');
  assert.equal(artifacts.reviewPack.words[0].provenanceSource, 'ks2-spelling-secure-vocabulary-source-v1');
  assert.equal(artifacts.reviewPack.words[0].safetyStatus, 'approved_for_import_reviewer_pack_only');
});
