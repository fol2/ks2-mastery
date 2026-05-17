import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SECURE_VOCABULARY_RELEASE_PROMOTION_NOT_APPROVED,
  SECURE_VOCABULARY_RELEASE_WORD_MISSING_FIELD,
  SECURE_VOCABULARY_RELEASE_WORD_MISSING_REVIEW_PACK_ENTRY,
  SECURE_VOCABULARY_RELEASE_WORD_NOT_ADULT_APPROVED,
  SECURE_VOCABULARY_REVIEW_PACK_WORD_METADATA_MISMATCH,
  verifySecureVocabularyRelease,
  verifySecureVocabularyReleaseReadiness,
} from '../scripts/verify-spelling-secure-vocabulary-release.mjs';

function sourceWord(overrides = {}) {
  return {
    slug: 'accommodate',
    word: 'accommodate',
    review: {
      status: 'approved',
      reviewer: 'Adult Reviewer',
      reviewedAt: '2026-05-17T10:00:00.000Z',
    },
    provenance: {
      source: 'audited-ks2-secure-vocabulary',
    },
    safety: {
      status: 'approved',
    },
    ...overrides,
  };
}

function reviewPackWord(overrides = {}) {
  return {
    slug: 'accommodate',
    word: 'accommodate',
    reviewStatus: 'approved',
    reviewer: 'Adult Reviewer',
    reviewedAt: '2026-05-17T10:00:00.000Z',
    provenanceSource: 'audited-ks2-secure-vocabulary',
    safetyStatus: 'approved',
    ...overrides,
  };
}

function releaseReadyFields() {
  return {
    acceptedSpellings: ['accommodate'],
    rejectedVariants: ['acommodate'],
    explanation: 'Accommodate means to make room for someone or something.',
    exampleSentences: ['The teacher will accommodate the group in the library.'],
    ukSpellingDecision: 'UK canonical spelling approved.',
    familyRoot: 'accommodate',
    morphologyTags: ['root-accommodate'],
    safetyNotes: 'Suitable for KS2 classroom use.',
    audioStatus: 'tts_required',
    ttsStatus: 'planned',
  };
}

function releaseReadySourceWord(overrides = {}) {
  return sourceWord({
    coverageTier: 'secure_extension_candidate',
    taxonomyTier: 'secure-extension',
    sourceReviewStatus: 'adult_approved_for_secure_extension_import',
    patternTags: ['suffix-ate'],
    safety: { status: 'approved_for_secure_extension_import' },
    releaseReadiness: releaseReadyFields(),
    ...overrides,
  });
}

function releaseReadyReviewPackWord(overrides = {}) {
  return reviewPackWord({
    coverageTier: 'secure_extension_candidate',
    taxonomyTier: 'secure-extension',
    safetyStatus: 'approved_for_secure_extension_import',
    releaseReadiness: releaseReadyFields(),
    ...overrides,
  });
}

test('secure vocabulary release gate passes when review-pack word metadata matches the audited source', () => {
  const report = verifySecureVocabularyRelease({
    auditedSource: { words: [sourceWord()] },
    reviewPack: { words: [reviewPackWord()] },
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
});

test('secure vocabulary release gate blocks review-pack word metadata mismatches', () => {
  const report = verifySecureVocabularyRelease({
    auditedSource: { words: [sourceWord()] },
    reviewPack: {
      words: [
        reviewPackWord({
          reviewStatus: 'pending',
          reviewer: 'Different Reviewer',
          reviewedAt: '2026-05-17T11:00:00.000Z',
          provenanceSource: 'unverified-import',
          safetyStatus: 'needs_review',
        }),
      ],
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.issues.length, 1);
  assert.equal(
    report.issues[0].code,
    SECURE_VOCABULARY_REVIEW_PACK_WORD_METADATA_MISMATCH
  );
  assert.match(report.issues[0].path, /^reviewPack\.words\[0\]/);
  assert.equal(report.issues[0].wordIdentity, 'accommodate');
  assert.deepEqual(
    report.issues[0].fields.sort(),
    ['provenanceSource', 'reviewStatus', 'reviewedAt', 'reviewer', 'safetyStatus'].sort()
  );
});

test('secure vocabulary release-readiness gate blocks import-reviewer-only sources', () => {
  const report = verifySecureVocabularyReleaseReadiness({
    auditedSource: {
      source: {
        approvalDecision: 'APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY',
        securePromotionAllowed: false,
      },
      words: [sourceWord({
        coverageTier: 'secure_extension_candidate',
        taxonomyTier: 'secure-extension',
        sourceReviewStatus: 'candidate_source_supplied_not_adult_approved',
        safety: { status: 'approved_for_import_reviewer_pack_only' },
      })],
    },
    reviewPack: {
      source: {
        approvalDecision: 'APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY',
        securePromotionAllowed: false,
      },
      words: [reviewPackWord({
        coverageTier: 'secure_extension_candidate',
        taxonomyTier: 'secure-extension',
        safetyStatus: 'approved_for_import_reviewer_pack_only',
      })],
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.checkedSecureExtensionWords, 1);
  assert.ok(report.issues.some((issue) => issue.code === SECURE_VOCABULARY_RELEASE_PROMOTION_NOT_APPROVED));
  assert.ok(report.issues.some((issue) => issue.code === SECURE_VOCABULARY_RELEASE_WORD_NOT_ADULT_APPROVED));
  assert.ok(report.issues.some((issue) => issue.code === SECURE_VOCABULARY_RELEASE_WORD_MISSING_FIELD));
});

test('secure vocabulary release-readiness gate passes approved source with release-quality fields', () => {
  const report = verifySecureVocabularyReleaseReadiness({
    auditedSource: {
      source: {
        approvalDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
        securePromotionAllowed: true,
      },
      words: [releaseReadySourceWord()],
    },
    reviewPack: {
      source: {
        approvalDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
        securePromotionAllowed: true,
      },
      words: [releaseReadyReviewPackWord()],
    },
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
});

test('secure vocabulary release-readiness gate blocks an empty review pack', () => {
  const report = verifySecureVocabularyReleaseReadiness({
    auditedSource: {
      source: {
        approvalDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
        securePromotionAllowed: true,
      },
      words: [releaseReadySourceWord()],
    },
    reviewPack: {
      source: {
        approvalDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
        securePromotionAllowed: true,
      },
      words: [],
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.checkedReviewPackWords, 0);
  assert.ok(report.issues.some(
    (issue) => issue.code === SECURE_VOCABULARY_RELEASE_WORD_MISSING_REVIEW_PACK_ENTRY
      && issue.wordIdentity === 'accommodate'
  ));
});

test('secure vocabulary release-readiness gate requires release fields on the review pack word', () => {
  const report = verifySecureVocabularyReleaseReadiness({
    auditedSource: {
      source: {
        approvalDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
        securePromotionAllowed: true,
      },
      words: [releaseReadySourceWord()],
    },
    reviewPack: {
      source: {
        approvalDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
        securePromotionAllowed: true,
      },
      words: [reviewPackWord({
        coverageTier: 'secure_extension_candidate',
        taxonomyTier: 'secure-extension',
        safetyStatus: 'approved_for_secure_extension_import',
      })],
    },
  });

  assert.equal(report.ok, false);
  assert.ok(report.issues.some(
    (issue) => issue.code === SECURE_VOCABULARY_RELEASE_WORD_MISSING_FIELD
      && issue.path === 'reviewPack.words[0]'
      && issue.field === 'explanation'
  ));
});

test('secure vocabulary release-readiness gate does not accept family root as morphology evidence', () => {
  const familyOnlyFields = {
    ...releaseReadyFields(),
    morphologyTags: [],
  };
  const report = verifySecureVocabularyReleaseReadiness({
    auditedSource: {
      source: {
        approvalDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
        securePromotionAllowed: true,
      },
      words: [releaseReadySourceWord({
        patternTags: [],
        releaseReadiness: familyOnlyFields,
      })],
    },
    reviewPack: {
      source: {
        approvalDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
        securePromotionAllowed: true,
      },
      words: [releaseReadyReviewPackWord({
        patternTags: [],
        releaseReadiness: familyOnlyFields,
      })],
    },
  });

  assert.equal(report.ok, false);
  assert.ok(report.issues.some(
    (issue) => issue.code === SECURE_VOCABULARY_RELEASE_WORD_MISSING_FIELD
      && issue.path === 'auditedSource.words[0]'
      && issue.field === 'patternOrMorphologyTags'
  ));
});
