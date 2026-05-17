import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DECISION_IMPORT_REVIEWER_PACK_ONLY,
  DECISION_SECURE_EXTENSION_IMPORT,
  auditSecureVocabularySource,
  buildSecureVocabularyArtifacts,
} from '../scripts/spelling-secure-vocabulary-source.mjs';
import {
  SECURE_VOCABULARY_RELEASE_PROMOTION_NOT_APPROVED,
  SECURE_VOCABULARY_RELEASE_WORD_MISSING_FIELD,
  SECURE_VOCABULARY_RELEASE_WORD_NOT_ADULT_APPROVED,
  verifySecureVocabularyRelease,
  verifySecureVocabularyReleaseReadiness,
} from '../scripts/verify-spelling-secure-vocabulary-release.mjs';

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

test('secure-extension import approval is applied to every secure-extension candidate row without fabricating release fields', () => {
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
  ], {
    decision: DECISION_SECURE_EXTENSION_IMPORT,
  });

  const artifacts = buildSecureVocabularyArtifacts(fixture);
  const secureWord = artifacts.auditedSource.words.find((word) => word.word === 'ability');
  const statutoryWord = artifacts.auditedSource.words.find((word) => word.word === 'accident');
  const reviewPackSecureWord = artifacts.reviewPack.words.find((word) => word.word === 'ability');
  const importPlanSecureRecord = artifacts.importPlan.records.find((record) => record.word === 'ability');

  assert.equal(artifacts.audit.approval.securePromotionAllowed, true);
  assert.equal(artifacts.importPlan.status, 'approved_for_secure_extension_import_not_applied');
  assert.equal(secureWord.sourceReviewStatus, 'adult_approved_for_secure_extension_import');
  assert.equal(
    secureWord.sourceReviewStatusBeforeSecureImportApproval,
    'candidate_source_supplied_not_adult_approved'
  );
  assert.equal(secureWord.secureImportApprovalApplied, true);
  assert.equal(secureWord.safety.status, 'approved_for_secure_extension_import');
  assert.equal(statutoryWord.sourceReviewStatus, 'already_in_current_published_spelling_snapshot');
  assert.equal(statutoryWord.secureImportApprovalApplied, false);
  assert.equal(reviewPackSecureWord.sourceReviewStatus, 'adult_approved_for_secure_extension_import');
  assert.equal(importPlanSecureRecord.sourceReviewStatus, 'adult_approved_for_secure_extension_import');

  const readiness = verifySecureVocabularyReleaseReadiness({
    auditedSource: artifacts.auditedSource,
    reviewPack: artifacts.reviewPack,
  });

  assert.equal(readiness.ok, false);
  assert.ok(readiness.issues.some(
    (issue) => issue.code === SECURE_VOCABULARY_RELEASE_WORD_MISSING_FIELD
  ));
  assert.equal(readiness.issues.some(
    (issue) => issue.code === SECURE_VOCABULARY_RELEASE_PROMOTION_NOT_APPROVED
  ), false);
  assert.equal(readiness.issues.some(
    (issue) => issue.code === SECURE_VOCABULARY_RELEASE_WORD_NOT_ADULT_APPROVED
  ), false);
});

test('owner-approved release-quality policy populates secure-extension release fields only', () => {
  const fixture = writeFixture([
    sourceRecord({
      acceptedSpellings: ['ability'],
      explanation: 'Record supplied explanation stays in place.',
      exampleSentences: ['The pupil showed ability in spelling.'],
      ukSpellingDecision: 'Record supplied UK spelling decision.',
      familyRoot: 'able',
      morphologyTags: ['record-supplied-morphology'],
      safetyNotes: 'Record supplied safety note.',
      audioStatus: 'recorded',
      ttsStatus: 'not_required',
    }),
    sourceRecord({
      coverageTier: 'secure_extension_candidate',
      normalisedWord: 'careful',
      patternTags: ['suffix-ful'],
      recordId: 'sv1-0002',
      word: 'careful',
    }),
    sourceRecord({
      coverageTier: 'current_statutory_core',
      normalisedWord: 'accident',
      recommendedPool: 'core',
      recordId: 'current-0001',
      reviewStatus: 'already_in_current_published_spelling_snapshot',
      word: 'accident',
      yearBand: 'Years 3-4',
    }),
  ], {
    decision: DECISION_SECURE_EXTENSION_IMPORT,
    releaseQualityFields: {
      ownerApprovedGeneratedFallback: true,
      approvalBasis: 'James approved owner-approved generated release-quality fields on 2026-05-17.',
    },
  });

  const artifacts = buildSecureVocabularyArtifacts(fixture);
  const suppliedSecureWord = artifacts.auditedSource.words.find((word) => word.word === 'ability');
  const generatedSecureWord = artifacts.auditedSource.words.find((word) => word.word === 'careful');
  const reviewPackGeneratedWord = artifacts.reviewPack.words.find((word) => word.word === 'careful');
  const statutoryWord = artifacts.auditedSource.words.find((word) => word.word === 'accident');

  assert.equal(suppliedSecureWord.releaseReadiness.explanation, 'Record supplied explanation stays in place.');
  assert.deepEqual(suppliedSecureWord.releaseReadiness.morphologyTags, ['record-supplied-morphology']);
  assert.deepEqual(generatedSecureWord.releaseReadiness.acceptedSpellings, ['careful']);
  assert.equal(
    generatedSecureWord.releaseReadiness.explanation,
    'Careful is an owner-approved generated KS2 secure-extension spelling-practice entry. Pupils should read it clearly, spell each letter in order, and keep the accepted UK form unchanged.'
  );
  assert.deepEqual(
    generatedSecureWord.releaseReadiness.exampleSentences,
    ['The teacher wrote the word careful on the board for secure vocabulary spelling practice.']
  );
  assert.equal(
    generatedSecureWord.releaseReadiness.ukSpellingDecision,
    'UK spelling approved: careful is the accepted spelling for this secure-extension entry.'
  );
  assert.deepEqual(generatedSecureWord.releaseReadiness.morphologyTags, ['suffix-ful']);
  assert.equal(generatedSecureWord.releaseReadiness.familyRoot, 'care');
  assert.match(
    generatedSecureWord.releaseReadiness.safetyNotes,
    /Owner-approved generated release-quality fields/
  );
  assert.equal(generatedSecureWord.releaseReadiness.audioStatus, 'tts_required');
  assert.equal(generatedSecureWord.releaseReadiness.ttsStatus, 'planned');
  assert.equal(
    generatedSecureWord.releaseReadiness.generationSource,
    'owner_approved_generated_release_quality_fallback'
  );
  assert.equal(generatedSecureWord.releaseReadiness.generationApprovalDate, '2026-05-17');
  assert.deepEqual(reviewPackGeneratedWord.releaseReadiness, generatedSecureWord.releaseReadiness);
  assert.deepEqual(statutoryWord.releaseReadiness.acceptedSpellings, []);
  assert.equal(statutoryWord.releaseReadiness.explanation, '');

  const readiness = verifySecureVocabularyReleaseReadiness({
    auditedSource: artifacts.auditedSource,
    reviewPack: artifacts.reviewPack,
  });

  assert.equal(readiness.ok, true);
  assert.equal(readiness.issueCount, 0);
});
