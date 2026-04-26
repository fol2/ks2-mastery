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

test('U2 H1 guard: content-retirement flipping allWordsMegaNow true emits sticky unlock via pre-v3-backfill path', () => {
  // Scenario: learner has 168 Mega slugs out of 170 published. A content
  // hot-swap RETIRES the remaining 2 non-Mega slugs (publishedCoreCount
  // drops from 170 -> 168). `allWordsMegaNow` flips to true on the next
  // submit.
  //
  // **Updated contract (reviewer HIGH fix — pre-v3 backfill)**: under U2,
  // the sticky-unlock path now fires for BOTH fresh graduations (path A,
  // via H1 submit-caused-this guard) AND already-graduated learners without
  // a sticky record (path B, pre-v3 backfill). The service layer cannot
  // distinguish "never graduated" from "graduated via retirement edge" —
  // both surfaces present as `preSubmitAllMega === true` and
  // `loadPostMegaFromStorage === null`. Rather than denying the dashboard
  // to a fully-Mega learner, path B writes the sticky bit with
  // `unlockedBy: 'pre-v3-backfill'` so admins can distinguish it from
  // genuine stage-4 graduations in audit.
  //
  // H1 submit-caused-this guard is preserved for path A (fresh path). Path
  // B intentionally bypasses H1 — the learner IS fully Mega now.
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

  // Submit a Guardian correct on an already-Mega slug. Pre-submit
  // allWordsMega is true (168/168 in shrunken runtime), so path B fires.
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
  assert.ok(postMega, 'pre-v3 backfill path persists the sticky bit');
  assert.equal(postMega.unlockedBy, 'pre-v3-backfill', 'marker distinguishes backfill from fresh graduation');
  const unlockEvents = (submitted.events || []).filter((e) => e?.type === SPELLING_EVENT_TYPES.POST_MEGA_UNLOCKED);
  assert.equal(unlockEvents.length, 1, 'single post-mega.unlocked event on pre-v3 backfill');
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

test('U2 Boss Dictation submit on pre-v3 graduated learner writes sticky via pre-v3-backfill path', () => {
  // Under the new U2 contract (pre-v3 backfill fix), Boss submits CAN
  // emit a sticky-unlock event via path B when the learner is fully Mega
  // but has no persisted sticky-bit. H1's submit-caused-this guard still
  // forbids path A on Boss (no stage transition), but path B explicitly
  // bypasses H1 to cover the pre-v3 cohort. The write is marked with
  // `unlockedBy: 'pre-v3-backfill'` so admins can distinguish it from
  // fresh-path graduations.
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

  // Path B fires: the learner IS fully Mega, so the sticky is minted with
  // the pre-v3 backfill marker.
  const postMega = readPersistedPostMega(repositories, learnerId);
  assert.ok(postMega, 'Boss submit on fully-Mega learner persists sticky via backfill');
  assert.equal(postMega.unlockedBy, 'pre-v3-backfill', 'marker identifies backfill path');
  const unlockEvents = (submitted.events || []).filter((e) => e?.type === SPELLING_EVENT_TYPES.POST_MEGA_UNLOCKED);
  assert.equal(unlockEvents.length, 1, 'single post-mega.unlocked event emitted on backfill');
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

// ----- 13. Pre-v3 graduated cohort backfill (reviewer HIGH fix) --------------
//
// Any learner who reached `allWordsMega: true` under P1/P1.5 has
// `data.postMega: null` when U2 code first reads their state. Without a
// backfill, H1's first conjunct (`preSubmitAllMega === false`) rejects every
// subsequent submit — the learner never mints a sticky bit via normal play.
// If content later adds a word, `allWordsMegaNow` flips to false,
// `postMegaUnlockedEver` is still false, `postMegaDashboardAvailable`
// becomes false, and the dashboard silently disappears.
//
// The backfill path has two surfaces:
//   A) Read-model: `getSpellingPostMasteryState` mints an in-memory record
//      when `allWordsMegaNow && postMegaRecord === null`, so the dashboard
//      stays visible even before a persisted write lands.
//   B) Service: `detectAndPersistFirstGraduation` now accepts the
//      pre-v3 path (`preSubmitAllMega === true`) and persists with
//      `unlockedBy: 'pre-v3-backfill'` on the next genuine submit.

test('U2 pre-v3 backfill: read-model mints in-memory record for fully-Mega learner with no sticky', () => {
  const { repositories, learnerId } = makeHarness();
  // Simulate v2 persisted state: progress is fullMega, NO `postMega` key
  // whatsoever (not even null — the sibling doesn't exist).
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
    // postMega: undefined — identical to the v2 persisted shape.
  });

  const record = repositories.subjectStates.read(learnerId, 'spelling');
  // Pin the state layer — sibling must be absent so the backfill path
  // under test is the one that fires (not a stale value).
  assert.equal(record.data.postMega, undefined, 'v2 persisted shape has no postMega sibling');

  const state = getSpellingPostMasteryState({
    subjectStateRecord: record,
    now: TODAY_MS,
  });
  assert.equal(state.allWordsMegaNow, true, 'learner is fully Mega');
  assert.equal(state.postMegaUnlockedEver, true, 'backfill mints in-memory sticky');
  assert.equal(state.postMegaDashboardAvailable, true, 'dashboard stays visible');
});

test('U2 pre-v3 backfill: next Guardian-correct submit persists sticky with pre-v3-backfill marker', () => {
  const { service, repositories, learnerId } = makeHarness();
  // Pre-seed a pre-v3 graduated learner (fullMega, no postMega sibling).
  seedFullMega(repositories, learnerId);
  // Precondition sanity-check: postMega is absent.
  assert.equal(readPersistedPostMega(repositories, learnerId), null);

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

  // After the first U2-era submit, postMega is stamped with the backfill
  // marker so admins can distinguish this cohort from fresh graduations.
  const postMega = readPersistedPostMega(repositories, learnerId);
  assert.ok(postMega, 'data.postMega persisted after first post-v3 submit');
  assert.equal(postMega.unlockedBy, 'pre-v3-backfill', 'marker distinguishes pre-v3 cohort');
  assert.equal(postMega.unlockedContentReleaseId, SPELLING_CONTENT_RELEASE_ID);
  assert.equal(postMega.unlockedPublishedCoreCount, ALL_CORE_COUNT);

  // Event emitted for audit parity with fresh graduations.
  const unlockEvents = (submitted.events || []).filter((e) => e?.type === SPELLING_EVENT_TYPES.POST_MEGA_UNLOCKED);
  assert.equal(unlockEvents.length, 1, 'single post-mega.unlocked event emitted on backfill');
});

test('U2 pre-v3 backfill: content added after sticky persists keeps postMegaDashboardAvailable true', () => {
  const { service, repositories, learnerId } = makeHarness();
  // Seed pre-v3 fullMega and trigger the backfill write via a submit.
  seedFullMega(repositories, learnerId);
  const warmupSlug = CORE_SLUGS[0];
  const warmupWord = CORE_WORDS.find((w) => w.slug === warmupSlug);
  const started = service.startSession(learnerId, {
    mode: 'guardian',
    words: [warmupSlug],
    length: 1,
  });
  assert.equal(started.ok, true);
  const warmup = service.submitAnswer(learnerId, started.state, warmupWord.word);
  assert.equal(warmup.ok, true);
  assert.ok(readPersistedPostMega(repositories, learnerId), 'sticky is now persistent');

  // Content bundle adds a new core word — the learner hasn't drilled it,
  // so `allWordsMegaNow` flips to false. The sticky-bit must keep the
  // dashboard available.
  const record = repositories.subjectStates.read(learnerId, 'spelling');
  const syntheticExtra = [{
    slug: 'fresh-word-delta',
    word: 'delta',
    family: 'new-family',
    year: '3-4',
    yearLabel: 'Years 3-4',
    spellingPool: 'core',
  }];
  const expandedSnapshot = {
    words: [...WORDS, ...syntheticExtra],
    wordBySlug: { ...Object.fromEntries(WORDS.map((w) => [w.slug, w])), ...Object.fromEntries(syntheticExtra.map((w) => [w.slug, w])) },
  };
  const state = getSpellingPostMasteryState({
    subjectStateRecord: record,
    runtimeSnapshot: expandedSnapshot,
    now: TODAY_MS,
  });
  assert.equal(state.allWordsMegaNow, false, 'live flag flips when new core word appears');
  assert.equal(state.postMegaUnlockedEver, true, 'persistent sticky stays set');
  assert.equal(state.postMegaDashboardAvailable, true, 'dashboard stays available');
  assert.equal(state.newCoreWordsSinceGraduation, 1, 'delta matches the added word');
});

// ----- 14. resetLearner clears ks2-spell-post-mega-<id> (MEDIUM fix) ---------
//
// `savePostMegaToStorage(learnerId, null)` is a silent no-op (the helper
// guards on `normalisePostMegaRecord(null) === null`). Bare-storage hosts
// (no `repository` adapter, or a repository without `resetLearner`) rely on
// the service's own explicit clears. `resetLearner` now calls
// `storage.removeItem(postMegaKey(learnerId))` directly, inside a try/catch.

test('U2 resetLearner clears persisted postMega sticky-bit on bare-storage host', () => {
  // Bare-storage harness: install MemoryStorage and wire the spelling
  // service DIRECTLY against it, with NO `createSpellingPersistence`
  // adapter. This is the contract the bare-storage fallback has to honour.
  const storage = installMemoryStorage();
  const learnerId = 'learner-bare';
  const service = createSpellingService({
    storage,
    now: () => TODAY_MS,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });

  // Seed postMega directly on the raw storage.
  const postMegaKey = `ks2-spell-post-mega-${learnerId}`;
  storage.setItem(postMegaKey, JSON.stringify({
    unlockedAt: TODAY_MS,
    unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
    unlockedPublishedCoreCount: ALL_CORE_COUNT,
    unlockedBy: 'all-core-stage-4',
  }));
  assert.ok(storage.getItem(postMegaKey), 'postMega seeded');

  // Reset the learner.
  service.resetLearner(learnerId);

  // Raw-storage read confirms the sticky-bit is cleared.
  assert.equal(storage.getItem(postMegaKey), null, 'resetLearner clears postMega on bare storage');
});

// ----- 15. Event suppression on failed sticky-unlock persist (u2-corr-1 LOW) -
//
// If the persistence proxy throws specifically on the sticky-unlock write
// (distinct from the legacy-engine progress write), `savePostMegaToStorage`
// returns `{ ok: false }` and `detectAndPersistFirstGraduation` must
// suppress the event so event + sticky-bit stay in lockstep. The learner's
// progress.stage must NOT demote — Mega stays. The next submit retries.

test('U2 storage failure on postMega write suppresses event and does NOT demote Mega', () => {
  // Drive u2-corr-1 directly via a bare-storage harness so the
  // throwOnNextSet raw-key filter maps cleanly to the postMega key written
  // by `savePostMegaToStorage` — there is no platform-persistence bundle
  // layer to rewrite the key here. The service is wired directly against
  // MemoryStorage (no createSpellingPersistence proxy), so raw key writes
  // are 1:1 with service-level writes. That lets us target ONLY the
  // sticky-unlock write without interfering with progress saves.
  const storage = installMemoryStorage();
  const learnerId = 'learner-bare-corr1';
  const service = createSpellingService({
    storage,
    now: () => TODAY_MS,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });

  // Seed a graduation-ready learner: all slugs Mega except one at stage 3.
  const progress = {};
  for (const slug of CORE_SLUGS) {
    progress[slug] = slug === CORE_SLUGS[0]
      ? { stage: 3, attempts: 3, correct: 2, wrong: 0, dueDay: TODAY_DAY, lastDay: TODAY_DAY - 1, lastResult: 'correct' }
      : { stage: 4, attempts: 6, correct: 5, wrong: 1, dueDay: TODAY_DAY + 30, lastDay: TODAY_DAY - 1, lastResult: 'correct' };
  }
  storage.setItem(`ks2-spell-progress-${learnerId}`, JSON.stringify(progress));

  const targetSlug = CORE_SLUGS[0];
  const targetWord = CORE_WORDS.find((w) => w.slug === targetSlug);

  // Arm storage to throw ONLY on writes to the sticky-unlock key. Bare
  // storage makes this 1:1 with the service's `savePostMegaToStorage` call,
  // so progress writes and guardian writes go through unaffected.
  storage.throwOnNextSet({ key: `ks2-spell-post-mega-${learnerId}` });

  const started = service.startSession(learnerId, {
    mode: 'single',
    words: [targetSlug],
    yearFilter: 'core',
    length: 1,
  });
  assert.equal(started.ok, true);
  const submitted = service.submitAnswer(learnerId, started.state, targetWord.word);
  assert.equal(submitted.ok, true);

  // (a) Event NOT emitted — persist + emit stay in lockstep.
  const unlockEvents = (submitted.events || []).filter((e) => e?.type === SPELLING_EVENT_TYPES.POST_MEGA_UNLOCKED);
  assert.equal(unlockEvents.length, 0, 'event suppressed on failed sticky-unlock write');

  // (b) Sticky-bit NOT persisted (the throw blocked the write).
  const persistedRaw = storage.getItem(`ks2-spell-post-mega-${learnerId}`);
  assert.equal(persistedRaw, null, 'sticky-bit not persisted on storage throw');

  // (c) `progress.stage` NOT demoted — the target slug still transitioned
  // to stage 4 via legacy-engine's own write (which happens before the
  // sticky-unlock write).
  const progressRaw = storage.getItem(`ks2-spell-progress-${learnerId}`);
  const progressAfter = JSON.parse(progressRaw);
  assert.equal(Number(progressAfter[targetSlug].stage), 4, 'Mega stays after failed sticky write');
  // And every OTHER Mega slug stays at stage 4 too.
  for (const slug of CORE_SLUGS) {
    if (slug === targetSlug) continue;
    const entry = progressAfter[slug];
    if (!entry) continue;
    assert.ok(entry.stage >= 4, `${slug} stage stays >= 4 after failed sticky write`);
  }

  // (d) Next submit succeeds and writes postMega. The learner's already at
  // full Mega → path B (pre-v3 backfill) fires on the retry. The storage
  // throw-hook is one-shot so the next write succeeds.
  const retrySlug = CORE_SLUGS[1];
  const retryWord = CORE_WORDS.find((w) => w.slug === retrySlug);
  const retryStarted = service.startSession(learnerId, {
    mode: 'guardian',
    words: [retrySlug],
    length: 1,
  });
  assert.equal(retryStarted.ok, true);
  const retrySubmit = service.submitAnswer(learnerId, retryStarted.state, retryWord.word);
  assert.equal(retrySubmit.ok, true);
  const postMegaRaw = storage.getItem(`ks2-spell-post-mega-${learnerId}`);
  assert.ok(postMegaRaw, 'next submit succeeds and writes postMega');
  const retryUnlockEvents = (retrySubmit.events || []).filter((e) => e?.type === SPELLING_EVENT_TYPES.POST_MEGA_UNLOCKED);
  assert.equal(retryUnlockEvents.length, 1, 'retry emits the event cleanly');
});
