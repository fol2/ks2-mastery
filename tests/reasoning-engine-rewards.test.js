import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { createServerReasoningEngine } from '../worker/src/subjects/reasoning/engine.js';
import { generateReasoningQuestion } from '../shared/reasoning/content.js';
import { projectReasoningRewards } from '../worker/src/projections/rewards.js';
import { reasoningSubjectCommandActions } from '../src/subjects/reasoning/command-actions.js';
import { buildReasoningReadModel } from '../worker/src/subjects/reasoning/read-models.js';

function findNumericCorrectAnswer(question, max = 50000) {
  for (let value = 0; value <= max; value += 1) {
    if (question.evaluate({ answer: String(value) }).correct) return String(value);
  }
  throw new Error(`No numeric answer found for ${question.itemId}`);
}

test('server reasoning engine returns exact due retry questions and emits evidence on independent success', () => {
  const templateId = 'pv_rounding_context';
  const seed = 1;
  const sourceQuestion = generateReasoningQuestion(templateId, seed);
  const answer = findNumericCorrectAnswer(sourceQuestion);
  const engine = createServerReasoningEngine({ now: () => 1_000_000_000_000, random: () => 0.1 });
  const started = engine.apply({
    learnerId: 'learner-1',
    subjectRecord: { data: { retryQueue: [{ templateId, seed, dueAt: 0, skillIds: ['pv_rounding'] }] } },
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3 },
    requestId: 'start-1',
  });
  const ref = started.state.session.questionRefs[0];
  assert.deepEqual(ref, { templateId, seed, itemId: `${templateId}:${seed}` });
  assert.equal(started.data.retryQueue.length, 1, 'due retry should remain queued until the item is actually finalised');

  const marked = engine.apply({
    learnerId: 'learner-1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: started.state.session.id, expectedQuestionId: ref.itemId, response: { answer } },
    requestId: 'mark-1',
  });
  assert.equal(marked.state.phase, 'summary');
  assert.equal(marked.summary, undefined);
  assert.equal(marked.stats.overview.totalQuestions, 1);
  assert.equal(marked.stats.overview.evidenceStars, 1);
  assert.equal(marked.data.retryQueue.some((entry) => entry.templateId === templateId && Number(entry.seed) === seed), false, 'finalised retry item should be removed before any new retry is scheduled');
  assert.deepEqual(marked.events.map((event) => event.type), [
    'reasoning.answer-submitted',
    'reasoning.evidence-earned',
    'reasoning.session-completed',
  ]);
  assert.match(marked.events[1].masteryKey, /^reasoning-poc-promoted-2026-05-11:reasoning-evidence:pv_rounding:/);
});

test('reasoning reward projection updates direct and grand monsters with independent state ids', () => {
  const projected = projectReasoningRewards({
    learnerId: 'learner-1',
    gameState: {},
    random: () => 0,
    domainEvents: [{
      type: 'reasoning.evidence-earned',
      learnerId: 'learner-1',
      skillId: 'pv_rounding',
      itemId: 'pv_rounding_context:1',
      contentReleaseId: 'reasoning-poc-promoted-2026-05-11',
      masteryKey: 'reasoning-poc-promoted-2026-05-11:reasoning-evidence:pv_rounding:pv_rounding_context:1:independent',
    }],
  });
  const codex = projected.gameState['monster-codex'];
  assert.equal(codex.numdrake.caught, true);
  assert.equal(codex.strategon.caught, true);
  assert.equal(codex.numdrake.starHighWater, 1);
  assert.equal(codex.strategon.grandStars, 1);
  assert.equal(projected.rewardEvents.length, 2);
  assert.ok(projected.rewardEvents.every((event) => event.subjectId === 'reasoning'));
});

test('server reasoning engine uses the injected command clock for support and session records', () => {
  let nowValue = 1_700_000_000_000;
  const engine = createServerReasoningEngine({ now: () => nowValue, random: () => 0.2 });
  const started = engine.apply({
    learnerId: 'learner-clock',
    subjectRecord: null,
    command: 'start-session',
    payload: { mode: 'faded', roundLength: 3 },
    requestId: 'clock-start',
  });
  assert.equal(started.practiceSession.startedAt, new Date(1_700_000_000_000).toISOString());
  assert.equal(started.practiceSession.updatedAt, new Date(1_700_000_000_000).toISOString());

  nowValue = 1_700_000_060_000;
  const itemId = started.state.session.questionRefs[0].itemId;
  const supported = engine.apply({
    learnerId: 'learner-clock',
    subjectRecord: { state: started.state, data: started.data },
    command: 'request-support',
    payload: { expectedSessionId: started.state.session.id, expectedQuestionId: itemId, kind: 'worked' },
    requestId: 'clock-support',
  });

  assert.equal(supported.state.session.support[itemId].requestedAt, 1_700_000_060_000);
  assert.equal(supported.state.session.support[itemId].level, 2);
  assert.equal(supported.practiceSession.startedAt, new Date(1_700_000_000_000).toISOString());
  assert.equal(supported.practiceSession.updatedAt, new Date(1_700_000_060_000).toISOString());
});



test('reasoning first-wrong feedback gives only a nudge until support is requested', () => {
  const engine = createServerReasoningEngine({ now: () => 10_000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-nudge',
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3, viewMode: 'one' },
    requestId: 'nudge-start',
  });
  const ref = started.state.session.questionRefs[0];
  const firstWrong = engine.apply({
    learnerId: 'learner-nudge',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: started.state.session.id, expectedQuestionId: ref.itemId, response: {} },
    requestId: 'nudge-wrong',
  });

  assert.equal(firstWrong.state.phase, 'session');
  assert.equal(firstWrong.state.feedback.final, false);
  assert.equal(firstWrong.state.feedback.result.answerText, undefined);
  assert.equal(firstWrong.state.feedback.result.feedbackLong, undefined);
  assert.equal(firstWrong.state.feedback.result.misconception, undefined);
  assert.equal(firstWrong.readModel.feedback.final, false);
  assert.equal(firstWrong.readModel.feedback.question.solutionLines, undefined);
  assert.equal(firstWrong.readModel.session.currentQuestion.solutionLines, undefined);
  assert.equal(firstWrong.readModel.feedback.result.answerText, undefined);
  assert.equal(firstWrong.readModel.feedback.result.feedbackLong, undefined);
  assert.equal(firstWrong.readModel.feedback.result.misconception, undefined);
  assert.ok(firstWrong.readModel.feedback.result.minimalHint);

  const supported = engine.apply({
    learnerId: 'learner-nudge',
    subjectRecord: { state: firstWrong.state, data: firstWrong.data },
    command: 'request-support',
    payload: { expectedSessionId: firstWrong.state.session.id, expectedQuestionId: ref.itemId, kind: 'faded' },
    requestId: 'nudge-support',
  });
  assert.equal(supported.readModel.feedback.supportLevel, 1);
  assert.ok(Array.isArray(supported.readModel.feedback.question.solutionLines));
  assert.ok(Array.isArray(supported.readModel.session.currentQuestion.solutionLines));
});

test('reasoning support requests are blocked before effort, in strict mode, and after marking', () => {
  const engine = createServerReasoningEngine({ now: () => 20_000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-support-guard',
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3, viewMode: 'one' },
    requestId: 'guard-start',
  });
  const ref = started.state.session.questionRefs[0];
  const unsupported = engine.apply({
    learnerId: 'learner-support-guard',
    subjectRecord: { state: started.state, data: started.data },
    command: 'request-support',
    payload: { expectedSessionId: started.state.session.id, expectedQuestionId: ref.itemId, kind: 'worked' },
    requestId: 'guard-before-effort',
  });
  assert.equal(unsupported.state.session.support[ref.itemId], undefined);
  assert.equal(unsupported.readModel.session.currentQuestion.solutionLines, undefined);

  const strict = engine.apply({
    learnerId: 'learner-support-guard',
    subjectRecord: { state: unsupported.state, data: unsupported.data },
    command: 'start-session',
    payload: { mode: 'sats', roundLength: 3, viewMode: 'one' },
    requestId: 'guard-strict-start',
  });
  const strictRef = strict.state.session.questionRefs[0];
  const strictSupport = engine.apply({
    learnerId: 'learner-support-guard',
    subjectRecord: { state: strict.state, data: strict.data },
    command: 'request-support',
    payload: { expectedSessionId: strict.state.session.id, expectedQuestionId: strictRef.itemId, kind: 'worked' },
    requestId: 'guard-strict-support',
  });
  assert.equal(strictSupport.state.session.support[strictRef.itemId], undefined);
  assert.equal(strictSupport.readModel.session.currentQuestion.solutionLines, undefined);

  const markedStart = engine.apply({
    learnerId: 'learner-support-guard',
    subjectRecord: { state: strictSupport.state, data: strictSupport.data },
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3, viewMode: 'one' },
    requestId: 'guard-marked-start',
  });
  const markedRef = markedStart.state.session.questionRefs[0];
  const markedQuestion = generateReasoningQuestion(markedRef.templateId, markedRef.seed);
  const markedAnswer = findNumericCorrectAnswer(markedQuestion);
  const marked = engine.apply({
    learnerId: 'learner-support-guard',
    subjectRecord: { state: markedStart.state, data: markedStart.data },
    command: 'submit-answer',
    payload: { expectedSessionId: markedStart.state.session.id, expectedQuestionId: markedRef.itemId, response: { answer: markedAnswer } },
    requestId: 'guard-marked-answer',
  });
  const afterMarkedSupport = engine.apply({
    learnerId: 'learner-support-guard',
    subjectRecord: { state: marked.state, data: marked.data },
    command: 'request-support',
    payload: { expectedSessionId: marked.state.session.id, expectedQuestionId: markedRef.itemId, kind: 'worked' },
    requestId: 'guard-after-marked',
  });
  assert.equal(afterMarkedSupport.state.session.support[markedRef.itemId], undefined);
  assert.equal(afterMarkedSupport.state.feedback.final, true);
  assert.ok(Array.isArray(afterMarkedSupport.readModel.session.currentQuestion.solutionLines));
});

test('worked and faded Reasoning modes expose seeded support without marking as independent', () => {
  const engine = createServerReasoningEngine({ now: () => 30_000, random: () => 0 });
  const worked = engine.apply({
    learnerId: 'learner-teach',
    command: 'start-session',
    payload: { mode: 'worked', roundLength: 3, viewMode: 'one' },
    requestId: 'worked-start',
  });
  const workedRef = worked.state.session.questionRefs[0];
  assert.equal(worked.state.session.support[workedRef.itemId].level, 2);
  assert.equal(worked.readModel.session.supportLevel, 2);
  assert.ok(Array.isArray(worked.readModel.session.currentQuestion.solutionLines));

  const faded = engine.apply({
    learnerId: 'learner-teach',
    command: 'start-session',
    payload: { mode: 'faded', roundLength: 3, viewMode: 'one' },
    requestId: 'faded-start',
  });
  const fadedRef = faded.state.session.questionRefs[0];
  assert.equal(faded.state.session.support[fadedRef.itemId].level, 1);
  assert.equal(faded.readModel.session.supportLevel, 1);
  assert.ok(Array.isArray(faded.readModel.session.currentQuestion.solutionLines));
});

test('reasoning support command actions send stale-session and stale-question guards', () => {
  const state = {
    learners: { selectedId: 'learner-action' },
    subjectUi: {
      reasoning: {
        session: {
          id: 'reasoning-session-action',
          currentQuestion: { id: 'pv_rounding_context:1' },
        },
      },
    },
  };
  assert.deepEqual(reasoningSubjectCommandActions['reasoning-support-faded'].payload({ state }), {
    expectedSessionId: 'reasoning-session-action',
    expectedQuestionId: 'pv_rounding_context:1',
    kind: 'faded',
  });
  assert.deepEqual(reasoningSubjectCommandActions['reasoning-support-worked'].payload({ state }), {
    expectedSessionId: 'reasoning-session-action',
    expectedQuestionId: 'pv_rounding_context:1',
    kind: 'worked',
  });
});


test('reasoning command actions include optional working for single and list responses', () => {
  const formData = new FormData();
  formData.set('answer', '42');
  formData.set('working', 'I rounded first.');
  const singleState = {
    learners: { selectedId: 'learner-working' },
    subjectUi: { reasoning: { session: { id: 'session-working', currentQuestion: { id: 'q1', inputSpec: { type: 'number' } } } } },
  };
  assert.deepEqual(reasoningSubjectCommandActions['reasoning-submit-form'].payload({ state: singleState, data: { formData } }), {
    expectedSessionId: 'session-working',
    expectedQuestionId: 'q1',
    response: { answer: '42', working: 'I rounded first.' },
  });

  const listFormData = new FormData();
  listFormData.set('q_q1_answer', '');
  listFormData.set('q_q1_working', 'method only');
  const listState = {
    learners: { selectedId: 'learner-working' },
    subjectUi: { reasoning: { session: { id: 'session-working', currentQuestion: { id: 'q1', inputSpec: { type: 'number' } }, questions: [{ id: 'q1', inputSpec: { type: 'number' } }] } } },
  };
  assert.deepEqual(reasoningSubjectCommandActions['reasoning-save-all'].payload({ state: listState, data: { formData: listFormData } }), {
    expectedSessionId: 'session-working',
    responses: { q1: { answer: '', working: 'method only' } },
    move: null,
  });
});

test('reasoning read model redacts legacy persisted first-wrong result fields', () => {
  const engine = createServerReasoningEngine({ now: () => 35_000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-legacy-redaction',
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3, viewMode: 'one' },
    requestId: 'legacy-redaction-start',
  });
  const ref = { templateId: 'pv_rounding_context', seed: 1, itemId: 'pv_rounding_context:1' };
  const question = generateReasoningQuestion(ref.templateId, ref.seed);
  const fullResult = question.evaluate({ answer: '0' });
  const readModel = buildReasoningReadModel({
    learnerId: 'learner-legacy-redaction',
    state: {
      ...started.state,
      feedback: { questionRef: ref, result: fullResult, final: false },
    },
    data: started.data,
    nowValue: 35_000,
  });
  assert.equal(fullResult.answerText.length > 0, true);
  assert.equal(readModel.feedback.result.answerText, undefined);
  assert.equal(readModel.feedback.result.feedbackLong, undefined);
  assert.equal(readModel.feedback.result.misconception, undefined);
  assert.equal(readModel.feedback.question.solutionLines, undefined);
});

test('duplicate Reasoning evidence keys update practice but do not re-emit evidence-earned events', () => {
  const templateId = 'pv_rounding_context';
  const seed = 1;
  const question = generateReasoningQuestion(templateId, seed);
  const answer = findNumericCorrectAnswer(question);
  const masteryKey = `reasoning-poc-promoted-2026-05-11:reasoning-evidence:pv_rounding:${templateId}:${seed}:independent`;
  const engine = createServerReasoningEngine({ now: () => 40_000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-duplicate',
    subjectRecord: { data: { evidenceKeys: [masteryKey], retryQueue: [{ templateId, seed, dueAt: 0, skillIds: ['pv_rounding'] }] } },
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3 },
    requestId: 'duplicate-start',
  });
  const marked = engine.apply({
    learnerId: 'learner-duplicate',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: started.state.session.id, expectedQuestionId: `${templateId}:${seed}`, response: { answer } },
    requestId: 'duplicate-mark',
  });

  assert.equal(marked.stats.overview.totalQuestions, 1);
  assert.equal(marked.stats.overview.evidenceStars, 1);
  assert.equal(marked.data.retryQueue.some((entry) => entry.templateId === templateId && Number(entry.seed) === seed), false, 'finalised retry item should be removed before any new retry is scheduled');
  assert.deepEqual(marked.events.map((event) => event.type), [
    'reasoning.answer-submitted',
    'reasoning.session-completed',
  ]);
});


test('Reasoning read models keep domain and skill hints hidden until marking or support', () => {
  const engine = createServerReasoningEngine({ now: () => 45_000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-domain-redaction',
    command: 'start-session',
    payload: { mode: 'sats', viewMode: 'one', roundLength: 3 },
    requestId: 'domain-start',
  });
  const questionBefore = started.readModel.session.currentQuestion;
  for (const navItem of started.readModel.session.questionNav) {
    assert.equal(navItem.id, `q${navItem.index + 1}`);
    assert.doesNotMatch(navItem.id, /^[a-z0-9_]+:\d+$/i);
    assert.equal(navItem.templateId, undefined);
  }
  assert.equal(questionBefore.id, 'q1');
  assert.equal(questionBefore.itemId, 'q1');
  assert.doesNotMatch(questionBefore.id, /^[a-z0-9_]+:\d+$/i);
  assert.equal(questionBefore.templateId, undefined);
  assert.equal(questionBefore.templateLabel, undefined);
  assert.equal(questionBefore.domain, undefined);
  assert.equal(questionBefore.skillIds, undefined);
  assert.equal(questionBefore.skillNames, undefined);
  assert.equal(started.readModel.session.questions[0].id, 'q1');
  assert.equal(started.readModel.session.questions[0].itemId, 'q1');

  const ref = started.state.session.questionRefs[0];
  const question = generateReasoningQuestion(ref.templateId, ref.seed);
  const answer = findNumericCorrectAnswer(question);
  const marked = engine.apply({
    learnerId: 'learner-domain-redaction',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: started.state.session.id, expectedQuestionId: questionBefore.id, response: { answer } },
    requestId: 'domain-mark',
  });

  assert.equal(marked.state.phase, 'summary');
  assert.equal(marked.readModel.session.currentQuestion.id, 'q1');
  assert.equal(marked.readModel.session.currentQuestion.itemId, 'q1');
  assert.equal(typeof marked.readModel.session.currentQuestion.domain, 'string');
  assert.equal(typeof marked.readModel.session.questionNav[0].templateId, 'string');
  assert.equal(typeof marked.readModel.session.currentQuestion.templateId, 'string');
  assert.equal(typeof marked.readModel.session.currentQuestion.templateLabel, 'string');
  assert.ok(Array.isArray(marked.readModel.session.currentQuestion.skillNames));
});

test('Reasoning first-wrong feedback question stays redacted before support', () => {
  const engine = createServerReasoningEngine({ now: () => 47_500, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-feedback-redaction',
    command: 'start-session',
    payload: { mode: 'smart', viewMode: 'one', roundLength: 3 },
    requestId: 'feedback-redaction-start',
  });
  const publicId = started.readModel.session.currentQuestion.id;
  const firstWrong = engine.apply({
    learnerId: 'learner-feedback-redaction',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: started.state.session.id, expectedQuestionId: publicId, response: { answer: '0' } },
    requestId: 'feedback-redaction-wrong',
  });

  assert.equal(firstWrong.readModel.feedback.final, false);
  assert.equal(firstWrong.readModel.feedback.question.id, 'q1');
  assert.equal(firstWrong.readModel.feedback.question.itemId, 'q1');
  assert.equal(firstWrong.readModel.feedback.question.templateId, undefined);
  assert.equal(firstWrong.readModel.feedback.question.templateLabel, undefined);
  assert.equal(firstWrong.readModel.feedback.question.domain, undefined);
  assert.equal(firstWrong.readModel.feedback.question.skillIds, undefined);
  assert.equal(firstWrong.readModel.feedback.question.skillNames, undefined);
});

test('Reasoning clears stale feedback when moving away from an unresolved first-wrong question', () => {
  const engine = createServerReasoningEngine({ now: () => 50_000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-stale-feedback',
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3, viewMode: 'one' },
    requestId: 'stale-start',
  });
  const ref = started.state.session.questionRefs[0];
  const firstWrong = engine.apply({
    learnerId: 'learner-stale-feedback',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: started.state.session.id, expectedQuestionId: ref.itemId, response: { answer: '0' } },
    requestId: 'stale-wrong',
  });
  assert.equal(firstWrong.readModel.feedback.final, false);

  const moved = engine.apply({
    learnerId: 'learner-stale-feedback',
    subjectRecord: { state: firstWrong.state, data: firstWrong.data },
    command: 'save-response',
    payload: { expectedSessionId: firstWrong.state.session.id, expectedQuestionId: ref.itemId, response: { answer: '0', working: 'first try' }, move: { delta: 1 } },
    requestId: 'stale-move',
  });

  assert.equal(moved.state.session.currentQuestionIndex, 1);
  assert.equal(moved.state.feedback, null);
  assert.equal(moved.readModel.feedback, null);
});

test('Reasoning list responses can be cleared and working is preserved in state and events', () => {
  const templateId = 'pv_rounding_context';
  const seed = 1;
  const question = generateReasoningQuestion(templateId, seed);
  const answer = findNumericCorrectAnswer(question);
  const engine = createServerReasoningEngine({ now: () => 55_000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-response-clear',
    subjectRecord: { data: { retryQueue: [{ templateId, seed, dueAt: 0, skillIds: ['pv_rounding'] }] } },
    command: 'start-session',
    payload: { mode: 'smart', viewMode: 'list', roundLength: 3 },
    requestId: 'clear-start',
  });
  const ref = started.state.session.questionRefs[0];
  const publicId = started.readModel.session.questions[0].id;
  assert.equal(publicId, 'q1');
  const saved = engine.apply({
    learnerId: 'learner-response-clear',
    subjectRecord: { state: started.state, data: started.data },
    command: 'save-response',
    payload: { expectedSessionId: started.state.session.id, responses: { [publicId]: { answer, working: 'rounded to the nearest ten' } } },
    requestId: 'clear-save',
  });
  assert.equal(saved.state.session.responses[ref.itemId].answer, answer);
  assert.equal(saved.state.session.responses[ref.itemId].working, 'rounded to the nearest ten');

  const cleared = engine.apply({
    learnerId: 'learner-response-clear',
    subjectRecord: { state: saved.state, data: saved.data },
    command: 'save-response',
    payload: { expectedSessionId: saved.state.session.id, responses: { [publicId]: { answer: '', working: '' } } },
    requestId: 'clear-blank',
  });
  assert.deepEqual(cleared.state.session.responses[ref.itemId], { answer: '', working: '' });

  const resaved = engine.apply({
    learnerId: 'learner-response-clear',
    subjectRecord: { state: cleared.state, data: cleared.data },
    command: 'save-response',
    payload: { expectedSessionId: cleared.state.session.id, responses: { [publicId]: { answer, working: 'place-value check' } } },
    requestId: 'clear-resave',
  });
  const marked = engine.apply({
    learnerId: 'learner-response-clear',
    subjectRecord: { state: resaved.state, data: resaved.data },
    command: 'mark-session',
    payload: { expectedSessionId: resaved.state.session.id },
    requestId: 'clear-mark',
  });

  assert.equal(marked.data.events[0].response.working, 'place-value check');
  assert.equal(marked.events[0].response.working, 'place-value check');
});

test('supported Reasoning success updates practice but does not award monster evidence', () => {
  const templateId = 'pv_rounding_context';
  const seed = 1;
  const question = generateReasoningQuestion(templateId, seed);
  const answer = findNumericCorrectAnswer(question);
  const engine = createServerReasoningEngine({ now: () => 60_000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-supported-no-star',
    subjectRecord: { data: { retryQueue: [{ templateId, seed, dueAt: 0, skillIds: ['pv_rounding'] }] } },
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3, viewMode: 'one' },
    requestId: 'supported-start',
  });
  const ref = started.state.session.questionRefs[0];
  const firstWrong = engine.apply({
    learnerId: 'learner-supported-no-star',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: started.state.session.id, expectedQuestionId: ref.itemId, response: { answer: '0' } },
    requestId: 'supported-wrong',
  });
  const supported = engine.apply({
    learnerId: 'learner-supported-no-star',
    subjectRecord: { state: firstWrong.state, data: firstWrong.data },
    command: 'request-support',
    payload: { expectedSessionId: firstWrong.state.session.id, expectedQuestionId: ref.itemId, kind: 'worked' },
    requestId: 'supported-help',
  });
  const marked = engine.apply({
    learnerId: 'learner-supported-no-star',
    subjectRecord: { state: supported.state, data: supported.data },
    command: 'submit-answer',
    payload: { expectedSessionId: supported.state.session.id, expectedQuestionId: ref.itemId, response: { answer } },
    requestId: 'supported-mark',
  });

  assert.equal(marked.stats.overview.totalQuestions, 1);
  assert.equal(marked.stats.overview.evidenceStars, 0);
  assert.deepEqual(marked.events.map((event) => event.type), [
    'reasoning.answer-submitted',
    'reasoning.session-completed',
  ]);
});

test('Reasoning numeric answers accept common KS2 unit suffixes without changing the mark scheme', () => {
  const angleQuestion = generateReasoningQuestion('geometry_angles', 1);
  const angleAnswer = findNumericCorrectAnswer(angleQuestion);
  assert.equal(angleQuestion.evaluate({ answer: `${angleAnswer}°` }).correct, true);
  assert.equal(angleQuestion.evaluate({ answer: `${angleAnswer} degrees` }).correct, true);

  const areaQuestion = generateReasoningQuestion('perimeter_to_area', 1);
  const areaAnswer = findNumericCorrectAnswer(areaQuestion);
  assert.equal(areaQuestion.evaluate({ answer: `${areaAnswer} cm²` }).correct, true);
  assert.equal(areaQuestion.evaluate({ answer: `${areaAnswer} cm2` }).correct, true);

  const moneyQuestion = generateReasoningQuestion('money_change_multistep', 1);
  const moneyMatch = String(moneyQuestion.solutionLines.at(-1) || '').match(/= £([0-9.]+)\.$/);
  assert.ok(moneyMatch, 'money fixture should expose the expected change in the worked solution');
  const moneyAnswer = moneyMatch[1];
  assert.equal(moneyQuestion.evaluate({ answer: `£${moneyAnswer}` }).correct, true);
  assert.equal(moneyQuestion.evaluate({ answer: `${moneyAnswer}` }).correct, true);
  assert.equal(moneyQuestion.evaluate({ answer: `${moneyAnswer}m` }).correct, false);
  assert.equal(moneyQuestion.evaluate({ answer: `${moneyAnswer}cm` }).correct, false);
  assert.equal(moneyQuestion.evaluate({ answer: `${moneyAnswer}kg` }).correct, false);

  const noteQuestion = generateReasoningQuestion('money_smallest_note_needed', 1);
  const noteChangeMatch = String(noteQuestion.solutionLines.at(-1) || '').match(/change would be £([0-9.]+)\.$/);
  assert.ok(noteChangeMatch, 'note fixture should expose the expected change in the worked solution');
  const noteChange = noteChangeMatch[1];
  const note = ['500', '1000', '2000'].find((value) => noteQuestion.evaluate({ note: value, change: noteChange }).correct);
  assert.ok(note, 'note fixture should have a correct note value');
  assert.equal(noteQuestion.evaluate({ note, change: noteChange }).correct, true);
  assert.equal(noteQuestion.evaluate({ note: `${note}m`, change: noteChange }).correct, false);
  assert.equal(noteQuestion.evaluate({ note: `${note}cm`, change: noteChange }).correct, false);
  assert.equal(noteQuestion.evaluate({ note: `${note}kg`, change: noteChange }).correct, false);

  const discountQuestion = generateReasoningQuestion('fdp_discount_price', 1);
  const discountSavingMatch = String(discountQuestion.solutionLines[0] || '').match(/is £([0-9.]+)\.$/);
  const discountSaleMatch = String(discountQuestion.solutionLines[1] || '').match(/= £([0-9.]+)\.$/);
  assert.ok(discountSavingMatch, 'discount fixture should expose the expected saving');
  assert.ok(discountSaleMatch, 'discount fixture should expose the expected sale price');
  const saving = discountSavingMatch[1];
  const salePrice = discountSaleMatch[1];
  assert.equal(discountQuestion.evaluate({ saving, salePrice }).correct, true);
  assert.equal(discountQuestion.evaluate({ saving: `${saving}cm`, salePrice }).correct, false);
  assert.equal(discountQuestion.evaluate({ saving, salePrice: `${salePrice}kg` }).correct, false);

  const estimateQuestion = generateReasoningQuestion('reason_budget_estimate', 1);
  const estimateMatch = String(estimateQuestion.solutionLines[1] || '').match(/= £([0-9.]+)\.$/);
  assert.ok(estimateMatch, 'budget estimate fixture should expose the expected estimated total');
  const estimate = estimateMatch[1];
  const enough = ['yes', 'no'].find((value) => estimateQuestion.evaluate({ estimate, enough: value }).correct);
  assert.ok(enough, 'budget estimate fixture should have a correct budget choice');
  assert.equal(estimateQuestion.evaluate({ estimate: `${estimate}m`, enough }).correct, false);
});

test('worker subject runtime wires reasoning command handlers', async () => {
  const runtime = createWorkerSubjectRuntime({ reasoning: { now: () => 1000, random: () => 0 } });
  const started = await runtime.dispatch({
    subjectId: 'reasoning',
    command: 'start-session',
    learnerId: 'learner-1',
    requestId: 'reasoning-runtime-start',
    expectedLearnerRevision: 0,
    payload: { mode: 'smart', viewMode: 'one', roundLength: 3 },
  }, {
    now: 1000,
    session: { accountId: 'adult-1' },
    repository: {
      async readSubjectRuntime(_accountId, _learnerId, subjectId) {
        assert.equal(subjectId, 'reasoning');
        return { subjectRecord: null, latestSession: null };
      },
      async readLearnerProjectionInput() {
        return { projectionState: { gameState: {}, events: [] }, tokens: [] };
      },
    },
  });

  assert.equal(started.subjectId, 'reasoning');
  assert.equal(started.subjectReadModel.subjectId, 'reasoning');
  assert.equal(started.subjectReadModel.phase, 'session');
  assert.ok(started.subjectReadModel.session.currentQuestion.id);
  assert.equal(started.subjectReadModel.session.currentQuestion.evaluate, undefined);
  assert.ok(started.runtimeWrite.state.session.id);
});
