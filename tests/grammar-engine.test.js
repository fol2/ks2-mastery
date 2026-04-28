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
  grammarQuestionVariantSignature,
  grammarTemplateById,
  grammarTemplateGeneratorFamilyId,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import { buildGrammarReadModel } from '../worker/src/subjects/grammar/read-models.js';
import {
  readGrammarLegacyOracle,
  readGrammarQuestionGeneratorBaseline,
  readGrammarQuestionGeneratorP2Baseline,
  readGrammarQuestionGeneratorP3Baseline,
} from './helpers/grammar-legacy-oracle.js';
import { assertNoForbiddenGrammarReadModelKeys } from '../scripts/grammar-production-smoke.mjs';

const LEGACY_GRAMMAR_CONTENT_RELEASE_ID = 'grammar-legacy-reviewed-2026-04-24';

test('Grammar legacy oracle fixture remains frozen for the reviewed denominator', () => {
  const oracle = readGrammarLegacyOracle();

  assert.equal(oracle.contentReleaseId, LEGACY_GRAMMAR_CONTENT_RELEASE_ID);
  assert.equal(oracle.conceptCount, 18);
  assert.equal(oracle.templateCount, 51);
  assert.equal(oracle.selectedResponseCount, 31);
  assert.equal(oracle.constructedResponseCount, 20);
});

test('Grammar QG P1 baseline remains frozen for the previous content release', () => {
  const baseline = readGrammarQuestionGeneratorBaseline();

  assert.equal(baseline.releaseId, 'grammar-qg-p1-2026-04-28');
  assert.equal(baseline.conceptCount, 18);
  assert.equal(baseline.templateCount, 57);
  assert.equal(baseline.selectedResponseCount, 37);
  assert.equal(baseline.constructedResponseCount, 20);
  assert.equal(baseline.generatedTemplateCount, 31);
  assert.equal(baseline.fixedTemplateCount, 26);
  assert.equal(baseline.answerSpecTemplateCount, 6);
  assert.deepEqual(baseline.thinPoolConcepts, []);
  assert.deepEqual(baseline.singleQuestionTypeConcepts, []);
  assert.equal(GRAMMAR_CONCEPTS.length, 18);
});

test('Grammar QG P2 baseline remains frozen for the shipped declarative marking denominator', () => {
  const baseline = readGrammarQuestionGeneratorP2Baseline();

  assert.equal(baseline.releaseId, 'grammar-qg-p2-2026-04-28');
  assert.equal(baseline.conceptCount, 18);
  assert.equal(baseline.templateCount, 57);
  assert.equal(baseline.selectedResponseCount, 37);
  assert.equal(baseline.constructedResponseCount, 20);
  assert.equal(baseline.generatedTemplateCount, 31);
  assert.equal(baseline.fixedTemplateCount, 26);
  assert.equal(baseline.answerSpecTemplateCount, 26);
  assert.equal(baseline.constructedResponseAnswerSpecTemplateCount, 20);
  assert.equal(baseline.legacyAdapterTemplateCount, 0);
  assert.equal(baseline.manualReviewOnlyTemplateCount, 4);
  assert.equal(baseline.p2MigrationComplete, true);
  assert.deepEqual(baseline.thinPoolConcepts, []);
  assert.deepEqual(baseline.singleQuestionTypeConcepts, []);
});

test('Grammar QG P3 baseline pins the historical explanation-depth release', () => {
  const baseline = readGrammarQuestionGeneratorP3Baseline();

  assert.equal(baseline.releaseId, 'grammar-qg-p3-2026-04-28');
  assert.equal(baseline.conceptCount, 18);
  assert.equal(baseline.templateCount, 70);
  assert.equal(baseline.selectedResponseCount, 50);
  assert.equal(baseline.constructedResponseCount, 20);
  assert.equal(baseline.generatedTemplateCount, 44);
  assert.equal(baseline.fixedTemplateCount, 26);
  assert.equal(baseline.answerSpecTemplateCount, 39);
  assert.equal(baseline.constructedResponseAnswerSpecTemplateCount, 20);
  assert.equal(baseline.legacyAdapterTemplateCount, 0);
  assert.equal(baseline.manualReviewOnlyTemplateCount, 4);
  assert.equal(baseline.p2MigrationComplete, true);
  assert.equal(baseline.explainTemplateCount, 17);
  assert.equal(baseline.conceptsWithExplainCoverage.length, 18);
  assert.deepEqual(baseline.conceptsMissingExplainCoverage, []);
  assert.equal(baseline.p3ExplanationComplete, true);
  assert.deepEqual(baseline.thinPoolConcepts, []);
  assert.deepEqual(baseline.singleQuestionTypeConcepts, []);
  // Live content now reflects P4 denominator
  assert.equal(GRAMMAR_CONCEPTS.length, 18);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.length, 78);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((template) => template.isSelectedResponse).length, 58);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((template) => !template.isSelectedResponse).length, 20);
});

test('Grammar legacy content still generates serialisable questions matching frozen oracle samples', () => {
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
    assert.equal(serialised.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID, sample.id);
    assert.equal(oracle.contentReleaseId, LEGACY_GRAMMAR_CONTENT_RELEASE_ID, sample.id);
    assert.equal(serialised.templateId, sample.id, sample.id);
    assert.equal(serialised.itemId, sample.sample.itemId, sample.id);
    assert.deepEqual(serialised.skillIds, sample.skillIds, sample.id);
    assert.equal(serialised.promptText, sample.sample.promptText, sample.id);
    assert.equal(typeof question.evaluate, 'function', sample.id);

    const template = grammarTemplateById(sample.id);
    const migratedAnswerSpecResponse = (
      !template?.isSelectedResponse
      && question.answerSpec?.kind !== 'manualReviewOnly'
      && Array.isArray(question.answerSpec.golden)
    )
      ? { answer: question.answerSpec.golden[0] }
      : sample.correctResponse;
    const correct = evaluateGrammarQuestion(question, migratedAnswerSpecResponse);
    if (question.answerSpec?.kind === 'manualReviewOnly') {
      assert.equal(correct.correct, false, sample.id);
      assert.equal(correct.nonScored, true, sample.id);
      assert.equal(correct.manualReviewOnly, true, sample.id);
      assert.equal(correct.score, 0, sample.id);
      assert.equal(correct.maxScore, 0, sample.id);
    } else if (!template?.isSelectedResponse && question.answerSpec) {
      assert.equal(correct.correct, true, sample.id);
      assert.equal(correct.score, correct.maxScore, sample.id);
      assert.equal(typeof correct.feedbackShort, 'string', sample.id);
    } else {
      assert.deepEqual(correct, sample.correctResult, sample.id);
    }
    assert.doesNotThrow(() => evaluateGrammarQuestion(question, {}), sample.id);
  }
});

test('Grammar QG P1 templates emit answer specs and score their golden responses', () => {
  const baseline = readGrammarQuestionGeneratorBaseline();
  const p1TemplateIds = [
    'qg_active_passive_choice',
    'qg_subject_object_classify_table',
    'qg_pronoun_referent_identify',
    'qg_formality_classify_table',
    'qg_modal_verb_explain',
    'qg_hyphen_ambiguity_explain',
  ];

  for (const templateId of p1TemplateIds) {
    assert.ok(
      baseline.samples.some((sample) => sample.templateId === templateId),
      `${templateId} should appear in the QG P1 signature baseline.`,
    );
    const question = createGrammarQuestion({ templateId, seed: 7 });
    assert.ok(question.answerSpec, `${templateId} should emit hidden answerSpec data.`);
    const serialised = serialiseGrammarQuestion(question);
    assert.equal(serialised.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
    assert.equal(serialised.templateId, templateId);

    const response = question.answerSpec.kind === 'multiField'
      ? Object.fromEntries(Object.entries(question.answerSpec.params.fields).map(([key, spec]) => [key, { answer: spec.golden[0] }]))
      : { answer: question.answerSpec.golden[0] };
    const result = evaluateGrammarQuestion(question, response);
    assert.equal(result.correct, true, templateId);
    assert.equal(result.score, result.maxScore, templateId);
  }
});

test('Grammar generated attempts store safe variant metadata without exposing it on currentItem', () => {
  const state = createInitialGrammarState();
  const question = createGrammarQuestion({ templateId: 'qg_modal_verb_explain', seed: 7 });
  const item = serialiseGrammarQuestion(question);
  assert.equal(item.generatorFamilyId, undefined);
  assert.equal(item.variantSignature, undefined);

  const applied = applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: { answer: question.answerSpec.golden[0] },
    supportLevel: 0,
    attempts: 1,
    now: 1_777_000_000_000,
  });

  const attempt = state.recentAttempts.at(-1);
  assert.equal(attempt.generatorFamilyId, 'qg_modal_verb_explain');
  assert.match(attempt.variantSignature, /^grammar-v1:[a-z0-9]+$/);
  assert.equal(applied.events[0].generatorFamilyId, 'qg_modal_verb_explain');
  assert.equal(applied.events[0].variantSignature, attempt.variantSignature);
});

test('Grammar manual-review-only attempts save responses without scoring or reward evidence', () => {
  const state = createInitialGrammarState();
  const question = createGrammarQuestion({ templateId: 'build_noun_phrase', seed: 1 });
  const item = serialiseGrammarQuestion(question);
  const before = JSON.parse(JSON.stringify({
    mastery: state.mastery,
    retryQueue: state.retryQueue,
    misconceptions: state.misconceptions,
  }));

  const applied = applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: {
      part1: 'The nervous',
      part2: 'young explorer',
      part3: 'from our class',
    },
    supportLevel: 0,
    attempts: 1,
    requestId: 'manual-review',
    now: 1_777_000_000_000,
  });

  assert.equal(applied.result.correct, false);
  assert.equal(applied.result.nonScored, true);
  assert.equal(applied.result.manualReviewOnly, true);
  assert.equal(applied.quality, 0);
  assert.deepEqual(state.mastery, before.mastery);
  assert.deepEqual(state.retryQueue, before.retryQueue);
  assert.deepEqual(state.misconceptions, before.misconceptions);
  assert.equal(state.recentAttempts.length, 1);
  assert.equal(state.recentAttempts[0].nonScored, true);
  const readModel = buildGrammarReadModel({ state, now: 1_777_000_000_000 });
  const nounPhraseConcept = readModel.analytics.concepts.find((concept) => concept.id === 'noun_phrases');
  assert.equal(nounPhraseConcept.confidence.recentMisses, 0);
  assert.equal(nounPhraseConcept.confidence.distinctTemplates, 0);
  assert.deepEqual(applied.events.map((event) => event.type), ['grammar.manual-review-saved']);
  assert.equal(applied.events.some((event) => event.type === 'grammar.answer-submitted'), false);
  assert.equal(applied.events.some((event) => event.type === 'grammar.concept-secured'), false);
});

test('Grammar manual-review-only practice summary separates answered from scored answers', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'manual-review-summary-start',
    payload: {
      roundLength: 1,
      templateId: 'build_noun_phrase',
      seed: 1,
    },
  });

  const submit = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'submit-answer',
    requestId: 'manual-review-summary-submit',
    payload: {
      response: {
        part1: 'The nervous young',
        part2: 'explorer',
        part3: 'from our class',
      },
    },
  });
  assert.equal(submit.state.session.answered, 1);
  assert.equal(submit.state.session.scoredAnswered, 0);
  assert.equal(submit.state.session.nonScoredAnswered, 1);

  const finished = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: submit.state, data: submit.data },
    latestSession: submit.practiceSession,
    command: 'continue-session',
    requestId: 'manual-review-summary-finish',
    payload: {},
  });

  assert.equal(finished.state.phase, 'summary');
  assert.equal(finished.state.summary.answered, 1);
  assert.equal(finished.state.summary.scoredAnswered, 0);
  assert.equal(finished.state.summary.nonScoredAnswered, 1);
  assert.equal(finished.state.summary.correct, 0);
  const completed = finished.events.find((event) => event.type === 'grammar.session-completed');
  assert.equal(completed.scoredAnswered, 0);
  assert.equal(completed.nonScoredAnswered, 1);
});

test('Grammar mini-test packs exclude manual-review-only templates', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const items = buildGrammarMiniSet({ size: 8, seed });
    assert.equal(items.length, 8, `seed ${seed}`);
    for (const item of items) {
      const template = grammarTemplateById(item.templateId);
      assert.notEqual(template?.answerSpecKind, 'manualReviewOnly', `${item.templateId} in seed ${seed}`);
    }
  }
});

test('Grammar strict mini-test rejects forced manual-review-only templates', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  assert.throws(() => engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'manual-review-mini-test',
    payload: {
      mode: 'satsset',
      templateId: 'build_noun_phrase',
      seed: 1,
    },
  }), (error) => error?.extra?.code === 'grammar_template_unavailable_for_mode');
});

test('Grammar mini-set generation covers mixed and focused pools without looping', () => {
  const mixed = buildGrammarMiniSet({ size: 8, seed: 1234 });
  assert.equal(mixed.length, 8);
  assert.ok(mixed.every((item) => item.contentReleaseId === GRAMMAR_CONTENT_RELEASE_ID));
  assert.deepEqual(
    mixed.map((item) => item.seed),
    Array.from({ length: 8 }, (_, index) => (1234 + index * 104729) >>> 0),
    'Mini-set item seeds must match the selector freshness seeds.',
  );

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

test('Grammar command engine clears active sessions from an older content release', () => {
  const now = 1_777_000_000_000;
  const engine = createServerGrammarEngine({ now: () => now });
  const started = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'stale-release-start',
    payload: {
      templateId: 'fronted_adverbial_choose',
      seed: 1,
      roundLength: 1,
    },
  });
  const staleState = JSON.parse(JSON.stringify(started.state));
  staleState.contentReleaseId = 'grammar-qg-p1-2026-04-28';
  staleState.session.currentItem.contentReleaseId = 'grammar-qg-p1-2026-04-28';

  const cleared = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {
      ui: staleState,
      data: {
        ...started.data,
        contentReleaseId: 'grammar-qg-p1-2026-04-28',
      },
    },
    latestSession: started.practiceSession,
    command: 'submit-answer',
    requestId: 'stale-release-submit',
    payload: { response: { answer: 'Before the match' } },
  });

  assert.equal(cleared.changed, true);
  assert.equal(cleared.state.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
  assert.equal(cleared.state.phase, 'dashboard');
  assert.equal(cleared.state.session, null);
  assert.equal(cleared.practiceSession.status, 'abandoned');
  assert.equal(cleared.practiceSession.id, started.practiceSession.id);
  assert.deepEqual(cleared.events, []);
});

test('Grammar retry queue de-duplicates repeated misses for the same template and seed', () => {
  const state = createInitialGrammarState();
  const question = createGrammarQuestion({ templateId: 'fronted_adverbial_choose', seed: 1 });
  const item = serialiseGrammarQuestion(question);
  const wrongAnswer = question.inputSpec.options.find((option) => !evaluateGrammarQuestion(question, { answer: option.value }).correct).value;

  for (let count = 0; count < 2; count += 1) {
    applyGrammarAttemptToState(state, {
      learnerId: 'learner-a',
      item,
      response: { answer: wrongAnswer },
      now: 1_777_000_000_000 + count,
    });
  }

  assert.equal(state.retryQueue.length, 1);
  assert.equal(state.retryQueue[0].templateId, 'fronted_adverbial_choose');
});

test('Grammar attempt history stores bounded response fields only', () => {
  const state = createInitialGrammarState();
  const question = createGrammarQuestion({ templateId: 'fix_fronted_adverbial', seed: 1 });
  const item = serialiseGrammarQuestion(question);

  applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: {
      answer: 'x'.repeat(120_000),
      extra: 'y'.repeat(120_000),
      nested: { value: 'not persisted' },
    },
    now: 1_777_000_000_000,
  });

  const persisted = state.recentAttempts[0].response;
  assert.deepEqual(Object.keys(persisted), ['answer']);
  assert.equal(persisted.answer.length, 2_000);
});

test('Grammar attempt history stores generated variant metadata but keeps read models redacted', () => {
  const state = createInitialGrammarState();
  const question = createGrammarQuestion({ templateId: 'qg_modal_verb_explain', seed: 1 });
  const item = serialiseGrammarQuestion(question);
  const template = grammarTemplateById(question.templateId);

  applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: { answer: question.answerSpec.golden[0] },
    now: 1_777_000_000_000,
  });

  const attempt = state.recentAttempts.at(-1);
  assert.equal(attempt.generatorFamilyId, grammarTemplateGeneratorFamilyId(template));
  assert.equal(attempt.variantSignature, grammarQuestionVariantSignature(question));
  assert.ok(attempt.variantSignature.startsWith('grammar-v1:'));

  const readModel = buildGrammarReadModel({ learnerId: 'learner-a', state, now: 1_777_000_000_000 });
  assert.equal(readModel.analytics.recentAttempts[0].generatorFamilyId, undefined);
  assert.equal(readModel.analytics.recentAttempts[0].variantSignature, undefined);
  assert.equal(readModel.analytics.recentAttempts[0].response, undefined);
  assert.equal(readModel.analytics.recentAttempts[0].result.answerText, undefined);
  assertNoForbiddenGrammarReadModelKeys(readModel, 'grammar.variantMetadataReadModel');
});

test('Grammar engine rejects empty answers before mastery is mutated', () => {
  const state = createInitialGrammarState();
  const question = createGrammarQuestion({ templateId: 'fronted_adverbial_choose', seed: 1 });
  const item = serialiseGrammarQuestion(question);

  assert.throws(() => applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: {},
    now: 1_777_000_000_000,
  }), (error) => error?.extra?.code === 'grammar_answer_required');
  assert.deepEqual(state.mastery.concepts, {});
  assert.equal(state.recentAttempts.length, 0);
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

test('Grammar trouble mode targets the weakest concept without pinning focus prefs', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {
      data: {
        prefs: {
          focusConceptId: 'word_classes',
        },
        mastery: {
          concepts: {
            adverbials: {
              attempts: 4,
              correct: 0,
              wrong: 4,
              strength: 0.12,
              dueAt: 1,
            },
            word_classes: {
              attempts: 8,
              correct: 8,
              wrong: 0,
              strength: 0.9,
              intervalDays: 10,
              dueAt: 1_777_000_000_000 + 10 * 86400000,
              correctStreak: 5,
            },
          },
        },
      },
    },
    command: 'start-session',
    requestId: 'start-trouble',
    payload: {
      mode: 'trouble',
      roundLength: 3,
      seed: 42,
    },
  });

  assert.equal(start.state.phase, 'session');
  assert.equal(start.state.session.mode, 'trouble');
  assert.equal(start.state.session.type, 'trouble-drill');
  assert.equal(start.state.session.focusConceptId, 'adverbials');
  assert.equal(start.state.prefs.focusConceptId, '');
  assert.equal(start.practiceSession.sessionKind, 'trouble');
  assert.ok(start.state.session.currentItem.skillIds.includes('adverbials'));
});

test('Grammar trouble mode honours explicit focus payloads separately from stored prefs', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {
      data: {
        mastery: {
          concepts: {
            adverbials: {
              attempts: 4,
              correct: 0,
              wrong: 4,
              strength: 0.12,
              dueAt: 1,
            },
          },
        },
      },
    },
    command: 'start-session',
    requestId: 'start-trouble-focused',
    payload: {
      mode: 'trouble',
      focusConceptId: 'word_classes',
      roundLength: 3,
      seed: 42,
    },
  });

  assert.equal(start.state.session.mode, 'trouble');
  assert.equal(start.state.session.focusConceptId, 'word_classes');
  assert.equal(start.state.prefs.focusConceptId, 'word_classes');
  assert.ok(start.state.session.currentItem.skillIds.includes('word_classes'));
});

test('Grammar save-prefs keeps trouble focus on automatic weakest selection', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const saved = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {
      data: {
        prefs: {
          mode: 'trouble',
          focusConceptId: '',
        },
      },
    },
    command: 'save-prefs',
    requestId: 'prefs-trouble-focus',
    payload: {
      prefs: {
        focusConceptId: 'word_classes',
      },
    },
  });

  assert.equal(saved.state.prefs.mode, 'trouble');
  assert.equal(saved.state.prefs.focusConceptId, '');
});

test('Grammar sentence surgery mode only picks surgery templates', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-surgery',
    payload: {
      mode: 'surgery',
      roundLength: 3,
      seed: 42,
    },
  });
  const template = GRAMMAR_TEMPLATE_METADATA.find((entry) => entry.id === start.state.session.currentItem.templateId);

  assert.equal(start.state.phase, 'session');
  assert.equal(start.state.session.mode, 'surgery');
  assert.equal(start.state.session.type, 'sentence-surgery');
  assert.equal(start.practiceSession.sessionKind, 'surgery');
  assert.equal(template.tags.includes('surgery'), true);
  assert.match(start.state.session.currentItem.questionType, /^(fix|rewrite)$/);
});

test('Grammar sentence surgery rejects explicit non-surgery templates', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  assert.throws(() => engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-surgery-bypass',
    payload: {
      mode: 'surgery',
      roundLength: 3,
      seed: 42,
      templateId: 'sentence_type_table',
    },
  }), (error) => error?.extra?.code === 'grammar_template_unavailable_for_mode');
});

test('Grammar explicit template starts ignore inherited focus prefs', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {
      data: {
        prefs: {
          focusConceptId: 'word_classes',
        },
      },
    },
    command: 'start-session',
    requestId: 'start-explicit-template-with-stored-focus',
    payload: {
      mode: 'smart',
      roundLength: 1,
      seed: 42,
      templateId: 'question_mark_select',
    },
  });

  assert.equal(start.state.phase, 'session');
  assert.equal(start.state.session.currentItem.templateId, 'question_mark_select');
  assert.equal(start.state.session.focusConceptId, '');
  assert.equal(start.state.prefs.focusConceptId, 'word_classes');
});

test('Grammar sentence surgery clears stored focus and stays inside the surgery pool', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {
      data: {
        prefs: {
          focusConceptId: 'word_classes',
        },
      },
    },
    command: 'start-session',
    requestId: 'start-surgery-focused',
    payload: {
      mode: 'surgery',
      roundLength: 3,
      seed: 77,
    },
  });
  const template = GRAMMAR_TEMPLATE_METADATA.find((entry) => entry.id === start.state.session.currentItem.templateId);

  assert.equal(start.state.session.mode, 'surgery');
  assert.equal(start.state.session.focusConceptId, '');
  assert.equal(start.state.prefs.focusConceptId, '');
  assert.equal(template.tags.includes('surgery'), true);
});

test('Grammar sentence builder mode only picks builder templates and clears stored focus', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {
      data: {
        prefs: {
          focusConceptId: 'word_classes',
        },
      },
    },
    command: 'start-session',
    requestId: 'start-builder',
    payload: {
      mode: 'builder',
      roundLength: 3,
      seed: 42,
    },
  });
  const template = GRAMMAR_TEMPLATE_METADATA.find((entry) => entry.id === start.state.session.currentItem.templateId);

  assert.equal(start.state.phase, 'session');
  assert.equal(start.state.session.mode, 'builder');
  assert.equal(start.state.session.type, 'sentence-builder');
  assert.equal(start.state.session.focusConceptId, '');
  assert.equal(start.state.prefs.focusConceptId, '');
  assert.equal(start.practiceSession.sessionKind, 'builder');
  assert.equal(template.tags.includes('builder'), true);
  assert.match(start.state.session.currentItem.questionType, /^(build|rewrite)$/);
});

test('Grammar sentence builder rejects explicit non-builder templates', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  assert.throws(() => engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-builder-bypass',
    payload: {
      mode: 'builder',
      roundLength: 3,
      seed: 42,
      templateId: 'sentence_type_table',
    },
  }), (error) => error?.extra?.code === 'grammar_template_unavailable_for_mode');
});

test('Grammar worked and faded modes apply supported scoring levels', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'fronted_adverbial_choose');
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const worked = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-worked',
    payload: {
      mode: 'worked',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(worked.state.session.mode, 'worked');
  assert.equal(worked.state.session.type, 'worked-example');
  assert.equal(worked.state.session.supportLevel, 2);

  const workedSubmit = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: worked.state, data: worked.data },
    latestSession: worked.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-worked',
    payload: { response: sample.correctResponse },
  });
  assert.equal(workedSubmit.state.recentAttempts.at(-1).supportLevel, 2);

  const faded = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-faded',
    payload: {
      mode: 'faded',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(faded.state.session.mode, 'faded');
  assert.equal(faded.state.session.type, 'faded-guidance');
  assert.equal(faded.state.session.supportLevel, 1);
});

test('Grammar strict mini-set rejects pre-answer support payloads', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'fronted_adverbial_choose');
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-strict-support',
    payload: {
      mode: 'satsset',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(start.state.session.type, 'mini-set');
  assert.equal(start.state.session.targetCount, 8);
  assert.equal(start.state.session.miniTest.questions.length, 8);

  assert.throws(() => engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-strict-support',
    payload: {
      response: sample.correctResponse,
      supportLevel: 1,
    },
  }), (error) => error?.extra?.code === 'grammar_support_unavailable_for_mode');
});

test('Grammar strict mini-set saves responses without feedback and marks only on finish', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'fronted_adverbial_choose');
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-strict-mini-test',
    payload: {
      mode: 'satsset',
      roundLength: 8,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  assert.equal(start.state.phase, 'session');
  assert.equal(start.state.session.type, 'mini-set');
  assert.equal(start.state.feedback, null);
  assert.equal(start.state.session.miniTest.setSize, 8);
  assert.equal(start.state.session.miniTest.timeLimitMs, Math.max(6 * 60_000, start.state.session.totalMarks * 54_000));

  const saved = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'save-mini-test-response',
    requestId: 'save-strict-mini-test',
    payload: {
      response: sample.correctResponse,
      advance: true,
    },
  });

  assert.equal(saved.state.phase, 'session');
  assert.equal(saved.state.feedback, null);
  assert.equal(saved.events.length, 0);
  assert.equal(saved.state.session.answered, 1);
  assert.equal(saved.state.session.currentIndex, 1);
  assert.equal(saved.state.recentAttempts.length, 0);

  const finished = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: saved.state, data: saved.data },
    latestSession: saved.practiceSession,
    command: 'finish-mini-test',
    requestId: 'finish-strict-mini-test',
    payload: {},
  });

  assert.equal(finished.state.phase, 'summary');
  assert.equal(finished.state.feedback, null);
  assert.equal(finished.state.session, null);
  assert.equal(finished.state.summary.answered, 1);
  assert.equal(finished.state.summary.targetCount, 8);
  assert.equal(finished.state.summary.miniTestReview.questions.length, 8);
  assert.equal(finished.state.summary.miniTestReview.questions[0].marked.result.correct, true);
  assert.equal(finished.state.summary.miniTestReview.questions[1].marked.result.feedbackShort, 'No answer saved.');
  assert.equal(finished.events.filter((event) => event.type === 'grammar.answer-submitted').length, 1);
  assert.ok(finished.events.some((event) => event.type === 'grammar.session-completed'));
});

test('Grammar strict mini-set rejects AI enrichment until review is complete', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-strict-ai',
    payload: {
      mode: 'satsset',
      roundLength: 8,
      seed: 12,
    },
  });

  assert.throws(() => engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'request-ai-enrichment',
    requestId: 'strict-ai-request',
    payload: { kind: 'explanation' },
  }), (error) => error?.extra?.code === 'grammar_ai_unavailable_for_mini_test');
});

test('Grammar timed session goal completes on the Worker clock', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'question_mark_select');
  let now = 1_777_000_000_000;
  const engine = createServerGrammarEngine({ now: () => now });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-timed-goal',
    payload: {
      mode: 'smart',
      goalType: 'timed',
      roundLength: 15,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  assert.equal(start.state.session.goal.type, 'timed');
  assert.equal(start.state.session.goal.timeLimitMs, 10 * 60_000);
  assert.equal(start.state.session.targetCount, 15);

  const submit = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-timed-goal',
    payload: { response: sample.correctResponse },
  });
  assert.equal(submit.state.phase, 'feedback');
  assert.equal(submit.state.feedback.canContinue, true);

  now += 10 * 60_000 + 1;
  const done = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: submit.state, data: submit.data },
    latestSession: submit.practiceSession,
    command: 'continue-session',
    requestId: 'continue-timed-goal',
    payload: {},
  });

  assert.equal(done.state.phase, 'summary');
  assert.equal(done.state.summary.goal.type, 'timed');
  assert.equal(done.state.summary.timedOut, true);
  assert.equal(done.state.summary.answered, 1);
});

test('Grammar clear-due goal uses due retry evidence before falling back', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'fronted_adverbial_choose');
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {
      data: {
        retryQueue: [{
          templateId: sample.id,
          seed: sample.sample.seed,
          dueAt: 1,
          conceptIds: sample.skillIds,
          reason: 'recent-miss',
        }],
      },
    },
    command: 'start-session',
    requestId: 'start-due-goal',
    payload: {
      mode: 'smart',
      goalType: 'due',
      roundLength: 15,
    },
  });

  assert.equal(start.state.session.goal.type, 'due');
  assert.equal(start.state.session.goal.initialDueCount, 1);
  assert.equal(start.state.session.targetCount, 1);
  assert.equal(start.state.session.currentItem.templateId, sample.id);

  const submit = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-due-goal',
    payload: { response: sample.correctResponse },
  });
  assert.equal(submit.state.feedback.canContinue, false);

  const done = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: submit.state, data: submit.data },
    latestSession: submit.practiceSession,
    command: 'continue-session',
    requestId: 'continue-due-goal',
    payload: {},
  });
  assert.equal(done.state.phase, 'summary');
  assert.equal(done.state.summary.goal.type, 'due');
  assert.equal(done.state.summary.answered, 1);
});

test('Grammar practice settings: Smart Review teaching items no longer demote independent correctness (U3 contract v2)', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'fronted_adverbial_choose');
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const prefs = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'save-prefs',
    requestId: 'prefs-smart-teaching',
    payload: {
      prefs: {
        allowTeachingItems: true,
        showDomainBeforeAnswer: false,
        speechRate: 9,
      },
    },
  });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: prefs.state, data: prefs.data },
    command: 'start-session',
    requestId: 'start-smart-teaching',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  assert.equal(start.state.prefs.allowTeachingItems, true);
  assert.equal(start.state.prefs.showDomainBeforeAnswer, false);
  assert.equal(start.state.prefs.speechRate, 1.4);
  // Under contract v2, Smart + allowTeachingItems no longer forces session support level.
  assert.equal(start.state.session.supportLevel, 0);
  assert.equal(start.state.session.supportContractVersion, 2);

  const submit = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-smart-teaching',
    payload: { response: sample.correctResponse },
  });

  const latestAttempt = submit.state.recentAttempts.at(-1);
  // Independent first-attempt correct in Smart Review: full credit.
  assert.equal(latestAttempt.supportLevelAtScoring, 0);
  assert.equal(latestAttempt.supportUsed, 'none');
  assert.equal(latestAttempt.firstAttemptIndependent, true);
  // Mastery strength should reflect quality 5 gain (independent correct: +0.13 from 0.25 baseline).
  assert.equal(
    submit.state.mastery.concepts.adverbials.strength,
    0.38,
    'Smart Review independent correct applies quality-5 +0.13 strength gain (0.25 → 0.38); supported quality would yield 0.29.',
  );
});

test('Grammar faded support action marks the next answer as supported', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'fronted_adverbial_choose');
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-faded-repair',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(start.state.session.supportLevel, 0);

  const faded = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'use-faded-support',
    requestId: 'use-faded-repair',
    payload: {},
  });
  assert.equal(faded.state.session.supportLevel, 1);
  assert.equal(faded.events.length, 0);

  const submit = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: faded.state, data: faded.data },
    latestSession: faded.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-faded-repair',
    payload: { response: sample.correctResponse },
  });
  assert.equal(submit.state.recentAttempts.at(-1).supportLevel, 1);
});

test('Grammar worked solution and retry repair do not double-count unsubmitted progress', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'fronted_adverbial_choose');
  const question = createGrammarQuestion({ templateId: sample.id, seed: sample.sample.seed });
  const wrongAnswer = question.inputSpec.options.find((option) => !evaluateGrammarQuestion(question, { answer: option.value }).correct).value;
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-worked-repair',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  const wrong = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-worked-repair-wrong',
    payload: { response: { answer: wrongAnswer } },
  });
  assert.equal(wrong.state.session.answered, 1);
  assert.equal(wrong.state.recentAttempts.length, 1);

  const worked = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: wrong.state, data: wrong.data },
    latestSession: wrong.practiceSession,
    command: 'show-worked-solution',
    requestId: 'show-worked-repair',
    payload: {},
  });
  assert.ok(worked.state.feedback.workedSolution.answerText);
  assert.equal(worked.state.session.supportLevel, 2);

  const retry = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: worked.state, data: worked.data },
    latestSession: worked.practiceSession,
    command: 'retry-current-question',
    requestId: 'retry-worked-repair',
    payload: {},
  });
  assert.equal(retry.state.phase, 'session');
  assert.equal(retry.state.session.answered, 1);
  assert.equal(retry.state.recentAttempts.length, 1);

  const correct = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: retry.state, data: retry.data },
    latestSession: retry.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-worked-repair-correct',
    payload: { response: sample.correctResponse },
  });
  assert.equal(correct.state.recentAttempts.length, 2);
  assert.equal(correct.state.recentAttempts.at(-1).supportLevel, 2);
  assert.equal(correct.state.recentAttempts.at(-1).attempts, 2);
  assert.equal(correct.state.feedback.result.correct, true);
  assert.equal(correct.state.feedback.result.score, 1);
  assert.equal(correct.state.session.answered, 1);
  assert.equal(correct.state.session.correct, 0);
  assert.equal(correct.state.session.totalScore, 0);

  const done = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: correct.state, data: correct.data },
    latestSession: correct.practiceSession,
    command: 'end-session',
    requestId: 'finish-worked-repair',
    payload: {},
  });
  assert.equal(done.state.phase, 'summary');
  assert.equal(done.state.summary.answered, 1);
  assert.equal(done.state.summary.correct, 0);
  assert.equal(done.state.summary.totalScore, 0);
  assert.equal(done.state.summary.totalMarks, 1);
});

test('Grammar similar problem repair creates a deterministic built-in variant', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'fronted_adverbial_choose');
  const question = createGrammarQuestion({ templateId: sample.id, seed: sample.sample.seed });
  const wrongAnswer = question.inputSpec.options.find((option) => !evaluateGrammarQuestion(question, { answer: option.value }).correct).value;
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-similar-repair',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  const wrong = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-similar-repair-wrong',
    payload: { response: { answer: wrongAnswer } },
  });
  const similar = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: wrong.state, data: wrong.data },
    latestSession: wrong.practiceSession,
    command: 'start-similar-problem',
    requestId: 'start-similar-repair-next',
    payload: {},
  });

  assert.equal(similar.state.phase, 'session');
  assert.equal(similar.state.session.currentItem.templateId, sample.id);
  assert.notEqual(similar.state.session.currentItem.seed, sample.sample.seed);
  assert.equal(similar.state.session.targetCount, 2);
  assert.equal(similar.state.session.repair.similarProblems, 1);
});

test('Grammar repair actions fail closed during unfinished strict mini-tests', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-mini-repair-reject',
    payload: {
      mode: 'satsset',
      roundLength: 8,
      seed: 10,
    },
  });

  assert.throws(() => engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'use-faded-support',
    requestId: 'mini-repair-reject',
    payload: {},
  }), (error) => error?.extra?.code === 'grammar_repair_unavailable_for_mode');
});

test('Grammar save-prefs clears completed summary state', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'question_mark_select');
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-summary-reset',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  const submit = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'submit-answer',
    requestId: 'submit-summary-reset',
    payload: { response: sample.correctResponse },
  });
  const done = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: submit.state, data: submit.data },
    latestSession: submit.practiceSession,
    command: 'continue-session',
    requestId: 'continue-summary-reset',
    payload: {},
  });
  assert.equal(done.state.phase, 'summary');

  const saved = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: done.state, data: done.data },
    latestSession: done.practiceSession,
    command: 'save-prefs',
    requestId: 'prefs-summary-reset',
    payload: { prefs: { mode: 'learn' } },
  });

  assert.equal(saved.state.phase, 'dashboard');
  assert.equal(saved.state.summary, null);
  assert.equal(saved.state.session, null);
  assert.equal(saved.state.awaitingAdvance, false);
  assert.equal(saved.state.prefs.mode, 'learn');
  assert.equal(saved.practiceSession, null);
});

// --- QG P4 mixed-transfer engine regression ---

test('P4 mixed-transfer template (choose/exact) correct answer scores correctly', () => {
  const templateId = 'qg_p4_sentence_speech_transfer';
  const question = createGrammarQuestion({ templateId, seed: 1 });
  assert.ok(question.answerSpec, 'P4 template must emit answerSpec');
  assert.equal(question.answerSpec.kind, 'exact');

  const result = evaluateGrammarQuestion(question, { answer: question.answerSpec.golden[0] });
  assert.equal(result.correct, true, 'Correct golden answer must score as correct');
  assert.equal(result.score, result.maxScore, 'Correct answer must achieve maxScore');
});

test('P4 mixed-transfer template wrong answer returns feedback', () => {
  const templateId = 'qg_p4_sentence_speech_transfer';
  const question = createGrammarQuestion({ templateId, seed: 1 });
  const wrongAnswer = question.answerSpec.nearMiss[0] || 'totally_wrong';

  const result = evaluateGrammarQuestion(question, { answer: wrongAnswer });
  assert.equal(result.correct, false, 'Near-miss answer must score as incorrect');
  assert.equal(result.score, 0, 'Wrong answer must score 0');
  assert.ok(
    result.feedbackShort || result.misconception,
    'Wrong answer must produce feedback or misconception label',
  );
});

test('P4 classify template multi-field marking works (voice_roles_transfer)', () => {
  const templateId = 'qg_p4_voice_roles_transfer';
  const question = createGrammarQuestion({ templateId, seed: 1 });
  assert.ok(question.answerSpec, 'P4 classify template must emit answerSpec');
  assert.equal(question.answerSpec.kind, 'multiField');

  // Build the correct multi-field response from golden values
  const fields = question.answerSpec.params.fields;
  const correctResponse = {};
  for (const [key, fieldSpec] of Object.entries(fields)) {
    correctResponse[key] = fieldSpec.golden[0];
  }

  const result = evaluateGrammarQuestion(question, correctResponse);
  assert.equal(result.correct, true, 'All-correct multi-field response must score as correct');
  assert.equal(result.score, result.maxScore, 'Full-score multi-field response must hit maxScore');
});

test('P4 classify template multi-field marking works (word_class_noun_phrase_transfer)', () => {
  const templateId = 'qg_p4_word_class_noun_phrase_transfer';
  const question = createGrammarQuestion({ templateId, seed: 1 });
  assert.ok(question.answerSpec, 'P4 classify template must emit answerSpec');
  assert.equal(question.answerSpec.kind, 'multiField');

  // Submit all wrong answers
  const fields = question.answerSpec.params.fields;
  const wrongResponse = {};
  for (const [key, fieldSpec] of Object.entries(fields)) {
    wrongResponse[key] = fieldSpec.nearMiss[0] || 'wrong';
  }

  const result = evaluateGrammarQuestion(question, wrongResponse);
  assert.equal(result.correct, false, 'All-wrong multi-field response must score as incorrect');
});

test('P4 mixed-transfer template updates all concept nodes in mastery', () => {
  const state = createInitialGrammarState();
  const templateId = 'qg_p4_adverbial_clause_boundary_transfer';
  const question = createGrammarQuestion({ templateId, seed: 1 });
  const item = serialiseGrammarQuestion(question);
  const template = grammarTemplateById(templateId);

  // Submit the correct answer
  const correctResponse = { answer: question.answerSpec.golden[0] };
  applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: correctResponse,
    supportLevel: 0,
    attempts: 1,
    now: 1_777_000_000_000,
  });

  // All 3 skillIds should be updated
  for (const conceptId of template.skillIds) {
    assert.equal(
      state.mastery.concepts[conceptId].attempts, 1,
      `Concept ${conceptId} should have 1 attempt after P4 multi-concept submission`,
    );
  }
});
