import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMatches, createServerReadingEngine } from '../worker/src/subjects/reading/engine.js';
import { buildReadingReadModel } from '../worker/src/subjects/reading/read-models.js';
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';

function fakeContext() {
  let subjectRecord = null;
  return {
    now: 1000,
    session: { accountId: 'acc1' },
    repository: {
      async readSubjectRuntime(_accountId, _learnerId, subjectId) {
        assert.equal(subjectId, 'reading');
        return { subjectRecord, latestSession: null };
      },
      async readLearnerProjectionInput() {
        return { projectionState: { gameState: {}, events: [] }, tokens: [] };
      },
    },
    setRecord(next) { subjectRecord = next; },
  };
}

test('reading engine starts a passage-first session and hides answer metadata before attempt', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'one' }, requestId: 'r1' });
  assert.equal(started.state.phase, 'question');
  assert.ok(started.state.session.sections[0].questionIds.length > 0);
  const readModel = buildReadingReadModel({ learnerId: 'l1', state: started.state, data: started.data, stats: started.stats, analytics: started.analytics });
  assert.equal(readModel.session.passage.id, 'red_tin_box');
  assert.ok(readModel.session.currentQuestion.stem);
  assert.equal(readModel.session.currentQuestion.modelAnswer, undefined);
  assert.equal(readModel.session.currentQuestion.explanation, undefined);
});

test('reading engine marks deterministically and then exposes feedback safely', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'one' }, requestId: 'r1' });
  const session = started.state.session;
  const qid = session.sections[0].questionIds[0];
  const marked = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: session.id, expectedQuestionId: qid, response: { answer: 'folded slips of paper' } },
    requestId: 'r2',
  });
  assert.equal(marked.state.phase, 'feedback');
  assert.equal(marked.state.feedback.result.score, 1);
  assert.equal(marked.events[0].type, 'reading.answer-submitted');
  const readModel = buildReadingReadModel({ learnerId: 'l1', state: marked.state, data: marked.data, stats: marked.stats, analytics: marked.analytics });
  assert.ok(readModel.feedback.result.modelAnswer.includes('Folded'));
  assert.ok(readModel.session.currentQuestion.modelAnswer.includes('Folded'));
});


test('reading exact match checks reject learner substrings of the correct answer', () => {
  const check = { exactAny: ['Folded slips of paper with notes on them'] };
  assert.equal(checkMatches('Folded slips of paper with notes on them', check), true);
  assert.equal(checkMatches('The box held folded slips of paper with notes on them', check), true);
  assert.equal(checkMatches('folded slips', check), false);
  assert.equal(checkMatches('he', check), false);
});

test('reading contains checks use phrase boundaries rather than character substrings', () => {
  const check = { containsAny: ['red tin box'] };
  assert.equal(checkMatches('She opened the red tin box carefully.', check), true);
  assert.equal(checkMatches('The red tin boxed set was on the shelf.', check), false);
  assert.equal(checkMatches('red tin', check), false);
});

test('reading save-response rejects stale expected session or question ids', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'one' }, requestId: 'r1' });
  const session = started.state.session;
  const qid = session.sections[0].questionIds[0];
  const staleSession = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'save-response',
    payload: { expectedSessionId: 'wrong-session', expectedQuestionId: qid, response: { answer: 'should not save' } },
    requestId: 'r2',
  });
  assert.equal(staleSession.changed, false);
  assert.equal(staleSession.state.session.sections[0].responses[qid], undefined);

  const staleQuestion = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'save-response',
    payload: { expectedSessionId: session.id, expectedQuestionId: 'wrong-question', response: { answer: 'should not save' } },
    requestId: 'r3',
  });
  assert.equal(staleQuestion.changed, false);
  assert.equal(staleQuestion.state.session.sections[0].responses[qid], undefined);
});

test('reading marked answers cannot be overwritten by duplicate or stale submissions', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'one' }, requestId: 'r1' });
  const session = started.state.session;
  const qid = session.sections[0].questionIds[0];
  const marked = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: session.id, expectedQuestionId: qid, response: { answer: 'folded slips of paper' } },
    requestId: 'r2',
  });
  const originalResponse = marked.state.session.sections[0].responses[qid];
  const originalResult = marked.state.session.sections[0].results[qid];

  const duplicate = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: marked.state, data: marked.data },
    command: 'submit-answer',
    payload: { expectedSessionId: session.id, expectedQuestionId: qid, response: { answer: 'changed after marking' } },
    requestId: 'r3',
  });
  assert.equal(duplicate.changed, false);
  assert.deepEqual(duplicate.state.session.sections[0].responses[qid], originalResponse);
  assert.deepEqual(duplicate.state.session.sections[0].results[qid], originalResult);
  assert.equal(duplicate.events.length, 0);

  const staleSave = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: marked.state, data: marked.data },
    command: 'save-response',
    payload: { expectedSessionId: session.id, expectedQuestionId: qid, response: { answer: 'changed by stale save' } },
    requestId: 'r4',
  });
  assert.equal(staleSave.changed, false);
  assert.deepEqual(staleSave.state.session.sections[0].responses[qid], originalResponse);
});

test('reading engine reloads persisted ui state for follow-up commands', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'l1',
    command: 'start-session',
    payload: { mode: 'guided', viewMode: 'one' },
    requestId: 'r1',
  });
  const session = started.state.session;
  const qid = session.sections[0].questionIds[0];

  const submitted = engine.apply({
    learnerId: 'l1',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: session.id,
      expectedQuestionId: qid,
      response: { answer: 'folded slips of paper' },
    },
    requestId: 'r2',
  });

  assert.equal(submitted.changed, true);
  assert.equal(submitted.state.phase, 'feedback');
  assert.equal(submitted.state.session.id, session.id);
});

test('reading due stats and review queue use the injected command clock', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const subjectRecord = {
    state: {},
    data: {
      skills: {
        '2a': {
          attempts: 1,
          correct: 1,
          wrong: 0,
          strength: 0.7,
          intervalDays: 1,
          dueAt: 1500,
          lastSeenAt: 900,
          lastWrongAt: null,
          correctStreak: 1,
        },
      },
      retryQueue: [{ questionId: 'future-review', passageId: 'red_tin_box', skillId: '2a', dueAt: 1500 }],
    },
  };
  const result = engine.apply({
    learnerId: 'l1',
    subjectRecord,
    command: 'save-prefs',
    payload: { prefs: { mode: 'guided' } },
    requestId: 'clock-regression',
  });
  assert.equal(result.stats.overview.due, 0);
  assert.equal(result.analytics.reviewQueue.length, 0);
  assert.equal(result.analytics.generatedAt, 1000);
});

test('worker subject runtime wires reading command handlers', async () => {
  const runtime = createWorkerSubjectRuntime({ reading: { now: () => 1000, random: () => 0 } });
  const context = fakeContext();
  const started = await runtime.dispatch({
    subjectId: 'reading',
    command: 'start-session',
    learnerId: 'l1',
    requestId: 'r1',
    expectedLearnerRevision: 0,
    payload: { mode: 'guided', viewMode: 'one' },
  }, context);
  assert.equal(started.subjectId, 'reading');
  assert.equal(started.subjectReadModel.subjectId, 'reading');
  assert.equal(started.subjectReadModel.phase, 'question');
  assert.ok(started.runtimeWrite.state.session.id);
});

import { projectReadingRewards } from '../worker/src/projections/rewards.js';

test('reading secured skill events project into reading-owned monster rewards', () => {
  const projection = projectReadingRewards({
    learnerId: 'l1',
    domainEvents: [{
      type: 'reading.skill-secured',
      subjectId: 'reading',
      learnerId: 'l1',
      skillId: '2d',
      contentReleaseId: 'reading-poc-promoted-2026-05-05',
    }],
    gameState: {},
    random: () => 0,
  });
  assert.ok(projection.rewardEvents.length >= 1);
  assert.equal(projection.rewardEvents[0].subjectId, 'reading');
  assert.equal(projection.rewardEvents[0].monsterId, 'inferane');
  assert.ok(projection.changedGameState['monster-codex'].inferane.caught);
});

test('reading delayed-feedback sessions do not expose answers through immediate submit or section mark', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'test', viewMode: 'one', paperId: 'paper_i' }, requestId: 'r1' });
  const session = started.state.session;
  const qid = session.sections[0].questionIds[0];

  const submitted = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'submit-answer',
    payload: { expectedSessionId: session.id, expectedQuestionId: qid, response: { answer: 'blue folder' } },
    requestId: 'r2',
  });
  assert.equal(submitted.state.phase, 'question');
  assert.equal(submitted.state.feedback, null);
  assert.equal(Object.keys(submitted.state.session.sections[0].results).length, 0);
  assert.equal(submitted.events.length, 0);

  const submittedReadModel = buildReadingReadModel({ learnerId: 'l1', state: submitted.state, data: submitted.data, stats: submitted.stats, analytics: submitted.analytics });
  assert.equal(submittedReadModel.session.result, null);
  assert.equal(submittedReadModel.session.currentQuestion.modelAnswer, undefined);

  const sectionMarked = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: submitted.state, data: submitted.data },
    command: 'mark-section',
    payload: {},
    requestId: 'r3',
  });
  assert.equal(Object.keys(sectionMarked.state.session.sections[0].results).length, 0);
  assert.match(sectionMarked.state.error, /whole paper/i);

  const sessionMarked = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: sectionMarked.state, data: sectionMarked.data },
    command: 'mark-session',
    payload: {},
    requestId: 'r4',
  });
  assert.equal(sessionMarked.state.error, '');
  assert.ok(Object.keys(sessionMarked.data.events).length > 0);
});

test('reading reward thresholds use direct clusters plus a full-domain aggregate monster', () => {
  const skills = ['2a', '2g', '2b', '2c', '2d', '2e', '2f', '2h'];
  let gameState = {};
  const allEvents = [];
  for (const skillId of skills) {
    const projection = projectReadingRewards({
      learnerId: 'l1',
      domainEvents: [{
        type: 'reading.skill-secured',
        subjectId: 'reading',
        learnerId: 'l1',
        skillId,
        contentReleaseId: 'reading-poc-promoted-2026-05-05',
      }],
      gameState,
      random: () => 0,
    });
    gameState = projection.gameState;
    allEvents.push(...projection.rewardEvents);
  }

  const codex = gameState['monster-codex'];
  assert.equal(codex.readbloom.mastered.length, 2);
  assert.equal(codex.lorequill.mastered.length, 8);
  assert.ok(allEvents.some((event) => event.monsterId === 'lorequill' && event.kind === 'mega'));
  assert.ok(allEvents.some((event) => event.monsterId === 'readbloom' && event.kind === 'mega'));
});

test('reading list-view read model exposes a safe current-section question list', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'list' }, requestId: 'r1' });
  const readModel = buildReadingReadModel({ learnerId: 'l1', state: started.state, data: started.data, stats: started.stats, analytics: started.analytics });
  assert.equal(readModel.session.viewMode, 'list');
  assert.equal(readModel.session.currentSection.index, 0);
  assert.equal(readModel.session.questions.length, started.state.session.sections[0].questionIds.length);
  assert.equal(readModel.session.questions[0].modelAnswer, undefined);
  assert.equal(readModel.session.questions[0].explanation, undefined);
  assert.equal(readModel.session.questions[0].response.answer, undefined);
});

test('reading save-response can persist visible section drafts and navigate without marking', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'list' }, requestId: 'r1' });
  const session = started.state.session;
  const [firstQid, secondQid] = session.sections[0].questionIds;
  const saved = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'save-response',
    payload: {
      expectedSessionId: session.id,
      expectedSectionIndex: 0,
      responses: {
        [firstQid]: { answer: 'folded slips of paper' },
        [secondQid]: { answer: '1' },
      },
      move: { questionIndex: 1 },
    },
    requestId: 'r2',
  });
  assert.equal(saved.changed, true);
  assert.equal(saved.state.session.currentQuestionIndex, 1);
  assert.deepEqual(saved.state.session.sections[0].responses[firstQid], { answer: 'folded slips of paper' });
  assert.equal(Object.keys(saved.state.session.sections[0].results).length, 0);
});

test('reading mark-section accepts current visible section drafts before deterministic marking', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'list' }, requestId: 'r1' });
  const session = started.state.session;
  const qid = session.sections[0].questionIds[0];
  const marked = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'mark-section',
    payload: {
      expectedSessionId: session.id,
      expectedSectionIndex: 0,
      responses: { [qid]: { answer: 'folded slips of paper' } },
    },
    requestId: 'r2',
  });
  assert.equal(marked.changed, true);
  assert.equal(marked.state.phase, 'summary');
  const event = marked.events.find((entry) => entry.type === 'reading.answer-submitted' && entry.questionId === qid);
  assert.equal(event?.score, 1);
  assert.equal(event?.maxScore, 1);
});

test('reading section response merge does not blank previously saved one-question drafts', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'one' }, requestId: 'r1' });
  const session = started.state.session;
  const [firstQid, secondQid] = session.sections[0].questionIds;
  const savedFirst = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'save-response',
    payload: {
      expectedSessionId: session.id,
      expectedSectionIndex: 0,
      expectedQuestionId: firstQid,
      response: { answer: 'folded slips of paper' },
      move: { questionIndex: 1 },
    },
    requestId: 'r2',
  });

  const merged = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: savedFirst.state, data: savedFirst.data },
    command: 'save-response',
    payload: {
      expectedSessionId: session.id,
      expectedSectionIndex: 0,
      responses: {
        [firstQid]: {},
        [secondQid]: { answer: '1' },
      },
      preserveExistingNonEmptyResponses: true,
    },
    requestId: 'r3',
  });
  assert.deepEqual(merged.state.session.sections[0].responses[firstQid], { answer: 'folded slips of paper' });

  const marked = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: merged.state, data: merged.data },
    command: 'mark-section',
    payload: {
      expectedSessionId: session.id,
      expectedSectionIndex: 0,
      responses: { [secondQid]: { answer: '1' } },
    },
    requestId: 'r4',
  });

  const firstEvent = marked.events.find((entry) => entry.type === 'reading.answer-submitted' && entry.questionId === firstQid);
  assert.equal(firstEvent?.score, 1);
});

test('reading list-mode section save can explicitly clear a previously saved draft', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'list' }, requestId: 'r1' });
  const session = started.state.session;
  const [firstQid] = session.sections[0].questionIds;
  const saved = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'save-response',
    payload: {
      expectedSessionId: session.id,
      expectedSectionIndex: 0,
      responses: { [firstQid]: { answer: 'folded slips of paper' } },
    },
    requestId: 'r2',
  });
  assert.deepEqual(saved.state.session.sections[0].responses[firstQid], { answer: 'folded slips of paper' });

  const cleared = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: saved.state, data: saved.data },
    command: 'save-response',
    payload: {
      expectedSessionId: session.id,
      expectedSectionIndex: 0,
      responses: { [firstQid]: { answer: '' } },
    },
    requestId: 'r3',
  });
  assert.deepEqual(cleared.state.session.sections[0].responses[firstQid], { answer: '' });
});

test('reading save and mark commands reject stale expected section indexes', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'list' }, requestId: 'r1' });
  const session = started.state.session;
  const qid = session.sections[0].questionIds[0];

  const staleSave = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'save-response',
    payload: {
      expectedSessionId: session.id,
      expectedSectionIndex: 1,
      responses: { [qid]: { answer: 'folded slips of paper' } },
    },
    requestId: 'r2',
  });
  assert.equal(staleSave.changed, false);
  assert.equal(staleSave.state.session.sections[0].responses[qid], undefined);

  const staleMark = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'mark-section',
    payload: {
      expectedSessionId: session.id,
      expectedSectionIndex: 1,
      responses: { [qid]: { answer: 'folded slips of paper' } },
    },
    requestId: 'r3',
  });
  assert.equal(staleMark.changed, false);
  assert.equal(Object.keys(staleMark.state.session.sections[0].results).length, 0);
  assert.equal(staleMark.events.length, 0);
});
