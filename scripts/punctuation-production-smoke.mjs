#!/usr/bin/env node

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import {
  createPunctuationContentIndexes,
  PUNCTUATION_RELEASE_ID,
} from '../shared/punctuation/content.js';
import { createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';
import {
  assertNoForbiddenObjectKeys,
  assertOkResponse,
  configuredOrigin,
  createDemoSession,
  getJson,
  loadBootstrap,
  subjectCommand,
} from './lib/production-smoke.mjs';
import {
  ALLOWED_PUNCTUATION_ACTIVE_ITEM_METADATA_KEYS as SHARED_ALLOWED_PUNCTUATION_ACTIVE_ITEM_METADATA_KEYS,
  FORBIDDEN_PUNCTUATION_ADULT_EVIDENCE_KEYS as SHARED_FORBIDDEN_PUNCTUATION_ADULT_EVIDENCE_KEYS,
  FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS as SHARED_FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS,
} from '../tests/helpers/forbidden-keys.mjs';

// Sets are built at module load from the shared Array exports. The canonical
// list lives in tests/helpers/forbidden-keys.mjs and is kept aligned with
// worker/src/subjects/punctuation/read-models.js FORBIDDEN_READ_MODEL_KEYS.
// Any new forbidden key must be added in the shared module first; the Worker
// enforces the contract at build time, and the smoke scans enforce it at
// deploy time.
const FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS = new Set(SHARED_FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS);
const FORBIDDEN_PUNCTUATION_ADULT_EVIDENCE_KEYS = new Set(SHARED_FORBIDDEN_PUNCTUATION_ADULT_EVIDENCE_KEYS);
const ALLOWED_PUNCTUATION_ACTIVE_ITEM_METADATA_KEYS = new Set(SHARED_ALLOWED_PUNCTUATION_ACTIVE_ITEM_METADATA_KEYS);
const OPAQUE_VARIANT_SIGNATURE_PATTERN = /^puncsig_[a-z0-9]+$/;

export function assertNoForbiddenPunctuationReadModelKeys(value, path = 'punctuation.subjectReadModel') {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenPunctuationReadModelKeys(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const allowedActiveItemMetadata = ALLOWED_PUNCTUATION_ACTIVE_ITEM_METADATA_KEYS.has(key)
      && path.endsWith('.session.currentItem');
    assert.equal(
      FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS.has(key) && !allowedActiveItemMetadata,
      false,
      `${path}.${key} exposed a server-only field.`,
    );
    assertNoForbiddenPunctuationReadModelKeys(child, `${path}.${key}`);
  }
}

export function assertNoForbiddenPunctuationAdultEvidenceKeys(value, path = 'punctuation.adultEvidence') {
  assertNoForbiddenObjectKeys(value, FORBIDDEN_PUNCTUATION_ADULT_EVIDENCE_KEYS, path);
}

function normaliseSourceOption(option, index) {
  if (option && typeof option === 'object' && !Array.isArray(option)) {
    const optionIndex = Number(option.index);
    return {
      index: Number.isInteger(optionIndex) && optionIndex >= 0 ? optionIndex : index,
      text: typeof option.text === 'string' ? option.text : '',
    };
  }
  return {
    index,
    text: typeof option === 'string' ? option : '',
  };
}

function visibleOptionSet(readItem) {
  assert.ok(Array.isArray(readItem?.options), `${readItem?.id || 'unknown item'} did not expose visible choice options.`);
  return readItem.options.map((option, index) => {
    assert.equal(typeof option?.text, 'string', `${readItem.id} exposed option ${index + 1} without visible text.`);
    assert.equal(Number.isInteger(Number(option?.index)), true, `${readItem.id} exposed option ${index + 1} without a numeric index.`);
    return {
      index: Number(option.index),
      text: option.text,
    };
  });
}

function assertVisiblePunctuationItemMatchesSource(readItem, source, path = 'punctuation.currentItem') {
  assert.equal(readItem?.id, source.id, `${path}.id did not match the source item.`);
  assert.equal(readItem?.mode, source.mode, `${path}.mode did not match the source item.`);
  assert.equal(readItem?.inputKind, source.mode === 'choose' ? 'choice' : 'text', `${path}.inputKind did not match the source item.`);
  assert.equal(readItem?.prompt, source.prompt || '', `${path}.prompt did not match the source item.`);
  assert.equal(readItem?.stem || '', source.stem || '', `${path}.stem did not match the source item.`);
  assert.equal(readItem?.clusterId || null, source.clusterId || null, `${path}.clusterId did not match the source item.`);
  assert.deepEqual(readItem?.skillIds || [], Array.isArray(source.skillIds) ? source.skillIds : [], `${path}.skillIds did not match the source item.`);
  assert.equal(readItem?.source, source.source === 'generated' ? 'generated' : 'fixed', `${path}.source did not match the source item.`);
  if (source.source === 'generated') {
    assert.equal(readItem?.variantSignature, source.variantSignature, `${path}.variantSignature did not match the generated source item.`);
    assert.match(readItem.variantSignature, OPAQUE_VARIANT_SIGNATURE_PATTERN, `${path}.variantSignature was not opaque.`);
  } else {
    assert.equal(Object.hasOwn(readItem || {}, 'variantSignature'), false, `${path}.variantSignature was exposed for a fixed item.`);
  }
  for (const forbiddenKey of ['templateId', 'generatorFamilyId', 'validator', 'validators', 'accepted', 'acceptedAnswers', 'answers', 'rawResponse']) {
    assert.equal(Object.hasOwn(readItem || {}, forbiddenKey), false, `${path}.${forbiddenKey} exposed generated internals.`);
  }

  if (readItem.inputKind === 'choice') {
    const expectedOptions = (Array.isArray(source.options) ? source.options : []).map(normaliseSourceOption);
    assert.deepEqual(visibleOptionSet(readItem), expectedOptions, `${path}.options did not match the source item visible option set.`);
  }
}

export function punctuationAnswerFor(readItem) {
  const manifest = createPunctuationRuntimeManifest();
  const indexes = createPunctuationContentIndexes(manifest);
  const source = indexes.itemById.get(readItem?.id);
  assert.ok(source, `Could not find source punctuation item for ${readItem?.id || 'unknown item'}.`);
  assertVisiblePunctuationItemMatchesSource(readItem, source);

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

export function punctuationExpectedContextFor(session = {}) {
  const context = {};
  if (typeof session.id === 'string' && session.id) context.expectedSessionId = session.id;
  if (typeof session.currentItem?.id === 'string' && session.currentItem.id) {
    context.expectedItemId = session.currentItem.id;
  }
  if (Number.isFinite(Number(session.answeredCount))) {
    context.expectedAnsweredCount = Number(session.answeredCount);
  }
  if (typeof session.releaseId === 'string' && session.releaseId) {
    context.expectedReleaseId = session.releaseId;
  }
  assert.equal(session.releaseId, PUNCTUATION_RELEASE_ID, 'Punctuation session release id did not match the current runtime release.');
  return context;
}

async function smokePunctuationSmartRound({ origin, cookie, learnerId, revision }) {
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
  assertNoForbiddenPunctuationReadModelKeys(startModel, 'punctuation.smart.startModel');

  const currentItem = startModel.session?.currentItem;
  const answer = punctuationAnswerFor(currentItem);
  const expectedContext = punctuationExpectedContextFor(startModel.session);
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: { ...answer, ...expectedContext },
  });
  revision = step.revision;
  const feedbackModel = step.payload.subjectReadModel;
  assert.equal(feedbackModel?.phase, 'feedback', 'Punctuation submit did not return feedback phase.');
  assert.equal(feedbackModel?.feedback?.kind, 'success', `Punctuation smoke answer was not accepted for ${currentItem?.id}.`);
  assertNoForbiddenPunctuationReadModelKeys(feedbackModel, 'punctuation.smart.feedbackModel');

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
  assertNoForbiddenPunctuationReadModelKeys(summaryModel, 'punctuation.smart.summaryModel');

  return {
    revision,
    itemId: currentItem.id,
    summaryTotal: summaryModel.summary.total,
  };
}

async function smokePunctuationGpsReview({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'gps', roundLength: '1' },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.phase, 'active-item', 'Punctuation GPS did not start in active-item phase.');
  assert.equal(startModel?.session?.mode, 'gps', 'Punctuation advanced smoke did not start GPS mode.');
  assert.equal(startModel?.session?.serverAuthority, 'worker', 'Punctuation GPS session was not Worker-owned.');
  assert.equal(startModel?.session?.gps?.delayedFeedback, true, 'Punctuation GPS did not enable delayed feedback.');
  assert.equal(startModel?.feedback, null, 'Punctuation GPS exposed feedback before the test ended.');
  assertNoForbiddenPunctuationReadModelKeys(startModel, 'punctuation.gps.startModel');

  const currentItem = startModel.session?.currentItem;
  const answer = punctuationAnswerFor(currentItem);
  const expectedContext = punctuationExpectedContextFor(startModel.session);
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: { ...answer, ...expectedContext },
  });
  revision = step.revision;
  const summaryModel = step.payload.subjectReadModel;
  assert.equal(summaryModel?.phase, 'summary', 'Punctuation GPS submit did not reach the delayed summary.');
  assert.equal(summaryModel?.summary?.total, 1, 'Punctuation GPS summary did not record one answered item.');
  assert.equal(summaryModel?.summary?.gps?.delayedFeedback, true, 'Punctuation GPS summary did not preserve delayed-feedback metadata.');
  assert.equal(summaryModel?.summary?.gps?.reviewItems?.length, 1, 'Punctuation GPS summary did not include one review row.');
  assert.equal(summaryModel.summary.gps.reviewItems[0]?.itemId, currentItem?.id, 'Punctuation GPS review row did not match the answered item.');
  assertNoForbiddenPunctuationReadModelKeys(summaryModel, 'punctuation.gps.summaryModel');

  return {
    revision,
    itemId: currentItem.id,
    summaryTotal: summaryModel.summary.total,
    reviewItems: summaryModel.summary.gps.reviewItems.length,
  };
}

async function smokePunctuationParentEvidence({ origin, cookie, learnerId }) {
  const result = await getJson(origin, `/api/hubs/parent?learnerId=${encodeURIComponent(learnerId)}`, { cookie });
  assertOkResponse('Parent Hub Punctuation evidence', result);
  const parentHub = result.payload?.parentHub;
  assert.ok(parentHub, 'Parent Hub response did not include a parentHub payload.');
  const evidence = parentHub.punctuationEvidence;
  assert.equal(evidence?.hasEvidence, true, 'Parent Hub did not expose Punctuation evidence after the smoke attempts.');
  assert.ok(
    Number(evidence?.overview?.attempts) >= 2,
    `Parent Hub Punctuation evidence recorded too few attempts: ${evidence?.overview?.attempts}`,
  );
  assert.equal(
    parentHub.progressSnapshots?.some((snapshot) => snapshot?.subjectId === 'punctuation'),
    true,
    'Parent Hub progress snapshots did not include Punctuation.',
  );
  assertNoForbiddenPunctuationAdultEvidenceKeys(evidence, 'parentHub.punctuationEvidence');
  assertNoForbiddenPunctuationAdultEvidenceKeys(parentHub.progressSnapshots, 'parentHub.progressSnapshots');
  assertNoForbiddenPunctuationAdultEvidenceKeys(parentHub.misconceptionPatterns, 'parentHub.misconceptionPatterns');

  return {
    attempts: evidence.overview.attempts,
    accuracyPercent: evidence.overview.accuracyPercent,
    sessionModes: evidence.bySessionMode.map((entry) => entry.id),
  };
}

async function smokePunctuation({ origin, cookie, learnerId, revision }) {
  const smart = await smokePunctuationSmartRound({ origin, cookie, learnerId, revision });
  const advanced = await smokePunctuationGpsReview({
    origin,
    cookie,
    learnerId,
    revision: smart.revision,
  });
  const parentHub = await smokePunctuationParentEvidence({ origin, cookie, learnerId });
  return {
    revision: advanced.revision,
    smart,
    advanced,
    parentHub,
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
      smartItemId: punctuation.smart.itemId,
      smartSummaryTotal: punctuation.smart.summaryTotal,
      advancedMode: 'gps',
      advancedItemId: punctuation.advanced.itemId,
      advancedReviewItems: punctuation.advanced.reviewItems,
      parentHubAttempts: punctuation.parentHub.attempts,
    },
    spelling: {
      progressTotal: spelling.progressTotal,
      hasPromptToken: spelling.hasPromptToken,
    },
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[punctuation-production-smoke] ${error?.stack || error?.message || error}`);
    process.exit(1);
  });
}
