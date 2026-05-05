import {
  createInitialReadingState,
  normaliseReadingPrefs,
} from './metadata.js';

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function normaliseReadingReadModel(rawValue, learnerId = '') {
  const initial = createInitialReadingState();
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? clone(rawValue) : {};
  if (raw.subjectId === 'reading' && Number(raw.version) >= 1) {
    return {
      ...initial,
      ...raw,
      learnerId: raw.learnerId || learnerId,
      prefs: normaliseReadingPrefs(raw.prefs || {}),
      pendingCommand: raw.pendingCommand || '',
      error: raw.error || '',
      session: raw.session || null,
      feedback: raw.feedback || null,
      summary: raw.summary || null,
      stats: raw.stats || initial.stats,
      analytics: raw.analytics || initial.analytics,
      content: raw.content || initial.content,
      parentSummary: raw.parentSummary || initial.parentSummary,
    };
  }
  return { ...initial, ...raw, learnerId, prefs: normaliseReadingPrefs(raw.prefs || {}) };
}

function currentUi(getState, learnerId = null) {
  const state = getState?.() || {};
  const selected = learnerId || state.learners?.selectedId || '';
  const ui = state.subjectUi?.reading || null;
  return normaliseReadingReadModel(ui, selected);
}

export function createReadingReadModelService({ getState } = {}) {
  return {
    initState(rawState, learnerId = '') {
      return normaliseReadingReadModel(rawState, learnerId);
    },
    getPrefs(learnerId) {
      return normaliseReadingPrefs(currentUi(getState, learnerId).prefs);
    },
    getStats(learnerId) {
      const overview = currentUi(getState, learnerId).stats?.overview || {};
      return {
        totalQuestions: Number(overview.totalQuestions) || 0,
        accuracy: Number(overview.accuracy) || 0,
        independentAccuracy: Number(overview.independentAccuracy) || 0,
        due: Number(overview.due) || 0,
        weak: Number(overview.weak) || 0,
        securedSkills: Number(overview.securedSkills) || 0,
        streakDays: Number(overview.streakDays) || 0,
      };
    },
    getAnalyticsSnapshot(learnerId) {
      return clone(currentUi(getState, learnerId).analytics) || createInitialReadingState().analytics;
    },
    resetLearner() {},
  };
}
