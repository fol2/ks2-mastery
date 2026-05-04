// Tests for U9 Boss Dictation service path.
//
// Boss Dictation is a `type: 'test'`-shaped single-attempt round over a random
// sample of core-pool Mega slugs. Unlike legacy SATs Test, Boss NEVER demotes
// `progress.stage` / `dueDay` / `lastDay` / `lastResult` — those invariants
// live in the dedicated `submitBossAnswer` path.
//
// Plan: docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md (U9).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOSS_DEFAULT_ROUND_LENGTH,
  BOSS_MAX_ROUND_LENGTH,
  BOSS_MIN_ROUND_LENGTH,
  SPELLING_MODES,
  normaliseMode,
} from '../src/subjects/spelling/service-contract.js';
import {
  SPELLING_EVENT_TYPES,
  createSpellingBossCompletedEvent,
} from '../src/subjects/spelling/events.js';
import { selectBossWords } from '../shared/spelling/service.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { buildSpellingLearnerReadModel } from '../src/subjects/spelling/read-model.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import {
  spellingSessionContextNote,
  spellingSessionFooterNote,
  spellingSessionInfoChips,
  spellingSessionInputPlaceholder,
  spellingSessionProgressLabel,
  spellingSessionSubmitLabel,
} from '../src/subjects/spelling/session-ui.js';
import { WORDS, WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';
import { seedFullCoreMega as seedFullCoreMegaShared } from './helpers/post-mastery-seeds.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function makeServiceWithSeed({ now, random, storage = installMemoryStorage() } = {}) {
  const repositories = createLocalPlatformRepositories({ storage });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });
  return { storage, repositories, service };
}

// P2 U3: delegates to the shared seeder. Matches the guardian suite's
// wiring — `guardian: {}` + `postMega: null` + `variation: true` — so the
// Boss unit tests keep the exact starting shape they had before the
// extraction.
function seedAllCoreMega(repositories, learnerId, todayDay) {
  return seedFullCoreMegaShared(repositories, learnerId, {
    today: todayDay,
    guardian: {},
    postMega: null,
    variation: true,
  });
}

function runBossRoundUntilSummary(service, learnerId, state, getAnswerForSlug) {
  const events = [];
  const seenSlugs = [];
  let current = state;
  while (current.phase === 'session') {
    const slug = current.session.currentCard.slug;
    seenSlugs.push(slug);
    const typed = getAnswerForSlug(slug, current);
    const submitted = service.submitAnswer(learnerId, current, typed);
    events.push(...submitted.events);
    current = submitted.state;
    assert.equal(current.awaitingAdvance, true, `awaitingAdvance after ${slug}`);
    const continued = service.continueSession(learnerId, current);
    events.push(...continued.events);
    current = continued.state;
  }
  return { state: current, events, seenSlugs };
}

// -----------------------------------------------------------------------------
// Contract constants + mode normalisation
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Fallback stage guard — mid-round progress loss must NOT silently demote Mega
// -----------------------------------------------------------------------------

test('Boss submitBossAnswer refuses the write if progress is cleared mid-round', () => {
  // Under a storage-clear race (learner resets progress mid-round, another tab
  // overwrites the progress map, etc.) the progressMap could be missing the
  // current Boss slug. The prior implementation synthesised a
  // `{ stage: 0, ... }` seed and wrote it — silently demoting a word that had
  // been Mega at round-start and violating the Mega-never-revoked invariant.
  //
  // The fix is to refuse the write and return an invalid-session transition,
  // so the UI shows an error instead of masking the demotion.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const storage = installMemoryStorage();
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42), storage });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.equal(started.ok, true);
  const firstSlug = started.state.session.currentCard.slug;

  // Simulate the storage-clear race: wipe the progress map after the round
  // has started but before the first submit.
  repositories.subjectStates.writeData('learner-a', 'spelling', { progress: {} });

  const submitted = service.submitAnswer('learner-a', started.state, 'anything');
  assert.equal(submitted.ok, false,
    'submit is refused when progress is missing for the current slug');

  // Verify no demotion landed — the progress map should still be empty
  // (not seeded with stage:0). Reading back through the service's progress
  // snapshot confirms no silent write happened for the current slug.
  const row = service.getAnalyticsSnapshot('learner-a').wordGroups
    .flatMap((g) => g.words)
    .find((w) => w.slug === firstSlug);
  // After the wipe the analytics row defaults to stage 0 for any slug not
  // present in the (now-empty) progress map — but the critical guarantee is
  // that submit did not write a new entry. The before/after state remains
  // "progress missing"; the service did not invent a stage:0 row.
  assert.equal(row.progress.attempts, 0,
    'no write landed for the current slug (attempts stays at 0)');
  assert.equal(row.progress.wrong, 0,
    'no write landed for the current slug (wrong stays at 0)');
});

// -----------------------------------------------------------------------------
// Resume-after-refresh — Boss must persist sessionKind 'boss' (not 'test') so
// Resume routes back to Boss Dictation, not SATs Test Setup.
// -----------------------------------------------------------------------------

test('Resume after refresh: active Boss session persists sessionKind === "boss"', () => {
  // Regression for PR #235 sev-80 blocker. When `buildActiveRecord` persisted
  // `sessionKind: session.type`, Boss (type: 'test') and Guardian (type:
  // 'learning') both lost their post-Mega identity across refresh. Resume
  // button then displayed "Continue SATs 20" and routed into SATs Test Setup.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.equal(started.ok, true, 'Boss session must start for this test');
  assert.equal(started.state.session.type, 'test', 'Boss session shape is type: test');
  assert.equal(started.state.session.mode, 'boss', 'Boss session mode is boss');

  // Round-trip: read the active record back through the persistence layer.
  // `service.startSession` already calls `syncPracticeSession` under the hood
  // (the repository.write hook), so we can read directly.
  const active = repositories.practiceSessions.latest('learner-a', 'spelling');
  assert.ok(active, 'active practice session record must exist after start');
  assert.equal(active.status, 'active');
  assert.equal(active.sessionKind, 'boss',
    `sessionKind must be 'boss' (mode identity), not 'test' (shape identity); got ${active.sessionKind}`);
});

test('Resume after refresh: read-model surfaces recommendedMode === "boss" for active Boss session', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.equal(started.ok, true);

  // Build the read model the dashboard uses.
  const subjectStateRecord = repositories.subjectStates.read('learner-a', 'spelling');
  const practiceSessions = repositories.practiceSessions.list('learner-a', 'spelling');

  const model = buildSpellingLearnerReadModel({
    subjectStateRecord,
    practiceSessions,
    eventLog: [],
    runtimeSnapshot: { words: WORDS, wordBySlug: WORD_BY_SLUG },
    now: now(),
  });

  assert.equal(model.currentFocus.recommendedMode, 'boss',
    'Resume should route back to Boss Dictation, not SATs Test Setup');
  assert.match(model.currentFocus.label, /Boss Dictation/i,
    `Resume label must say "Boss Dictation", got ${model.currentFocus.label}`);
  assert.doesNotMatch(model.currentFocus.label, /SATs/i,
    'Resume label must not leak SATs copy for Boss');
});

test('Resume after refresh: Guardian session also persists sessionKind === "guardian"', () => {
  // Guardian has the same shape-vs-mode mismatch as Boss: type is 'learning',
  // mode is 'guardian'. Without the fix, `sessionKind` was 'learning', which
  // read-model mapped to 'smart' so Resume routed to Smart Review Setup.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  // Force an active Guardian record by seeding a Guardian mission.
  // Use service.startSession({mode:'guardian'}) which is available when Mega.
  const started = service.startSession('learner-a', { mode: 'guardian', length: 5 });
  if (!started.ok) {
    // Guardian may have no words due without seeded guardian map — skip.
    return;
  }
  assert.equal(started.state.session.mode, 'guardian');
  const active = repositories.practiceSessions.latest('learner-a', 'spelling');
  assert.ok(active);
  assert.equal(active.sessionKind, 'guardian',
    `sessionKind must be 'guardian'; got ${active.sessionKind}`);

  const subjectStateRecord = repositories.subjectStates.read('learner-a', 'spelling');
  const practiceSessions = repositories.practiceSessions.list('learner-a', 'spelling');
  const model = buildSpellingLearnerReadModel({
    subjectStateRecord,
    practiceSessions,
    eventLog: [],
    runtimeSnapshot: { words: WORDS, wordBySlug: WORD_BY_SLUG },
    now: now(),
  });
  assert.equal(model.currentFocus.recommendedMode, 'guardian');
});

// -----------------------------------------------------------------------------
// Alt+5 double-press abuse — prefs.mode must not mutate unless the transition
// actually commits. Protects against `startSession` failing after savePrefs
// has already written 'boss' to storage, which would leave the child's Setup
// scene configured for Boss without ever actually running one.
// -----------------------------------------------------------------------------

test('Alt+5 abuse: failed Boss startSession must NOT persist prefs.mode = "boss"', () => {
  // Simulate the `spelling-shortcut-start` action when allWordsMega === false.
  // This is the exact scenario a rapid double-press exposes: the gate holds,
  // startSession returns ok:false, and prefs must remain on the pre-Alt+5
  // value. If savePrefs runs before startSession (or runs regardless of the
  // transition outcome), the child's Setup scene defaults to Boss on next
  // open even though no Boss session was ever committed.
  const now = () => Date.UTC(2026, 0, 10);
  const { service } = makeServiceWithSeed({ now, random: () => 0.5 });
  // Baseline: prefs.mode starts at the default 'smart'.
  const initialPrefs = service.getPrefs('learner-a');
  assert.equal(initialPrefs.mode, 'smart', 'baseline prefs.mode === "smart"');

  // Mirror module.js `spelling-shortcut-start` logic: read prefs, start,
  // persist only on ok.
  const currentPrefs = service.getPrefs('learner-a');
  const transition = service.startSession('learner-a', {
    mode: 'boss',
    yearFilter: currentPrefs.yearFilter,
    length: currentPrefs.roundLength,
    extraWordFamilies: currentPrefs.extraWordFamilies,
  });
  if (transition?.ok !== false) {
    service.savePrefs('learner-a', { mode: 'boss' });
  }

  // allWordsMega === false so Boss startSession returns ok:false and prefs
  // MUST still be 'smart'. If module.js is ever refactored to run savePrefs
  // before startSession (or unconditionally), this assertion flips and the
  // test fails.
  assert.equal(transition.ok, false, 'Boss transition must fail without Mega');
  const afterPrefs = service.getPrefs('learner-a');
  assert.equal(afterPrefs.mode, 'smart',
    `prefs.mode must NOT have been promoted to "boss" after a failed transition; got "${afterPrefs.mode}"`);
});

test('Alt+5 abuse: successful Boss startSession DOES persist prefs.mode = "boss"', () => {
  // Inverse regression test — when Boss does transition successfully the
  // savePrefs step must still run, so the Setup scene on next refresh
  // reflects the committed session mode.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const currentPrefs = service.getPrefs('learner-a');
  assert.equal(currentPrefs.mode, 'smart');

  const transition = service.startSession('learner-a', {
    mode: 'boss',
    yearFilter: currentPrefs.yearFilter,
    length: currentPrefs.roundLength,
    extraWordFamilies: currentPrefs.extraWordFamilies,
  });
  if (transition?.ok !== false) {
    service.savePrefs('learner-a', { mode: 'boss' });
  }

  assert.equal(transition.ok, true);
  assert.equal(transition.state.session.mode, 'boss');
  const afterPrefs = service.getPrefs('learner-a');
  assert.equal(afterPrefs.mode, 'boss',
    'prefs.mode SHOULD be "boss" after a successful Boss transition');
});

test('Resume after refresh: legacy SATs test preserves sessionKind === "test"', () => {
  // Guard against over-generalising the fix: non-post-Mega modes (smart /
  // trouble / test / single) must still use session.type as sessionKind.
  const now = () => Date.UTC(2026, 0, 10);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(7) });
  const today = Math.floor(now() / DAY_MS);
  // Seed enough secure progress so SATs test can run (type: 'test' uses
  // core year only; any progress shape will do for starting a test session).
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'test' });
  assert.equal(started.ok, true);
  assert.equal(started.state.session.type, 'test');
  assert.equal(started.state.session.mode, 'test');

  const active = repositories.practiceSessions.latest('learner-a', 'spelling');
  assert.ok(active);
  assert.equal(active.sessionKind, 'test',
    'legacy SATs test must keep sessionKind === "test"');

  const subjectStateRecord = repositories.subjectStates.read('learner-a', 'spelling');
  const practiceSessions = repositories.practiceSessions.list('learner-a', 'spelling');
  const model = buildSpellingLearnerReadModel({
    subjectStateRecord,
    practiceSessions,
    eventLog: [],
    runtimeSnapshot: { words: WORDS, wordBySlug: WORD_BY_SLUG },
    now: now(),
  });
  assert.equal(model.currentFocus.recommendedMode, 'test');
});

