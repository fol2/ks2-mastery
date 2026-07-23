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

function safeProgress(progress) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return null;
  return {
    total: Number.isFinite(Number(progress.total)) ? Number(progress.total) : 0,
    checked: Number.isFinite(Number(progress.checked)) ? Number(progress.checked) : 0,
    done: Number.isFinite(Number(progress.done)) ? Number(progress.done) : 0,
    wrongCount: Number.isFinite(Number(progress.wrongCount)) ? Number(progress.wrongCount) : 0,
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
    progress: safeProgress(session.progress),
    currentStage: Number.isFinite(Number(session.currentStage)) ? Number(session.currentStage) : 0,
    currentCard: safeCurrentCard(session.currentCard),
    // Never expose currentSlug/word text on public or redacted session
    // surfaces — bootstrap redaction tests forbid raw spellings here.
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
    safe.persistenceWarning = {
      reason: typeof feedback.persistenceWarning.reason === 'string'
        ? feedback.persistenceWarning.reason
        : '',
      acknowledged: Boolean(feedback.persistenceWarning.acknowledged),
    };
  }

  return safe;
}

function safeSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
  // Field-pick summary for command UI (drill-again, accuracy chips). Avoid
  // deep-cloning arbitrary nested maps that can grow with session history.
  const mistakes = Array.isArray(summary.mistakes)
    ? summary.mistakes.slice(0, 40).map((item) => (
      item && typeof item === 'object' && !Array.isArray(item)
        ? {
          slug: typeof item.slug === 'string' ? item.slug : '',
          word: typeof item.word === 'string' ? item.word : '',
        }
        : null
    )).filter(Boolean)
    : [];
  return {
    mode: typeof summary.mode === 'string' ? summary.mode : '',
    label: typeof summary.label === 'string' ? summary.label : '',
    message: typeof summary.message === 'string' ? summary.message : '',
    headline: typeof summary.headline === 'string' ? summary.headline : '',
    body: typeof summary.body === 'string' ? summary.body : '',
    totalWords: Number.isFinite(Number(summary.totalWords)) ? Number(summary.totalWords) : 0,
    checked: Number.isFinite(Number(summary.checked)) ? Number(summary.checked) : 0,
    correct: Number.isFinite(Number(summary.correct)) ? Number(summary.correct) : 0,
    wrong: Number.isFinite(Number(summary.wrong)) ? Number(summary.wrong) : 0,
    accuracy: Number.isFinite(Number(summary.accuracy)) ? Number(summary.accuracy) : null,
    elapsedMs: Number.isFinite(Number(summary.elapsedMs)) ? Number(summary.elapsedMs) : 0,
    mistakes,
  };
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
  // Avoid cloneSerialisable(state): the worker state can carry session maps
  // that command read models never expose. Field-pick only.
  const safeState = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const session = safeSession(safeState.session);
  return {
    subjectId: 'spelling',
    learnerId,
    version: 1,
    phase: typeof safeState.phase === 'string' ? safeState.phase : 'dashboard',
    awaitingAdvance: Boolean(safeState.awaitingAdvance),
    session,
    feedback: safeFeedback(safeState.feedback, session),
    summary: safeSummary(safeState.summary),
    error: typeof safeState.error === 'string' ? safeState.error : '',
    prefs: prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? { ...prefs } : {},
    stats: stats && typeof stats === 'object' && !Array.isArray(stats) ? { ...stats } : {},
    analytics: analytics && typeof analytics === 'object' && !Array.isArray(analytics)
      ? {
        ...analytics,
        wordGroups: [],
      }
      : null,
    audio: audio && typeof audio === 'object' && !Array.isArray(audio) ? { ...audio } : null,
    content: content && typeof content === 'object' && !Array.isArray(content) ? { ...content } : null,
  };
}

/**
 * Bootstrap-sized public projection written atomically with the command.
 * Intentionally thinner than the command subjectReadModel: no feedback,
 * no analytics word groups, no audio tokens. Matches the fields
 * compactBootstrapPublicSubjectUi keeps for spelling.
 */
export function buildSpellingPublicSubjectReadModel({
  learnerId,
  state,
  prefs,
  stats,
  audio = null,
  postMastery = null,
} = {}) {
  const safeState = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const session = safeSession(safeState.session);
  // Keep only the bootstrap/replay token surface (promptToken + flags). Do not
  // store transcripts or other bulky media metadata on the public projection.
  const publicAudio = audio && typeof audio === 'object' && !Array.isArray(audio) && audio.promptToken
    ? {
      subjectId: typeof audio.subjectId === 'string' ? audio.subjectId : 'spelling',
      learnerId: typeof audio.learnerId === 'string' ? audio.learnerId : learnerId,
      promptToken: String(audio.promptToken),
      slow: Boolean(audio.slow),
      wordOnly: Boolean(audio.wordOnly),
    }
    : null;
  return {
    subjectId: 'spelling',
    learnerId,
    version: 1,
    phase: typeof safeState.phase === 'string' ? safeState.phase : 'dashboard',
    awaitingAdvance: Boolean(safeState.awaitingAdvance),
    session,
    feedback: null,
    summary: null,
    error: '',
    prefs: prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? { ...prefs } : {},
    stats: stats && typeof stats === 'object' && !Array.isArray(stats) ? { ...stats } : {},
    analytics: null,
    audio: publicAudio,
    content: null,
    ...(postMastery && typeof postMastery === 'object' && !Array.isArray(postMastery)
      ? { postMastery }
      : {}),
  };
}
