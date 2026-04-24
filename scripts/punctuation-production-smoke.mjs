#!/usr/bin/env node

import assert from 'node:assert/strict';

import { createPunctuationContentIndexes } from '../shared/punctuation/content.js';
import { createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';

const DEFAULT_ORIGIN = 'https://ks2.eugnel.uk';
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

function argValue(...names) {
  for (const name of names) {
    const index = process.argv.indexOf(name);
    if (index !== -1 && index + 1 < process.argv.length) return process.argv[index + 1];
  }
  return '';
}

function configuredOrigin() {
  const raw = argValue('--origin', '--url') || process.env.KS2_SMOKE_ORIGIN || DEFAULT_ORIGIN;
  const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return new URL(value).origin;
}

function getSetCookies(response) {
  const values = response.headers.getSetCookie?.();
  if (Array.isArray(values) && values.length) return values;
  return String(response.headers.get('set-cookie') || '')
    .split(/,\s*(?=ks2_)/)
    .filter(Boolean);
}

function sessionCookieFrom(response) {
  return getSetCookies(response)
    .map((cookie) => String(cookie || '').split(';')[0])
    .find((cookie) => cookie.startsWith('ks2_session=')) || '';
}

async function readJsonResponse(response) {
  const text = await response.text().catch(() => '');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawBody: text };
  }
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const payload = await readJsonResponse(response);
  return { response, payload };
}

function sameOriginHeaders(origin, cookie = '') {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    origin,
    ...(cookie ? { cookie } : {}),
  };
}

async function postJson(origin, path, body = {}, { cookie = '' } = {}) {
  return fetchJson(new URL(path, origin), {
    method: 'POST',
    headers: sameOriginHeaders(origin, cookie),
    body: JSON.stringify(body),
  });
}

async function getJson(origin, path, { cookie = '' } = {}) {
  return fetchJson(new URL(path, origin), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
    },
  });
}

function assertOkResponse(label, result) {
  assert.ok(result.response.ok, `${label} failed with ${result.response.status}: ${JSON.stringify(result.payload)}`);
  assert.notEqual(result.payload?.ok, false, `${label} returned ok=false: ${JSON.stringify(result.payload)}`);
}

function assertNoForbiddenReadModelKeys(value, path = 'subjectReadModel') {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenReadModelKeys(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_READ_MODEL_KEYS.has(key), false, `${path}.${key} exposed a server-only read-model field.`);
    assertNoForbiddenReadModelKeys(child, `${path}.${key}`);
  }
}

function nextRevisionFrom(commandPayload, previousRevision) {
  const applied = Number(commandPayload?.mutation?.appliedRevision);
  return Number.isFinite(applied) ? applied : previousRevision;
}

function createRequestId(prefix) {
  createRequestId.sequence = (createRequestId.sequence || 0) + 1;
  return `${prefix}-${Date.now()}-${createRequestId.sequence}`;
}

async function createDemoSession(origin) {
  const result = await postJson(origin, '/api/demo/session');
  assertOkResponse('Demo session creation', result);
  const cookie = sessionCookieFrom(result.response);
  assert.ok(cookie, 'Demo session did not return a ks2_session cookie.');
  assert.equal(result.payload?.session?.demo, true, 'Demo session payload was not marked as demo.');
  return { cookie, session: result.payload.session };
}

async function loadBootstrap(origin, cookie) {
  const result = await getJson(origin, '/api/bootstrap', { cookie });
  assertOkResponse('Bootstrap', result);
  const learnerId = result.payload?.learners?.selectedId;
  assert.ok(learnerId, 'Bootstrap did not include a selected learner.');
  return {
    payload: result.payload,
    learnerId,
    revision: Number(result.payload?.learners?.byId?.[learnerId]?.stateRevision) || 0,
  };
}

async function subjectCommand({
  origin,
  cookie,
  subjectId,
  learnerId,
  revision,
  command,
  payload = {},
}) {
  const requestId = createRequestId(`${subjectId}-${command}`);
  const result = await postJson(origin, `/api/subjects/${encodeURIComponent(subjectId)}/command`, {
    subjectId,
    learnerId,
    command,
    requestId,
    correlationId: requestId,
    expectedLearnerRevision: revision,
    payload,
  }, { cookie });
  assertOkResponse(`${subjectId} ${command}`, result);
  return {
    payload: result.payload,
    revision: nextRevisionFrom(result.payload, revision),
  };
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
  const bootstrap = await loadBootstrap(origin, demo.cookie);
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
