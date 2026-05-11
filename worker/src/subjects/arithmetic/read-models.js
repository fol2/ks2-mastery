import {
  ARITHMETIC_CONTENT_RELEASE_ID,
  arithmeticPublicQuestionId,
  arithmeticContentSummary,
  safeQuestionForClient,
} from '../../../../shared/arithmetic/content.js';

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function safeSession(session, { includeReview = false } = {}) {
  if (!session) return null;
  const safe = {
    id: session.id,
    mode: session.mode,
    goal: session.goal,
    focusSkillId: session.focusSkillId || '',
    testForm: session.testForm || 'short',
    startedAt: session.startedAt,
    status: session.status || 'active',
    answered: session.answered || 0,
    correct: session.correct || 0,
    score: session.score || 0,
    maxScore: session.maxScore || 0,
    dueStart: session.dueStart || 0,
    currentIndex: session.currentIndex || 0,
    currentQuestion: safeQuestionForClient(session.currentQuestion, { sessionId: session.id, index: session.currentIndex || 0 }),
    heroContext: session.heroContext || null,
  };
  if (Array.isArray(session.paper)) {
    safe.paper = session.paper.map((entry, index) => ({
      index,
      status: entry.status || 'blank',
      response: entry.response || {},
      working: entry.working || '',
      question: safeQuestionForClient(entry.question, { includeAnswer: Boolean(includeReview || entry.result), sessionId: session.id, index }),
      result: includeReview || entry.result ? entry.result || null : null,
    }));
    safe.questionCount = safe.paper.length;
  }
  return safe;
}

function safeFeedback(feedback, session) {
  if (!feedback) return null;
  return {
    questionId: arithmeticPublicQuestionId({ sessionId: session?.id || '', question: session?.currentQuestion || null, index: session?.currentIndex || 0 }) || '',
    result: feedback.result || null,
    response: feedback.response || {},
    solutionLines: Array.isArray(feedback.solutionLines) ? feedback.solutionLines.slice() : [],
    checkLine: feedback.checkLine || '',
  };
}

function parentSummary(stats, analytics) {
  const overview = stats?.overview || {};
  const weak = (analytics?.skills || []).filter((row) => row.status === 'weak').slice(0, 3).map((row) => row.name);
  const misc = (analytics?.misconceptions || []).slice(0, 2).map((row) => row.label);
  const total = Number(overview.totalQuestions) || 0;
  if (!total) return 'Arithmetic is ready. Start with Smart Review to build a baseline across number facts, operations, decimals, fractions and percentages.';
  let text = `Arithmetic has ${total} logged question${total === 1 ? '' : 's'} with about ${Number(overview.accuracy) || 0}% accuracy.`;
  if (weak.length) text += ` Current weak spots: ${weak.join(', ')}.`;
  if (misc.length) text += ` Watch for: ${misc.join(' and ')}.`;
  text += ' Best next move: keep Smart Review short and daily, then use Error Clinic after repeated slips.';
  return text;
}

export function buildArithmeticReadModel({ learnerId = '', state = {}, data = {}, stats = null, analytics = null, content = null, projections = null } = {}) {
  const overview = stats || { overview: {}, skills: [] };
  const detail = analytics || { skills: [], strands: [], misconceptions: [], recentAttempts: [] };
  return {
    version: 1,
    subjectId: 'arithmetic',
    learnerId,
    releaseId: ARITHMETIC_CONTENT_RELEASE_ID,
    phase: state.phase || 'setup',
    prefs: clone(state.prefs || data.prefs || {}),
    session: safeSession(state.session, { includeReview: state.phase === 'summary' }),
    feedback: safeFeedback(state.feedback, state.session),
    summary: state.summary || null,
    error: state.error || '',
    stats: overview,
    analytics: detail,
    content: content || arithmeticContentSummary(),
    parentSummary: parentSummary(overview, detail),
    projections: projections || null,
  };
}
