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
import {
  buildGrammarCommandReadModel,
  buildGrammarReadModel,
} from '../worker/src/subjects/grammar/read-models.js';
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

test('Grammar live smart five-question session does not repeat templates when the pool allows', () => {
  for (const seed of [1, 2, 27]) {
    const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
    let result = engine.apply({
      learnerId: 'learner-a',
      subjectRecord: {},
      command: 'start-session',
      requestId: `runtime-no-repeat-start-${seed}`,
      payload: {
        mode: 'smart',
        roundLength: 5,
        seed,
      },
    });
    const templateIds = [];

    for (let index = 0; index < 5; index += 1) {
      const item = result.state.session?.currentItem;
      assert.ok(item, `seed ${seed} item ${index + 1} should be active`);
      templateIds.push(item.templateId);
      result = engine.apply({
        learnerId: 'learner-a',
        subjectRecord: { ui: result.state, data: result.data },
        latestSession: result.practiceSession,
        command: 'submit-answer',
        requestId: `runtime-no-repeat-submit-${seed}-${index}`,
        payload: {
          response: responseForGrammarItem(item),
          clientElapsedMs: 1000,
        },
      });
      if (index < 4) {
        result = engine.apply({
          learnerId: 'learner-a',
          subjectRecord: { ui: result.state, data: result.data },
          latestSession: result.practiceSession,
          command: 'continue-session',
          requestId: `runtime-no-repeat-continue-${seed}-${index}`,
          payload: {},
        });
      }
    }

    assert.equal(
      new Set(templateIds).size,
      templateIds.length,
      `seed ${seed} repeated template(s): ${templateIds.join(', ')}`,
    );
  }
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

test('Grammar command read models omit heavy stable fields until the user opens summary surfaces', () => {
  const state = createInitialGrammarState();
  state.phase = 'session';
  state.prefs = { mode: 'smart', roundLength: 5 };
  state.transferEvidence = {
    'storm-scene': {
      latest: {
        writing: 'A short piece of saved writing.',
        selfAssessment: [{ key: 'sentence-variety', checked: true }],
        savedAt: 1_777_000_000_000,
      },
      history: [],
      updatedAt: 1_777_000_000_000,
    },
  };

  const full = buildGrammarReadModel({ learnerId: 'learner-a', state, now: 1_777_000_000_000 });
  const compact = buildGrammarCommandReadModel({
    command: 'start-session',
    learnerId: 'learner-a',
    state,
    now: 1_777_000_000_000,
  });

  assert.equal(compact.readModelPatch, true);
  assert.equal(compact.analytics, undefined);
  assert.equal(compact.capabilities, undefined);
  assert.equal(compact.transferLane, undefined);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length / 2);

  const transferPatch = buildGrammarCommandReadModel({
    command: 'save-transfer-evidence',
    learnerId: 'learner-a',
    state,
    now: 1_777_000_000_000,
  });
  assert.equal(transferPatch.readModelPatch, true);
  assert.ok(transferPatch.transferLane?.evidence?.length >= 1);
  assert.equal(transferPatch.analytics, undefined);

  const summaryModel = buildGrammarCommandReadModel({
    command: 'end-session',
    learnerId: 'learner-a',
    state,
    now: 1_777_000_000_000,
  });
  assert.equal(summaryModel.readModelPatch, undefined);
  assert.ok(Array.isArray(summaryModel.analytics?.concepts));
  assert.ok(summaryModel.capabilities?.enabledModes?.length > 0);
  assert.ok(summaryModel.transferLane);
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
  assert.notEqual(similar.state.session.currentItem.templateId, sample.id);
  assert.notEqual(similar.state.session.currentItem.seed, sample.sample.seed);
  const baseSkillIds = new Set(question.skillIds || []);
  assert.ok(
    similar.state.session.currentItem.skillIds.some((skillId) => baseSkillIds.has(skillId)),
    'similar problem should stay on the same Grammar skill without replaying the same template',
  );
  assert.equal(similar.state.session.targetCount, 2);
  assert.equal(similar.state.session.repair.similarProblems, 1);
});

test('Grammar similar problem repair fails closed when the same-skill pool is exhausted', () => {
  const oracle = readGrammarLegacyOracle();
  const sample = oracle.templates.find((template) => template.id === 'fronted_adverbial_choose');
  const question = createGrammarQuestion({ templateId: sample.id, seed: sample.sample.seed });
  const wrongAnswer = question.inputSpec.options.find((option) => !evaluateGrammarQuestion(question, { answer: option.value }).correct).value;
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-similar-repair-saturated',
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
    requestId: 'submit-similar-repair-saturated-wrong',
    payload: { response: { answer: wrongAnswer } },
  });

  const saturatedUi = JSON.parse(JSON.stringify(wrong.state));
  const baseSkillIds = new Set(question.skillIds || []);
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    if ((template.skillIds || []).some((skillId) => baseSkillIds.has(skillId))) {
      saturatedUi.session.varietyTelemetry._templateCounts[template.id] = 1;
    }
  }
  const beforeSession = JSON.parse(JSON.stringify(saturatedUi.session));

  const similar = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: saturatedUi, data: wrong.data },
    latestSession: wrong.practiceSession,
    command: 'start-similar-problem',
    requestId: 'start-similar-repair-saturated-next',
    payload: {},
  });

  assert.equal(similar.changed, false);
  assert.equal(similar.state.phase, 'feedback');
  assert.deepEqual(similar.state.session, beforeSession);
});

test('Grammar similar problem repair is unavailable before an answer is marked', () => {
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'fronted_adverbial_choose');
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  const start = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: {},
    command: 'start-session',
    requestId: 'start-similar-repair-not-ready',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  const beforeSession = JSON.parse(JSON.stringify(start.state.session));
  assert.throws(() => engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: start.state, data: start.data },
    latestSession: start.practiceSession,
    command: 'start-similar-problem',
    requestId: 'start-similar-repair-too-early',
    payload: {},
  }), (error) => error?.extra?.code === 'grammar_repair_not_ready');
  assert.equal(start.state.phase, 'session');
  assert.equal(start.state.session.answered, 0);
  assert.equal(start.state.session.currentIndex, 0);
  assert.equal(start.state.session.currentItem.templateId, sample.id);
  assert.deepEqual(start.state.session, beforeSession);
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
