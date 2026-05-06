import {
  READING_CONTENT_RELEASE_ID,
  READING_MISCONCEPTIONS,
  READING_QUESTION_TYPE_LABELS,
  READING_SKILLS,
  readingContentSummary,
  readingPassageMap,
  readingQuestionRefMap,
  readingWordCount,
} from '../../../../shared/reading/content.js';

const PASSAGE_MAP = readingPassageMap();
const QUESTION_REF_MAP = readingQuestionRefMap();

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function safeQuestion(question, { includeSkill = false, includeFeedback = false } = {}) {
  if (!question) return null;
  const base = {
    id: question.id,
    type: question.type,
    stem: question.stem,
    marks: question.marks,
    typeLabel: READING_QUESTION_TYPE_LABELS[question.type] || question.type,
  };
  if (includeSkill) {
    base.skillId = question.skill;
    base.skillName = READING_SKILLS[question.skill]?.name || question.skill;
  }
  if (question.type === 'mcq' || question.type === 'multiSelect') base.options = (question.options || []).slice();
  if (question.type === 'match') {
    base.prompts = (question.prompts || []).slice();
    base.options = (question.options || []).slice();
  }
  if (question.type === 'order') base.items = (question.items || []).slice();
  if (includeFeedback) {
    base.modelAnswer = question.modelAnswer || '';
    base.explanation = question.explanation || '';
    base.hint = question.hint || '';
    base.reread = Array.isArray(question.reread) ? question.reread.slice() : [];
  }
  return base;
}

function safePassage(passage) {
  if (!passage) return null;
  return {
    id: passage.id,
    title: passage.title,
    genre: passage.genre,
    difficulty: passage.difficulty,
    isLong: !!passage.isLong,
    wordCount: readingWordCount(passage),
    blocks: (passage.blocks || []).slice(),
  };
}

function currentSection(session) {
  return session?.sections?.[session.currentSectionIndex] || null;
}

function currentQuestionId(session) {
  const section = currentSection(session);
  return section?.questionIds?.[session.currentQuestionIndex] || '';
}

function markedCount(session) {
  return (session?.sections || []).reduce((sum, section) => sum + Object.keys(section.results || {}).length, 0);
}


function responseHasValue(value) {
  if (Array.isArray(value)) return value.some(responseHasValue);
  if (value && typeof value === 'object') return Object.values(value).some(responseHasValue);
  return String(value == null ? '' : value).trim() !== '';
}

function answerCount(session) {
  return (session?.sections || []).reduce((sum, section) => sum + section.questionIds.filter((qid) => responseHasValue(section.responses?.[qid])).length, 0);
}

function questionCount(session) {
  return (session?.sections || []).reduce((sum, section) => sum + section.questionIds.length, 0);
}

function totalMarks(session) {
  return (session?.sections || []).reduce((sum, section) => sum + section.questionIds.reduce((inner, qid) => inner + (QUESTION_REF_MAP[qid]?.question?.marks || 0), 0), 0);
}

function currentScore(session) {
  return (session?.sections || []).reduce((sum, section) => sum + Object.values(section.results || {}).reduce((inner, result) => inner + (result.score || 0), 0), 0);
}

function sectionNav(session) {
  return (session?.sections || []).map((section, index) => {
    const passage = PASSAGE_MAP[section.passageId];
    return {
      index,
      title: session.mode === 'test' ? `Text ${index + 1}` : (passage?.title || `Text ${index + 1}`),
      passageId: section.passageId,
      current: index === session.currentSectionIndex,
      answered: section.questionIds.filter((qid) => responseHasValue(section.responses?.[qid])).length,
      marked: Object.keys(section.results || {}).length,
      total: section.questionIds.length,
    };
  });
}

function questionNav(session) {
  const section = currentSection(session);
  if (!section) return [];
  return section.questionIds.map((qid, index) => {
    const result = section.results?.[qid] || null;
    const hasResponse = responseHasValue(section.responses?.[qid]);
    return {
      id: qid,
      index,
      current: index === session.currentQuestionIndex,
      status: result ? (result.correct ? 'correct' : result.score > 0 ? 'partial' : 'wrong') : hasResponse ? 'saved' : 'blank',
      score: result?.score ?? null,
      maxScore: QUESTION_REF_MAP[qid]?.question?.marks || 0,
    };
  });
}

function activeSessionReadModel(session) {
  if (!session) return null;
  const section = currentSection(session);
  const passage = PASSAGE_MAP[section?.passageId];
  const qid = currentQuestionId(session);
  const question = QUESTION_REF_MAP[qid]?.question || null;
  const result = section?.results?.[qid] || null;
  const response = section?.responses?.[qid] || null;
  return {
    id: session.id,
    mode: session.mode,
    strict: !!session.strict,
    delayedFeedback: !!session.delayedFeedback,
    viewMode: session.viewMode || 'one',
    startedAt: session.startedAt,
    timeLimitMin: session.timeLimitMin || null,
    paperId: session.paperId || '',
    paperTitle: session.paperTitle || '',
    heroContext: session.heroContext || null,
    currentSectionIndex: session.currentSectionIndex || 0,
    currentQuestionIndex: session.currentQuestionIndex || 0,
    questionCount: questionCount(session),
    markedCount: markedCount(session),
    answeredCount: answerCount(session),
    score: currentScore(session),
    maxScore: totalMarks(session),
    sectionNav: sectionNav(session),
    questionNav: questionNav(session),
    passage: safePassage(passage),
    currentQuestion: safeQuestion(question, { includeSkill: Boolean(result), includeFeedback: Boolean(result) }),
    response,
    result: result ? clone(result) : null,
  };
}

function buildFeedback(state) {
  const feedback = state?.feedback;
  if (!feedback?.questionId) return null;
  const ref = QUESTION_REF_MAP[feedback.questionId];
  const question = ref?.question || null;
  const result = feedback.result || null;
  return {
    question: safeQuestion(question, { includeSkill: true, includeFeedback: true }),
    result: result ? clone(result) : null,
    hint: feedback.hint || '',
    misconceptionLabel: result?.misconception ? READING_MISCONCEPTIONS[result.misconception] || result.misconception : '',
  };
}

function parentSummary(stats, analytics) {
  const overview = stats?.overview || {};
  if (!overview.totalQuestions) {
    return 'No Reading practice has been logged yet. Start with Guided practice or Smart review to build a baseline across retrieval, vocabulary, inference and summarising.';
  }
  const weakSkills = (analytics?.skills || [])
    .filter((row) => row.status === 'weak' || row.status === 'due')
    .slice(0, 3)
    .map((row) => row.name);
  const weakCopy = weakSkills.length ? ` The next useful focus is ${weakSkills.join(', ')}.` : ' Keep using mixed review to protect secure skills.';
  return `Reading accuracy is ${overview.accuracy}% across ${overview.totalQuestions} marked questions, with independent accuracy at ${overview.independentAccuracy}%.${weakCopy}`;
}

export function buildReadingReadModel({ learnerId, state, data, stats, analytics, content, projections } = {}) {
  const safeStats = stats || { overview: {}, skills: [] };
  const safeAnalytics = analytics || { available: true, skills: [], byGenre: [], byType: [], misconceptionPatterns: [], recentActivity: [], reviewQueue: [] };
  return {
    subjectId: 'reading',
    version: 1,
    learnerId,
    releaseId: READING_CONTENT_RELEASE_ID,
    phase: state?.phase || 'setup',
    prefs: state?.prefs || data?.prefs || {},
    pendingCommand: '',
    error: state?.error || '',
    content: content || readingContentSummary(),
    session: activeSessionReadModel(state?.session || null),
    feedback: buildFeedback(state),
    summary: state?.summary ? clone(state.summary) : null,
    stats: safeStats,
    analytics: safeAnalytics,
    parentSummary: parentSummary(safeStats, safeAnalytics),
    projections: projections ? { available: true } : undefined,
  };
}
