import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { createServerReasoningEngine } from '../worker/src/subjects/reasoning/engine.js';
import { generateReasoningQuestion } from '../shared/reasoning/content.js';
import { projectReasoningRewards } from '../worker/src/projections/rewards.js';

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
    payload: { mode: 'smart', roundLength: 3 },
    requestId: 'clock-start',
  });
  assert.equal(started.practiceSession.startedAt, new Date(1_700_000_000_000).toISOString());
  assert.equal(started.practiceSession.updatedAt, new Date(1_700_000_000_000).toISOString());

  nowValue = 1_700_000_060_000;
  const supported = engine.apply({
    learnerId: 'learner-clock',
    subjectRecord: { state: started.state, data: started.data },
    command: 'request-support',
    payload: { kind: 'faded' },
    requestId: 'clock-support',
  });

  const itemId = supported.state.session.questionRefs[0].itemId;
  assert.equal(supported.state.session.support[itemId].requestedAt, 1_700_000_060_000);
  assert.equal(supported.practiceSession.startedAt, new Date(1_700_000_000_000).toISOString());
  assert.equal(supported.practiceSession.updatedAt, new Date(1_700_000_060_000).toISOString());
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
