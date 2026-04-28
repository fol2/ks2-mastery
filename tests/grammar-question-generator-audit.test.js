import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGrammarQuestionGeneratorAudit } from '../scripts/audit-grammar-question-generator.mjs';
import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
} from '../worker/src/subjects/grammar/content.js';

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
  assert.equal(audit.answerSpecTemplateCount, 39);
  assert.equal(audit.constructedResponseTemplateCount, 20);
  assert.equal(audit.constructedResponseAnswerSpecTemplateCount, 20);
  assert.equal(audit.legacyAdapterTemplateCount, 0);
  assert.equal(audit.manualReviewOnlyTemplateCount, 4);
  assert.equal(audit.p2MigrationComplete, true);
  assert.equal(audit.explainTemplateCount, 17);
  assert.equal(audit.conceptsWithExplainCoverage.length, GRAMMAR_CONCEPTS.length);
  assert.deepEqual(audit.conceptsMissingExplainCoverage, []);
  assert.equal(audit.p3ExplanationComplete, true);
  assert.ok(
    audit.explainCoverageByConcept.every((row) => row.explainTemplateCount >= 1),
    'Every Grammar concept should have at least one explanation template after QG P3.',
  );
  assert.deepEqual(audit.answerSpecKindCounts, {
    acceptedSet: 2,
    exact: 17,
    manualReviewOnly: 4,
    multiField: 2,
    normalisedText: 5,
    punctuationPattern: 9,
  });
});

test('Grammar generated variants have stable answer-safe signatures', () => {
  const audit = buildGrammarQuestionGeneratorAudit();
  assert.deepEqual(audit.missingGeneratorMetadata, []);
  assert.deepEqual(audit.generatedSignatureCollisions, []);
  assert.deepEqual(audit.repeatedGeneratedVariants, []);
  assert.ok(
    audit.legacyRepeatedGeneratedVariants.length >= 1,
    'Legacy generated repeated variants stay advisory rather than blocking P2 marking migration.',
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

test('Grammar generated variant signatures ignore choice shuffle order only', () => {
  const sameModalQuestion = createGrammarQuestion({ templateId: 'qg_modal_verb_explain', seed: 1 });
  const sameModalQuestionDifferentShuffle = createGrammarQuestion({ templateId: 'qg_modal_verb_explain', seed: 4 });
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
