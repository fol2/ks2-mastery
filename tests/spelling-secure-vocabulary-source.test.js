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
  buildSecureVocabularyRuntimeImport,
} from '../scripts/import-spelling-secure-vocabulary.mjs';
import {
  secureVocabularySemanticMeaningOverrideFor,
} from '../scripts/spelling-secure-vocabulary-sentence-generator.mjs';
import {
  verifySecureVocabularyRuntime,
} from '../scripts/verify-spelling-secure-vocabulary-runtime.mjs';
import {
  SECURE_VOCABULARY_RELEASE_PROMOTION_NOT_APPROVED,
  SECURE_VOCABULARY_RELEASE_WORD_MISSING_FIELD,
  SECURE_VOCABULARY_RELEASE_WORD_NOT_ADULT_APPROVED,
  verifySecureVocabularyRelease,
  verifySecureVocabularyReleaseReadiness,
} from '../scripts/verify-spelling-secure-vocabulary-release.mjs';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';

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

function auditedSourceFixture() {
  return {
    kind: 'ks2-spelling-secure-vocabulary-audited-source',
    version: 1,
    source: {
      artifactId: 'ks2-spelling-secure-vocabulary-source-v1',
      sourceJsonlSha256: 'fixture-hash',
      recordCount: 247,
      uniqueWordCount: 247,
      approvalDecision: DECISION_SECURE_EXTENSION_IMPORT,
      reviewerName: 'James',
      reviewerRole: 'Owner/adult reviewer',
      reviewTimestamp: '2026-05-17T16:01:23+01:00',
      importReviewerPackAllowed: true,
      securePromotionAllowed: true,
      counts: {
        taxonomyTier: {
          'statutory-core': 213,
          'enrichment-extra': 52,
          'secure-extension': 2,
        },
      },
    },
    words: [
      {
        id: 'sv1-test-0001',
        slug: 'cartographytest',
        word: 'cartographytest',
        sourceRecordId: 'sv1-test-0001',
        taxonomyTier: 'secure-extension',
        sourceBucket: 'geography_history_secure',
        yearBand: 'Y5-Y6 or extension after adult review',
        patternTags: ['base-word'],
        advisories: [],
        sourceReviewStatus: 'adult_approved_for_secure_extension_import',
        sourceReviewStatusBeforeSecureImportApproval: 'candidate_source_supplied_not_adult_approved',
        secureImportApprovalApplied: true,
        review: {
          status: 'approved',
          decision: DECISION_SECURE_EXTENSION_IMPORT,
          reviewer: 'James',
          reviewedAt: '2026-05-17T16:01:23+01:00',
          sourceJsonlSha256: 'fixture-hash',
        },
        safety: {
          status: 'approved_for_secure_extension_import',
          advisories: [],
          securePromotionAllowed: true,
        },
        releaseReadiness: {
          acceptedSpellings: ['cartographytest'],
          rejectedVariants: [],
          explanation: 'Cartographytest is an owner-approved secure-extension fixture for runtime import tests.',
          exampleSentences: ['The teacher wrote the word cartographytest for secure vocabulary spelling practice.'],
          ukSpellingDecision: 'UK spelling approved: cartographytest is the accepted fixture spelling.',
          familyRoot: 'cartographytest',
          morphologyTags: ['base-word'],
          safetyNotes: 'Owner-approved fixture suitable for runtime import tests.',
          audioStatus: 'tts_required',
          ttsStatus: 'planned',
        },
      },
      {
        id: 'sv1-0036',
        slug: 'admission',
        word: 'admission',
        sourceRecordId: 'sv1-0036',
        taxonomyTier: 'secure-extension',
        sourceBucket: 'school_academic_secure',
        yearBand: 'Y5-Y6 or extension after adult review',
        patternTags: ['suffix-sion'],
        advisories: [],
        sourceReviewStatus: 'adult_approved_for_secure_extension_import',
        sourceReviewStatusBeforeSecureImportApproval: 'candidate_source_supplied_not_adult_approved',
        secureImportApprovalApplied: true,
        review: {
          status: 'approved',
          decision: DECISION_SECURE_EXTENSION_IMPORT,
          reviewer: 'James',
          reviewedAt: '2026-05-17T16:01:23+01:00',
          sourceJsonlSha256: 'fixture-hash',
        },
        safety: {
          status: 'approved_for_secure_extension_import',
          advisories: [],
          securePromotionAllowed: true,
        },
        releaseReadiness: {
          acceptedSpellings: ['admission'],
          rejectedVariants: [],
          explanation: 'Admission is an owner-approved secure-extension fixture that is now deliberately represented as Extra.',
          exampleSentences: ['The ticket allowed admission to the museum.'],
          ukSpellingDecision: 'UK spelling approved: admission is the accepted spelling.',
          familyRoot: 'admission',
          morphologyTags: ['suffix-sion'],
          safetyNotes: 'Owner-approved fixture suitable for runtime import tests.',
          audioStatus: 'tts_required',
          ttsStatus: 'planned',
        },
      },
    ],
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
  const semanticMeaning = secureVocabularySemanticMeaningOverrideFor({ slug: 'careful', word: 'careful' });

  assert.equal(suppliedSecureWord.releaseReadiness.explanation, 'Record supplied explanation stays in place.');
  assert.deepEqual(suppliedSecureWord.releaseReadiness.morphologyTags, ['record-supplied-morphology']);
  assert.deepEqual(generatedSecureWord.releaseReadiness.acceptedSpellings, ['careful']);
  assert.equal(generatedSecureWord.releaseReadiness.explanation, semanticMeaning);
  assert.doesNotMatch(generatedSecureWord.releaseReadiness.explanation, /owner-approved generated|spelling-practice entry|spell each letter|accepted UK form/i);
  assert.deepEqual(
    generatedSecureWord.releaseReadiness.exampleSentences,
    ['Cara made a careful choice before cutting the card.']
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

test('secure vocabulary runtime import publishes approved secure-extension words without changing statutory semantics', () => {
  const auditedSource = auditedSourceFixture();
  const imported = buildSecureVocabularyRuntimeImport({
    auditedSource,
    contentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    publishedAt: 1779035400000,
  });

  const report = verifySecureVocabularyRuntime({
    auditedSource,
    contentBundle: imported.bundle,
  });
  const runtimeWord = imported.bundle.releases.at(-1).snapshot.wordBySlug.cartographytest;

  assert.equal(imported.manifest.imported.secureExtensionWordCount, 1);
  assert.equal(imported.manifest.imported.skippedExistingExtraWordCount, 1);
  assert.deepEqual(imported.manifest.imported.skippedExistingExtraWordSlugs, ['admission']);
  assert.equal(imported.manifest.release.id, 'spelling-r12');
  assert.equal(report.ok, true);
  assert.equal(report.issueCount, 0);
  assert.equal(report.summary.statutoryCoreCount, 213);
  assert.equal(report.summary.enrichmentExtraCount, 52);
  assert.equal(report.summary.secureExtensionCount, 1);
  assert.deepEqual(report.reclassifiedExistingExtraWords, ['admission']);
  assert.equal(runtimeWord.coverageTier, 'secure-extension');
  assert.equal(runtimeWord.spellingPool, 'core');
  assert.equal(runtimeWord.accepted.includes('cartographytest'), true);
});

test('secure vocabulary runtime import still blocks non-reclassified slug collisions', () => {
  const fixture = auditedSourceFixture();
  const collisionWord = {
    ...fixture.words[0],
    id: 'sv1-collision-0001',
    slug: 'mollusc',
    word: 'mollusc',
    sourceRecordId: 'sv1-collision-0001',
    sourceBucket: 'school_academic_secure',
    releaseReadiness: {
      ...fixture.words[0].releaseReadiness,
      acceptedSpellings: ['mollusc'],
      explanation: 'Mollusc is an owner-approved secure-extension fixture used to lock collision handling.',
      exampleSentences: ['The class studied a mollusc in the science lesson.'],
      ukSpellingDecision: 'UK spelling approved: mollusc is the accepted spelling.',
      familyRoot: 'mollusc',
      morphologyTags: ['base-word'],
    },
  };
  const collisionSource = {
    ...fixture,
    source: {
      ...fixture.source,
      counts: {
        taxonomyTier: {
          'statutory-core': 213,
          'enrichment-extra': 52,
          'secure-extension': 1,
        },
      },
    },
    words: [collisionWord],
  };

  assert.throws(
    () => buildSecureVocabularyRuntimeImport({
      auditedSource: collisionSource,
      contentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
      publishedAt: 1779035400000,
    }),
    (error) => {
      assert.match(error.message, /Secure vocabulary import collides with existing runtime word\(s\): mollusc/);
      assert.deepEqual(error.issues, [{
        code: 'secure_vocabulary_runtime_slug_collision',
        path: 'content.draft.words',
        word: 'mollusc',
      }]);
      return true;
    }
  );
});
