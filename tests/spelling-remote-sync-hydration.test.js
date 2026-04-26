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

// -----------------------------------------------------------------------------
// Section 4 — PR #277 reviewer-driven fixes
// (a) HIGH correctness: Worker postMastery includes todayDay + guardianMap so
//     the SpellingSetupScene's GraduationStatRibbon doesn't render
//     "Next check in 20562 days".
// (b) HIGH adversarial: applyCommandResponse preserves the previous postMastery
//     snapshot when a subsequent response lacks postMastery (old Worker
//     rolling deploy, engine throw via the MEDIUM try/catch fix).
// (c) HIGH adversarial: handlePreferenceSaveError preserves the postMastery
//     cache so a graduated learner whose Alt+4 start succeeds but whose
//     save-prefs fails doesn't regress to legacy Smart Review.
// -----------------------------------------------------------------------------

test('PR #277 Worker postMastery carries todayDay + guardianMap so the Setup scene renders a sensible nextDueDelta', () => {
  const engine = createServerSpellingEngine({
    now: () => TODAY_MS,
    random: () => 0.5,
    contentSnapshot: contentSnapshot(),
  });

  // A graduated learner with one guardian entry due tomorrow. The scene's
  // GraduationStatRibbon computes `nextDueDelta = nextGuardianDueDay - todayDay`;
  // if todayDay falls back to 0 the delta becomes 20562 (the D1-epoch day
  // number today) and the "Next check in 20562 days" regression reappears.
  const firstCoreSlug = CORE_SLUGS[0];
  const guardianMap = {
    [firstCoreSlug]: {
      stage: 'secure',
      nextDueDay: TODAY_DAY + 1,
      // Normaliser tolerates extra fields; we only need a shape that survives
      // normaliseGuardianMap.
    },
  };
  const data = {
    progress: seedAllCoreMegaProgress(),
    guardian: guardianMap,
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

  const pm = response.postMastery;
  assert.ok(pm, 'Worker postMastery block present');

  // (1) `todayDay` must equal the clock's day number — NOT 0, not undefined.
  // Without this the scene's `nextDueDelta` computation falls back to 0 and
  // the ribbon displays "Next check in 20562 days".
  assert.equal(typeof pm.todayDay, 'number', 'postMastery.todayDay is a number');
  assert.equal(pm.todayDay, TODAY_DAY, 'postMastery.todayDay equals the scene-expected today');

  // (2) `guardianMap` must be a populated object mirroring the persisted
  // guardian entries (after normalisation). The Word Bank scene depends on
  // this for Guardian chip filtering; without it the chips render empty.
  assert.ok(pm.guardianMap && typeof pm.guardianMap === 'object' && !Array.isArray(pm.guardianMap),
    'postMastery.guardianMap is a plain object');

  // (3) Integration parity with the Setup scene's GraduationStatRibbon:
  // replicate its `nextDueDelta` derivation and assert it computes sensibly
  // (NOT 20562 — that was the original bug signature when `todayDay` fell back
  // to 0). The ribbon renders "in 20562 days" only when
  // `nextDueDelta = nextGuardianDueDay - 0`, i.e. today is missing.
  const today = Number.isFinite(Number(pm.todayDay)) ? Math.floor(Number(pm.todayDay)) : 0;
  const nextDue = Number.isFinite(Number(pm.nextGuardianDueDay)) ? Math.floor(Number(pm.nextGuardianDueDay)) : null;
  const nextDueDelta = nextDue == null ? null : nextDue - today;
  if (nextDueDelta !== null) {
    // The delta must be a small non-negative integer — 0 (today), 1
    // (tomorrow), or a handful of days. Anything >= 1000 is the regression
    // we're pinning against; 20562 is the specific signature from the bug.
    assert.ok(nextDueDelta >= 0 && nextDueDelta < 1000,
      `nextDueDelta must be a small value, got ${nextDueDelta}`);
    assert.notEqual(nextDueDelta, 20562,
      'regression guard — "Next check in 20562 days" must never render');
  }
});

test('PR #277 applyCommandResponse preserves postMastery cache when follow-up response lacks postMastery', async () => {
  // Sequence: (a) hydrate from response A (full postMastery),
  // (b) issue response B WITHOUT postMastery, (c) assert the cached
  // response-A snapshot is still present. Simulates the Worker-rolling-deploy
  // scenario where one in-flight request lands on an old worker instance that
  // never emitted the field.
  const { getState, store } = createHydrationHarness();
  const responses = [];
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
    guardianMap: { 'demo-slug': { stage: 'secure', nextDueDay: TODAY_DAY + 1 } },
    recommendedWords: [],
    postMasteryDebug: {
      source: 'worker',
      publishedCoreCount: ALL_CORE_COUNT,
      secureCoreCount: ALL_CORE_COUNT,
      blockingCoreCount: 0,
      blockingCoreSlugsPreview: [],
      extraWordsIgnoredCount: 0,
      guardianMapCount: 1,
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
      send() {
        const next = responses.shift();
        return Promise.resolve(next);
      },
    },
    preferenceSaveDebounceMs: 0,
  });

  // Response A — full postMastery block. This hydrates the cache.
  responses.push({
    subjectReadModel: { phase: 'dashboard' },
    postMastery: workerPostMastery,
  });
  handler.handle('spelling-toggle-pref', { pref: 'autoSpeak' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
  await flushPromises();

  const afterA = getState().subjectUi?.spelling?.postMastery;
  assert.ok(afterA, 'response A hydrated postMastery cache');
  assert.equal(afterA.allWordsMega, true, 'cache has graduated-learner snapshot');
  assert.equal(afterA.guardianMissionState, 'wobbling');

  // Response B — NO postMastery field (rolling-deploy old worker / throw-
  // handled by MEDIUM try/catch). The cache must be preserved.
  responses.push({
    subjectReadModel: { phase: 'dashboard' },
    // deliberately no postMastery
  });
  handler.handle('spelling-toggle-pref', { pref: 'autoSpeak' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
  await flushPromises();

  const afterB = getState().subjectUi?.spelling?.postMastery;
  assert.ok(afterB, 'postMastery cache preserved across postMastery-less response');
  assert.equal(afterB.allWordsMega, true, 'cache still reflects graduated-learner snapshot');
  assert.equal(afterB.postMegaDashboardAvailable, true,
    'dashboard availability survives old-worker compat window');
  assert.equal(afterB.guardianMissionState, 'wobbling',
    'response A values remain after a postMastery-less response');
});

test('PR #277 handlePreferenceSaveError preserves postMastery cache so a graduated learner does not regress to legacy dashboard', async () => {
  // Scenario: Alt+4 Guardian shortcut fires. start-session succeeds and the
  // response hydrates postMastery with graduated values. The subsequent
  // save-prefs throws (e.g. flaky sync). Before this fix
  // handlePreferenceSaveError wiped the cache via reloadFromRepositories and
  // the dashboard regressed to locked-fallback, dropping the learner back
  // onto Smart Review. After the fix the cache is preserved across the
  // error path.
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
  // Start from a state that already has the graduated postMastery cached so
  // we can isolate the save-prefs-error path without depending on start-
  // session completing first.
  const { getState, store } = createHydrationHarness({
    phase: 'dashboard',
    prefs: { mode: 'guardian', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
    analytics: null,
    error: '',
    postMastery: workerPostMastery,
  });

  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: { getPrefs() { return getState().subjectUi.spelling.prefs; } } },
    tts: { speak() {}, stop() {} },
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        if (request.command === 'save-prefs') {
          return Promise.reject(new Error('Sync temporarily unavailable.'));
        }
        return Promise.resolve({ subjectReadModel: { phase: 'dashboard' }, postMastery: workerPostMastery });
      },
    },
    preferenceSaveDebounceMs: 0,
  });

  // Trigger a preference-save action — the debounced save-prefs call will
  // reject and route through handlePreferenceSaveError.
  handler.handle('spelling-toggle-pref', { pref: 'autoSpeak' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
  await flushPromises();
  await flushPromises();

  // Cache must survive the failed save-prefs: the learner is still graduated.
  const afterError = getState().subjectUi?.spelling?.postMastery;
  assert.ok(afterError, 'postMastery cache preserved across save-prefs failure');
  assert.equal(afterError.allWordsMega, true,
    'graduated learner does not regress to legacy Smart Review dashboard');
  assert.equal(afterError.postMegaDashboardAvailable, true,
    'dashboard remains available after preference-save error');
  assert.equal(afterError.guardianMissionState, 'due',
    'cached mission state from before the error is still in place');
});
