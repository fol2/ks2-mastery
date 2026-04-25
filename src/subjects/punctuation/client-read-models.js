import { createInitialPunctuationState, normalisePunctuationPrefs } from './service-contract.js';

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function currentUi(getState, learnerId = null) {
  const state = getState?.() || {};
  const selected = learnerId || state.learners?.selectedId || '';
  const ui = state.subjectUi?.punctuation || null;
  return {
    selected,
    ui: ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : createInitialPunctuationState(),
  };
}

export function createPunctuationReadModelService({ getState } = {}) {
  return {
    initState(rawState) {
      return rawState && typeof rawState === 'object' && !Array.isArray(rawState)
        ? { ...createInitialPunctuationState(), ...clone(rawState) }
        : createInitialPunctuationState();
    },
    getPrefs(learnerId) {
      return normalisePunctuationPrefs(currentUi(getState, learnerId).ui.prefs);
    },
    savePrefs() {
      return normalisePunctuationPrefs();
    },
    getStats(learnerId) {
      const stats = currentUi(getState, learnerId).ui.stats || {};
      return {
        total: Number(stats.total) || 0,
        secure: Number(stats.secure) || 0,
        due: Number(stats.due) || 0,
        fresh: Number(stats.fresh) || 0,
        weak: Number(stats.weak) || 0,
        attempts: Number(stats.attempts) || 0,
        correct: Number(stats.correct) || 0,
        accuracy: Number(stats.accuracy) || 0,
        publishedRewardUnits: Number(stats.publishedRewardUnits) || 14,
        securedRewardUnits: Number(stats.securedRewardUnits) || 0,
      };
    },
    getAnalyticsSnapshot(learnerId) {
      return clone(currentUi(getState, learnerId).ui.analytics) || {
        releaseId: 'punctuation-r4-full-14-skill-structure',
        attempts: 0,
        correct: 0,
        accuracy: 0,
        sessionsCompleted: 0,
        skillRows: [],
        rewardUnits: [],
        bySessionMode: [],
        byItemMode: [],
        weakestFacets: [],
        recentMistakes: [],
        misconceptionPatterns: [],
        dailyGoal: {
          targetAttempts: 4,
          attemptsToday: 0,
          correctToday: 0,
          completed: false,
          progressPercent: 0,
        },
        streak: {
          currentDays: 0,
          bestDays: 0,
          activeDays: 0,
        },
      };
    },
    startSession() {},
    submitAnswer() {},
    continueSession() {},
    endSession() {},
    resetLearner() {},
  };
}
