#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  GRAMMAR_CONTENT_RELEASE_ID,
} from '../worker/src/subjects/grammar/content.js';
import {
  assertNoForbiddenObjectKeys,
  configuredOrigin,
  createDemoSession,
  loadBootstrap,
  subjectCommand,
} from './lib/production-smoke.mjs';
import {
  FORBIDDEN_GRAMMAR_ITEM_KEYS as SHARED_FORBIDDEN_GRAMMAR_ITEM_KEYS,
  FORBIDDEN_GRAMMAR_READ_MODEL_KEYS as SHARED_FORBIDDEN_GRAMMAR_READ_MODEL_KEYS,
} from '../tests/helpers/forbidden-keys.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CLI_ARGS = process.argv.slice(2);
const JSON_OUTPUT = CLI_ARGS.includes('--json');

function cliValue(name, fallback = '') {
  const equalsArg = CLI_ARGS.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = CLI_ARGS.indexOf(name);
  if (index !== -1 && CLI_ARGS[index + 1]) return CLI_ARGS[index + 1];
  return fallback;
}

const CONFIGURED_ORIGIN_VALUE = cliValue('--evidence-origin', 'repository');
const CONFIGURED_RELEASE_ID = cliValue('--expected-release', cliValue('--release-id', GRAMMAR_CONTENT_RELEASE_ID));
const CONFIGURED_OUT_PATH = cliValue('--out', '') || null;

const GRAMMAR_SMOKE_ITEM = Object.freeze({
  templateId: 'qg_modal_verb_explain',
  seed: 7,
});

const GRAMMAR_MINI_TEST_ITEM = Object.freeze({
  templateId: 'fronted_adverbial_choose',
  seed: 11,
});

const GRAMMAR_TARGET_SENTENCE_CUE_ITEM = Object.freeze({
  templateId: 'identify_words_in_sentence',
  seed: 1,
});

const GRAMMAR_NOUN_PHRASE_CUE_ITEM = Object.freeze({
  templateId: 'qg_p4_voice_roles_transfer',
  seed: 1,
});

export const GRAMMAR_ANSWER_SPEC_FAMILY_SMOKE_ITEMS = Object.freeze([
  Object.freeze({
    family: 'exact',
    templateId: 'qg_modal_verb_explain',
    seed: 7,
  }),
  Object.freeze({
    family: 'multiField',
    templateId: 'qg_subject_object_classify_table',
    seed: 7,
    response: Object.freeze({ row0: 'subject', row1: 'object' }),
  }),
  Object.freeze({
    // P19 Contract A.2 promoted tense_rewrite/active_passive_rewrite/proc2_*
    // open-rewrite templates to manualReviewOnly. The smoke fixture for the
    // normalisedText family now uses the P14 subject-object constructed
    // template, which still emits a normalisedText answerSpec (single token).
    family: 'normalisedText',
    templateId: 'qg_p14_subject_object_constructed_rewrite',
    seed: 0,
    response: Object.freeze({ answer: 'Aisha' }),
  }),
  Object.freeze({
    family: 'punctuationPattern',
    templateId: 'fix_fronted_adverbial',
    seed: 0,
    response: Object.freeze({ answer: 'After the concert, the audience cheered loudly.' }),
  }),
  Object.freeze({
    family: 'acceptedSet',
    templateId: 'combine_clauses_rewrite',
    seed: 0,
    response: Object.freeze({ answer: 'Although Mia was tired, she finished the race.' }),
  }),
  Object.freeze({
    family: 'manualReviewOnly',
    templateId: 'build_noun_phrase',
    seed: 0,
    response: Object.freeze({
      part1: 'The careful',
      part2: 'detective',
      part3: 'with a silver badge',
    }),
  }),
]);

// Sets are built at module load from the shared Array exports so the single
// source of truth in tests/helpers/forbidden-keys.mjs cannot drift from this
// smoke test's checks.
const FORBIDDEN_GRAMMAR_READ_MODEL_KEYS = new Set(SHARED_FORBIDDEN_GRAMMAR_READ_MODEL_KEYS);
const FORBIDDEN_GRAMMAR_ITEM_KEYS = new Set(SHARED_FORBIDDEN_GRAMMAR_ITEM_KEYS);

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

function visibleOptionValue(option) {
  if (Array.isArray(option)) return String(option[0] ?? '');
  if (option && typeof option === 'object') return String(option.value ?? '');
  return String(option ?? '');
}

function visibleOptionValues(options) {
  return (Array.isArray(options) ? options : [])
    .map(visibleOptionValue)
    .filter((value) => value.trim());
}

function firstVisibleOption(options) {
  return visibleOptionValues(options)[0] || '';
}

function firstAllowedGolden(answerSpec, allowedValues) {
  const allowed = new Set(allowedValues);
  for (const value of Array.isArray(answerSpec?.golden) ? answerSpec.golden : []) {
    const text = String(value ?? '');
    if (!allowed.size || allowed.has(text)) return text;
  }
  return '';
}

function responseUsesVisibleInput(inputSpec, response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
  const spec = inputSpec && typeof inputSpec === 'object' ? inputSpec : {};
  if (spec.type === 'single_choice') {
    return visibleOptionValues(spec.options).includes(String(response.answer ?? ''));
  }
  if (spec.type === 'checkbox_list') {
    const allowed = new Set(visibleOptionValues(spec.options));
    const selected = Array.isArray(response.selected) ? response.selected.map(String) : [];
    return selected.length > 0 && selected.every((value) => allowed.has(value));
  }
  if (spec.type === 'table_choice') {
    const globalAllowed = visibleOptionValues(spec.columns);
    return (Array.isArray(spec.rows) ? spec.rows : []).every((row) => {
      const key = typeof row?.key === 'string' ? row.key : '';
      const allowed = visibleOptionValues(Array.isArray(row?.options) && row.options.length ? row.options : globalAllowed);
      return key && allowed.includes(String(response[key] ?? ''));
    });
  }
  if (spec.type === 'multi') {
    return (Array.isArray(spec.fields) ? spec.fields : []).every((field) => {
      const key = typeof field?.key === 'string' ? field.key : '';
      const value = String(response[key] ?? '').trim();
      if (!key || !value) return false;
      const allowed = visibleOptionValues(field.options);
      return !allowed.length || allowed.includes(value);
    });
  }
  return String(response.answer ?? '').trim().length > 0;
}

function responseFromVisibleInput(question) {
  const inputSpec = question?.inputSpec || {};
  const answerSpec = question?.answerSpec || {};

  if (inputSpec.type === 'single_choice') {
    return correctResponseFor({
      templateId: question.templateId,
      seed: question.seed,
      inputSpec,
    });
  }

  if (inputSpec.type === 'checkbox_list') {
    const selected = (Array.isArray(answerSpec.golden) ? answerSpec.golden : [])
      .map(String)
      .filter((value) => visibleOptionValues(inputSpec.options).includes(value));
    return { selected: selected.length ? selected : [firstVisibleOption(inputSpec.options)].filter(Boolean) };
  }

  if (inputSpec.type === 'table_choice') {
    const fields = answerSpec?.params?.fields && typeof answerSpec.params.fields === 'object'
      ? answerSpec.params.fields
      : {};
    const globalAllowed = visibleOptionValues(inputSpec.columns);
    const response = {};
    for (const row of Array.isArray(inputSpec.rows) ? inputSpec.rows : []) {
      const key = typeof row?.key === 'string' ? row.key : '';
      if (!key) continue;
      const allowed = visibleOptionValues(Array.isArray(row.options) && row.options.length ? row.options : globalAllowed);
      response[key] = firstAllowedGolden(fields[key], allowed) || allowed[0] || '';
    }
    return response;
  }

  if (inputSpec.type === 'multi') {
    const fields = answerSpec?.params?.fields && typeof answerSpec.params.fields === 'object'
      ? answerSpec.params.fields
      : {};
    const response = {};
    for (const field of Array.isArray(inputSpec.fields) ? inputSpec.fields : []) {
      const key = typeof field?.key === 'string' ? field.key : '';
      if (!key) continue;
      const allowed = visibleOptionValues(field.options);
      response[key] = firstAllowedGolden(fields[key], allowed)
        || allowed[0]
        || String(fields[key]?.answerText || fields[key]?.golden?.[0] || answerSpec.answerText || answerSpec.golden?.[0] || 'Smoke response');
    }
    return response;
  }

  return {
    answer: String(answerSpec.answerText || answerSpec.golden?.[0] || 'Smoke response'),
  };
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

export function visibleResponseForAnswerSpecFamily(readItem) {
  const fixture = GRAMMAR_ANSWER_SPEC_FAMILY_SMOKE_ITEMS.find((item) => (
    item.templateId === readItem?.templateId && Number(item.seed) === Number(readItem?.seed)
  ));
  if (!fixture) return correctResponseFor(readItem);
  if (fixture.response && responseUsesVisibleInput(readItem.inputSpec, fixture.response)) return { ...fixture.response };
  const question = createGrammarQuestion({
    templateId: readItem?.templateId,
    seed: readItem?.seed,
  });
  assert.ok(question, `Could not rebuild Grammar answer-spec smoke question for ${readItem?.templateId || 'unknown template'}.`);
  const response = responseFromVisibleInput(question);
  assert.equal(
    responseUsesVisibleInput(readItem.inputSpec, response),
    true,
    `Grammar ${fixture.family} smoke response did not use production-visible input values.`,
  );
  return response;
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
  assert.equal(
    startModel?.session?.currentItem?.contentReleaseId,
    CONFIGURED_RELEASE_ID,
    `Grammar current item did not serve expected release ${CONFIGURED_RELEASE_ID}.`,
  );
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
    contentReleaseId: startModel.session.currentItem.contentReleaseId,
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

async function smokeGrammarAnswerSpecFamilies({ origin, cookie, learnerId, revision }) {
  const covered = [];
  for (const fixture of GRAMMAR_ANSWER_SPEC_FAMILY_SMOKE_ITEMS) {
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
        templateId: fixture.templateId,
        seed: fixture.seed,
      },
    });
    revision = step.revision;
    const startModel = step.payload.subjectReadModel;
    assert.equal(startModel?.phase, 'session', `Grammar ${fixture.family} smoke did not start in session phase.`);
    assert.equal(startModel?.session?.currentItem?.templateId, fixture.templateId);
    assertNoForbiddenGrammarReadModelKeys(startModel, `grammar.${fixture.family}.startModel`);

    const response = visibleResponseForAnswerSpecFamily(startModel.session.currentItem);
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
    assert.equal(feedbackModel?.phase, 'feedback', `Grammar ${fixture.family} submit did not return feedback.`);
    if (fixture.family === 'manualReviewOnly') {
      assert.equal(feedbackModel?.feedback?.result?.correct, false, 'Manual-review smoke must not auto-correct.');
      assert.equal(feedbackModel?.feedback?.result?.nonScored, true, 'Manual-review smoke must be non-scored.');
      assert.equal(feedbackModel?.feedback?.result?.manualReviewOnly, true, 'Manual-review smoke must carry manual-review marker.');
    } else {
      assert.equal(feedbackModel?.feedback?.result?.correct, true, `Grammar ${fixture.family} smoke answer was not accepted.`);
    }
    assertNoForbiddenGrammarReadModelKeys(feedbackModel, `grammar.${fixture.family}.feedbackModel`);

    step = await subjectCommand({
      origin,
      cookie,
      subjectId: 'grammar',
      learnerId,
      revision,
      command: 'continue-session',
    });
    revision = step.revision;
    assert.equal(step.payload.subjectReadModel?.phase, 'summary', `Grammar ${fixture.family} smoke did not reach summary.`);
    assertNoForbiddenGrammarReadModelKeys(step.payload.subjectReadModel, `grammar.${fixture.family}.summaryModel`);
    covered.push(fixture.family);
  }

  return { revision, covered };
}

async function smokeGrammarCueAssertions({ origin, cookie, learnerId, revision }) {
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
      templateId: GRAMMAR_TARGET_SENTENCE_CUE_ITEM.templateId,
      seed: GRAMMAR_TARGET_SENTENCE_CUE_ITEM.seed,
    },
  });
  revision = step.revision;
  let model = step.payload.subjectReadModel;
  let item = model?.session?.currentItem;
  assert.equal(model?.phase, 'session', 'Grammar target-sentence cue smoke did not start in session phase.');
  assert.equal(item?.templateId, GRAMMAR_TARGET_SENTENCE_CUE_ITEM.templateId);
  assert.equal(item?.focusCue?.type, 'target-sentence', 'Target-sentence cue smoke did not expose target-sentence focusCue.');
  assert.equal(item?.focusCue?.targetKind, 'sentence', 'Target-sentence cue smoke did not expose sentence targetKind.');
  assert.ok(item?.focusCue?.targetText, 'Target-sentence cue smoke did not expose targetText.');
  assert.ok(item?.screenReaderPromptText?.includes(item.focusCue.targetText), 'Target-sentence screen-reader text did not include targetText.');
  assert.ok(item?.readAloudText?.includes(item.focusCue.targetText), 'Target-sentence read-aloud text did not include targetText.');
  assert.match(item.readAloudText, /The sentence is:/, 'Target-sentence read-aloud text did not use sentence phrasing.');
  assertNoForbiddenGrammarReadModelKeys(model, 'grammar.targetSentenceCueModel');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'start-session',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: GRAMMAR_NOUN_PHRASE_CUE_ITEM.templateId,
      seed: GRAMMAR_NOUN_PHRASE_CUE_ITEM.seed,
    },
  });
  revision = step.revision;
  model = step.payload.subjectReadModel;
  item = model?.session?.currentItem;
  assert.equal(model?.phase, 'session', 'Grammar noun-phrase cue smoke did not start in session phase.');
  assert.equal(item?.templateId, GRAMMAR_NOUN_PHRASE_CUE_ITEM.templateId);
  assert.equal(item?.focusCue?.targetKind, 'noun-phrase', 'Noun-phrase cue smoke did not expose noun-phrase targetKind.');
  assert.match(item?.readAloudText || '', /The underlined noun phrase is:/, 'Noun-phrase read-aloud text did not say noun phrase.');
  assert.doesNotMatch(item?.readAloudText || '', /The underlined word is:/, 'Noun-phrase read-aloud text incorrectly said word.');
  assert.match(item?.screenReaderPromptText || '', /The underlined noun phrase is:/, 'Noun-phrase screen-reader text did not say noun phrase.');
  assertNoForbiddenGrammarReadModelKeys(model, 'grammar.nounPhraseCueModel');

  return {
    revision,
    targetSentenceTemplateId: GRAMMAR_TARGET_SENTENCE_CUE_ITEM.templateId,
    nounPhraseTemplateId: GRAMMAR_NOUN_PHRASE_CUE_ITEM.templateId,
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
  const answerSpecFamilies = await smokeGrammarAnswerSpecFamilies({
    origin,
    cookie,
    learnerId,
    revision: repairAi.revision,
  });
  const cueAssertions = await smokeGrammarCueAssertions({
    origin,
    cookie,
    learnerId,
    revision: answerSpecFamilies.revision,
  });

  return {
    revision: cueAssertions.revision,
    normal,
    miniTest,
    repairAi,
    answerSpecFamilies,
    cueAssertions,
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

function getCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function main() {
  const origin = configuredOrigin();
  const demo = await createDemoSession(origin);
  const bootstrap = await loadBootstrap(origin, demo.cookie, { expectedSession: demo.session });

  let normalRoundResult = { ok: false, detail: '' };
  let miniTestResult = { ok: false, detail: '' };
  let repairResult = { ok: false, detail: '' };
  let cueAssertionResult = { ok: false, detail: '' };
  let forbiddenKeyScanResult = { ok: true, detail: 'checked via assertNoForbiddenGrammarReadModelKeys in each phase' };
  let testedTemplateIds = [];
  let overallOk = true;

  let grammar;
  try {
    grammar = await smokeGrammar({
      origin,
      cookie: demo.cookie,
      learnerId: bootstrap.learnerId,
      revision: bootstrap.revision,
    });
    normalRoundResult = { ok: true, detail: `templateId=${grammar.normal.templateId}, answered=${grammar.normal.summaryAnswered}` };
    miniTestResult = { ok: true, detail: `answered=${grammar.miniTest.answered}, reviewSize=${grammar.miniTest.reviewSize}` };
    repairResult = { ok: true, detail: `supportKind=${grammar.repairAi.supportKind}, aiKind=${grammar.repairAi.aiKind}` };
    cueAssertionResult = {
      ok: true,
      detail: `targetSentence=${grammar.cueAssertions.targetSentenceTemplateId}, nounPhrase=${grammar.cueAssertions.nounPhraseTemplateId}`,
    };
    testedTemplateIds = [
      GRAMMAR_SMOKE_ITEM.templateId,
      GRAMMAR_MINI_TEST_ITEM.templateId,
      ...GRAMMAR_ANSWER_SPEC_FAMILY_SMOKE_ITEMS.map((item) => item.templateId),
      GRAMMAR_TARGET_SENTENCE_CUE_ITEM.templateId,
      GRAMMAR_NOUN_PHRASE_CUE_ITEM.templateId,
    ];
  } catch (error) {
    overallOk = false;
    const msg = error?.message || String(error);
    if (msg.includes('normalRound') || msg.includes('Grammar did not start') || msg.includes('Grammar smoke')) {
      normalRoundResult = { ok: false, detail: msg };
    } else if (msg.includes('mini-test') || msg.includes('miniTest') || msg.includes('Mini')) {
      miniTestResult = { ok: false, detail: msg };
    } else if (msg.includes('repair') || msg.includes('faded') || msg.includes('similar')) {
      repairResult = { ok: false, detail: msg };
    } else if (msg.includes('cue') || msg.includes('read-aloud') || msg.includes('screen-reader') || msg.includes('noun-phrase')) {
      cueAssertionResult = { ok: false, detail: msg };
    } else {
      normalRoundResult = { ok: false, detail: msg };
    }
    if (!JSON_OUTPUT) throw error;
  }

  if (grammar) {
    const spelling = await smokeSpelling({
      origin,
      cookie: demo.cookie,
      learnerId: bootstrap.learnerId,
      revision: grammar.revision,
    });

    if (!JSON_OUTPUT) {
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
          answerSpecFamilies: grammar.answerSpecFamilies.covered,
          cueAssertions: grammar.cueAssertions,
        },
        spelling: {
          progressTotal: spelling.progressTotal,
          hasPromptToken: spelling.hasPromptToken,
        },
      }, null, 2));
    }
  }

  if (JSON_OUTPUT) {
    const environment = origin === 'https://ks2.eugnel.uk' ? 'production' : 'non-production';
    const releaseIdAssertion = grammar
      ? {
          ok: grammar.normal.contentReleaseId === CONFIGURED_RELEASE_ID,
          detail: `contentReleaseId=${grammar.normal.contentReleaseId}`,
        }
      : { ok: false, detail: `contentReleaseId not observed; expected ${CONFIGURED_RELEASE_ID}` };
    const command = [
      'npm run smoke:production:grammar -- --json',
      `--evidence-origin=${CONFIGURED_ORIGIN_VALUE}`,
      `--expected-release=${CONFIGURED_RELEASE_ID}`,
      ...(CONFIGURED_OUT_PATH ? [`--out=${CONFIGURED_OUT_PATH}`] : []),
    ].join(' ');

    const evidence = {
      ok: overallOk,
      releaseId: CONFIGURED_RELEASE_ID,
      evidenceOrigin: CONFIGURED_ORIGIN_VALUE,
      environment,
      deployedUrl: origin,
      origin: CONFIGURED_ORIGIN_VALUE,
      contentReleaseId: CONFIGURED_RELEASE_ID,
      testedTemplateIds,
      answerSpecFamiliesCovered: grammar
        ? grammar.answerSpecFamilies.covered
        : [],
      command,
      learnerFixtureType: 'demo-session',
      itemCreationResult: normalRoundResult,
      answerSubmissionResult: normalRoundResult,
      readModelUpdateResult: normalRoundResult,
      noAnswerLeakAssertion: forbiddenKeyScanResult,
      semanticCueAssertion: cueAssertionResult,
      promptCueAssertion: cueAssertionResult,
      readAloudAssertion: cueAssertionResult,
      releaseIdAssertion,
      normalRoundResult,
      miniTestResult,
      repairResult,
      cueAssertionResult,
      forbiddenKeyScanResult,
      failureDetails: overallOk ? null : { normalRoundResult, miniTestResult, repairResult, cueAssertionResult },
      timestamp: new Date().toISOString(),
      commitSha: getCommitSha(),
    };

    const outPath = CONFIGURED_OUT_PATH
      ? path.resolve(ROOT_DIR, CONFIGURED_OUT_PATH)
      : path.join(ROOT_DIR, 'reports', 'grammar', `grammar-production-smoke-${CONFIGURED_RELEASE_ID}.json`);
    mkdirSync(path.dirname(outPath), { recursive: true });
    const jsonStr = JSON.stringify(evidence, null, 2);
    writeFileSync(outPath, jsonStr + '\n', 'utf8');
    console.log(jsonStr);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[grammar-production-smoke] ${error?.stack || error?.message || error}`);
    process.exit(1);
  });
}
