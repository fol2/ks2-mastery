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

// Phase 3 U8 (origin R34): child learner read-model never carries `contextPack`.
// The Worker `buildPunctuationReadModel` already drops it at assembly time; this
// belt-and-braces strip catches any future regression (e.g. a synthetic payload
// loaded from a stale cache or a scope-parameter change) before it reaches the
// React surface. See docs/plans/2026-04-25-005-*.md U8.
function stripForbiddenChildScopeFields(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  if (!('contextPack' in state)) return state;
  const { contextPack: _ignored, ...rest } = state;
  return rest;
}

// Phase 4 U3 (origin R4): derive the `analytics.available` signal from the
// shape of the raw analytics payload the Worker projected (or didn't). The
// Punctuation Map branches on this value to distinguish three states that
// used to be indistinguishable in the UI:
//
//   - `true`    — the Worker projected a non-empty `skillRows` array. Real
//                 evidence is available; the Map renders per-skill status.
//   - `'empty'` — the projection ran and yielded zero rows (fresh learner,
//                 legitimately no evidence yet), OR the payload is simply
//                 absent because the upstream worker has not yet wired its
//                 availability emission (plan R4 defers the upstream half to
//                 a future PR). The Map renders every skill as `'new'`,
//                 preserving the pre-U3 fresh-learner copy.
//   - `false`   — the upstream EXPLICITLY emitted `available: false` (Worker
//                 timeout / degraded state / serialiser failure). The Map
//                 renders every skill as `'unknown'` with a child-friendly
//                 helper line. `false` requires an explicit upstream signal;
//                 the client NEVER infers `false` from the absence of a
//                 payload.
//
// **Review follow-on (PR #269)**: the BLOCKING defect in the original shape
// was that a cold-start learner (no upstream emission wired yet) fell into
// the null-branch and received `false`, rendering 14 "Unknown" chips and
// 14 copies of the helper line. That is a visible UX regression worse than
// the pre-U3 silent-'new' behaviour. The null-branch default now flips to
// `'empty'` — the honest "no evidence yet" reading — so fresh learners see
// pre-U3 fresh-learner copy until upstream wires its explicit signal. Once
// that upstream wiring lands, any degraded emission (`available: false`)
// flows through untouched and triggers the 'unknown' UX correctly.
export function deriveAnalyticsAvailability(analytics) {
  if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) return 'empty';
  if (analytics.available === true || analytics.available === false || analytics.available === 'empty') {
    return analytics.available;
  }
  if (!Array.isArray(analytics.skillRows)) return 'empty';
  return analytics.skillRows.length === 0 ? 'empty' : true;
}

// Phase 4 U3: attach an `analytics.available` signal to the read-model so
// the Map scene can branch on payload availability without re-inspecting
// the raw snapshot shape at every render. The returned object is a shallow
// copy so the caller never mutates a frozen input.
function withAnalyticsAvailability(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const rawAnalytics = state.analytics && typeof state.analytics === 'object' && !Array.isArray(state.analytics)
    ? state.analytics
    : null;
  const available = deriveAnalyticsAvailability(rawAnalytics);
  const nextAnalytics = rawAnalytics
    ? { ...rawAnalytics, available }
    : { available };
  return { ...state, analytics: nextAnalytics };
}

export function createPunctuationReadModelService({ getState } = {}) {
  return {
    initState(rawState) {
      const base = rawState && typeof rawState === 'object' && !Array.isArray(rawState)
        ? { ...createInitialPunctuationState(), ...clone(rawState) }
        : createInitialPunctuationState();
      return withAnalyticsAvailability(stripForbiddenChildScopeFields(base));
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
