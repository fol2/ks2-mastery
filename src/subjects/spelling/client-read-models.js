import {
  cloneSerialisable,
  createInitialSpellingState,
  createLockedPostMasteryState,
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

// P2 U4: hydration window before we flip the fallback label from
// 'checking' to 'locked-fallback'. 500ms is short enough that a fresh
// bootstrap response (observed ~100-300ms over LAN) lands well before the
// flip, and long enough that a slow network still sees a deliberate
// "Checking Word Vault..." placeholder rather than a pre-emptive "locked"
// copy. If the worker response never arrives (offline, degraded sync)
// the UI falls through to the legacy locked dashboard after the timeout.
export const POST_MASTERY_HYDRATION_WINDOW_MS = 500;

function buildLockedFallback({ source, todayDay }) {
  return {
    ...createLockedPostMasteryState(),
    todayDay,
    postMasteryDebug: {
      source,
      publishedCoreCount: 0,
      secureCoreCount: 0,
      blockingCoreCount: 0,
      blockingCoreSlugsPreview: [],
      extraWordsIgnoredCount: 0,
      guardianMapCount: 0,
      contentReleaseId: null,
      allWordsMega: false,
      stickyUnlocked: false,
    },
  };
}

export function createSpellingReadModelService({
  getState = () => null,
  now = () => Date.now(),
  hydrationWindowMs = POST_MASTERY_HYDRATION_WINDOW_MS,
} = {}) {
  // Per-learner hydration window timestamp. A learner that has never seen a
  // worker hydration event gets `source: 'checking'` for the first
  // `hydrationWindowMs` of their session; afterwards the source falls
  // through to 'locked-fallback' so the legacy dashboard renders rather
  // than a stuck "Checking Word Vault..." placeholder.
  const hydrationStart = new Map();

  function readModel(learnerId) {
    const appState = getState() || {};
    return asReadModel(appState.subjectUi?.spelling, learnerId || appState.learners?.selectedId || '');
  }

  function sourceFallbackForLearner(learnerId) {
    const key = String(learnerId || '');
    const ts = typeof now === 'function' ? Number(now()) : Number(now);
    const safeTs = Number.isFinite(ts) ? ts : Date.now();
    const window = Number(hydrationWindowMs);
    const safeWindow = Number.isFinite(window) && window >= 0 ? window : POST_MASTERY_HYDRATION_WINDOW_MS;
    if (!hydrationStart.has(key)) {
      hydrationStart.set(key, safeTs);
      return safeWindow > 0 ? 'checking' : 'locked-fallback';
    }
    const startedAt = Number(hydrationStart.get(key));
    const elapsed = safeTs - startedAt;
    return elapsed < safeWindow ? 'checking' : 'locked-fallback';
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
    getPostMasteryState(learnerId) {
      // Remote-sync runtime: the shell does not have direct access to the
      // learner's guardian map, so the read-model falls back to "not
      // graduated yet". The server-synced surface re-issues the Setup scene
      // through the next cached command response which carries the real
      // state via the Worker engine. This keeps the Setup render stable
      // while the first round trip is in flight.
      //
      // U1 critical: the Setup scene gates the Begin button on
      // `guardianMissionAvailable`; without the defaults below, the
      // remote-sync dashboard would read `undefined` for the gate and stay
      // permanently disabled. The defaults mirror the 'locked' state so the
      // legacy dashboard renders until the first command round-trip
      // populates `subjectUi.spelling.postMastery`.
      //
      // Uses the shared `createLockedPostMasteryState()` factory (defined in
      // `service-contract.js`) so this stub, the session-phase shortcut in
      // `spelling-view-model.js`, and the `computeGuardianMissionState`
      // 'locked' result never drift. `todayDay` is populated from the live
      // clock so UI copy that formats "next check in N days" renders a
      // sensible (albeit zero-delta) value before hydration.
      //
      // U1 (P2): when falling through to the locked factory, we also attach
      // a `postMasteryDebug` sibling with `source: 'locked-fallback'` so the
      // Admin hub can distinguish a Worker-hydrated snapshot ('worker') from
      // a client-only fallback stub. The other debug scalars default to
      // zero / false because the client shell has no guardian data to reason
      // about — if the admin sees this on production it's a strong signal
      // the Worker hydration hasn't completed yet for the selected learner.
      //
      // U4 (P2): the no-cache fallback now stamps `source: 'checking'`
      // for the first 500ms of a learner session (hydration window). The
      // SpellingSetupScene renders a "Checking Word Vault..." skeleton while
      // the source reads 'checking'; if the worker round-trip has not
      // landed within the window, the source falls through to the legacy
      // 'locked-fallback' so the dashboard degrades to the legacy Smart
      // Review setup rather than a stuck loading state. A graduated
      // learner with a LOCAL sticky-bit short-circuits this entire path
      // because the client's service-authoritative getPostMasteryState
      // returns `postMegaDashboardAvailable: true` synchronously — the
      // checking placeholder is NOT visible in the happy path for
      // returning graduated learners.
      const cached = readModel(learnerId).postMastery;
      if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
        return cloneSerialisable(cached);
      }
      const tsNow = typeof now === 'function' ? Number(now()) : Number(now);
      const safeTs = Number.isFinite(tsNow) ? tsNow : Date.now();
      return buildLockedFallback({
        source: sourceFallbackForLearner(learnerId),
        todayDay: Math.floor(safeTs / (24 * 60 * 60 * 1000)),
      });
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
