import { createInitialArithmeticState, normaliseArithmeticPrefs } from './metadata.js';

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function normaliseArithmeticReadModel(rawValue, learnerId = '') {
  const initial = createInitialArithmeticState();
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? clone(rawValue) : {};
  return {
    ...initial,
    ...raw,
    learnerId: raw.learnerId || learnerId,
    prefs: normaliseArithmeticPrefs(raw.prefs || {}),
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

function currentUi(getState, learnerId = null) {
  const state = getState?.() || {};
  const selected = learnerId || state.learners?.selectedId || '';
  return normaliseArithmeticReadModel(state.subjectUi?.arithmetic, selected);
}

export function createArithmeticReadModelService({ getState } = {}) {
  return {
    initState(rawState, learnerId = '') {
      return normaliseArithmeticReadModel(rawState, learnerId);
    },
    getPrefs(learnerId) {
      return normaliseArithmeticPrefs(currentUi(getState, learnerId).prefs);
    },
    getStats(learnerId) {
      const overview = currentUi(getState, learnerId).stats?.overview || {};
      return {
        totalQuestions: Number(overview.totalQuestions) || 0,
        accuracy: Number(overview.accuracy) || 0,
        due: Number(overview.due) || 0,
        weak: Number(overview.weak) || 0,
        securedSkills: Number(overview.securedSkills) || 0,
        securedRewardUnits: Number(overview.securedRewardUnits) || 0,
        streakDays: Number(overview.streakDays) || 0,
      };
    },
    getAnalyticsSnapshot(learnerId) {
      return clone(currentUi(getState, learnerId).analytics) || createInitialArithmeticState().analytics;
    },
    resetLearner() {},
  };
}
