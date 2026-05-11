import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_P21_EXPANSION_SUMMARY,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import { isTemplateBlocked } from '../worker/src/subjects/grammar/certification-status.js';

const P21_TEMPLATES = GRAMMAR_TEMPLATE_METADATA.filter((template) => template.tags.includes('qg-p21'));

const P21_GENERIC_EXPLANATION_FILLERS = new Set([
  'It only depends on the final punctuation mark.',
  'It is correct because it is the shortest option.',
  'It is correct because it sounds more exciting.',
]);


function p21TemplatesForConcept(conceptId) {
  return P21_TEMPLATES.filter((template) => template.skillIds.includes(conceptId));
}

test('Grammar QG P21 adds a certified closed-response expansion layer across all concepts', () => {
  assert.equal(GRAMMAR_CONTENT_RELEASE_ID, 'grammar-qg-p21-2026-05-11');
  assert.deepEqual(GRAMMAR_P21_EXPANSION_SUMMARY, {
    releaseId: 'grammar-qg-p21-2026-05-11',
    familyCount: 36,
    templateCount: 36,
    caseCount: 288,
    conceptCount: 18,
    minCasesPerFamily: 8,
    maxCasesPerFamily: 8,
    policy: 'closed selected-response only; no manualReviewOnly; no reward/mastery mutation',
  });
  assert.equal(P21_TEMPLATES.length, 36);
  assert.equal(new Set(P21_TEMPLATES.flatMap((template) => template.skillIds)).size, 18);
  for (const conceptId of new Set(P21_TEMPLATES.flatMap((template) => template.skillIds))) {
    assert.equal(p21TemplatesForConcept(conceptId).length, 2, `${conceptId} should have choose + explain P21 templates`);
  }
});

test('Grammar QG P21 templates are runtime-certified and safe to schedule', () => {
  for (const template of P21_TEMPLATES) {
    assert.equal(isTemplateBlocked(template.id), false, `${template.id} should be approved in runtime certification`);
    assert.equal(template.answerSpecKind, 'exact');
    assert.equal(template.isSelectedResponse, true);
    assert.equal(template.satsFriendly, true);
    assert.equal(template.fairnessConversion, null);
  }
});

test('Grammar QG P21 selected-response cases mark exactly one visible option correct', () => {
  for (const template of P21_TEMPLATES) {
    for (let seed = 1; seed <= 8; seed += 1) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      assert.ok(question, `${template.id}:${seed} should generate a question`);
      const options = question.inputSpec?.options || [];
      assert.equal(options.length, 4, `${template.id}:${seed} should expose four options`);
      assert.equal(new Set(options.map((option) => option.value)).size, 4, `${template.id}:${seed} should expose distinct option values`);

      const correctOptions = options.filter((option) => question.evaluate({ answer: option.value }).correct === true);
      assert.equal(correctOptions.length, 1, `${template.id}:${seed} should have exactly one correct option`);
      for (const option of options.filter((candidate) => candidate.value !== correctOptions[0].value)) {
        assert.equal(question.evaluate({ answer: option.value }).correct, false, `${template.id}:${seed} should reject distractor ${option.value}`);
      }
    }
  }
});


test('Grammar QG P21 explanation templates use concept-specific misconception options', () => {
  const explanationTemplates = P21_TEMPLATES.filter((template) => template.questionType === 'explain');
  assert.equal(explanationTemplates.length, 18);

  for (const template of explanationTemplates) {
    for (let seed = 1; seed <= 8; seed += 1) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      const options = question.inputSpec?.options || [];
      const correct = options.find((option) => question.evaluate({ answer: option.value }).correct === true);
      assert.ok(correct, `${template.id}:${seed} should expose one correct explanation option`);
      const distractors = options.filter((option) => option.value !== correct.value).map((option) => option.value);
      assert.equal(distractors.length, 3, `${template.id}:${seed} should expose three distractors`);
      for (const distractor of distractors) {
        assert.equal(
          P21_GENERIC_EXPLANATION_FILLERS.has(distractor),
          false,
          `${template.id}:${seed} should not use generic explanation filler: ${distractor}`,
        );
      }
    }
  }
});
