import { arithmeticPublicQuestionId } from './shared/arithmetic/content.js';
import { createServerArithmeticEngine } from './worker/src/subjects/arithmetic/engine.js';

function answerFor(question) {
  return question.expected.kind === 'fraction' ? `${question.expected.n}/${question.expected.d}` : String(question.expected.value);
}
function publicQuestionId(session) {
  return arithmeticPublicQuestionId({ sessionId: session?.id || '', question: session?.currentQuestion, index: session?.currentIndex || 0 });
}
const now = 1700000000000;
const makeDueData = () => ({
  prefs: { mode: 'smart', goal: 'due', focusSkillId: '', testForm: 'short' },
  skills: {
    number_bonds: { attempts: 1, correct: 1, wrong: 0, strength: 0.62, intervalDays: 1, dueAt: now - 1000, lastSeenAt: new Date(now - 86400000).toISOString(), lastWrongAt: null, correctStreak: 1 },
  },
  templates: {}, rewardUnits: {}, misconceptions: {}, retryQueue: [], recentAttempts: [], sessions: [], streak: { lastPracticeDay: null, days: 0 },
});
const engine = createServerArithmeticEngine({ now: () => now });
const dueStarted = engine.apply({ learnerId: 'probe-due', subjectRecord: { ui: {}, data: makeDueData() }, command: 'start-session', payload: { mode: 'smart', goal: 'due' }, requestId: 'probe-due-start' });
const wrong = engine.apply({ learnerId: 'probe-due', subjectRecord: { ui: dueStarted.state, data: dueStarted.data }, command: 'submit-answer', payload: { expectedSessionId: dueStarted.state.session.id, expectedQuestionId: publicQuestionId(dueStarted.state.session), response: { answer: '999999999' } }, requestId: 'probe-due-wrong' });
const emptyStarted = engine.apply({ learnerId: 'probe-empty-due', subjectRecord: { ui: {}, data: {} }, command: 'start-session', payload: { mode: 'smart', goal: 'due' }, requestId: 'probe-empty-start' });
let empty = emptyStarted;
let iterations = 0;
for (; iterations < 10 && empty.state.phase !== 'summary'; iterations += 1) {
  empty = engine.apply({ learnerId:'probe-empty-due', subjectRecord:{ui:empty.state,data:empty.data}, command:'submit-answer', payload:{ expectedSessionId: empty.state.session.id, expectedQuestionId: publicQuestionId(empty.state.session), response:{answer:answerFor(empty.state.session.currentQuestion)}}, requestId:`probe-empty-submit-${iterations}`});
  if (empty.state.phase !== 'summary') {
    empty = engine.apply({ learnerId:'probe-empty-due', subjectRecord:{ui:empty.state,data:empty.data}, command:'continue-session', payload:{ expectedSessionId: empty.state.session.id, expectedQuestionId: publicQuestionId(empty.state.session)}, requestId:`probe-empty-continue-${iterations}`});
  }
}
console.log(JSON.stringify({
  dueStart: dueStarted.state.session.dueStart,
  firstQuestionTemplate: dueStarted.state.session.currentQuestion.templateId,
  firstQuestionSkillIds: dueStarted.state.session.currentQuestion.skillIds,
  firstQuestionTargetsDueSkill: dueStarted.state.session.currentQuestion.skillIds.includes('number_bonds'),
  wrongAnswerPhase: wrong.state.phase,
  wrongAnswerSummary: wrong.state.summary,
  wrongAnswerSessionStatus: wrong.state.session?.status,
  emptyDueStart: emptyStarted.state.session.dueStart,
  emptyDueAfterTenCorrectPhase: empty.state.phase,
  emptyDueAfterTenCorrectSummary: empty.state.summary,
  emptyDueAfterTenIterations: iterations,
  emptyDueAfterTenAnswered: empty.state.session?.answered ?? empty.state.summary?.answered,
}, null, 2));
