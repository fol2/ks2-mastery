import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyGrammarAttemptToState,
  buildGrammarMiniSet,
  createInitialGrammarState,
  createServerGrammarEngine,
  grammarConceptStatus,
} from '../worker/src/subjects/grammar/engine.js';
import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  GRAMMAR_CONCEPTS,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import { readGrammarLegacyOracle } from './helpers/grammar-legacy-oracle.js';

test('Grammar legacy oracle fixture pins the reviewed content denominator', () => {
  const oracle = readGrammarLegacyOracle();

  assert.equal(oracle.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
  assert.equal(oracle.conceptCount, 18);
  assert.equal(oracle.templateCount, 51);
  assert.equal(oracle.selectedResponseCount, 31);
  assert.equal(oracle.constructedResponseCount, 20);
  assert.equal(GRAMMAR_CONCEPTS.length, 18);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.length, 51);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((template) => template.isSelectedResponse).length, 31);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((template) => !template.isSelectedResponse).length, 20);
});

test('Grammar content generates serialisable questions matching oracle samples', () => {
  const oracle = readGrammarLegacyOracle();
  const conceptIds = new Set(GRAMMAR_CONCEPTS.map((concept) => concept.id));
  const questionTypes = new Set(Object.keys(oracle.questionTypes));

  for (const sample of oracle.templates) {
    assert.ok(sample.skillIds.length > 0, sample.id);
    assert.ok(sample.skillIds.every((conceptId) => conceptIds.has(conceptId)), sample.id);
    assert.ok(questionTypes.has(sample.questionType), sample.id);

    const question = createGrammarQuestion({
      templateId: sample.id,
      seed: sample.sample.seed,
    });
    const serialised = serialiseGrammarQuestion(question);
    assert.equal(serialised.contentReleaseId, oracle.contentReleaseId, sample.id);
    assert.equal(serialised.templateId, sample.id, sample.id);
    assert.equal(serialised.itemId, sample.sample.itemId, sample.id);
    assert.deepEqual(serialised.skillIds, sample.skillIds, sample.id);
    assert.equal(serialised.promptText, sample.sample.promptText, sample.id);
    assert.equal(typeof question.evaluate, 'function', sample.id);

    const correct = evaluateGrammarQuestion(question, sample.correctResponse);
    assert.deepEqual(correct, sample.correctResult, sample.id);
    assert.doesNotThrow(() => evaluateGrammarQuestion(question, {}), sample.id);
  }
});

test('Grammar mini-set generation covers mixed and focused pools without looping', () => {
  const mixed = buildGrammarMiniSet({ size: 8, seed: 1234 });
  assert.equal(mixed.length, 8);
  assert.ok(mixed.every((item) => item.contentReleaseId === GRAMMAR_CONTENT_RELEASE_ID));

  for (const concept of GRAMMAR_CONCEPTS) {
    const focused = buildGrammarMiniSet({ size: 4, focusConceptId: concept.id, seed: 9001 });
    assert.equal(focused.length, 4, concept.id);
    assert.ok(focused.some((item) => item.skillIds.includes(concept.id)), concept.id);
  }
});

test('Grammar mastery status blocks secured state when a strong concept is due', () => {
  const now = 1_777_000_000_000;
  assert.equal(grammarConceptStatus({
    attempts: 8,
    correct: 8,
    wrong: 0,
    strength: 0.9,
    intervalDays: 10,
    dueAt: now - 1,
    correctStreak: 5,
  }, now), 'due');
});

test('Grammar answer quality gives supported correctness less gain than independent first attempts', () => {
  const templateId = 'fronted_adverbial_choose';
  const seed = 100;
  const question = createGrammarQuestion({ templateId, seed });
  const item = serialiseGrammarQuestion(question);
  const answer = { answer: question.inputSpec.options.find((option) => evaluateGrammarQuestion(question, { answer: option.value }).correct).value };

  const independent = createInitialGrammarState();
  applyGrammarAttemptToState(independent, {
    learnerId: 'learner-a',
    item,
    response: answer,
    supportLevel: 0,
    attempts: 1,
    now: 1_777_000_000_000,
  });

  const supported = createInitialGrammarState();
  applyGrammarAttemptToState(supported, {
    learnerId: 'learner-a',
    item,
    response: answer,
    supportLevel: 1,
    attempts: 1,
    now: 1_777_000_000_000,
  });

  assert.ok(
    independent.mastery.concepts.adverbials.strength > supported.mastery.concepts.adverbials.strength,
  );
});

test('Grammar multi-skill templates update every concept node', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.skillIds.length > 1);
  const state = createInitialGrammarState();
  const item = serialiseGrammarQuestion(createGrammarQuestion({
    templateId: sample.id,
    seed: sample.sample.seed,
  }));

  applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: sample.correctResponse,
    supportLevel: 0,
    attempts: 1,
    now: 1_777_000_000_000,
  });

  for (const conceptId of sample.skillIds) {
    assert.equal(state.mastery.concepts[conceptId].attempts, 1, conceptId);
  }
});

test('Grammar engine rejects stale content release evidence', () => {
  const question = createGrammarQuestion({ templateId: 'fronted_adverbial_choose', seed: 1 });
  const item = {
    ...serialiseGrammarQuestion(question),
    contentReleaseId: 'old-release',
  };

  assert.throws(() => applyGrammarAttemptToState(createInitialGrammarState(), {
    learnerId: 'learner-a',
    item,
    response: {},
  }), (error) => error?.extra?.code === 'grammar_content_release_mismatch');
});

test('Grammar retry queue de-duplicates repeated misses for the same template and seed', () => {
  const state = createInitialGrammarState();
  const question = createGrammarQuestion({ templateId: 'fronted_adverbial_choose', seed: 1 });
  const item = serialiseGrammarQuestion(question);

  for (let count = 0; count < 2; count += 1) {
    applyGrammarAttemptToState(state, {
      learnerId: 'learner-a',
      item,
      response: { answer: 'not the answer' },
      now: 1_777_000_000_000 + count,
    });
  }

  assert.equal(state.retryQueue.length, 1);
  assert.equal(state.retryQueue[0].templateId, 'fronted_adverbial_choose');
});

test('Grammar server engine creates a session, marks an answer, and records summary events', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'question_mark_select');
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-1',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(start.state.phase, 'session');
  assert.equal(start.practiceSession.status, 'active');

  const submit = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-1',
    payload: { response: sample.correctResponse },
  });
  assert.equal(submit.state.phase, 'feedback');
  assert.equal(submit.state.feedback.result.correct, true);
  assert.ok(submit.events.some((event) => event.type === 'grammar.answer-submitted'));

  const done = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: submit.state, data: submit.data },
    latestSession: submit.practiceSession,
    command: 'continue-session',
    requestId: 'continue-1',
    payload: {},
  });
  assert.equal(done.state.phase, 'summary');
  assert.equal(done.practiceSession.status, 'completed');
  assert.ok(done.events.some((event) => event.type === 'grammar.session-completed'));
});
