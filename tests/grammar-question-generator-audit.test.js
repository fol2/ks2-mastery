import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGrammarQuestionGeneratorAudit } from '../scripts/audit-grammar-question-generator.mjs';
import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
} from '../worker/src/subjects/grammar/content.js';
import { readGrammarQuestionGeneratorP6Baseline } from './helpers/grammar-legacy-oracle.js';

test('Grammar question-generator audit covers the current template inventory', () => {
  const audit = buildGrammarQuestionGeneratorAudit();
  assert.equal(audit.conceptCount, GRAMMAR_CONCEPTS.length);
  assert.equal(audit.templateCount, GRAMMAR_TEMPLATE_METADATA.length);
  assert.equal(audit.generatedTemplateCount + audit.fixedTemplateCount, audit.templateCount);
  assert.equal(audit.selectedResponseCount + audit.constructedResponseCount, audit.templateCount);
  assert.deepEqual(audit.duplicateTemplateIds, []);
  assert.deepEqual(audit.templatesMissingAnswerSpecs, []);
  assert.deepEqual(audit.invalidAnswerSpecs, []);
  assert.equal(audit.conceptCoverage.length, GRAMMAR_CONCEPTS.length);
  assert.equal(audit.answerSpecTemplateCount, 479);
  assert.equal(audit.constructedResponseTemplateCount, 193);
  assert.equal(audit.constructedResponseAnswerSpecTemplateCount, 193);
  assert.equal(audit.legacyAdapterTemplateCount, 0);
  assert.equal(audit.manualReviewOnlyTemplateCount, 4);
  assert.equal(audit.p2MigrationComplete, true);
  assert.equal(audit.explainTemplateCount, 126);
  assert.equal(audit.conceptsWithExplainCoverage.length, GRAMMAR_CONCEPTS.length);
  assert.deepEqual(audit.conceptsMissingExplainCoverage, []);
  assert.equal(audit.p3ExplanationComplete, true);
  assert.ok(
    audit.explainCoverageByConcept.every((row) => row.explainTemplateCount >= 1),
    'Every Grammar concept should have at least one explanation template after QG P3.',
  );
  assert.deepEqual(audit.answerSpecKindCounts, {
    acceptedSet: 2,
    exact: 230,
    manualReviewOnly: 4,
    multiField: 56,
    normalisedText: 178,
    punctuationPattern: 9,
  });

  // P4 mixed-transfer assertions
  assert.equal(typeof audit.mixedTransferTemplateCount, 'number');
  assert.equal(audit.mixedTransferTemplateCount, 26);
  assert.ok(Array.isArray(audit.conceptsMissingMixedTransferCoverage));
  assert.equal(audit.conceptsMissingMixedTransferCoverage.length, 0);
  assert.equal(audit.p4MixedTransferComplete, true);
});

test('Grammar generated variants have stable answer-safe signatures', () => {
  const audit = buildGrammarQuestionGeneratorAudit();
  assert.deepEqual(audit.missingGeneratorMetadata, []);
  assert.deepEqual(audit.generatedSignatureCollisions, []);
  assert.deepEqual(audit.repeatedGeneratedVariants, []);
  assert.strictEqual(
    audit.legacyRepeatedGeneratedVariants.length,
    0,
    'P4 requires zero legacy repeated variants in default seed window',
  );
  assert.ok(audit.sampleCount > 0);

  const sample = createGrammarQuestion({ templateId: 'proc2_subject_object_identify', seed: 7 });
  const a = grammarQuestionVariantSignature(sample);
  const b = grammarQuestionVariantSignature(createGrammarQuestion({ templateId: 'proc2_subject_object_identify', seed: 7 }));
  const c = grammarQuestionVariantSignature(createGrammarQuestion({ templateId: 'proc2_subject_object_identify', seed: 8 }));
  assert.match(a, /^grammar-v1:[a-z0-9]+$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('Grammar question-generator P18 denominator assertions', () => {
  const deepSeeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const audit = buildGrammarQuestionGeneratorAudit({ seeds: [1, 2, 3], deepSeeds });

  assert.equal(audit.releaseId, 'grammar-qg-p18-2026-05-02');
  assert.equal(audit.templateCount, 510);
  assert.equal(audit.conceptCount, 18);
  assert.equal(audit.selectedResponseCount, 317);
  assert.equal(audit.constructedResponseCount, 193);
  assert.equal(audit.generatedTemplateCount, 484);
  assert.equal(audit.fixedTemplateCount, 26);
  assert.equal(audit.explainTemplateCount, 126);
  assert.equal(audit.conceptsWithExplainCoverage.length, 18);
  assert.equal(audit.mixedTransferTemplateCount, 26);
  assert.equal(audit.conceptsWithMixedTransferCoverage.length, 18);
  assert.equal(audit.repeatedGeneratedVariants.length, 0, 'Default-window repeated variants must be zero');
  assert.equal(audit.lowDepthGeneratedTemplates.length, 0, 'Deep low-depth families must be zero');
  assert.equal(audit.answerSpecTemplateCount, 479);
  assert.equal(audit.constructedResponseAnswerSpecTemplateCount, 193);
  assert.equal(audit.manualReviewOnlyTemplateCount, 4);
  assert.equal(audit.generatedSignatureCollisions.length, 0, 'Cross-template collisions must be zero');
});

test('Grammar P6 baseline fixture remains frozen while P18 supersedes the live audit output', () => {
  const deepSeeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const audit = buildGrammarQuestionGeneratorAudit({ seeds: [1, 2, 3], deepSeeds });
  const baseline = readGrammarQuestionGeneratorP6Baseline();

  assert.equal(baseline.releaseId, 'grammar-qg-p11-2026-04-30');
  assert.equal(audit.conceptCount, baseline.conceptCount);
  assert.equal(audit.templateCount, 510);
  assert.equal(baseline.templateCount, 78);
  assert.ok(audit.selectedResponseCount > baseline.selectedResponseCount);
  assert.ok(audit.constructedResponseCount > baseline.constructedResponseCount);
  assert.ok(audit.generatedTemplateCount > baseline.generatedTemplateCount);
  assert.equal(audit.fixedTemplateCount, baseline.fixedTemplateCount);
  assert.ok(audit.explainTemplateCount > baseline.explainTemplateCount);
  assert.ok(audit.mixedTransferTemplateCount > baseline.mixedTransferTemplateCount);
  assert.ok(audit.answerSpecTemplateCount > baseline.answerSpecTemplateCount);
  assert.ok(audit.constructedResponseAnswerSpecTemplateCount > baseline.constructedResponseAnswerSpecTemplateCount);
  assert.equal(audit.manualReviewOnlyTemplateCount, baseline.manualReviewOnlyTemplateCount);
  assert.equal(audit.repeatedGeneratedVariants.length, baseline.repeatedGeneratedVariants.length);
  assert.equal(audit.generatedSignatureCollisions.length, baseline.generatedSignatureCollisions.length);
  assert.equal(audit.lowDepthGeneratedTemplates.length, baseline.lowDepthGeneratedTemplates.length);
  assert.deepEqual(audit.conceptsWithExplainCoverage, baseline.conceptsWithExplainCoverage);
  assert.deepEqual(audit.conceptsMissingExplainCoverage, baseline.conceptsMissingExplainCoverage);
  assert.deepEqual(audit.conceptsWithMixedTransferCoverage, baseline.conceptsWithMixedTransferCoverage);
  assert.deepEqual(audit.conceptsMissingMixedTransferCoverage, baseline.conceptsMissingMixedTransferCoverage);
});

test('Grammar generated variant signatures ignore choice shuffle order only', () => {
  // With 8 modal verb cases, seed 1 and seed 9 wrap to the same case index (1%8 === 9%8 === 1)
  const sameModalQuestion = createGrammarQuestion({ templateId: 'qg_modal_verb_explain', seed: 1 });
  const sameModalQuestionDifferentShuffle = createGrammarQuestion({ templateId: 'qg_modal_verb_explain', seed: 9 });
  const differentModalQuestion = createGrammarQuestion({ templateId: 'qg_modal_verb_explain', seed: 2 });

  assert.equal(
    grammarQuestionVariantSignature(sameModalQuestion),
    grammarQuestionVariantSignature(sameModalQuestionDifferentShuffle),
    'Changing only the shuffled option order must not create a fresh generated variant.',
  );
  assert.notEqual(
    grammarQuestionVariantSignature(sameModalQuestion),
    grammarQuestionVariantSignature(differentModalQuestion),
    'A materially different prompt/model should still produce a distinct variant signature.',
  );
});
