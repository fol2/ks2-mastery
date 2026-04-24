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

function normaliseChoiceOptions(inputSpec, context) {
  assert.ok(Array.isArray(inputSpec?.options) && inputSpec.options.length > 0, `${context} did not expose answer options.`);
  return inputSpec.options.map((option, index) => {
    assert.equal(typeof option?.value, 'string', `${context} exposed option ${index + 1} without a string value.`);
    assert.equal(typeof option?.label, 'string', `${context} exposed option ${index + 1} without a string label.`);
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

export function correctResponseFor(readItem) {
  assert.equal(readItem?.inputSpec?.type, 'single_choice', 'Grammar production read model did not expose a single-choice input.');
  const readOptions = normaliseChoiceOptions(readItem.inputSpec, 'Grammar production read model');

  const question = createGrammarQuestion({
    templateId: readItem?.templateId,
    seed: readItem?.seed,
  });
  assert.ok(question, `Could not rebuild Grammar smoke question for ${readItem?.templateId || 'unknown template'}.`);
  assert.equal(question.inputSpec?.type, 'single_choice', 'Grammar production smoke expects a single-choice template.');
  const expectedOptions = normaliseChoiceOptions(question.inputSpec, 'Regenerated Grammar smoke question');
  assert.deepEqual(readOptions, expectedOptions, 'Grammar production option set did not match the regenerated question.');

  for (const option of readOptions) {
    if (evaluateGrammarQuestion(question, { answer: option.value })?.correct) {
      return { answer: option.value };
    }
  }

  throw new Error(`Grammar production options did not contain a correct answer for ${readItem?.templateId}.`);
}

async function smokeGrammar({ origin, cookie, learnerId, revision }) {
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
  const bootstrap = await loadBootstrap(origin, demo.cookie);

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
      templateId: grammar.templateId,
      summaryAnswered: grammar.summaryAnswered,
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
