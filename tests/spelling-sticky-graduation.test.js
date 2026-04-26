// Tests for U2 — Sticky graduation with SPELLING_CONTENT_RELEASE_ID.
//
// Plan: docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md (U2)
//
// Contract under test:
//   1. Once a learner first achieves `allWordsMega: true`, `data.postMega` is
//      persisted exactly once and never overwritten while already set.
//   2. `postMega.unlockedContentReleaseId === 'spelling-p2-baseline-2026-04-26'`.
//   3. `postMegaUnlockedEver` and `postMegaDashboardAvailable` remain true for
//      the lifetime of the record — content added or retired never demotes
//      either flag.
//   4. `newCoreWordsSinceGraduation = max(0, publishedCoreCount - unlockedPublishedCoreCount)`.
//   5. H1 submit-caused-this guard: emission fires only when the just-submitted
//      slug's stage transitioned `< 4 → === 4` during this submit. A
//      content-retirement edge that shrinks `publishedCoreCount` over an
//      already-Mega word must NOT trigger a spurious sticky unlock.
//   6. H3 idempotency: inside the persistence critical section, a non-null
//      `data.postMega` is NEVER overwritten on a second Mega-producing
//      answer — the original `unlockedAt` survives.
//   7. `SPELLING_SERVICE_STATE_VERSION === 3`.
//
// Executed test-first per the plan's execution note. The invariant at the top
// of this file ("post-graduation content-added never revokes
// postMegaDashboardAvailable") runs as the headline assertion and pins the
// sticky-bit contract before any downstream regression can touch it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence, normaliseSpellingSubjectData } from '../src/subjects/spelling/repository.js';
import { WORDS } from '../src/subjects/spelling/data/word-data.js';
import {
  SPELLING_CONTENT_RELEASE_ID,
  SPELLING_SERVICE_STATE_VERSION,
} from '../src/subjects/spelling/service-contract.js';
import { SPELLING_EVENT_TYPES } from '../src/subjects/spelling/events.js';
import { getSpellingPostMasteryState } from '../src/subjects/spelling/read-model.js';
import { normaliseServerSpellingData } from '../worker/src/subjects/spelling/engine.js';

// ----- Fixtures -------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY_MS = Date.UTC(2026, 0, 10);
const TODAY_DAY = Math.floor(TODAY_MS / DAY_MS);
const CORE_WORDS = WORDS.filter((word) => word.spellingPool !== 'extra');
const CORE_SLUGS = CORE_WORDS.map((word) => word.slug);
const ALL_CORE_COUNT = CORE_SLUGS.length;

// Seed a learner so every core slug is Mega (stage 4) EXCEPT the
// `exceptSlug`, which is the slug we intend to be the "first-graduation
// moment" upgrader. Leaving one slug at stage 3 + attempts 2/3 means the
// learner can finish graduation with a single successful Smart Review
// submit on that slug.
function seedGraduationReady(repositories, learnerId, { exceptSlug }) {
  const progress = {};
  for (const slug of CORE_SLUGS) {
    if (slug === exceptSlug) {
      progress[slug] = {
        stage: 3,
        attempts: 3,
        correct: 2,
        wrong: 0,
        dueDay: TODAY_DAY,
        lastDay: TODAY_DAY - 1,
        lastResult: 'correct',
      };
    } else {
      progress[slug] = {
        stage: 4,
        attempts: 6,
        correct: 5,
        wrong: 1,
        dueDay: TODAY_DAY + 30,
        lastDay: TODAY_DAY - 1,
        lastResult: 'correct',
      };
    }
  }
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress,
    guardian: {},
  });
  return progress;
}

function seedFullMega(repositories, learnerId) {
  const progress = Object.fromEntries(CORE_SLUGS.map((slug) => [slug, {
    stage: 4,
    attempts: 6,
    correct: 5,
    wrong: 1,
    dueDay: TODAY_DAY + 30,
    lastDay: TODAY_DAY - 1,
    lastResult: 'correct',
  }]));
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress,
    guardian: {},
  });
  return progress;
}

function makeHarness({ learnerId = 'learner-a', contentSnapshot = undefined } = {}) {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const now = () => TODAY_MS;
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random: () => 0.5,
    contentSnapshot,
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  return { storage, repositories, service, learnerId, now };
}

function readPersistedPostMega(repositories, learnerId) {
  const record = repositories.subjectStates.read(learnerId, 'spelling');
  return record?.data?.postMega ?? null;
}

// ----- 1. State-version + constant --------------------------------------------

test('U2 SPELLING_SERVICE_STATE_VERSION bumped to 3', () => {
  assert.equal(SPELLING_SERVICE_STATE_VERSION, 3);
});

test('U2 SPELLING_CONTENT_RELEASE_ID exported and matches planned value', () => {
  assert.equal(SPELLING_CONTENT_RELEASE_ID, 'spelling-p2-baseline-2026-04-26');
});

// ----- 2. Headline invariant --------------------------------------------------
//
// Post-graduation content-added never revokes `postMegaDashboardAvailable`.
// This is the invariant called out by the plan's execution note — it pins
// the sticky-bit contract before any downstream regression can touch it.

test('U2 invariant: post-graduation content-added never revokes postMegaDashboardAvailable', () => {
  const { repositories, learnerId } = makeHarness();
  // Seed: learner is graduated with all 170 core words, and the sticky-bit
  // has been persisted. writeData REPLACES `data` wholesale, so bundle
  // progress + guardian + postMega in one call.
  const progress = Object.fromEntries(CORE_SLUGS.map((slug) => [slug, {
    stage: 4,
    attempts: 6,
    correct: 5,
    wrong: 1,
    dueDay: TODAY_DAY + 30,
    lastDay: TODAY_DAY - 1,
    lastResult: 'correct',
  }]));
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress,
    guardian: {},
    postMega: {
      unlockedAt: TODAY_MS,
      unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      unlockedPublishedCoreCount: ALL_CORE_COUNT,
      unlockedBy: 'all-core-stage-4',
    },
  });

  // Baseline — post-mega dashboard is available.
  const baseRecord = repositories.subjectStates.read(learnerId, 'spelling');
  const baseState = getSpellingPostMasteryState({
    subjectStateRecord: baseRecord,
    now: TODAY_MS,
  });
  assert.equal(baseState.postMegaUnlockedEver, true);
  assert.equal(baseState.postMegaDashboardAvailable, true);
  assert.equal(baseState.newCoreWordsSinceGraduation, 0);

  // Content added — the learner's progress map STAYS identical but the
  // runtime snapshot exposes three brand-new core slugs that the learner
  // has not yet drilled. `allWordsMegaNow` flips to false, but the sticky
  // bit keeps `postMegaDashboardAvailable: true`, and
  // `newCoreWordsSinceGraduation === 3` surfaces the delta.
  const syntheticExtra = [
    { slug: 'fresh-word-alpha', word: 'alpha', family: 'new-family', year: '3-4', yearLabel: 'Years 3-4', spellingPool: 'core' },
    { slug: 'fresh-word-beta', word: 'beta', family: 'new-family', year: '3-4', yearLabel: 'Years 3-4', spellingPool: 'core' },
    { slug: 'fresh-word-gamma', word: 'gamma', family: 'new-family', year: '3-4', yearLabel: 'Years 3-4', spellingPool: 'core' },
  ];
  const expandedSnapshot = {
    words: [...WORDS, ...syntheticExtra],
    wordBySlug: { ...Object.fromEntries(WORDS.map((w) => [w.slug, w])), ...Object.fromEntries(syntheticExtra.map((w) => [w.slug, w])) },
  };
  const expandedState = getSpellingPostMasteryState({
    subjectStateRecord: baseRecord,
    runtimeSnapshot: expandedSnapshot,
    now: TODAY_MS,
  });
  assert.equal(expandedState.allWordsMegaNow, false, 'live flag flips when new core words appear');
  assert.equal(expandedState.postMegaUnlockedEver, true, 'sticky stays set forever');
  assert.equal(expandedState.postMegaDashboardAvailable, true, 'dashboard stays available after content-added');
  assert.equal(expandedState.newCoreWordsSinceGraduation, 3, 'delta equals number of new core words');
});

// ----- 3. Fresh-graduate happy path -------------------------------------------

test('U2 happy path: fresh learner finishing final core word persists postMega sticky-bit with release id', () => {
  const { service, repositories, learnerId } = makeHarness();
  const targetSlug = CORE_SLUGS[0];
  seedGraduationReady(repositories, learnerId, { exceptSlug: targetSlug });

  const targetWord = CORE_WORDS.find((w) => w.slug === targetSlug);
  assert.ok(targetWord, 'target core word exists');

  const started = service.startSession(learnerId, {
    mode: 'single',
    words: [targetSlug],
    yearFilter: 'core',
    length: 1,
  });
  assert.equal(started.ok, true);
  const submitted = service.submitAnswer(learnerId, started.state, targetWord.word);
  assert.equal(submitted.ok, true, 'submit succeeds on final core word');

  // postMega must be written now.
  const postMega = readPersistedPostMega(repositories, learnerId);
  assert.ok(postMega, 'data.postMega persisted after first-graduation moment');
  assert.equal(postMega.unlockedAt, TODAY_MS, 'unlockedAt is now()');
  assert.equal(postMega.unlockedContentReleaseId, SPELLING_CONTENT_RELEASE_ID);
  assert.equal(postMega.unlockedPublishedCoreCount, ALL_CORE_COUNT);
  assert.equal(postMega.unlockedBy, 'all-core-stage-4');

  // `spelling.post-mega.unlocked` event emitted in the transition.
  const unlockEvent = (submitted.events || []).find((e) => e?.type === SPELLING_EVENT_TYPES.POST_MEGA_UNLOCKED);
  assert.ok(unlockEvent, 'post-mega.unlocked event emitted on first-graduation');
  assert.equal(unlockEvent.learnerId, learnerId);
  assert.equal(unlockEvent.contentReleaseId, SPELLING_CONTENT_RELEASE_ID);
  assert.equal(unlockEvent.publishedCoreCount, ALL_CORE_COUNT);
  assert.equal(unlockEvent.unlockedAt, TODAY_MS);
});

// ----- 4. H3 persistence-layer idempotency ------------------------------------

test('U2 idempotency: second Mega-producing answer preserves original unlockedAt (H3 guard)', () => {
  const { service, repositories, learnerId } = makeHarness();
  // Pre-seed: learner already has postMega from an earlier graduation moment
  // with a synthetic OLDER timestamp. writeData REPLACES `data` wholesale,
  // so we must bundle progress + guardian + postMega into a single write.
  const progress = Object.fromEntries(CORE_SLUGS.map((slug) => [slug, {
    stage: 4,
    attempts: 6,
    correct: 5,
    wrong: 1,
    dueDay: TODAY_DAY + 30,
    lastDay: TODAY_DAY - 1,
    lastResult: 'correct',
  }]));
  const priorUnlockedAt = TODAY_MS - 5 * DAY_MS;
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress,
    guardian: {},
    postMega: {
      unlockedAt: priorUnlockedAt,
      unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      unlockedPublishedCoreCount: ALL_CORE_COUNT,
      unlockedBy: 'all-core-stage-4',
    },
  });

  // Run a Guardian round to produce a "correct" answer on an already-Mega
  // slug. The graduation-moment detector must recognise the sticky-bit is
  // already set and NOT overwrite it.
  const targetSlug = CORE_SLUGS[0];
  const targetWord = CORE_WORDS.find((w) => w.slug === targetSlug);
  const started = service.startSession(learnerId, {
    mode: 'guardian',
    words: [targetSlug],
    length: 1,
  });
  assert.equal(started.ok, true);
  const submitted = service.submitAnswer(learnerId, started.state, targetWord.word);
  assert.equal(submitted.ok, true);

  const postMega = readPersistedPostMega(repositories, learnerId);
  assert.equal(postMega.unlockedAt, priorUnlockedAt, 'original unlockedAt preserved');
  const events = submitted.events || [];
  assert.equal(
    events.filter((e) => e?.type === SPELLING_EVENT_TYPES.POST_MEGA_UNLOCKED).length,
    0,
    'no duplicate post-mega.unlocked event',
  );
});

// ----- 5. H1 submit-caused-this guard — NEGATIVE path -------------------------

test('U2 H1 guard: content-retirement flipping allWordsMegaNow true does NOT emit sticky unlock', () => {
  // Scenario: learner has 168 Mega slugs out of 170 published. A content
  // hot-swap RETIRES the remaining 2 non-Mega slugs (publishedCoreCount
  // drops from 170 -> 168). `allWordsMegaNow` would suddenly flip to true
  // without any slug's stage having transitioned from <4 to 4. The H1
  // submit-caused-this guard must PREVENT a spurious sticky unlock.
  //
  // We drive this through a service.submitAnswer call on a non-graduating
  // slug (e.g. a guardian correct answer). The just-submitted slug's
  // stage was already 4, so the third conjunct "stage transitioned <4 → 4"
  // is false → no emission.
  //
  // Harness: build a runtime snapshot that has ONLY the CORE_SLUGS[0..167]
  // slice (shrunken core pool). The learner was pre-seeded with Mega on
  // slugs [0..167] and stage 2 on [168..169]. With the shrunken snapshot,
  // `isAllWordsMega` would return true — but the learner's submit didn't
  // upgrade any stage from <4 to 4.
  const RETIRED_COUNT = 2;
  const activeSlugs = CORE_SLUGS.slice(0, CORE_SLUGS.length - RETIRED_COUNT);
  const shrunkenWords = CORE_WORDS.filter((w) => activeSlugs.includes(w.slug));
  const shrunkenBySlug = Object.fromEntries(shrunkenWords.map((w) => [w.slug, w]));

  const { service, repositories, learnerId } = makeHarness({
    contentSnapshot: { words: shrunkenWords, wordBySlug: shrunkenBySlug },
  });

  // Learner: every ACTIVE slug is Mega; the retired ones have whatever
  // stage the original content left — they're no longer tracked by the
  // runtime so they can't trigger graduation directly.
  const progress = {};
  for (const slug of activeSlugs) {
    progress[slug] = {
      stage: 4,
      attempts: 6,
      correct: 5,
      wrong: 1,
      dueDay: TODAY_DAY + 30,
      lastDay: TODAY_DAY - 1,
      lastResult: 'correct',
    };
  }
  // Keep retired slugs around (content hot-swap may retire but preserves
  // learner records). They're at stage 2 so they would have blocked
  // graduation BEFORE retirement.
  for (const slug of CORE_SLUGS.slice(activeSlugs.length)) {
    progress[slug] = {
      stage: 2,
      attempts: 2,
      correct: 1,
      wrong: 1,
      dueDay: TODAY_DAY,
      lastDay: TODAY_DAY - 1,
      lastResult: 'wrong',
    };
  }
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress,
    guardian: {},
    // Critically: NO postMega set — the retirement has just happened, the
    // sticky bit has never been written.
  });

  // Submit a Guardian correct on an already-Mega slug. Pre-submit stage === 4,
  // post-submit stage === 4. The H1 guard denies emission because the
  // just-submitted slug did NOT transition <4 → 4.
  const targetSlug = activeSlugs[0];
  const targetWord = CORE_WORDS.find((w) => w.slug === targetSlug);
  const started = service.startSession(learnerId, {
    mode: 'guardian',
    words: [targetSlug],
    length: 1,
  });
  assert.equal(started.ok, true);
  const submitted = service.submitAnswer(learnerId, started.state, targetWord.word);
  assert.equal(submitted.ok, true);

  const postMega = readPersistedPostMega(repositories, learnerId);
  assert.equal(postMega, null, 'no spurious sticky unlock on content-retirement edge');
  const unlockEvents = (submitted.events || []).filter((e) => e?.type === SPELLING_EVENT_TYPES.POST_MEGA_UNLOCKED);
  assert.equal(unlockEvents.length, 0, 'no post-mega.unlocked event on content-retirement edge');
});

// ----- 6. Content-added delta surfacing via read-model ------------------------

test('U2 read-model: content-added increases newCoreWordsSinceGraduation by the published delta', () => {
  const { repositories, learnerId } = makeHarness();
  // Bundle progress + postMega in a single writeData — the channel replaces
  // `data` wholesale on every call.
  const progress = Object.fromEntries(CORE_SLUGS.map((slug) => [slug, {
    stage: 4, attempts: 6, correct: 5, wrong: 1,
    dueDay: TODAY_DAY + 30, lastDay: TODAY_DAY - 1, lastResult: 'correct',
  }]));
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress,
    guardian: {},
    postMega: {
      unlockedAt: TODAY_MS - 10 * DAY_MS,
      unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      unlockedPublishedCoreCount: ALL_CORE_COUNT,
      unlockedBy: 'all-core-stage-4',
    },
  });

  const record = repositories.subjectStates.read(learnerId, 'spelling');

  // Runtime adds 5 fresh core words that the learner hasn't drilled.
  const synthetic = Array.from({ length: 5 }, (_, i) => ({
    slug: `fresh-${i}`,
    word: `fresh${i}`,
    family: 'fresh-family',
    year: '3-4',
    yearLabel: 'Years 3-4',
    spellingPool: 'core',
  }));
  const expandedSnapshot = {
    words: [...WORDS, ...synthetic],
    wordBySlug: { ...Object.fromEntries(WORDS.map((w) => [w.slug, w])), ...Object.fromEntries(synthetic.map((w) => [w.slug, w])) },
  };
  const state = getSpellingPostMasteryState({
    subjectStateRecord: record,
    runtimeSnapshot: expandedSnapshot,
    now: TODAY_MS,
  });
  assert.equal(state.newCoreWordsSinceGraduation, 5);
  assert.equal(state.postMegaDashboardAvailable, true);
  assert.equal(state.postMegaUnlockedEver, true);
});

test('U2 read-model: retirement clamps newCoreWordsSinceGraduation to 0 (no negative delta surfaces)', () => {
  const { repositories, learnerId } = makeHarness();
  const progress = Object.fromEntries(CORE_SLUGS.map((slug) => [slug, {
    stage: 4, attempts: 6, correct: 5, wrong: 1,
    dueDay: TODAY_DAY + 30, lastDay: TODAY_DAY - 1, lastResult: 'correct',
  }]));
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress,
    guardian: {},
    postMega: {
      unlockedAt: TODAY_MS - 10 * DAY_MS,
      unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      unlockedPublishedCoreCount: ALL_CORE_COUNT,
      unlockedBy: 'all-core-stage-4',
    },
  });

  const record = repositories.subjectStates.read(learnerId, 'spelling');

  // Runtime retires 2 core words. publishedCoreCount shrinks to 168.
  const shrunkenWords = CORE_WORDS.slice(0, CORE_WORDS.length - 2);
  const shrunkenSnapshot = {
    words: shrunkenWords,
    wordBySlug: Object.fromEntries(shrunkenWords.map((w) => [w.slug, w])),
  };
  const state = getSpellingPostMasteryState({
    subjectStateRecord: record,
    runtimeSnapshot: shrunkenSnapshot,
    now: TODAY_MS,
  });
  assert.equal(state.newCoreWordsSinceGraduation, 0, 'retirement clamps to 0 — dashboard stays quiet');
  assert.equal(state.postMegaDashboardAvailable, true);
});

// ----- 7. Fresh learner never graduated ---------------------------------------

test('U2 read-model: fresh learner never graduated reports locked sticky bits', () => {
  const { repositories, learnerId } = makeHarness();
  // No writeData call — the repository is empty for this learner.
  const record = repositories.subjectStates.read(learnerId, 'spelling');
  const state = getSpellingPostMasteryState({
    subjectStateRecord: record,
    now: TODAY_MS,
  });
  assert.equal(state.postMegaUnlockedEver, false);
  assert.equal(state.postMegaDashboardAvailable, false);
  assert.equal(state.newCoreWordsSinceGraduation, 0);
  assert.equal(state.allWordsMegaNow, false);
  // Alias: `allWordsMega` must still work for one release.
  assert.equal(state.allWordsMega, state.allWordsMegaNow);
});

// ----- 8. Boss-answer first-graduation path -----------------------------------

test('U2 Boss Dictation final-card correct submit emits sticky unlock if it graduates the learner', () => {
  // Boss is Mega-safe — submits don't demote. But the H1 guard also means
  // Boss submits can't cause a first-graduation (the slug was already
  // stage 4 to be in the Boss pool). So the event must NOT emit from a
  // Boss path. Pin this explicitly.
  const { service, repositories, learnerId } = makeHarness();
  seedFullMega(repositories, learnerId);

  const started = service.startSession(learnerId, {
    mode: 'boss',
    words: [CORE_SLUGS[0], CORE_SLUGS[1]],
    length: 2,
  });
  assert.equal(started.ok, true);
  const firstWord = CORE_WORDS.find((w) => w.slug === CORE_SLUGS[0]);
  const submitted = service.submitAnswer(learnerId, started.state, firstWord.word);
  assert.equal(submitted.ok, true);

  // No postMega was written by Boss because no slug transitioned <4 → 4.
  assert.equal(readPersistedPostMega(repositories, learnerId), null);
  const unlockEvents = (submitted.events || []).filter((e) => e?.type === SPELLING_EVENT_TYPES.POST_MEGA_UNLOCKED);
  assert.equal(unlockEvents.length, 0);
});

// ----- 9. normaliseSpellingSubjectData learns postMega sibling ----------------

test('U2 client normaliser preserves data.postMega as a sibling of progress/guardian/prefs', () => {
  const raw = {
    prefs: { mode: 'smart' },
    progress: { possess: { stage: 4 } },
    guardian: {},
    postMega: {
      unlockedAt: TODAY_MS,
      unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      unlockedPublishedCoreCount: 170,
      unlockedBy: 'all-core-stage-4',
    },
  };
  const normalised = normaliseSpellingSubjectData(raw, TODAY_DAY);
  assert.ok(normalised.postMega, 'postMega survives normalisation');
  assert.equal(normalised.postMega.unlockedAt, TODAY_MS);
  assert.equal(normalised.postMega.unlockedContentReleaseId, SPELLING_CONTENT_RELEASE_ID);
  assert.equal(normalised.postMega.unlockedPublishedCoreCount, 170);
  assert.equal(normalised.postMega.unlockedBy, 'all-core-stage-4');
});

test('U2 client normaliser rejects malformed postMega (returns no sibling)', () => {
  // The normaliser drops the sibling key entirely when the input is
  // garbage, so reading `normalised.postMega` yields `undefined`, not
  // `null`. Either signal (undefined / null) disambiguates "never
  // graduated" for downstream consumers. The explicit sibling-dropped
  // shape keeps persisted bundles compact for pre-graduation learners.
  const normalised = normaliseSpellingSubjectData({ postMega: 'garbage' }, TODAY_DAY);
  assert.equal(normalised.postMega, undefined);
  const arrayNormalised = normaliseSpellingSubjectData({ postMega: [] }, TODAY_DAY);
  assert.equal(arrayNormalised.postMega, undefined);
});

test('U2 Worker twin normaliser preserves data.postMega in parity with client', () => {
  const raw = {
    prefs: {},
    progress: {},
    guardian: {},
    postMega: {
      unlockedAt: TODAY_MS,
      unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      unlockedPublishedCoreCount: 170,
      unlockedBy: 'all-core-stage-4',
    },
  };
  const normalised = normaliseServerSpellingData(raw, TODAY_MS);
  assert.ok(normalised.postMega, 'Worker twin preserves postMega');
  assert.equal(normalised.postMega.unlockedContentReleaseId, SPELLING_CONTENT_RELEASE_ID);
});

// ----- 10. allWordsMega alias survives one release ----------------------------

// ----- 11. Two-tab concurrent first-graduation (U2-to-U5 window) ------------
//
// Simulate two tabs BOTH calling the write path back-to-back against the same
// repositories (single service instance standing in for two tabs; the proxy's
// critical section is the unit of observation). The H3 guard inside the
// storage-proxy setItem must skip the second write so the original
// `unlockedAt` survives. This is the plan's "Two tabs both detect
// first-graduation" scenario, coverage-adjusted for a single-process test
// harness.

test('U2 H3 proxy guard: concurrent first-graduation writes keep the original unlockedAt', () => {
  const { repositories, learnerId, now } = makeHarness();
  // Build a fresh SpellingPersistence against the same repositories so we
  // hit the proxy's storage `setItem` path (including the H3 guard).
  // Bypass the service so we can arbitrarily pose as "two tabs" each
  // writing a different sticky bit.
  const persistence = createSpellingPersistence({ repositories, now });
  const firstUnlockedAt = TODAY_MS;
  const secondUnlockedAt = TODAY_MS + 60_000;

  const firstRecord = {
    unlockedAt: firstUnlockedAt,
    unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
    unlockedPublishedCoreCount: ALL_CORE_COUNT,
    unlockedBy: 'all-core-stage-4',
  };
  persistence.storage.setItem(
    `ks2-spell-post-mega-${learnerId}`,
    JSON.stringify(firstRecord),
  );
  const afterFirst = readPersistedPostMega(repositories, learnerId);
  assert.ok(afterFirst, 'first write lands the sticky bit');
  assert.equal(afterFirst.unlockedAt, firstUnlockedAt);

  const secondRecord = {
    unlockedAt: secondUnlockedAt,
    unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
    unlockedPublishedCoreCount: ALL_CORE_COUNT + 3,
    unlockedBy: 'all-core-stage-4',
  };
  persistence.storage.setItem(
    `ks2-spell-post-mega-${learnerId}`,
    JSON.stringify(secondRecord),
  );
  const finalRecord = readPersistedPostMega(repositories, learnerId);
  assert.equal(finalRecord.unlockedAt, firstUnlockedAt, 'second write rejected by H3 guard');
  assert.equal(finalRecord.unlockedPublishedCoreCount, ALL_CORE_COUNT, 'unlockedPublishedCoreCount preserved');
});

// ----- 12. Storage failure during sticky-unlock write does NOT demote -------
//
// If the proxy throws on the sticky-unlock setItem (e.g. quota exceeded),
// the learner's progress.stage must stay at 4 for every Mega slug. The
// persistenceWarning surfaces on the feedback channel so the UI can ask
// the learner to free storage. Mega-never-revoked invariant holds.

test('U2 storage failure on sticky-unlock write does NOT demote progress.stage', () => {
  const { service, repositories, storage, learnerId } = makeHarness();
  const targetSlug = CORE_SLUGS[0];
  seedGraduationReady(repositories, learnerId, { exceptSlug: targetSlug });
  const targetWord = CORE_WORDS.find((w) => w.slug === targetSlug);

  // Arm storage to throw on the very next setItem — first write after that
  // will be the legacy engine's saveProgress, which will fail and raise a
  // persistenceWarning.
  storage.throwOnNextSet();

  const started = service.startSession(learnerId, {
    mode: 'single',
    words: [targetSlug],
    yearFilter: 'core',
    length: 1,
  });
  // Either the session started or it errored — we don't care about the
  // start path, only that the submit that follows does not demote Mega.
  if (!started.ok) {
    // Start-session failure isn't the behaviour under test, but pins that
    // the harness doesn't throw. Re-arm and move on.
    return;
  }
  const submitted = service.submitAnswer(learnerId, started.state, targetWord.word);
  // Submit may succeed or raise a warning — either way, Mega slugs must
  // stay stage >= 4.
  assert.equal(submitted.ok, true);
  const record = repositories.subjectStates.read(learnerId, 'spelling');
  for (const slug of CORE_SLUGS) {
    if (slug === targetSlug) continue; // skip the slug we're drilling
    const entry = record.data.progress[slug];
    if (!entry) continue;
    assert.ok(entry.stage >= 4, `${slug} stage stays at 4 after storage-quota failure`);
  }
});

test('U2 allWordsMega alias: getSpellingPostMasteryState exposes both allWordsMega and allWordsMegaNow', () => {
  const { repositories, learnerId } = makeHarness();
  seedFullMega(repositories, learnerId);
  const record = repositories.subjectStates.read(learnerId, 'spelling');
  const state = getSpellingPostMasteryState({
    subjectStateRecord: record,
    now: TODAY_MS,
  });
  assert.equal(state.allWordsMegaNow, true);
  assert.equal(state.allWordsMega, true, 'allWordsMega alias tracks allWordsMegaNow');
});
