import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import {
  runPunctuationContentAudit,
} from '../scripts/audit-punctuation-content.mjs';

test('punctuation content audit reports the current fixed and generated baseline', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-baseline',
    generatedPerFamily: 1,
  });

  assert.equal(audit.ok, true, audit.failures.join('\n'));
  assert.deepEqual(audit.summary, {
    fixedItemCount: 71,
    generatorFamilyCount: 25,
    generatedItemCount: 25,
    runtimeItemCount: 96,
    publishedRewardUnitCount: 14,
    publishedSkillCount: 14,
  });
  assert.equal(audit.bySkill.length, 14);
  assert.equal(audit.bySkill.every((row) => row.generatedFamilyCount >= 1), true);
});

test('punctuation content audit reports per-skill coverage and generated signatures', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-coverage',
    generatedPerFamily: 1,
  });
  const sentenceEndings = audit.bySkill.find((row) => row.skillId === 'sentence_endings');
  const speech = audit.bySkill.find((row) => row.skillId === 'speech');

  assert.equal(sentenceEndings.fixedItemCount, 4);
  assert.equal(sentenceEndings.generatedItemCount, 1);
  assert.equal(sentenceEndings.generatedSignatureCount, 1);
  assert.ok(sentenceEndings.readinessCoverage.includes('insertion'));
  assert.ok(speech.generatedItemCount >= 2);
  assert.ok(speech.validatorCoverageCount > 0);
});

test('punctuation content audit can prove expanded deterministic bank variety', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-expanded-bank',
    generatedPerFamily: 4,
    thresholds: {
      failOnDuplicateGeneratedSignatures: true,
    },
  });

  assert.equal(audit.ok, true, audit.failures.join('\n'));
  for (const row of audit.generatorFamilies.filter((entry) => entry.published)) {
    assert.equal(row.generatedItemCount, 4, row.id);
    assert.equal(row.variantSignatures.length, 4, row.id);
    assert.equal(row.templateIds.length, 4, row.id);
  }
});

test('punctuation content audit can fail when generated variants exceed unique bank capacity', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-over-capacity',
    generatedPerFamily: 5,
    thresholds: {
      failOnDuplicateGeneratedSignatures: true,
    },
  });

  assert.equal(audit.ok, false);
  assert.match(audit.failures.join('\n'), /Duplicate generated variant signatures/);
});

test('punctuation content audit detects missing generated family coverage', () => {
  const manifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    generatorFamilies: [
      ...PUNCTUATION_CONTENT_MANIFEST.generatorFamilies,
      {
        id: 'gen_sentence_endings_missing_templates',
        skillId: 'sentence_endings',
        rewardUnitId: 'sentence-endings-core',
        published: true,
        mode: 'insert',
        deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
      },
    ],
  };
  const audit = runPunctuationContentAudit({ manifest, seed: 'missing-family', generatedPerFamily: 1 });

  assert.equal(audit.ok, false);
  assert.match(audit.failures.join('\n'), /gen_sentence_endings_missing_templates produced no generated items/);
});

test('punctuation content audit threshold failures are machine-readable', () => {
  const audit = runPunctuationContentAudit({
    seed: 'strict-audit',
    generatedPerFamily: 1,
    thresholds: {
      minGeneratedSignaturesPerPublishedSkill: 3,
      minValidatorCoveragePerPublishedSkill: 1,
    },
  });

  assert.equal(audit.ok, false);
  assert.match(audit.failures.join('\n'), /sentence_endings has 1 generated signatures/);
  assert.equal(Array.isArray(audit.bySkill), true);
  assert.equal(Array.isArray(audit.generatorFamilies), true);
});
