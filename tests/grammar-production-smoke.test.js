import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import {
  assertNoForbiddenGrammarReadModelKeys,
  correctResponseFor,
} from '../scripts/grammar-production-smoke.mjs';

function smokeQuestion() {
  const question = createGrammarQuestion({
    templateId: 'fronted_adverbial_choose',
    seed: 1,
  });
  assert.ok(question, 'Fixture question should exist.');
  return question;
}

function readItemFromQuestion(question) {
  return {
    templateId: question.templateId,
    seed: question.seed,
    inputSpec: question.inputSpec,
  };
}

test('Grammar production smoke answers from the production-visible option set', () => {
  const question = smokeQuestion();
  const readItem = readItemFromQuestion(question);
  const response = correctResponseFor(readItem);

  assert.ok(
    readItem.inputSpec.options.some((option) => option.value === response.answer),
    'Smoke response should use a value present in the read-model options.',
  );
  assert.equal(evaluateGrammarQuestion(question, response)?.correct, true);
});

test('Grammar production smoke rejects option sets that do not match the regenerated item', () => {
  const question = smokeQuestion();
  const correctOption = question.inputSpec.options.find((option) => (
    evaluateGrammarQuestion(question, { answer: option.value })?.correct
  ));
  assert.ok(correctOption, 'Fixture question should have a correct option.');

  const readItem = readItemFromQuestion(question);
  readItem.inputSpec = {
    ...readItem.inputSpec,
    options: readItem.inputSpec.options.map((option) => (
      option.value === correctOption.value
        ? { value: 'hidden-local-answer', label: 'Hidden local answer' }
        : option
    )),
  };

  assert.throws(
    () => correctResponseFor(readItem),
    /Grammar production option set did not match the regenerated question/,
  );
});

test('Grammar production smoke scans feedback and summary models for forbidden keys', () => {
  assert.doesNotThrow(() => assertNoForbiddenGrammarReadModelKeys({
    stats: { templates: { total: 44, selectedResponse: 20 } },
    session: {
      currentItem: {
        templateId: 'fronted_adverbial_choose',
        inputSpec: { type: 'single_choice', options: [{ value: 'A', label: 'A' }] },
      },
    },
  }, 'grammar.startModel'));

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      feedback: { result: { correctResponses: ['A'] } },
    }, 'grammar.feedbackModel'),
    /grammar\.feedbackModel\.feedback\.result\.correctResponses exposed a server-only field/,
  );

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      session: { currentItem: { templates: [{ id: 'fronted_adverbial_choose' }] } },
    }, 'grammar.summaryModel'),
    /grammar\.summaryModel\.session\.currentItem\.templates exposed a server-only field/,
  );
});
