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
    feedback: safeState.feedback || null,
    summary: safeState.summary || null,
    error: typeof safeState.error === 'string' ? safeState.error : '',
    prefs: cloneSerialisable(prefs) || {},
    stats: cloneSerialisable(stats) || {},
    analytics: analytics ? cloneSerialisable(analytics) : null,
    audio: audio ? cloneSerialisable(audio) : null,
    content: content ? cloneSerialisable(content) : null,
  };
}
