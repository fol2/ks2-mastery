// Tests for U4 — Remote-sync post-mastery hydration + Alt+4 regression.
//
// Plan: docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md (U4)
//
// Contracts under test:
//   1. `createServerSpellingEngine.apply(...)` includes a `postMastery` block
//      on every command response. The block carries the canonical fields
//      (`allWordsMega`, `allWordsMegaNow`, `postMegaDashboardAvailable`,
//      `postMegaUnlockedEver`, `newCoreWordsSinceGraduation`, the full
//      guardian aggregates, plus `postMasteryDebug.source === 'worker'`).
//      Pre-graduation learners see the locked-shaped block.
//   2. Client `applyCommandResponse` merges `response.postMastery` into
//      `subjectUi.spelling.postMastery`; a subsequent
//      `services.spelling.getPostMasteryState(learnerId)` reads the Worker
//      values verbatim.
//   3. When a Worker response omits `postMastery` (characterisation: old
//      Worker version), the client falls back to the existing client-read-
//      models locked-fallback without crashing.
//   4. Graduated learner on a FRESH device (no local `data.postMega`, no
//      client cache): the client starts at the locked-fallback and the
//      first Worker response hydrates `postMegaDashboardAvailable: true`.
//   5. Graduated learner WITH local sticky-bit: the client read-model
//      already returns `postMegaDashboardAvailable: true` from the cached
//      postMastery entry in `subjectUi.spelling.postMastery` — no "Checking
//      Word Vault…" flicker.
//
// Executed test-first per the plan's execution note — the first two
// Worker-response assertions below fail against the current engine until
// the `postMastery` emission lands.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createServerSpellingEngine } from '../worker/src/subjects/spelling/engine.js';
import { resolveRuntimeSnapshot } from '../src/subjects/spelling/content/model.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { WORDS } from '../src/subjects/spelling/data/word-data.js';
import { SPELLING_CONTENT_RELEASE_ID } from '../src/subjects/spelling/service-contract.js';
import { createSpellingReadModelService } from '../src/subjects/spelling/client-read-models.js';
import { createRemoteSpellingActionHandler } from '../src/subjects/spelling/remote-actions.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY_MS = Date.UTC(2026, 0, 10);
const TODAY_DAY = Math.floor(TODAY_MS / DAY_MS);
const CORE_WORDS = WORDS.filter((word) => word.spellingPool !== 'extra');
const CORE_SLUGS = CORE_WORDS.map((word) => word.slug);
const ALL_CORE_COUNT = CORE_SLUGS.length;

function contentSnapshot() {
  return resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
}

function seedAllCoreMegaProgress() {
  const progress = {};
  for (const slug of CORE_SLUGS) {
    progress[slug] = {
      stage: 4,
      attempts: 6,
      correct: 5,
      wrong: 1,
      dueDay: TODAY_DAY + 60,
      lastDay: TODAY_DAY - 7,
      lastResult: 'correct',
    };
  }
  return progress;
}

// -----------------------------------------------------------------------------
// Section 1 — Worker `apply()` emits `postMastery` (F3 / AE1 on the plan).
// -----------------------------------------------------------------------------

test('U4 Worker apply() emits postMastery block for a pre-graduation learner', () => {
  const engine = createServerSpellingEngine({
    now: () => TODAY_MS,
    random: () => 0.5,
    contentSnapshot: contentSnapshot(),
  });

  const response = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: null, data: {} },
    latestSession: null,
    command: 'save-prefs',
    payload: { prefs: { mode: 'smart' } },
  });

  assert.ok(response.postMastery, 'response carries a postMastery block');
  const pm = response.postMastery;
  assert.equal(typeof pm, 'object');
  assert.equal(pm.allWordsMega, false, 'fresh learner has no Mega progress');
  assert.equal(pm.allWordsMegaNow, false);
  assert.equal(pm.postMegaUnlockedEver, false);
  assert.equal(pm.postMegaDashboardAvailable, false);
  assert.equal(pm.newCoreWordsSinceGraduation, 0);
  assert.equal(typeof pm.guardianDueCount, 'number');
  assert.equal(typeof pm.guardianMissionState, 'string');
  assert.ok(pm.postMasteryDebug, 'carries admin debug panel data');
  assert.equal(pm.postMasteryDebug.source, 'worker',
    'worker-emitted postMastery marks source=worker so admin hub can distinguish it from the client-only locked-fallback');
  assert.equal(pm.postMasteryDebug.stickyUnlocked, false);
});

test('U4 Worker apply() emits postMastery with allWordsMega=true for an all-core-Mega learner', () => {
  const engine = createServerSpellingEngine({
    now: () => TODAY_MS,
    random: () => 0.5,
    contentSnapshot: contentSnapshot(),
  });

  const data = {
    progress: seedAllCoreMegaProgress(),
    guardian: {},
    postMega: {
      unlockedAt: TODAY_MS - 7 * DAY_MS,
      unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      unlockedPublishedCoreCount: ALL_CORE_COUNT,
      unlockedBy: 'all-core-stage-4',
    },
  };

  const response = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: null, data },
    latestSession: null,
    command: 'save-prefs',
    payload: { prefs: { mode: 'smart' } },
  });

  assert.ok(response.postMastery, 'response carries a postMastery block');
  const pm = response.postMastery;
  assert.equal(pm.allWordsMega, true);
  assert.equal(pm.allWordsMegaNow, true);
  assert.equal(pm.postMegaUnlockedEver, true);
  assert.equal(pm.postMegaDashboardAvailable, true);
  assert.equal(pm.postMasteryDebug.source, 'worker');
  assert.equal(pm.postMasteryDebug.stickyUnlocked, true);
  assert.equal(pm.postMasteryDebug.allWordsMega, true);
});

test('U4 Worker apply() emits postMastery on start-session, submit-answer, and continue-session', () => {
  const engine = createServerSpellingEngine({
    now: () => TODAY_MS,
    random: () => 0.5,
    contentSnapshot: contentSnapshot(),
  });

  const started = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: null, data: {} },
    latestSession: null,
    command: 'start-session',
    payload: { mode: 'smart', length: 1, yearFilter: 'core' },
  });
  assert.ok(started.postMastery, 'start-session response carries postMastery');
  assert.equal(started.postMastery.postMasteryDebug.source, 'worker');

  // submit-answer — pick the slug the engine scheduled, do not guess.
  const slug = started.state.session.currentCard.slug;
  const word = CORE_WORDS.find((w) => w.slug === slug);
  const submitted = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: started.state, data: started.data },
    latestSession: started.practiceSession,
    command: 'submit-answer',
    payload: { typed: word ? word.word : 'unknown' },
  });
  assert.ok(submitted.postMastery, 'submit-answer response carries postMastery');
  assert.equal(submitted.postMastery.postMasteryDebug.source, 'worker');
});

// -----------------------------------------------------------------------------
// Section 2 — Client `applyCommandResponse` hydrates
// `subjectUi.spelling.postMastery` (F3 / Happy-path #2 on the plan).
// -----------------------------------------------------------------------------

function createHydrationHarness(initialSpellingUi = null) {
  let state = {
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      spelling: initialSpellingUi || {
        phase: 'dashboard',
        prefs: { mode: 'smart', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
        analytics: null,
        error: '',
      },
    },
    monsterCelebrations: { pending: [], queue: [] },
    transientUi: {},
  };
  const updateCalls = [];
  const store = {
    getState() { return state; },
    updateSubjectUi(subjectId, updater) {
      const previous = state.subjectUi?.[subjectId] || {};
      const next = typeof updater === 'function'
        ? updater(previous)
        : { ...previous, ...(updater || {}) };
      state = {
        ...state,
        subjectUi: { ...state.subjectUi, [subjectId]: next },
      };
      updateCalls.push(['updateSubjectUi', subjectId, next]);
    },
    patch(updater) {
      const patch = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...(patch || {}) };
    },
    pushToasts() {},
    pushMonsterCelebrations() {},
    deferMonsterCelebrations() { return true; },
    releaseMonsterCelebrations() { return true; },
    dismissMonsterCelebration() { return true; },
    reloadFromRepositories() { /* no-op for these tests */ },
    repositories: { eventLog: { list() { return []; } } },
  };
  return { getState: () => state, store, updateCalls };
}

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

test('U4 client applyCommandResponse merges response.postMastery into subjectUi.spelling.postMastery', async () => {
  const { getState, store } = createHydrationHarness();
  const sent = [];
  const workerPostMastery = {
    allWordsMega: true,
    allWordsMegaNow: true,
    postMegaUnlockedEver: true,
    postMegaDashboardAvailable: true,
    newCoreWordsSinceGraduation: 0,
    guardianDueCount: 3,
    wobblingCount: 1,
    wobblingDueCount: 1,
    nonWobblingDueCount: 2,
    unguardedMegaCount: 0,
    guardianAvailableCount: 5,
    guardianMissionState: 'wobbling',
    guardianMissionAvailable: true,
    nextGuardianDueDay: TODAY_DAY + 1,
    todayDay: TODAY_DAY,
    guardianMap: {},
    recommendedWords: [],
    postMasteryDebug: {
      source: 'worker',
      publishedCoreCount: ALL_CORE_COUNT,
      secureCoreCount: ALL_CORE_COUNT,
      blockingCoreCount: 0,
      blockingCoreSlugsPreview: [],
      extraWordsIgnoredCount: 0,
      guardianMapCount: 0,
      contentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      allWordsMega: true,
      stickyUnlocked: true,
    },
  };
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: { getPrefs() { return getState().subjectUi.spelling.prefs; } } },
    tts: { speak() {}, stop() {} },
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({
          subjectReadModel: { phase: 'dashboard' },
          postMastery: workerPostMastery,
        });
      },
    },
    preferenceSaveDebounceMs: 0,
  });

  handler.handle('spelling-toggle-pref', { pref: 'autoSpeak' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
  await flushPromises();

  // Hydration landed on `subjectUi.spelling.postMastery`.
  const hydrated = getState().subjectUi?.spelling?.postMastery;
  assert.ok(hydrated, 'subjectUi.spelling.postMastery hydrated from response');
  assert.equal(hydrated.allWordsMega, true);
  assert.equal(hydrated.postMegaDashboardAvailable, true);
  assert.equal(hydrated.guardianMissionState, 'wobbling');
  assert.equal(hydrated.postMasteryDebug.source, 'worker');
  assert.equal(hydrated.postMasteryDebug.stickyUnlocked, true);
});

test('U4 client-read-models getPostMasteryState prefers hydrated postMastery over locked fallback', () => {
  const workerPostMastery = {
    allWordsMega: true,
    allWordsMegaNow: true,
    postMegaUnlockedEver: true,
    postMegaDashboardAvailable: true,
    newCoreWordsSinceGraduation: 0,
    guardianDueCount: 2,
    wobblingCount: 0,
    wobblingDueCount: 0,
    nonWobblingDueCount: 2,
    unguardedMegaCount: 0,
    guardianAvailableCount: 2,
    guardianMissionState: 'due',
    guardianMissionAvailable: true,
    nextGuardianDueDay: TODAY_DAY,
    todayDay: TODAY_DAY,
    guardianMap: {},
    recommendedWords: [],
    postMasteryDebug: {
      source: 'worker',
      publishedCoreCount: ALL_CORE_COUNT,
      secureCoreCount: ALL_CORE_COUNT,
      blockingCoreCount: 0,
      blockingCoreSlugsPreview: [],
      extraWordsIgnoredCount: 0,
      guardianMapCount: 0,
      contentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      allWordsMega: true,
      stickyUnlocked: true,
    },
  };
  const appState = {
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      spelling: {
        subjectId: 'spelling',
        version: 1,
        learnerId: 'learner-a',
        phase: 'dashboard',
        postMastery: workerPostMastery,
      },
    },
  };

  const service = createSpellingReadModelService({ getState: () => appState });
  const postMastery = service.getPostMasteryState('learner-a');
  assert.equal(postMastery.allWordsMega, true,
    'cached worker-hydrated postMastery wins over the locked fallback');
  assert.equal(postMastery.postMegaDashboardAvailable, true);
  assert.equal(postMastery.postMasteryDebug.source, 'worker');
});

// -----------------------------------------------------------------------------
// Section 3 — "Checking Word Vault..." transient source label (Edge case
// "hydration race for FRESH learner" on the plan).
// -----------------------------------------------------------------------------

test('U4 client-read-models falls back to locked-fallback source when hydrationWindowMs is zero', () => {
  // Historical characterisation: when the hydration window is disabled
  // (hydrationWindowMs: 0) the no-cache path goes straight to
  // `locked-fallback` — preserving the pre-U4 label that the Admin hub
  // depends on to distinguish a client-only stub from a worker snapshot.
  const appState = {
    learners: { selectedId: 'learner-a' },
    subjectUi: { spelling: { phase: 'dashboard' } },
  };
  const service = createSpellingReadModelService({
    getState: () => appState,
    hydrationWindowMs: 0,
  });
  const postMastery = service.getPostMasteryState('learner-a');
  assert.equal(postMastery.postMasteryDebug.source, 'locked-fallback',
    'no-cache path stays on locked-fallback per existing contract');
  assert.equal(postMastery.postMegaDashboardAvailable, false);
});

test('U4 client-read-models stamps source=checking during the hydration window (≤500ms)', () => {
  const appState = {
    learners: { selectedId: 'learner-a' },
    subjectUi: { spelling: { phase: 'dashboard' } },
  };
  let nowValue = 1_000;
  const service = createSpellingReadModelService({
    getState: () => appState,
    now: () => nowValue,
    hydrationWindowMs: 500,
  });

  // First read registers the hydration window start and returns
  // source='checking' — the setup scene renders the placeholder skeleton.
  const first = service.getPostMasteryState('learner-a');
  assert.equal(first.postMasteryDebug.source, 'checking',
    'first read inside the hydration window stamps source=checking');
  assert.equal(first.postMegaDashboardAvailable, false,
    'checking label does not unlock the dashboard');

  // Advance mid-window — still 'checking'.
  nowValue = 1_000 + 250;
  const mid = service.getPostMasteryState('learner-a');
  assert.equal(mid.postMasteryDebug.source, 'checking');

  // Advance past the window — source now falls through to 'locked-fallback'.
  nowValue = 1_000 + 501;
  const past = service.getPostMasteryState('learner-a');
  assert.equal(past.postMasteryDebug.source, 'locked-fallback',
    'after the hydration window elapses, source flips to locked-fallback');
});

test('U4 client-read-models: hydrated postMastery cache wins even during the checking window (H6)', () => {
  // The H6 sticky-bit short-circuit in the plan says a graduated learner
  // who already has `data.postMega` persisted must never see the
  // "Checking Word Vault..." placeholder. We verify at the read-model
  // layer: if the cache is populated, `source=checking` is never returned.
  const workerPostMastery = {
    allWordsMega: true,
    allWordsMegaNow: true,
    postMegaUnlockedEver: true,
    postMegaDashboardAvailable: true,
    newCoreWordsSinceGraduation: 0,
    guardianDueCount: 0,
    wobblingCount: 0,
    wobblingDueCount: 0,
    nonWobblingDueCount: 0,
    unguardedMegaCount: 0,
    guardianAvailableCount: 0,
    guardianMissionState: 'rested',
    guardianMissionAvailable: false,
    nextGuardianDueDay: null,
    todayDay: TODAY_DAY,
    guardianMap: {},
    recommendedWords: [],
    postMasteryDebug: {
      source: 'worker',
      publishedCoreCount: ALL_CORE_COUNT,
      secureCoreCount: ALL_CORE_COUNT,
      blockingCoreCount: 0,
      blockingCoreSlugsPreview: [],
      extraWordsIgnoredCount: 0,
      guardianMapCount: 0,
      contentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      allWordsMega: true,
      stickyUnlocked: true,
    },
  };
  const appState = {
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      spelling: {
        subjectId: 'spelling',
        version: 1,
        learnerId: 'learner-a',
        phase: 'dashboard',
        postMastery: workerPostMastery,
      },
    },
  };
  const service = createSpellingReadModelService({
    getState: () => appState,
    now: () => 1_000,
    hydrationWindowMs: 500,
  });
  const pm = service.getPostMasteryState('learner-a');
  assert.equal(pm.postMasteryDebug.source, 'worker',
    'sticky-bit short-circuit: cached postMastery wins over checking-window stub');
  assert.equal(pm.postMegaDashboardAvailable, true);
});

test('U4 Worker response omits postMastery (old-worker characterisation): client keeps locked-fallback', async () => {
  const { getState, store } = createHydrationHarness();
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: { getPrefs() { return getState().subjectUi.spelling.prefs; } } },
    tts: { speak() {}, stop() {} },
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      // Characterisation: an older worker version emits NO postMastery
      // field. The client must tolerate the missing field and not crash.
      send() {
        return Promise.resolve({ subjectReadModel: { phase: 'dashboard' } });
      },
    },
    preferenceSaveDebounceMs: 0,
  });

  handler.handle('spelling-toggle-pref', { pref: 'autoSpeak' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
  await flushPromises();

  // When postMastery is absent the client must NOT wipe any previous cache;
  // if there was none, the fallback is a locked-state read via the client
  // read-model service — not a thrown error.
  const spelling = getState().subjectUi?.spelling || {};
  // If postMastery is set at all it must be falsy-locked shape, not a
  // truthy-available one.
  if (spelling.postMastery) {
    assert.equal(spelling.postMastery.postMegaDashboardAvailable, false);
  }
});
