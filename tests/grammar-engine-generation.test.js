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

function responseForGrammarItem(item) {
  const question = createGrammarQuestion({ templateId: item.templateId, seed: item.seed });
  if (question.answerSpec?.kind === 'multiField') {
    const response = {};
    for (const [key, fieldSpec] of Object.entries(question.answerSpec.params?.fields || {})) {
      response[key] = fieldSpec.golden?.[0] || fieldSpec.accepted?.[0] || 'answer';
    }
    return response;
  }
  if (Array.isArray(question.answerSpec?.golden) && question.answerSpec.golden.length > 0) {
    return { answer: question.answerSpec.golden[0] };
  }
  const correctOption = (question.inputSpec?.options || []).find((option) =>
    evaluateGrammarQuestion(question, { answer: option.value }).correct);
  if (correctOption) return { answer: correctOption.value };
  return { answer: 'A complete answer.' };
}

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
  // Live content now reflects the P21 pool-expansion follow-up.
  assert.equal(GRAMMAR_CONCEPTS.length, 18);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.length, 546);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((template) => template.isSelectedResponse).length, 357);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((template) => !template.isSelectedResponse).length, 189);
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

