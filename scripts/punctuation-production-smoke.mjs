#!/usr/bin/env node

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import {
  createPunctuationContentIndexes,
  PUNCTUATION_RELEASE_ID,
} from '../shared/punctuation/content.js';
import { createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
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
const PRODUCTION_GENERATED_PER_FAMILY = 4;
const LIST_COMMA_VALIDATOR_TYPES = new Set(['requiresListCommas', 'combineListSentence']);

export const PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS = Object.freeze({
  releaseId: PUNCTUATION_RELEASE_ID,
  fixedItemCount: 92,
  generatedItemCount: 100,
  runtimeItemCount: 192,
  publishedRewardUnits: 14,
  generatedPerFamily: PRODUCTION_GENERATED_PER_FAMILY,
});

export const PUNCTUATION_DASH_POLICY_VARIANTS = Object.freeze([
  Object.freeze({ id: 'spaced-hyphen', label: 'spaced hyphen', mark: '-' }),
  Object.freeze({ id: 'en-dash', label: 'en dash', mark: '–' }),
  Object.freeze({ id: 'em-dash', label: 'em dash', mark: '—' }),
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createProductionPunctuationRuntimeManifest() {
  return createPunctuationRuntimeManifest({
    generatedPerFamily: PRODUCTION_GENERATED_PER_FAMILY,
  });
}

export function punctuationRuntimeStatsForSmoke({
  manifest = createProductionPunctuationRuntimeManifest(),
} = {}) {
  const indexes = createPunctuationContentIndexes(manifest);
  return {
    releaseId: manifest.releaseId || PUNCTUATION_RELEASE_ID,
    fixedItemCount: indexes.items.filter((item) => item.source !== 'generated').length,
    generatedItemCount: indexes.items.filter((item) => item.source === 'generated').length,
    runtimeItemCount: indexes.items.length,
    publishedRewardUnits: indexes.publishedRewardUnits.length,
    generatedPerFamily: PRODUCTION_GENERATED_PER_FAMILY,
  };
}

export function punctuationObservedRuntimeStats(readModel) {
  return {
    releaseId: readModel?.content?.releaseId || null,
    runtimeItems: Number(readModel?.stats?.total) || 0,
    publishedRewardUnits: Number(readModel?.stats?.publishedRewardUnits) || 0,
  };
}

export function assertPunctuationP2RuntimeStats(readModel, path = 'punctuation.subjectReadModel') {
  assert.deepEqual(
    punctuationRuntimeStatsForSmoke(),
    PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS,
    'Local P2 release-manifest expectations no longer match the production runtime manifest.',
  );
  const observed = punctuationObservedRuntimeStats(readModel);
  assert.equal(observed.releaseId, PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.releaseId, `${path}.content.releaseId did not match P2.`);
  assert.equal(
    Number(readModel?.content?.publishedRewardUnitCount),
    PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.publishedRewardUnits,
    `${path}.content.publishedRewardUnitCount did not match P2.`,
  );
  assert.equal(
    observed.runtimeItems,
    PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.runtimeItemCount,
    `${path}.stats.total did not match the P2 runtime item count.`,
  );
  assert.equal(
    observed.publishedRewardUnits,
    PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.publishedRewardUnits,
    `${path}.stats.publishedRewardUnits did not preserve the P2 reward denominator.`,
  );
  return observed;
}

function isAllowedActiveCurrentItemMetadata({ key, child, parent, pathSegments, rootPhase }) {
  return ALLOWED_PUNCTUATION_ACTIVE_ITEM_METADATA_KEYS.has(key)
    && rootPhase === 'active-item'
    && pathSegments.length === 2
    && pathSegments[0] === 'session'
    && pathSegments[1] === 'currentItem'
    && isPlainObject(parent)
    && parent.source === 'generated'
    && typeof child === 'string'
    && OPAQUE_VARIANT_SIGNATURE_PATTERN.test(child);
}

function assertNoForbiddenPunctuationReadModelKeysAt(value, { path, pathSegments, rootPhase }) {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenPunctuationReadModelKeysAt(entry, {
      path: `${path}[${index}]`,
      pathSegments: [...pathSegments, `[${index}]`],
      rootPhase,
    }));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const allowedActiveItemMetadata = isAllowedActiveCurrentItemMetadata({
      key,
      child,
      parent: value,
      pathSegments,
      rootPhase,
    });
    assert.equal(
      FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS.has(key) && !allowedActiveItemMetadata,
      false,
      `${path}.${key} exposed a server-only field.`,
    );
    assertNoForbiddenPunctuationReadModelKeysAt(child, {
      path: `${path}.${key}`,
      pathSegments: [...pathSegments, key],
      rootPhase,
    });
  }
}

export function assertNoForbiddenPunctuationReadModelKeys(value, path = 'punctuation.subjectReadModel', context = {}) {
  const rootPhase = context.rootPhase || (isPlainObject(value) && typeof value.phase === 'string' ? value.phase : null);
  assertNoForbiddenPunctuationReadModelKeysAt(value, {
    path,
    pathSegments: [],
    rootPhase,
  });
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

export function punctuationSourceFor(readItem) {
  const manifest = createProductionPunctuationRuntimeManifest();
  const indexes = createPunctuationContentIndexes(manifest);
  const source = indexes.itemById.get(readItem?.id);
  assert.ok(source, `Could not find source punctuation item for ${readItem?.id || 'unknown item'}.`);
  return source;
}

export function punctuationAnswerFor(readItem) {
  const source = punctuationSourceFor(readItem);
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

export function punctuationWrongAnswerFor(readItem) {
  if (readItem?.inputKind === 'choice') {
    const options = visibleOptionSet(readItem);
    return { choiceIndex: options.at(-1)?.index ?? 99 };
  }
  const stem = typeof readItem?.stem === 'string' ? readItem.stem.trim() : '';
  return { typed: stem || 'This answer is deliberately wrong.' };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function dashVariantAnswerFor(source, mark = '–') {
  if (!source?.skillIds?.includes('dash_clause')) return '';
  if (source.mode === 'choose') return '';
  if (typeof source.model !== 'string' || !/\s[–—-]\s/.test(source.model)) return '';
  return source.model.replace(/\s[–—-]\s/g, ` ${mark} `);
}

export function oxfordCommaAnswerFor(source) {
  const validator = source?.validator;
  if (!isPlainObject(validator) || !LIST_COMMA_VALIDATOR_TYPES.has(validator.type)) return '';
  if (validator.allowFinalComma === false) return '';
  const items = Array.isArray(validator.items)
    ? validator.items.filter((entry) => typeof entry === 'string' && entry)
    : [];
  if (items.length < 3 || typeof source.model !== 'string') return '';
  const penultimate = items.at(-2);
  const last = items.at(-1);
  const pattern = new RegExp(`\\b${escapeRegExp(penultimate)}\\s+and\\s+${escapeRegExp(last)}\\b`);
  const answer = source.model.replace(pattern, `${penultimate}, and ${last}`);
  return answer !== source.model ? answer : '';
}

export function assertPunctuationSourceAcceptsAnswer(source, answer, label = source?.id || 'punctuation item') {
  const result = markPunctuationAnswer({ item: source, answer });
  assert.equal(result.correct, true, `${label} was not accepted by deterministic marking: ${JSON.stringify(result)}`);
  return result;
}

export function assertGeneratedActiveItemPolicy(readItem, path = 'punctuation.currentItem') {
  const source = punctuationSourceFor(readItem);
  assert.equal(readItem?.source, 'generated', `${path}.source was not generated.`);
  assert.equal(source.source, 'generated', `${path} source item was not generated.`);
  assertVisiblePunctuationItemMatchesSource(readItem, source, path);
  return source;
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
  const observedRuntimeStats = assertPunctuationP2RuntimeStats(startModel, 'punctuation.smart.startModel');
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
  assertPunctuationP2RuntimeStats(feedbackModel, 'punctuation.smart.feedbackModel');
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
  assertPunctuationP2RuntimeStats(summaryModel, 'punctuation.smart.summaryModel');
  assert.equal(summaryModel?.phase, 'summary', 'Punctuation continue did not reach summary.');
  assert.equal(summaryModel?.summary?.total, 1, 'Punctuation summary did not record one answered item.');
  assertNoForbiddenPunctuationReadModelKeys(summaryModel, 'punctuation.smart.summaryModel');

  return {
    revision,
    observedRuntimeStats,
    itemId: currentItem.id,
    summaryTotal: summaryModel.summary.total,
  };
}

async function startPunctuationSearchSession({
  origin,
  cookie,
  learnerId,
  revision,
  sessionOptions,
  label,
}) {
  const step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'start-session',
    payload: sessionOptions,
  });
  const model = step.payload.subjectReadModel;
  assertPunctuationP2RuntimeStats(model, `punctuation.${label}.startModel`);
  assert.equal(model?.phase, 'active-item', `Punctuation ${label} did not start in active-item phase.`);
  assert.equal(model?.session?.serverAuthority, 'worker', `Punctuation ${label} session was not Worker-owned.`);
  assert.equal(model?.session?.releaseId, PUNCTUATION_RELEASE_ID, `Punctuation ${label} session release id did not match P2.`);
  assertNoForbiddenPunctuationReadModelKeys(model, `punctuation.${label}.startModel`);
  return {
    revision: step.revision,
    model,
  };
}

function seenItemLabel(entry) {
  return `${entry.itemId}:${entry.source}:${entry.mode}:${entry.skills.join('+')}`;
}

async function smokePunctuationTargetedAnswer({
  origin,
  cookie,
  learnerId,
  revision,
  label,
  sessionOptions,
  predicate,
  answerForTarget,
  expectedFeedbackKind = 'success',
  maxAnsweredItems = 18,
  afterSubmit = null,
}) {
  let search = await startPunctuationSearchSession({
    origin,
    cookie,
    learnerId,
    revision,
    sessionOptions,
    label,
  });
  revision = search.revision;
  let model = search.model;
  const seen = [];
  let answeredItems = 0;

  while (answeredItems < maxAnsweredItems) {
    assertPunctuationP2RuntimeStats(model, `punctuation.${label}.model`);
    assertNoForbiddenPunctuationReadModelKeys(model, `punctuation.${label}.model`);

    if (model?.phase === 'summary') {
      search = await startPunctuationSearchSession({
        origin,
        cookie,
        learnerId,
        revision,
        sessionOptions,
        label,
      });
      revision = search.revision;
      model = search.model;
      continue;
    }

    if (model?.phase === 'feedback') {
      const continued = await subjectCommand({
        origin,
        cookie,
        subjectId: 'punctuation',
        learnerId,
        revision,
        command: 'continue-session',
      });
      revision = continued.revision;
      model = continued.payload.subjectReadModel;
      continue;
    }

    assert.equal(model?.phase, 'active-item', `Punctuation ${label} reached unexpected phase ${model?.phase}.`);
    const currentItem = model.session?.currentItem;
    const source = punctuationSourceFor(currentItem);
    assertVisiblePunctuationItemMatchesSource(currentItem, source, `punctuation.${label}.currentItem`);
    seen.push({
      itemId: currentItem.id,
      source: currentItem.source,
      mode: currentItem.mode,
      skills: currentItem.skillIds || [],
    });

    const matches = predicate({ readItem: currentItem, source, model });
    const answer = matches
      ? answerForTarget({ readItem: currentItem, source, model })
      : punctuationAnswerFor(currentItem);
    const expectedContext = punctuationExpectedContextFor(model.session);
    const submitted = await subjectCommand({
      origin,
      cookie,
      subjectId: 'punctuation',
      learnerId,
      revision,
      command: 'submit-answer',
      payload: { ...answer, ...expectedContext },
    });
    revision = submitted.revision;
    const feedbackModel = submitted.payload.subjectReadModel;
    assertPunctuationP2RuntimeStats(feedbackModel, `punctuation.${label}.feedbackModel`);
    assertNoForbiddenPunctuationReadModelKeys(feedbackModel, `punctuation.${label}.feedbackModel`);
    answeredItems += 1;

    if (matches) {
      assert.equal(feedbackModel?.phase, 'feedback', `Punctuation ${label} did not return feedback for target item.`);
      assert.equal(
        feedbackModel?.feedback?.kind,
        expectedFeedbackKind,
        `Punctuation ${label} feedback kind did not match ${expectedFeedbackKind}.`,
      );
      if (afterSubmit) {
        afterSubmit({
          readItem: currentItem,
          source,
          answer,
          step: submitted,
          feedbackModel,
        });
      }
      return {
        revision,
        itemId: currentItem.id,
        source: currentItem.source,
        mode: currentItem.mode,
        skillIds: currentItem.skillIds || [],
        feedbackKind: feedbackModel.feedback.kind,
        misconceptionTags: feedbackModel.feedback.misconceptionTags || [],
        seenItems: seen.map(seenItemLabel),
      };
    }

    model = feedbackModel;
  }

  throw new Error(
    `Punctuation ${label} did not find a matching item after ${answeredItems} answered items. `
      + `Seen: ${seen.map(seenItemLabel).join(', ')}`,
  );
}

async function smokePunctuationGeneratedIncorrect({ origin, cookie, learnerId, revision }) {
  return smokePunctuationTargetedAnswer({
    origin,
    cookie,
    learnerId,
    revision,
    label: 'generatedIncorrect',
    sessionOptions: { mode: 'speech', roundLength: '2' },
    predicate: ({ readItem, source }) => readItem?.source === 'generated' && source.source === 'generated' && readItem.inputKind === 'text',
    answerForTarget: ({ readItem, source }) => {
      const answer = punctuationWrongAnswerFor(readItem);
      const result = markPunctuationAnswer({ item: source, answer });
      assert.equal(result.correct, false, `Generated wrong-answer probe unexpectedly marked ${source.id} correct.`);
      assert.ok(result.misconceptionTags.length > 0, `Generated wrong-answer probe produced no misconception tags for ${source.id}.`);
      return answer;
    },
    expectedFeedbackKind: 'error',
    afterSubmit: ({ readItem, source, step, feedbackModel }) => {
      assertGeneratedActiveItemPolicy(readItem, 'punctuation.generatedIncorrect.currentItem');
      assert.ok(
        feedbackModel.feedback.misconceptionTags.length > 0,
        `Generated incorrect answer for ${source.id} produced no feedback misconception tags.`,
      );
      assert.equal(
        step.payload.domainEvents?.some((event) => (
          event.type === 'punctuation.misconception-observed'
          && event.itemId === source.id
        )),
        true,
        `Generated incorrect answer for ${source.id} did not emit misconception evidence.`,
      );
      for (const event of step.payload.domainEvents || []) {
        assert.equal(Object.hasOwn(event, 'templateId'), false, 'Generated misconception evidence exposed templateId.');
        assert.equal(Object.hasOwn(event, 'acceptedAnswers'), false, 'Generated misconception evidence exposed acceptedAnswers.');
        assert.equal(Object.hasOwn(event, 'validator'), false, 'Generated misconception evidence exposed validator.');
      }
    },
  });
}

async function smokePunctuationDashAcceptance({ origin, cookie, learnerId, revision }) {
  const results = [];
  let currentRevision = revision;
  for (const variant of PUNCTUATION_DASH_POLICY_VARIANTS) {
    const result = await smokePunctuationTargetedAnswer({
      origin,
      cookie,
      learnerId,
      revision: currentRevision,
      label: `dashAcceptance.${variant.id}`,
      sessionOptions: { mode: 'boundary', roundLength: '6' },
      predicate: ({ source }) => Boolean(dashVariantAnswerFor(source, variant.mark)),
      answerForTarget: ({ source }) => {
        const typed = dashVariantAnswerFor(source, variant.mark);
        assertPunctuationSourceAcceptsAnswer(source, { typed }, `${source.id} ${variant.label}`);
        return { typed };
      },
      expectedFeedbackKind: 'success',
    });
    currentRevision = result.revision;
    results.push({
      variant: variant.id,
      itemId: result.itemId,
      mode: result.mode,
      skillIds: result.skillIds,
    });
  }
  return {
    revision: currentRevision,
    variants: results,
  };
}

async function smokePunctuationOxfordCommaAcceptance({ origin, cookie, learnerId, revision }) {
  return smokePunctuationTargetedAnswer({
    origin,
    cookie,
    learnerId,
    revision,
    label: 'oxfordCommaAcceptance',
    sessionOptions: { mode: 'comma_flow', roundLength: '6' },
    predicate: ({ source }) => Boolean(oxfordCommaAnswerFor(source)),
    answerForTarget: ({ source }) => {
      const typed = oxfordCommaAnswerFor(source);
      assertPunctuationSourceAcceptsAnswer(source, { typed }, `${source.id} Oxford comma`);
      return { typed };
    },
    expectedFeedbackKind: 'success',
    maxAnsweredItems: 24,
  });
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
  assertPunctuationP2RuntimeStats(startModel, 'punctuation.gps.startModel');
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
  assertPunctuationP2RuntimeStats(summaryModel, 'punctuation.gps.summaryModel');
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
  const generatedIncorrect = await smokePunctuationGeneratedIncorrect({
    origin,
    cookie,
    learnerId,
    revision: smart.revision,
  });
  const dashAcceptance = await smokePunctuationDashAcceptance({
    origin,
    cookie,
    learnerId,
    revision: generatedIncorrect.revision,
  });
  const oxfordCommaAcceptance = await smokePunctuationOxfordCommaAcceptance({
    origin,
    cookie,
    learnerId,
    revision: dashAcceptance.revision,
  });
  const advanced = await smokePunctuationGpsReview({
    origin,
    cookie,
    learnerId,
    revision: oxfordCommaAcceptance.revision,
  });
  const parentHub = await smokePunctuationParentEvidence({ origin, cookie, learnerId });
  return {
    revision: advanced.revision,
    smart,
    generatedIncorrect,
    dashAcceptance,
    oxfordCommaAcceptance,
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
      productionObserved: {
        ...punctuation.smart.observedRuntimeStats,
        generatedItemCommandPathProbe: {
          itemId: punctuation.generatedIncorrect.itemId,
          mode: punctuation.generatedIncorrect.mode,
          skillIds: punctuation.generatedIncorrect.skillIds,
          feedbackKind: punctuation.generatedIncorrect.feedbackKind,
          misconceptionTags: punctuation.generatedIncorrect.misconceptionTags,
        },
      },
      localReleaseManifestExpectation: {
        fixedItems: PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.fixedItemCount,
        generatedItems: PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.generatedItemCount,
        generatedPerFamily: PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.generatedPerFamily,
        runtimeItems: PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.runtimeItemCount,
        publishedRewardUnits: PUNCTUATION_P2_LOCAL_RELEASE_MANIFEST_EXPECTATIONS.publishedRewardUnits,
      },
      smartItemId: punctuation.smart.itemId,
      smartSummaryTotal: punctuation.smart.summaryTotal,
      generatedIncorrectItemId: punctuation.generatedIncorrect.itemId,
      generatedIncorrectMisconceptionTags: punctuation.generatedIncorrect.misconceptionTags,
      dashAcceptance: punctuation.dashAcceptance.variants,
      oxfordCommaItemId: punctuation.oxfordCommaAcceptance.itemId,
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
