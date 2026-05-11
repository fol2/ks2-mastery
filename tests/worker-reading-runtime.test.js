import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMatches, createServerReadingEngine, evaluateReadingQuestion } from '../worker/src/subjects/reading/engine.js';
import { buildReadingReadModel } from '../worker/src/subjects/reading/read-models.js';
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { READING_PASSAGES } from '../shared/reading/content.js';

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

test('reading phrase checks reject locally negated correct phrases', () => {
  assert.equal(checkMatches('speech marks', { containsAny: ['speech marks'] }), true);
  assert.equal(checkMatches('The answer is speech marks.', { containsAny: ['speech marks'] }), true);
  assert.equal(checkMatches('No. Speech marks.', { containsAny: ['speech marks'] }), true);
  assert.equal(checkMatches('not speech marks', { containsAny: ['speech marks'] }), false);
  assert.equal(checkMatches('It is not because of speech marks.', { containsAny: ['speech marks'] }), false);
  assert.equal(checkMatches('not speech marks, but speech marks', { containsAny: ['speech marks'] }), true);
  assert.equal(checkMatches('folded slips of paper', { keywordAny: [['fold', 'slip', 'paper']] }), true);
  assert.equal(checkMatches('Folded. Slips of paper.', { keywordAny: [['fold', 'slip', 'paper']] }), true);
  assert.equal(checkMatches('It was folded. They were slips of paper.', { keywordAny: [['fold', 'slip', 'paper']] }), true);
  assert.equal(checkMatches('not folded slips of paper', { keywordAny: [['fold', 'slip', 'paper']] }), false);
  assert.equal(checkMatches('It was folded, not slips of paper', { keywordAny: [['fold', 'slip', 'paper']] }), false);
  assert.equal(checkMatches('It was folded; not slips of paper', { keywordAny: [['fold', 'slip', 'paper']] }), false);
  assert.equal(checkMatches('not folded slips of paper, but folded slips of paper', { keywordAny: [['fold', 'slip', 'paper']] }), true);
  assert.equal(checkMatches('not only speech marks', { containsAny: ['speech marks'] }), true);
  assert.equal(checkMatches('speech marks are not needed', { containsAny: ['speech marks'] }), false);
  assert.equal(checkMatches('speech marks not needed', { containsAny: ['speech marks'] }), false);
  assert.equal(checkMatches('folded slips of paper were not inside', { keywordAny: [['fold', 'slip', 'paper']] }), false);
  assert.equal(checkMatches('the house around her seemed to change did not happen', { containsAny: ['the house around her seemed to change'] }), false);
  assert.equal(checkMatches('the house around her seemed to change was false', { containsAny: ['the house around her seemed to change'] }), false);
  assert.equal(checkMatches('It had folded slips of paper, not coins.', { keywordAny: [['fold', 'slip', 'paper']] }), true);
  assert.equal(checkMatches('folded slips of paper, but not coins', { keywordAny: [['fold', 'slip', 'paper']] }), true);
});

test('reading evidence fallback does not award marks for negated evidence quotes', () => {
  const question = {
    id: 'negated_evidence_probe',
    type: 'evidenceShort',
    skill: '2d',
    marks: 2,
    answerMarks: 1,
    evidenceMarks: 1,
    answerCheck: { keywordAny: [['house', 'change']] },
    evidenceCheck: { containsAny: ['the house around her seemed to change'] },
    modelAnswer: 'The house seems different; evidence could include "the house around her seemed to change".',
    explanation: '',
  };

  const valid = evaluateReadingQuestion(question, {
    answer: 'the house changes',
    evidence: 'the house around her seemed to change',
  });
  assert.equal(valid.score, 2);

  const negated = evaluateReadingQuestion(question, {
    answer: 'the house changes',
    evidence: 'not the house around her seemed to change',
  });
  assert.equal(negated.score, 1);
  assert.equal(negated.correct, false);

  const negatedLaterToken = evaluateReadingQuestion(question, {
    answer: 'the house changes',
    evidence: 'the house did not change around her',
  });
  assert.equal(negatedLaterToken.score, 1);
  assert.equal(negatedLaterToken.correct, false);

  const negatedAfterPhrase = evaluateReadingQuestion(question, {
    answer: 'the house changes',
    evidence: 'the house around her seemed to change did not happen',
  });
  assert.equal(negatedAfterPhrase.score, 1);
  assert.equal(negatedAfterPhrase.correct, false);

  const negatedAfterOverlap = evaluateReadingQuestion(question, {
    answer: 'the house changes',
    evidence: 'house around her seemed to change did not happen',
  });
  assert.equal(negatedAfterOverlap.score, 1);
  assert.equal(negatedAfterOverlap.correct, false);

  const contrastAfterPhrase = evaluateReadingQuestion(question, {
    answer: 'the house changes',
    evidence: 'the house around her seemed to change, not the tin box',
  });
  assert.equal(contrastAfterPhrase.score, 2);

  const corrected = evaluateReadingQuestion(question, {
    answer: 'the house changes',
    evidence: 'not the house around her seemed to change, but the house around her seemed to change',
  });
  assert.equal(corrected.score, 2);

  const partialCorrected = evaluateReadingQuestion(question, {
    answer: 'the house changes',
    evidence: 'wrong: the house around her seemed. However, house around her seemed to change',
  });
  assert.equal(partialCorrected.score, 2);
});

test('reading evidence checks accept source-affirmed negation snippets', () => {
  const seedVault = READING_PASSAGES.find((passage) => passage.id === 'seed_vault_guardians');
  const svgQ3 = seedVault.questions.find((question) => question.id === 'svg_q3');
  const svgQ10 = seedVault.questions.find((question) => question.id === 'svg_q10');

  assert.equal(checkMatches('A few seeds are kept locally, and duplicate samples are sent to another seed bank so one accident cannot erase a variety.', svgQ3.evidenceCheck), true);
  assert.equal(checkMatches('A seed bank is not a museum of dead things.', svgQ10.evidenceCheck), true);

  const marked = evaluateReadingQuestion(svgQ10, {
    answer: 'It is not dead; it is living and can grow for future harvests.',
    evidence: 'A seed bank is not a museum of dead things.',
  });
  assert.equal(marked.score, 2);
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



test('reading avoids immediate passage repeats after a started session is ended without answers', () => {
  let clock = 1000;
  const engine = createServerReadingEngine({ now: () => clock, random: () => 0 });
  const first = engine.apply({
    learnerId: 'l1',
    command: 'start-session',
    payload: { mode: 'guided', viewMode: 'one' },
    requestId: 'r1',
  });
  assert.equal(first.state.session.sections[0].passageId, 'red_tin_box');

  clock = 1500;
  const ended = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: first.state, data: first.data },
    command: 'end-session',
    payload: {},
    requestId: 'r2',
  });

  clock = 2000;
  const second = engine.apply({
    learnerId: 'l1',
    subjectRecord: { state: ended.state, data: ended.data },
    command: 'start-session',
    payload: { mode: 'guided', viewMode: 'one' },
    requestId: 'r3',
  });

  assert.equal(second.state.session.sections[0].passageId, 'city_swifts');
  assert.notEqual(second.state.session.sections[0].passageId, first.state.session.sections[0].passageId);
});

test('reading guided mode uses weakness and variety rather than always taking the first four questions', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const strongQuestion = {
    attempts: 6,
    correct: 6,
    wrong: 0,
    strength: 0.97,
    intervalDays: 14,
    dueAt: 1000 + 14 * 86400000,
    lastSeenAt: 900,
    correctStreak: 6,
  };
  const started = engine.apply({
    learnerId: 'l1',
    subjectRecord: {
      data: {
        questions: {
          rtb_q1: strongQuestion,
          rtb_q2: strongQuestion,
          rtb_q3: strongQuestion,
          rtb_q4: strongQuestion,
        },
      },
    },
    command: 'start-session',
    payload: { mode: 'guided', viewMode: 'one' },
    requestId: 'guided-variety',
  });

  const questionIds = started.state.session.sections[0].questionIds;
  assert.equal(started.state.session.sections[0].passageId, 'red_tin_box');
  assert.notDeepEqual(questionIds, ['rtb_q1', 'rtb_q2', 'rtb_q3', 'rtb_q4']);
  assert.ok(questionIds.includes('rtb_q5'));
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
import { progressForReadingMonster } from '../src/platform/game/monster-system.js';

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



test('reading secured skill event carries deep secure evidence and mastery key', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({ learnerId: 'l1', command: 'start-session', payload: { mode: 'guided', viewMode: 'one' }, requestId: 'r1' });
  const session = started.state.session;
  const qid = session.sections[0].questionIds[0];
  const marked = engine.apply({
    learnerId: 'l1',
    subjectRecord: {
      state: started.state,
      data: {
        ...started.data,
        skills: {
          ...started.data.skills,
          '2a': {
            attempts: 5,
            correct: 5,
            wrong: 0,
            strength: 0.9,
            intervalDays: 7,
            dueAt: 1000 + 7 * 86400000,
            lastSeenAt: 900,
            correctStreak: 5,
          },
        },
        securedSkillKeys: [],
      },
    },
    command: 'submit-answer',
    payload: { expectedSessionId: session.id, expectedQuestionId: qid, response: { answer: 'folded slips of paper' } },
    requestId: 'secure-evidence',
  });

  const secureEvent = marked.events.find((event) => event.type === 'reading.skill-secured' && event.skillId === '2a');
  assert.ok(secureEvent);
  assert.equal(secureEvent.masteryKey, 'reading-poc-promoted-2026-05-05:reading-skill:2a');
  assert.equal(secureEvent.secureEvidence.kind, 'deep-secure-reading-skill');
  assert.equal(secureEvent.secureEvidence.status, 'secured');
  assert.equal(secureEvent.secureEvidence.correctStreak, 5);
  assert.equal(secureEvent.secureEvidence.intervalDays, 7);
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



test('reading reward state exposes release-scoped 100-star high-water progress', () => {
  const projectionOne = projectReadingRewards({
    learnerId: 'l1',
    domainEvents: [{
      type: 'reading.skill-secured',
      subjectId: 'reading',
      learnerId: 'l1',
      skillId: '2a',
      contentReleaseId: 'reading-poc-promoted-2026-05-05',
    }],
    gameState: {},
    random: () => 0,
  });
  let codex = projectionOne.gameState['monster-codex'];
  assert.equal(codex.readbloom.starHighWater, 50);
  assert.equal(codex.readbloom.displayStars, 50);
  assert.equal(codex.lorequill.grandStars, 13);

  const projectionTwo = projectReadingRewards({
    learnerId: 'l1',
    domainEvents: [{
      type: 'reading.skill-secured',
      subjectId: 'reading',
      learnerId: 'l1',
      skillId: '2g',
      contentReleaseId: 'reading-poc-promoted-2026-05-05',
    }],
    gameState: projectionOne.gameState,
    random: () => 0,
  });
  codex = projectionTwo.gameState['monster-codex'];
  assert.equal(codex.readbloom.starHighWater, 100);
  assert.equal(codex.readbloom.displayStars, 100);

  const progress = progressForReadingMonster({
    readbloom: {
      caught: true,
      releaseId: 'reading-poc-promoted-2026-05-05',
      mastered: [
        'old-release:reading-skill:2a',
        'reading-poc-promoted-2026-05-05:reading-skill:2g',
      ],
      starHighWater: 100,
    },
  }, 'readbloom');
  assert.equal(progress.mastered, 1);
  assert.equal(progress.computedStars, 50);
  assert.equal(progress.displayStars, 100);
  assert.equal(progress.starHighWater, 100);
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
