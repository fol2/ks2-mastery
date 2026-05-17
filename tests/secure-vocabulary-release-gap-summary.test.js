import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderSecureVocabularyReleaseGapMarkdown,
  summariseSecureVocabularyReleaseGaps,
} from '../scripts/summarise-spelling-secure-vocabulary-release-gaps.mjs';

function readyFields(word) {
  return {
    acceptedSpellings: [word],
    explanation: `${word} is a KS2 classroom word.`,
    exampleSentences: [`We used ${word} in our lesson.`],
    ukSpellingDecision: 'UK canonical spelling approved.',
    familyRoot: word,
    morphologyTags: [`root-${word}`],
    audioStatus: 'tts_required',
  };
}

test('secure vocabulary release gap summary counts approval and field blockers', () => {
  const summary = summariseSecureVocabularyReleaseGaps({
    auditedSource: {
      source: {
        approvalDecision: 'APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY',
        securePromotionAllowed: false,
      },
      words: [
        {
          slug: 'ability',
          word: 'ability',
          sourceRecordId: 'sv1-0001',
          taxonomyTier: 'secure-extension',
          sourceReviewStatus: 'candidate_source_supplied_not_adult_approved',
          yearBand: 'Y3-Y6',
          sourceBucket: 'school_academic_secure',
          patternTags: [],
          advisories: ['adult_review_context_sensitivity'],
        },
        {
          slug: 'accurate',
          word: 'accurate',
          sourceRecordId: 'sv1-0002',
          taxonomyTier: 'secure-extension',
          sourceReviewStatus: 'adult_approved_for_secure_extension_import',
          yearBand: 'Y3-Y6',
          sourceBucket: 'school_academic_secure',
          patternTags: ['suffix-ate'],
          advisories: [],
          releaseReadiness: readyFields('accurate'),
        },
        {
          slug: 'statutory',
          word: 'statutory',
          sourceRecordId: 'cur-0001',
          taxonomyTier: 'statutory-core',
          sourceReviewStatus: 'adult_approved_for_secure_extension_import',
        },
      ],
    },
    reviewPack: {
      source: {
        approvalDecision: 'APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY',
        securePromotionAllowed: false,
      },
      words: [
        {
          slug: 'ability',
          word: 'ability',
          sourceRecordId: 'sv1-0001',
          taxonomyTier: 'secure-extension',
          reviewStatus: 'approved',
          safetyStatus: 'approved_for_import_reviewer_pack_only',
        },
      ],
    },
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.status, 'RELEASE BLOCKED');
  assert.equal(summary.counts.secureExtensionWords, 2);
  assert.equal(summary.counts.missingReviewPackEntries, 1);
  assert.equal(summary.counts.adultApprovedForSecureImport, 1);
  assert.equal(summary.counts.notAdultApprovedForSecureImport, 1);
  assert.equal(summary.counts.advisoryWordCount, 1);
  assert.equal(summary.missingFields.auditedSource.acceptedSpellings, 1);
  assert.equal(summary.missingFields.auditedSource.explanation, 1);
  assert.equal(summary.missingFields.auditedSource.patternOrMorphologyTags, 1);
  assert.equal(summary.missingFields.reviewPack.acceptedSpellings, 1);
  assert.equal(summary.missingFields.reviewPack.explanation, 1);
  assert.equal(summary.distributions.reviewStatus.candidate_source_supplied_not_adult_approved, 1);
  assert.equal(summary.distributions.reviewStatus.adult_approved_for_secure_extension_import, 1);
  assert.equal(summary.distributions.advisories.adult_review_context_sensitivity, 1);
  assert.deepEqual(summary.examples.notAdultApproved[0], {
    word: 'ability',
    sourceRecordId: 'sv1-0001',
  });
  assert.equal(summary.releaseReadiness.metadataIssueCount, 1);
});

test('secure vocabulary release gap markdown renders blocker counts', () => {
  const markdown = renderSecureVocabularyReleaseGapMarkdown({
    status: 'RELEASE BLOCKED',
    approval: {
      auditedSourceDecision: 'APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY',
      reviewPackDecision: 'APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY',
      auditedSourceSecurePromotionAllowed: false,
      reviewPackSecurePromotionAllowed: false,
      promotionApproved: false,
    },
    counts: {
      auditedSourceWords: 2,
      reviewPackWords: 1,
      secureExtensionWords: 1,
      missingReviewPackEntries: 0,
      adultApprovedForSecureImport: 0,
      notAdultApprovedForSecureImport: 1,
      advisoryWordCount: 0,
      noAdvisoryWordCount: 1,
    },
    releaseReadiness: {
      issueCount: 9,
      metadataIssueCount: 0,
    },
    missingFields: {
      auditedSource: {
        acceptedSpellings: 1,
        explanation: 1,
        exampleSentences: 1,
        ukSpellingDecision: 1,
        patternOrMorphologyTags: 1,
        familyRoot: 1,
        audioOrTtsStatus: 1,
      },
      reviewPack: {
        acceptedSpellings: 1,
        explanation: 1,
        exampleSentences: 1,
        ukSpellingDecision: 1,
        patternOrMorphologyTags: 1,
        familyRoot: 1,
        audioOrTtsStatus: 1,
      },
    },
    distributions: {
      reviewStatus: {
        candidate_source_supplied_not_adult_approved: 1,
      },
      advisories: {},
    },
    examples: {
      notAdultApproved: [
        { word: 'ability', sourceRecordId: 'sv1-0001' },
      ],
    },
  });

  assert.match(markdown, /Status: RELEASE BLOCKED/);
  assert.match(markdown, /Release-readiness issue count: 9/);
  assert.match(markdown, /APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY/);
  assert.match(markdown, /\| acceptedSpellings \| 1 \| 1 \|/);
  assert.match(markdown, /\| ability \| sv1-0001 \|/);
});

test('secure vocabulary release gap markdown does not request another approval after secure import is approved', () => {
  const markdown = renderSecureVocabularyReleaseGapMarkdown({
    status: 'RELEASE BLOCKED',
    approval: {
      auditedSourceDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
      reviewPackDecision: 'APPROVED_FOR_SECURE_EXTENSION_IMPORT',
      auditedSourceSecurePromotionAllowed: true,
      reviewPackSecurePromotionAllowed: true,
      promotionApproved: true,
    },
    counts: {
      auditedSourceWords: 1463,
      reviewPackWords: 1463,
      secureExtensionWords: 1217,
      missingReviewPackEntries: 0,
      adultApprovedForSecureImport: 1217,
      notAdultApprovedForSecureImport: 0,
      advisoryWordCount: 12,
      noAdvisoryWordCount: 1205,
    },
    releaseReadiness: {
      issueCount: 17038,
      metadataIssueCount: 0,
    },
    missingFields: {
      auditedSource: {
        acceptedSpellings: 1217,
        explanation: 1217,
        exampleSentences: 1217,
        ukSpellingDecision: 1217,
        patternOrMorphologyTags: 1217,
        familyRoot: 1217,
        audioOrTtsStatus: 1217,
      },
      reviewPack: {
        acceptedSpellings: 1217,
        explanation: 1217,
        exampleSentences: 1217,
        ukSpellingDecision: 1217,
        patternOrMorphologyTags: 1217,
        familyRoot: 1217,
        audioOrTtsStatus: 1217,
      },
    },
    distributions: {
      reviewStatus: {
        adult_approved_for_secure_extension_import: 1217,
      },
      advisories: {
        adult_review_context_sensitivity: 12,
      },
    },
    examples: {
      notAdultApproved: [],
    },
  });

  assert.match(markdown, /has `APPROVED_FOR_SECURE_EXTENSION_IMPORT`/);
  assert.match(markdown, /still requires all missing release fields/);
  assert.doesNotMatch(markdown, /requires `APPROVED_FOR_SECURE_EXTENSION_IMPORT`, adult-approved/);
});
