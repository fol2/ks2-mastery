import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SECURE_VOCABULARY_REVIEW_PACK_WORD_METADATA_MISMATCH,
  verifySecureVocabularyRelease,
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
