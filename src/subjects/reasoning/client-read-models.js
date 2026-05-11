import { createInitialReasoningState, normaliseReasoningPrefs } from './metadata.js';

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function normaliseReasoningReadModel(raw, learnerId = '') {
  const base = createInitialReasoningState();
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    ...base,
    ...clone(source),
    subjectId: 'reasoning',
    learnerId: learnerId || source.learnerId || '',
    prefs: normaliseReasoningPrefs({ ...base.prefs, ...(source.prefs || {}) }),
    stats: {
      ...base.stats,
      ...(source.stats || {}),
      overview: { ...base.stats.overview, ...(source.stats?.overview || {}) },
      skills: Array.isArray(source.stats?.skills) ? source.stats.skills : (source.stats?.skills || base.stats.skills),
    },
    analytics: {
      ...base.analytics,
      ...(source.analytics || {}),
      skills: Array.isArray(source.analytics?.skills) ? source.analytics.skills : [],
      templates: Array.isArray(source.analytics?.templates) ? source.analytics.templates : [],
      misconceptionPatterns: Array.isArray(source.analytics?.misconceptionPatterns) ? source.analytics.misconceptionPatterns : [],
      recentActivity: Array.isArray(source.analytics?.recentActivity) ? source.analytics.recentActivity : [],
      reviewQueue: Array.isArray(source.analytics?.reviewQueue) ? source.analytics.reviewQueue : [],
    },
    pendingCommand: source.pendingCommand || '',
    error: source.error || '',
  };
}

export function createReasoningReadModelService({ getState } = {}) {
  function current(learnerId = '') {
    const state = typeof getState === 'function' ? getState() : null;
    return normaliseReasoningReadModel(state?.subjectUi?.reasoning, learnerId || state?.learners?.selectedId || '');
  }
  return {
    getStats(learnerId) {
      return current(learnerId).stats?.overview || {};
    },
    getAnalyticsSnapshot(learnerId) {
      return current(learnerId).analytics || {};
    },
    getPrefs(learnerId) {
      return current(learnerId).prefs;
    },
    resetLearner() {},
  };
}
