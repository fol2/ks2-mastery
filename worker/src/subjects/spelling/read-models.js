import { cloneSerialisable } from '../../../../src/platform/core/repositories/helpers.js';

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
  return {
    subjectId: 'spelling',
    learnerId,
    version: 1,
    phase: safeState.phase || 'dashboard',
    awaitingAdvance: Boolean(safeState.awaitingAdvance),
    session: safeState.session || null,
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
