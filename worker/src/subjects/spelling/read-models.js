import { cloneSerialisable } from '../../../../src/platform/core/repositories/helpers.js';

function safePrompt(prompt) {
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) return null;
  return {
    cloze: typeof prompt.cloze === 'string' ? prompt.cloze : '',
  };
}

function safeCurrentCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  return {
    prompt: safePrompt(card.prompt),
  };
}

function safeSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
  return {
    id: typeof session.id === 'string' ? session.id : '',
    type: typeof session.type === 'string' ? session.type : 'learning',
    mode: typeof session.mode === 'string' ? session.mode : 'smart',
    label: typeof session.label === 'string' ? session.label : 'Spelling round',
    practiceOnly: Boolean(session.practiceOnly),
    fallbackToSmart: Boolean(session.fallbackToSmart),
    phase: typeof session.phase === 'string' ? session.phase : 'question',
    promptCount: Number.isFinite(Number(session.promptCount)) ? Number(session.promptCount) : 0,
    startedAt: Number.isFinite(Number(session.startedAt)) ? Number(session.startedAt) : 0,
    progress: cloneSerialisable(session.progress) || null,
    currentStage: Number.isFinite(Number(session.currentStage)) ? Number(session.currentStage) : 0,
    currentCard: safeCurrentCard(session.currentCard),
    serverAuthority: session.serverAuthority === 'worker' ? 'worker' : null,
  };
}

function safeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

function safeFeedback(feedback, session = null) {
  if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback)) return null;
  const revealAnswer = session?.type !== 'test'
    && session?.phase === 'correction'
    && typeof feedback.answer === 'string'
    && feedback.answer;
  const safe = {
    kind: typeof feedback.kind === 'string' ? feedback.kind : 'info',
    headline: typeof feedback.headline === 'string' ? feedback.headline : '',
    ...(revealAnswer ? { answer: feedback.answer } : {}),
    ...(typeof feedback.attemptedAnswer === 'string' && feedback.attemptedAnswer.trim()
      ? { attemptedAnswer: feedback.attemptedAnswer.trim().slice(0, 80) }
      : {}),
    body: typeof feedback.body === 'string' ? feedback.body : '',
    footer: typeof feedback.footer === 'string' ? feedback.footer : '',
    familyWords: safeStringArray(feedback.familyWords),
  };

  if (
    !safe.headline
    && !safe.answer
    && !safe.attemptedAnswer
    && !safe.body
    && !safe.footer
    && !safe.familyWords.length
    && !feedback.persistenceWarning
  ) {
    return null;
  }

  if (
    feedback.persistenceWarning
    && typeof feedback.persistenceWarning === 'object'
    && !Array.isArray(feedback.persistenceWarning)
  ) {
    safe.persistenceWarning = cloneSerialisable(feedback.persistenceWarning) || null;
  }

  return safe;
}

export function buildSpellingReadModel({
  learnerId,
  state,
  prefs,
  stats,
  analytics = null,
  audio = null,
  content = null,
} = {}) {
  const safeState = cloneSerialisable(state) || {};
  const session = safeSession(safeState.session);
  return {
    subjectId: 'spelling',
    learnerId,
    version: 1,
    phase: safeState.phase || 'dashboard',
    awaitingAdvance: Boolean(safeState.awaitingAdvance),
    session,
    feedback: safeFeedback(safeState.feedback, session),
    summary: safeState.summary || null,
    error: typeof safeState.error === 'string' ? safeState.error : '',
    prefs: cloneSerialisable(prefs) || {},
    stats: cloneSerialisable(stats) || {},
    analytics: analytics ? cloneSerialisable(analytics) : null,
    audio: audio ? cloneSerialisable(audio) : null,
    content: content ? cloneSerialisable(content) : null,
  };
}
