#!/usr/bin/env node

import assert from 'node:assert/strict';

import { createPunctuationContentIndexes } from '../shared/punctuation/content.js';
import { createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';
import {
  assertNoForbiddenObjectKeys,
  configuredOrigin,
  createDemoSession,
  loadBootstrap,
  subjectCommand,
} from './lib/production-smoke.mjs';

const FORBIDDEN_READ_MODEL_KEYS = new Set([
  'accepted',
  'answers',
  'correctIndex',
  'rubric',
  'validator',
  'seed',
  'generator',
  'hiddenQueue',
  'unpublished',
]);

function assertNoForbiddenReadModelKeys(value, path = 'subjectReadModel') {
  assertNoForbiddenObjectKeys(value, FORBIDDEN_READ_MODEL_KEYS, path);
}

function punctuationAnswerFor(readItem) {
  const manifest = createPunctuationRuntimeManifest();
  const indexes = createPunctuationContentIndexes(manifest);
  const source = indexes.itemById.get(readItem?.id);
  assert.ok(source, `Could not find source punctuation item for ${readItem?.id || 'unknown item'}.`);

  if (readItem.inputKind === 'choice') {
    assert.ok(Number.isInteger(source.correctIndex), `Punctuation choice item ${source.id} has no correctIndex.`);
    return { choiceIndex: source.correctIndex };
  }

  const typed = Array.isArray(source.accepted) && typeof source.accepted[0] === 'string'
    ? source.accepted[0]
    : source.model;
  assert.ok(typeof typed === 'string' && typed, `Punctuation text item ${source.id} has no model answer.`);
  return { typed };
}

async function smokePunctuation({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'smart', roundLength: '1' },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.phase, 'active-item', 'Punctuation did not start in active-item phase.');
  assert.equal(startModel?.session?.serverAuthority, 'worker', 'Punctuation session was not Worker-owned.');
  assert.equal(startModel?.session?.length, 1, 'Punctuation smoke round did not use length 1.');
  assertNoForbiddenReadModelKeys(startModel);

  const currentItem = startModel.session?.currentItem;
  const answer = punctuationAnswerFor(currentItem);
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: answer,
  });
  revision = step.revision;
  const feedbackModel = step.payload.subjectReadModel;
  assert.equal(feedbackModel?.phase, 'feedback', 'Punctuation submit did not return feedback phase.');
  assert.equal(feedbackModel?.feedback?.kind, 'success', `Punctuation smoke answer was not accepted for ${currentItem?.id}.`);
  assertNoForbiddenReadModelKeys(feedbackModel);

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'continue-session',
  });
  revision = step.revision;
  const summaryModel = step.payload.subjectReadModel;
  assert.equal(summaryModel?.phase, 'summary', 'Punctuation continue did not reach summary.');
  assert.equal(summaryModel?.summary?.total, 1, 'Punctuation summary did not record one answered item.');
  assertNoForbiddenReadModelKeys(summaryModel);

  return {
    revision,
    itemId: currentItem.id,
    summaryTotal: summaryModel.summary.total,
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
  assert.equal(
    bootstrap.payload?.subjectExposureGates?.punctuationProduction,
    true,
    'Punctuation production exposure gate is not enabled.',
  );

  const punctuation = await smokePunctuation({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: bootstrap.revision,
  });
  const spelling = await smokeSpelling({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: punctuation.revision,
  });

  console.log(JSON.stringify({
    ok: true,
    origin,
    accountId: demo.session.accountId,
    learnerId: bootstrap.learnerId,
    punctuation: {
      itemId: punctuation.itemId,
      summaryTotal: punctuation.summaryTotal,
    },
    spelling: {
      progressTotal: spelling.progressTotal,
      hasPromptToken: spelling.hasPromptToken,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(`[punctuation-production-smoke] ${error?.stack || error?.message || error}`);
  process.exit(1);
});
