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
  assert.deepEqual(marked.events.map((event) => event.type), [
    'reasoning.answer-submitted',
    'reasoning.session-completed',
  ]);
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
