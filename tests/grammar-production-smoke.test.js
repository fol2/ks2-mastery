import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import {
  assertNoForbiddenGrammarReadModelKeys,
  correctResponseFor,
  incorrectResponseFor,
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

test('Grammar production smoke can select an incorrect visible option for repair coverage', () => {
  const question = smokeQuestion();
  const readItem = readItemFromQuestion(question);
  const response = incorrectResponseFor(readItem);

  assert.ok(
    readItem.inputSpec.options.some((option) => option.value === response.answer),
    'Smoke response should use a value present in the read-model options.',
  );
  assert.equal(evaluateGrammarQuestion(question, response)?.correct, false);
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

test('Grammar production smoke rejects extra production option fields', () => {
  const question = smokeQuestion();
  const readItem = readItemFromQuestion(question);
  readItem.inputSpec = {
    ...readItem.inputSpec,
    options: readItem.inputSpec.options.map((option, index) => (
      index === 0 ? { ...option, correct: true } : option
    )),
  };

  assert.throws(
    () => correctResponseFor(readItem),
    /Grammar production read model exposed option 1 with unexpected fields: correct, label, value/,
  );
});

test('Grammar production smoke scans feedback and summary models for forbidden keys', () => {
  assert.doesNotThrow(() => assertNoForbiddenGrammarReadModelKeys({
    stats: { contentStats: { total: 51, selectedResponse: 31, constructedResponse: 20 } },
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

test('Grammar production smoke scans mini-test, support, and AI enrichment read models', () => {
  assert.doesNotThrow(() => assertNoForbiddenGrammarReadModelKeys({
    session: {
      currentItem: {
        templateId: 'fronted_adverbial_choose',
        inputSpec: { type: 'single_choice', options: [{ value: 'A', label: 'A' }] },
      },
      supportGuidance: {
        kind: 'faded',
        notices: ['Use the visible prompt only.'],
      },
    },
    aiEnrichment: {
      kind: 'explanation',
      status: 'ready',
      nonScored: true,
      explanation: { body: 'Non-scored support.' },
    },
    summary: {
      miniTestReview: {
        questions: [{
          marked: { result: { feedbackShort: 'Correct.', answerText: 'Visible after marking.' } },
        }],
      },
    },
  }, 'grammar.completenessModel'));

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      session: { supportGuidance: { workedExample: { correctResponses: ['A'] } } },
    }, 'grammar.supportModel'),
    /grammar\.supportModel\.session\.supportGuidance\.workedExample\.correctResponses exposed a server-only field/,
  );

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      aiEnrichment: { revisionDrills: [{ accepted: ['A'] }] },
    }, 'grammar.aiModel'),
    /grammar\.aiModel\.aiEnrichment\.revisionDrills\[0\]\.accepted exposed a server-only field/,
  );

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      summary: { miniTestReview: { questions: [{ marked: { result: { answers: ['A'] } } }] } },
    }, 'grammar.miniReviewModel'),
    /grammar\.miniReviewModel\.summary\.miniTestReview\.questions\[0\]\.marked\.result\.answers exposed a server-only field/,
  );
});
