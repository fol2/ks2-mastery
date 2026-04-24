import {
  cloneSerialisable,
  createInitialSpellingState,
  normaliseBoolean,
  normaliseMode,
  normaliseRoundLength,
  normaliseStats,
  normaliseYearFilter,
} from './service-contract.js';
import {
  DEFAULT_BUFFERED_GEMINI_VOICE,
  DEFAULT_TTS_PROVIDER,
  normaliseBufferedGeminiVoice,
  normaliseTtsProvider,
} from './tts-providers.js';

function defaultPrefs() {
  const mode = 'smart';
  return {
    mode,
    yearFilter: 'core',
    roundLength: normaliseRoundLength('20', mode),
    showCloze: true,
    autoSpeak: true,
    extraWordFamilies: false,
    ttsProvider: DEFAULT_TTS_PROVIDER,
    bufferedGeminiVoice: DEFAULT_BUFFERED_GEMINI_VOICE,
  };
}

function normalisePrefs(rawPrefs = {}) {
  const mode = normaliseMode(rawPrefs.mode, 'smart');
  return {
    mode,
    yearFilter: normaliseYearFilter(rawPrefs.yearFilter, 'core'),
    roundLength: normaliseRoundLength(rawPrefs.roundLength, mode),
    showCloze: normaliseBoolean(rawPrefs.showCloze, true),
    autoSpeak: normaliseBoolean(rawPrefs.autoSpeak, true),
    extraWordFamilies: normaliseBoolean(rawPrefs.extraWordFamilies, false),
    ttsProvider: normaliseTtsProvider(rawPrefs.ttsProvider),
    bufferedGeminiVoice: normaliseBufferedGeminiVoice(rawPrefs.bufferedGeminiVoice),
  };
}

function emptyAnalytics() {
  return {
    pools: {
      all: normaliseStats({}),
      core: normaliseStats({}),
      y34: normaliseStats({}),
      y56: normaliseStats({}),
      extra: normaliseStats({}),
    },
    wordGroups: [],
    generatedAt: Date.now(),
  };
}

function statsForFilter(stats, yearFilter) {
  const safeStats = stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : {};
  const key = yearFilter === 'y3-4'
    ? 'y34'
    : yearFilter === 'y5-6'
      ? 'y56'
      : yearFilter === 'extra'
        ? 'extra'
        : 'core';
  return normaliseStats(safeStats[key] || safeStats.core || safeStats.all || {});
}

function asReadModel(rawValue, learnerId) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
    ? cloneSerialisable(rawValue)
    : {};
  if (raw.subjectId === 'spelling' && Number(raw.version) >= 1) {
    return {
      ...createInitialSpellingState(),
      ...raw,
      learnerId: raw.learnerId || learnerId,
      prefs: normalisePrefs(raw.prefs || {}),
      stats: raw.stats && typeof raw.stats === 'object' ? raw.stats : {},
      analytics: raw.analytics && typeof raw.analytics === 'object' ? raw.analytics : emptyAnalytics(),
    };
  }
  return {
    ...createInitialSpellingState(),
    ...raw,
    learnerId,
    prefs: defaultPrefs(),
    stats: {},
    analytics: emptyAnalytics(),
  };
}

export function createSpellingReadModelService({ getState = () => null } = {}) {
  function readModel(learnerId) {
    const appState = getState() || {};
    return asReadModel(appState.subjectUi?.spelling, learnerId || appState.learners?.selectedId || '');
  }

  return {
    initState(rawState, learnerId) {
      return asReadModel(rawState, learnerId);
    },
    getPrefs(learnerId) {
      return readModel(learnerId).prefs;
    },
    getStats(learnerId, yearFilter = 'core') {
      return statsForFilter(readModel(learnerId).stats, yearFilter);
    },
    getAnalyticsSnapshot(learnerId) {
      return cloneSerialisable(readModel(learnerId).analytics || emptyAnalytics());
    },
    getAudioCue(learnerId) {
      return cloneSerialisable(readModel(learnerId).audio || null);
    },
    savePrefs() {
      return defaultPrefs();
    },
    resetLearner() {},
  };
}
