import { cloneSerialisable } from '../../platform/core/repositories/index.js';
import { normaliseArithmeticReadModel } from './client-read-models.js';
import { createInitialArithmeticState, normaliseArithmeticPrefs } from './metadata.js';

const SUBJECT_ID = 'arithmetic';

// This intentionally small bank is the deterministic Node-harness reference.
// Production marking remains behind the Worker command boundary.
export const ARITHMETIC_THIN_SLICE_QUESTIONS = Object.freeze([
  Object.freeze({ id: 'arith-thin-add', stem: '3,486 + 2,157 =', answer: '5643', skillId: 'column_addition', skillName: 'Column addition', explanation: '3,486 + 2,157 = 5,643.' }),
  Object.freeze({ id: 'arith-thin-subtract', stem: '7,200 − 2,846 =', answer: '4354', skillId: 'column_subtraction', skillName: 'Column subtraction', explanation: '7,200 − 2,846 = 4,354.' }),
  Object.freeze({ id: 'arith-thin-multiply', stem: '36 × 24 =', answer: '864', skillId: 'short_multiplication', skillName: 'Multiplication', explanation: '36 × 24 = 864.' }),
  Object.freeze({ id: 'arith-thin-divide', stem: '936 ÷ 12 =', answer: '78', skillId: 'short_division', skillName: 'Division', explanation: '936 ÷ 12 = 78.' }),
  Object.freeze({ id: 'arith-thin-fraction', stem: 'Find 3/4 of 200.', answer: '150', skillId: 'fractions_of_amount', skillName: 'Fractions of amounts', explanation: 'One quarter of 200 is 50, so three quarters is 150.' }),
  Object.freeze({ id: 'arith-thin-percent', stem: 'Find 15% of 240.', answer: '36', skillId: 'percentages_of_amount', skillName: 'Percentages of amounts', explanation: '10% is 24 and 5% is 12, so 15% is 36.' }),
]);

function timestamp(now) {
  const value = typeof now === 'function' ? Number(now()) : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function questionAt(index) {
  const safeIndex = Math.max(0, Number(index) || 0) % ARITHMETIC_THIN_SLICE_QUESTIONS.length;
  const source = ARITHMETIC_THIN_SLICE_QUESTIONS[safeIndex];
  return {
    ...cloneSerialisable(source),
    templateLabel: 'Year 5/6 arithmetic',
    domain: 'Mixed arithmetic',
    marks: 1,
    inputSpec: { label: 'Answer' },
  };
}

function normaliseAnswer(value) {
  return String(value ?? '').trim().replace(/,/g, '');
}

function answerFromResponse(response) {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    return response.answer ?? response.typed ?? response.response?.answer ?? '';
  }
  return response;
}

function transition(state, { events = [], changed = true, ok = true } = {}) {
  return {
    ok,
    changed,
    state: cloneSerialisable(state),
    events: events.map((event) => cloneSerialisable(event)),
    audio: null,
  };
}

function statsFromData(data) {
  const attempts = Number(data.progress.attempts) || 0;
  const correct = Number(data.progress.correct) || 0;
  return {
    totalQuestions: attempts,
    attempts,
    correct,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    due: attempts ? 0 : 1,
    weak: Math.max(0, attempts - correct),
    securedSkills: 0,
    securedRewardUnits: 0,
    streakDays: 0,
    nextUp: attempts ? 'Next mixed arithmetic question' : 'First mixed arithmetic question',
  };
}

function analyticsFromData(data) {
  const stats = statsFromData(data);
  const skillRows = new Map();
  for (const attempt of data.progress.recentAttempts) {
    const row = skillRows.get(attempt.skillId) || {
      skillId: attempt.skillId,
      name: attempt.skillName,
      attempts: 0,
      correct: 0,
      strength: 0,
      status: 'new',
    };
    row.attempts += 1;
    if (attempt.correct) row.correct += 1;
    row.strength = Math.round((row.correct / row.attempts) * 100);
    row.status = row.strength >= 80 ? 'secure' : 'learning';
    skillRows.set(row.skillId, row);
  }
  const skills = [...skillRows.values()];
  return {
    attempts: stats.attempts,
    correct: stats.correct,
    accuracy: stats.accuracy,
    sessionsCompleted: Number(data.progress.sessionsCompleted) || 0,
    skills,
    strands: [{
      strandId: 'mixed_arithmetic',
      name: 'Year 5/6 mixed arithmetic',
      strength: stats.accuracy,
      status: stats.attempts ? 'learning' : 'new',
    }],
    misconceptions: [],
    recentAttempts: cloneSerialisable(data.progress.recentAttempts),
  };
}

function stateWithReadModels(state, learnerId, data) {
  const stats = statsFromData(data);
  return normaliseArithmeticReadModel({
    ...state,
    learnerId,
    prefs: normaliseArithmeticPrefs(data.prefs),
    stats: {
      overview: stats,
      skills: analyticsFromData(data).skills,
    },
    analytics: analyticsFromData(data),
    parentSummary: stats.attempts
      ? `Arithmetic has ${stats.attempts} answered question${stats.attempts === 1 ? '' : 's'} at ${stats.accuracy}% accuracy.`
      : 'Arithmetic is ready for a short Year 5/6 mixed practice round.',
  }, learnerId);
}

export function createArithmeticService({ repository, now = Date.now } = {}) {
  if (!repository) {
    throw new TypeError('Arithmetic service requires a repository.');
  }

  const clock = () => timestamp(now);

  return {
    initState(previousState, learnerId = '') {
      const data = repository.readData(learnerId);
      return stateWithReadModels(
        normaliseArithmeticReadModel(previousState, learnerId),
        learnerId,
        data,
      );
    },
    getPrefs(learnerId) {
      return normaliseArithmeticPrefs(repository.readData(learnerId).prefs);
    },
    savePrefs(learnerId, patch = {}) {
      const data = repository.readData(learnerId);
      data.prefs = normaliseArithmeticPrefs({ ...data.prefs, ...patch });
      repository.writeData(learnerId, data);
      return cloneSerialisable(data.prefs);
    },
    getStats(learnerId) {
      return statsFromData(repository.readData(learnerId));
    },
    getAnalyticsSnapshot(learnerId) {
      return analyticsFromData(repository.readData(learnerId));
    },
    startSession(learnerId, options = {}) {
      const data = repository.readData(learnerId);
      data.prefs = normaliseArithmeticPrefs({ ...data.prefs, ...options });
      repository.writeData(learnerId, data);
      const startedAt = clock();
      const question = questionAt(data.progress.nextIndex);
      const session = {
        id: `arithmetic-thin-session-${learnerId}-${startedAt}`,
        mode: 'smart',
        goal: 'thin-slice',
        startedAt,
        status: 'active',
        answered: 0,
        correct: 0,
        score: 0,
        maxScore: 1,
        currentIndex: 0,
        currentQuestion: question,
      };
      repository.writeActiveSession(learnerId, session, startedAt);
      return transition(stateWithReadModels({
        ...createInitialArithmeticState(),
        phase: 'session',
        session,
      }, learnerId, data), {
        events: [{
          id: `arithmetic.session-started:${learnerId}:${session.id}`,
          type: 'arithmetic.session-started',
          subjectId: SUBJECT_ID,
          learnerId,
          sessionId: session.id,
          createdAt: startedAt,
        }],
      });
    },
    submitAnswer(learnerId, uiState, response) {
      const ui = this.initState(uiState, learnerId);
      const question = ui.session?.currentQuestion;
      if (ui.phase !== 'session' || !question) {
        return transition(ui, { ok: false, changed: false });
      }
      const submitted = normaliseAnswer(answerFromResponse(response));
      const correct = submitted === normaliseAnswer(question.answer);
      const completedAt = clock();
      const data = repository.readData(learnerId);
      data.progress.attempts += 1;
      data.progress.correct += correct ? 1 : 0;
      data.progress.nextIndex += 1;
      data.progress.sessionsCompleted += 1;
      data.progress.recentAttempts.push({
        questionId: question.id,
        skillId: question.skillId,
        skillName: question.skillName,
        correct,
        createdAt: completedAt,
      });
      data.progress.recentAttempts = data.progress.recentAttempts.slice(-20);
      repository.writeData(learnerId, data);
      const summary = {
        id: ui.session.id,
        mode: 'smart',
        answered: 1,
        questionCount: 1,
        correct: correct ? 1 : 0,
        score: correct ? 1 : 0,
        maxScore: 1,
        completedAt,
      };
      const completedSession = {
        ...ui.session,
        status: 'completed',
        answered: 1,
        correct: correct ? 1 : 0,
        score: correct ? 1 : 0,
        completedAt,
      };
      repository.writeCompletedSession(learnerId, completedSession, summary, completedAt);
      return transition(stateWithReadModels({
        ...createInitialArithmeticState(),
        phase: 'summary',
        session: completedSession,
        feedback: {
          questionId: question.id,
          result: {
            correct,
            score: correct ? 1 : 0,
            maxScore: 1,
            feedbackShort: correct ? 'Correct.' : 'Not quite.',
            feedbackLong: correct ? question.explanation : `The correct answer is ${question.answer}. ${question.explanation}`,
            answerText: question.answer,
          },
          solutionLines: [question.explanation],
        },
        summary,
      }, learnerId, data), {
        events: [
          {
            id: `arithmetic.answer-submitted:${learnerId}:${ui.session.id}`,
            type: 'arithmetic.answer-submitted',
            subjectId: SUBJECT_ID,
            learnerId,
            sessionId: ui.session.id,
            questionId: question.id,
            correct,
            createdAt: completedAt,
          },
          {
            id: `arithmetic.session-completed:${learnerId}:${ui.session.id}`,
            type: 'arithmetic.session-completed',
            subjectId: SUBJECT_ID,
            learnerId,
            sessionId: ui.session.id,
            answered: 1,
            correct: correct ? 1 : 0,
            createdAt: completedAt,
          },
        ],
      });
    },
    continueSession(learnerId, uiState) {
      const ui = this.initState(uiState, learnerId);
      if (ui.phase !== 'summary') return transition(ui, { changed: false });
      return transition(stateWithReadModels(createInitialArithmeticState(), learnerId, repository.readData(learnerId)));
    },
    endSession(learnerId, uiState) {
      const ui = this.initState(uiState, learnerId);
      if (ui.phase === 'session' && ui.session) {
        repository.writeAbandonedSession(learnerId, ui.session, clock());
      }
      return transition(stateWithReadModels(createInitialArithmeticState(), learnerId, repository.readData(learnerId)));
    },
    resetLearner(learnerId) {
      repository.resetLearner(learnerId);
    },
  };
}
