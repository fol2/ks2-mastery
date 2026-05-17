import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RELEASE_INPUT_TEMPLATE_COLUMNS,
  buildSecureVocabularyReleaseInputTemplate,
} from '../scripts/build-spelling-secure-vocabulary-release-input-template.mjs';

test('secure vocabulary release input template includes only secure-extension rows', () => {
  const template = buildSecureVocabularyReleaseInputTemplate({
    auditedSource: {
      source: {
        artifactId: 'ks2-spelling-secure-vocabulary-source-v1',
        sourceJsonlSha256: 'source-hash',
        approvalDecision: 'APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY',
        securePromotionAllowed: false,
      },
      words: [
        {
          sourceRecordId: 'sv1-0001',
          word: 'ability',
          taxonomyTier: 'secure-extension',
          yearBand: 'Y3-Y6',
          sourceBucket: 'school_academic_secure',
          patternTags: ['suffix-ity'],
          advisories: ['adult_review_context_sensitivity'],
          sourceReviewStatus: 'candidate_source_supplied_not_adult_approved',
        },
        {
          sourceRecordId: 'cur-0001',
          word: 'statutory',
          taxonomyTier: 'statutory-core',
          sourceReviewStatus: 'adult_approved',
        },
      ],
    },
  });

  assert.equal(template.rows.length, 1);
  assert.equal(template.rows[0].sourceRecordId, 'sv1-0001');
  assert.equal(template.rows[0].word, 'ability');
  assert.equal(template.rows[0].existingPatternTags, 'suffix-ity');
  assert.equal(template.rows[0].existingAdvisories, 'adult_review_context_sensitivity');
  assert.equal(template.rows[0].secureImportReviewStatus, '');
  assert.equal(template.rows[0].acceptedSpellings, '');
  assert.equal(template.rows[0].explanation, '');
  assert.equal(template.rows[0].secureImportApprovalDecision, '');
  assert.equal(template.manifest.counts.secureExtensionRows, 1);
  assert.equal(template.manifest.counts.advisoryRows, 1);
  assert.equal(template.manifest.source.sourceJsonlSha256, 'source-hash');
  assert.equal(template.manifest.requiredApprovalDecision, 'APPROVED_FOR_SECURE_EXTENSION_IMPORT');
});

test('secure vocabulary release input template renders deterministic CSV columns and escapes values', () => {
  const template = buildSecureVocabularyReleaseInputTemplate({
    auditedSource: {
      source: {
        sourceJsonlSha256: 'source-hash',
        approvalDecision: 'APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY',
      },
      words: [
        {
          sourceRecordId: 'sv1-0002',
          word: 'comma,word',
          taxonomyTier: 'secure-extension',
          yearBand: 'Y5-Y6',
          sourceBucket: 'writing_grammar_secure',
          patternTags: ['root-"quote"'],
          advisories: [],
          sourceReviewStatus: 'candidate_source_supplied_not_adult_approved',
        },
      ],
    },
  });

  const lines = template.csv.trimEnd().split('\n');
  assert.deepEqual(lines[0].split(','), RELEASE_INPUT_TEMPLATE_COLUMNS);
  assert.match(lines[1], /^sv1-0002,"comma,word",secure-extension/);
  assert.match(lines[1], /"root-""quote"""/);
  assert.match(template.markdown, /Required live-import approval decision: APPROVED_FOR_SECURE_EXTENSION_IMPORT/);
  assert.match(template.markdown, /does not approve or import any word/);
});
