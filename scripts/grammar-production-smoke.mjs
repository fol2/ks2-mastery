#!/usr/bin/env node

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import {
  assertNoForbiddenObjectKeys,
  configuredOrigin,
  createDemoSession,
  loadBootstrap,
  subjectCommand,
} from './lib/production-smoke.mjs';

const GRAMMAR_SMOKE_ITEM = Object.freeze({
  templateId: 'fronted_adverbial_choose',
  seed: 1,
});

const GRAMMAR_MINI_TEST_ITEM = Object.freeze({
  templateId: 'fronted_adverbial_choose',
  seed: 11,
});

const FORBIDDEN_GRAMMAR_READ_MODEL_KEYS = new Set([
  'solutionLines',
  'correctResponse',
  'correctResponses',
  'accepted',
  'answers',
  'evaluate',
  'generator',
  'template',
]);

const FORBIDDEN_GRAMMAR_ITEM_KEYS = new Set([
  ...FORBIDDEN_GRAMMAR_READ_MODEL_KEYS,
  'templates',
]);

function normaliseChoiceOptions(inputSpec, context, { allowExtraKeys = false } = {}) {
  assert.ok(Array.isArray(inputSpec?.options) && inputSpec.options.length > 0, `${context} did not expose answer options.`);
  return inputSpec.options.map((option, index) => {
    assert.equal(typeof option?.value, 'string', `${context} exposed option ${index + 1} without a string value.`);
    assert.equal(typeof option?.label, 'string', `${context} exposed option ${index + 1} without a string label.`);
    if (!allowExtraKeys) {
      const keys = Object.keys(option).sort();
      assert.deepEqual(keys, ['label', 'value'], `${context} exposed option ${index + 1} with unexpected fields: ${keys.join(', ')}`);
    }
    return {
      value: option.value,
      label: option.label,
    };
  });
}

export function assertNoForbiddenGrammarReadModelKeys(value, path = 'grammar.subjectReadModel') {
  assertNoForbiddenObjectKeys(value, FORBIDDEN_GRAMMAR_READ_MODEL_KEYS, path);
  assertNoForbiddenObjectKeys(value?.session?.currentItem, FORBIDDEN_GRAMMAR_ITEM_KEYS, `${path}.session.currentItem`);
}

function questionForReadItem(readItem) {
  assert.equal(readItem?.inputSpec?.type, 'single_choice', 'Grammar production read model did not expose a single-choice input.');
  const readOptions = normaliseChoiceOptions(readItem.inputSpec, 'Grammar production read model');

  const question = createGrammarQuestion({
    templateId: readItem?.templateId,
    seed: readItem?.seed,
  });
  assert.ok(question, `Could not rebuild Grammar smoke question for ${readItem?.templateId || 'unknown template'}.`);
  assert.equal(question.inputSpec?.type, 'single_choice', 'Grammar production smoke expects a single-choice template.');
  const expectedOptions = normaliseChoiceOptions(question.inputSpec, 'Regenerated Grammar smoke question', { allowExtraKeys: true });
  assert.deepEqual(readOptions, expectedOptions, 'Grammar production option set did not match the regenerated question.');
  return { question, readOptions };
}

export function correctResponseFor(readItem) {
  const { question, readOptions } = questionForReadItem(readItem);
  for (const option of readOptions) {
    if (evaluateGrammarQuestion(question, { answer: option.value })?.correct) {
      return { answer: option.value };
    }
  }

  throw new Error(`Grammar production options did not contain a correct answer for ${readItem?.templateId}.`);
}

export function incorrectResponseFor(readItem) {
  const { question, readOptions } = questionForReadItem(readItem);
  for (const option of readOptions) {
    if (!evaluateGrammarQuestion(question, { answer: option.value })?.correct) {
      return { answer: option.value };
    }
  }

  throw new Error(`Grammar production options did not contain an incorrect answer for ${readItem?.templateId}.`);
}

async function smokeGrammarNormalRound({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'start-session',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: GRAMMAR_SMOKE_ITEM.templateId,
      seed: GRAMMAR_SMOKE_ITEM.seed,
    },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.phase, 'session', 'Grammar did not start in session phase.');
  assert.equal(startModel?.authority, 'worker', 'Grammar read model was not Worker-authoritative.');
  assert.equal(startModel?.session?.serverAuthority, 'worker', 'Grammar session was not Worker-owned.');
  assert.equal(startModel?.session?.targetCount, 1, 'Grammar smoke round did not use one target item.');
  assert.equal(startModel?.session?.currentItem?.templateId, GRAMMAR_SMOKE_ITEM.templateId);
  assertNoForbiddenGrammarReadModelKeys(startModel, 'grammar.startModel');

  const response = correctResponseFor(startModel.session.currentItem);
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: { response },
  });
  revision = step.revision;
  const feedbackModel = step.payload.subjectReadModel;
  assert.equal(feedbackModel?.phase, 'feedback', 'Grammar submit did not return feedback phase.');
  assert.equal(feedbackModel?.feedback?.result?.correct, true, 'Grammar smoke answer was not accepted.');
  assertNoForbiddenGrammarReadModelKeys(feedbackModel, 'grammar.feedbackModel');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'continue-session',
  });
  revision = step.revision;
  const summaryModel = step.payload.subjectReadModel;
  assert.equal(summaryModel?.phase, 'summary', 'Grammar continue did not reach summary.');
  assert.equal(summaryModel?.summary?.answered, 1, 'Grammar summary did not record one answered item.');
  assert.equal(summaryModel?.summary?.targetCount, 1, 'Grammar summary did not preserve the one-item target.');
  assertNoForbiddenGrammarReadModelKeys(summaryModel, 'grammar.summaryModel');

  return {
    revision,
    templateId: startModel.session.currentItem.templateId,
    summaryAnswered: summaryModel.summary.answered,
  };
}

async function smokeGrammarMiniTest({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'start-session',
    payload: {
      mode: 'satsset',
      roundLength: 8,
      templateId: GRAMMAR_MINI_TEST_ITEM.templateId,
      seed: GRAMMAR_MINI_TEST_ITEM.seed,
    },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.phase, 'session', 'Grammar mini-test did not start in session phase.');
  assert.equal(startModel?.session?.type, 'mini-set', 'Grammar mini-test did not expose mini-set session type.');
  assert.equal(startModel?.session?.miniTest?.setSize, 8, 'Grammar mini-test did not use the requested eight-question set.');
  assert.equal(startModel?.session?.miniTest?.questions?.[0]?.answered, false, 'Grammar mini-test should start with no saved response.');
  assert.equal(startModel?.feedback, null, 'Grammar mini-test exposed feedback before marking.');
  assertNoForbiddenGrammarReadModelKeys(startModel, 'grammar.miniTestStartModel');

  const response = correctResponseFor(startModel.session.currentItem);
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'save-mini-test-response',
    payload: { response },
  });
  revision = step.revision;
  const savedModel = step.payload.subjectReadModel;
  assert.equal(savedModel?.phase, 'session', 'Grammar mini-test save did not stay in session phase.');
  assert.equal(savedModel?.feedback, null, 'Grammar mini-test save exposed early feedback.');
  assert.equal(savedModel?.summary, null, 'Grammar mini-test save exposed early summary.');
  assert.equal(savedModel?.session?.miniTest?.questions?.[0]?.answered, true, 'Grammar mini-test response was not saved.');
  assertNoForbiddenGrammarReadModelKeys(savedModel, 'grammar.miniTestSavedModel');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'finish-mini-test',
  });
  revision = step.revision;
  const summaryModel = step.payload.subjectReadModel;
  assert.equal(summaryModel?.phase, 'summary', 'Grammar mini-test finish did not reach summary.');
  assert.equal(summaryModel?.summary?.answered, 1, 'Grammar mini-test summary did not record the saved answer.');
  assert.equal(summaryModel?.summary?.miniTestReview?.questions?.length, 8, 'Grammar mini-test review did not include the full set.');
  assert.equal(summaryModel?.summary?.miniTestReview?.questions?.[0]?.marked?.result?.correct, true, 'Grammar mini-test review did not mark the saved response.');
  assertNoForbiddenGrammarReadModelKeys(summaryModel, 'grammar.miniTestSummaryModel');

  return {
    revision,
    answered: summaryModel.summary.answered,
    reviewSize: summaryModel.summary.miniTestReview.questions.length,
  };
}

async function smokeGrammarRepairAndAi({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'start-session',
    payload: {
      mode: 'smart',
      roundLength: 2,
      templateId: GRAMMAR_SMOKE_ITEM.templateId,
      seed: GRAMMAR_SMOKE_ITEM.seed + 101,
    },
  });
  revision = step.revision;
  let model = step.payload.subjectReadModel;
  assert.equal(model?.phase, 'session', 'Grammar repair smoke did not start in session phase.');
  assertNoForbiddenGrammarReadModelKeys(model, 'grammar.repairStartModel');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'use-faded-support',
  });
  revision = step.revision;
  model = step.payload.subjectReadModel;
  assert.equal(model?.session?.supportLevel, 1, 'Grammar faded support did not raise the support level.');
  assert.equal(model?.session?.supportGuidance?.kind, 'faded', 'Grammar faded support did not expose faded guidance.');
  assertNoForbiddenGrammarReadModelKeys(model, 'grammar.fadedSupportModel');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'request-ai-enrichment',
    payload: { kind: 'explanation' },
  });
  revision = step.revision;
  model = step.payload.subjectReadModel;
  assert.equal(model?.aiEnrichment?.status, 'ready', 'Grammar AI enrichment did not return ready content.');
  assert.equal(model?.aiEnrichment?.nonScored, true, 'Grammar AI enrichment was not marked non-scored.');
  const aiKind = model.aiEnrichment.kind;
  assertNoForbiddenGrammarReadModelKeys(model, 'grammar.aiEnrichmentModel');

  const wrongResponse = incorrectResponseFor(model.session.currentItem);
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: { response: wrongResponse },
  });
  revision = step.revision;
  model = step.payload.subjectReadModel;
  assert.equal(model?.phase, 'feedback', 'Grammar repair smoke did not return feedback.');
  assert.equal(model?.feedback?.result?.correct, false, 'Grammar repair smoke wrong answer was not marked for review.');
  assertNoForbiddenGrammarReadModelKeys(model, 'grammar.repairFeedbackModel');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'show-worked-solution',
  });
  revision = step.revision;
  model = step.payload.subjectReadModel;
  assert.ok(model?.feedback?.workedSolution?.answerText, 'Grammar worked solution did not expose post-marking answer support.');
  assertNoForbiddenGrammarReadModelKeys(model, 'grammar.workedSolutionModel');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'start-similar-problem',
  });
  revision = step.revision;
  model = step.payload.subjectReadModel;
  assert.equal(model?.phase, 'session', 'Grammar similar problem did not return to session phase.');
  assert.ok(model?.session?.currentItem?.templateId, 'Grammar similar problem did not expose the next safe item.');
  assertNoForbiddenGrammarReadModelKeys(model, 'grammar.similarProblemModel');

  return {
    revision,
    supportKind: 'faded',
    aiKind,
  };
}

async function smokeGrammar({ origin, cookie, learnerId, revision }) {
  const normal = await smokeGrammarNormalRound({ origin, cookie, learnerId, revision });
  const miniTest = await smokeGrammarMiniTest({
    origin,
    cookie,
    learnerId,
    revision: normal.revision,
  });
  const repairAi = await smokeGrammarRepairAndAi({
    origin,
    cookie,
    learnerId,
    revision: miniTest.revision,
  });

  return {
    revision: repairAi.revision,
    normal,
    miniTest,
    repairAi,
  };
}

async function smokeSpelling({ origin, cookie, learnerId, revision }) {
  const step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'spelling',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'single', slug: 'early', length: 1 },
  });
  const model = step.payload.subjectReadModel;
  assert.equal(model?.phase, 'session', 'Spelling did not start in session phase.');
  assert.equal(model?.session?.serverAuthority, 'worker', 'Spelling session was not Worker-owned.');
  assert.equal(model?.session?.progress?.total, 1, 'Spelling smoke round did not use one target word.');
  assert.equal(model?.session?.currentCard?.word, undefined, 'Spelling read model exposed the raw word.');
  assert.equal(model?.session?.currentCard?.prompt?.sentence, undefined, 'Spelling read model exposed the raw sentence.');
  assert.ok(model?.session?.currentCard?.prompt?.cloze, 'Spelling read model did not include the redacted cloze prompt.');
  assert.ok(step.payload?.audio?.promptToken, 'Spelling command did not return a prompt token.');
  assert.ok(model?.audio?.promptToken, 'Spelling read model did not include a prompt token.');

  return {
    revision: step.revision,
    progressTotal: model.session.progress.total,
    hasPromptToken: true,
  };
}

async function main() {
  const origin = configuredOrigin();
  const demo = await createDemoSession(origin);
  const bootstrap = await loadBootstrap(origin, demo.cookie, { expectedSession: demo.session });

  const grammar = await smokeGrammar({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: bootstrap.revision,
  });
  const spelling = await smokeSpelling({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: grammar.revision,
  });

  console.log(JSON.stringify({
    ok: true,
    origin,
    accountId: demo.session.accountId,
    learnerId: bootstrap.learnerId,
    grammar: {
      templateId: grammar.normal.templateId,
      summaryAnswered: grammar.normal.summaryAnswered,
      miniTestAnswered: grammar.miniTest.answered,
      miniTestReviewSize: grammar.miniTest.reviewSize,
      repairSupportKind: grammar.repairAi.supportKind,
      aiKind: grammar.repairAi.aiKind,
    },
    spelling: {
      progressTotal: spelling.progressTotal,
      hasPromptToken: spelling.hasPromptToken,
    },
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[grammar-production-smoke] ${error?.stack || error?.message || error}`);
    process.exit(1);
  });
}
