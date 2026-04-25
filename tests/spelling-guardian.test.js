import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUARDIAN_INTERVALS,
  GUARDIAN_MAX_REVIEW_LEVEL,
  GUARDIAN_MIN_ROUND_LENGTH,
  GUARDIAN_MAX_ROUND_LENGTH,
  GUARDIAN_DEFAULT_ROUND_LENGTH,
  SPELLING_MODES,
  SPELLING_SERVICE_STATE_VERSION,
  normaliseGuardianMap,
  normaliseGuardianRecord,
  normaliseMode,
} from '../src/subjects/spelling/service-contract.js';
import {
  SPELLING_EVENT_TYPES,
  createSpellingGuardianMissionCompletedEvent,
  createSpellingGuardianRecoveredEvent,
  createSpellingGuardianRenewedEvent,
  createSpellingGuardianWobbledEvent,
} from '../src/subjects/spelling/events.js';
import { normaliseServerSpellingData } from '../worker/src/subjects/spelling/engine.js';
import {
  advanceGuardianOnCorrect,
  advanceGuardianOnWrong,
  ensureGuardianRecord,
  isGuardianEligibleSlug,
  selectGuardianWords,
} from '../shared/spelling/service.js';
import { GUARDIAN_SECURE_STAGE } from '../src/subjects/spelling/service-contract.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { WORDS, WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';
import {
  buildSpellingLearnerReadModel,
  getSpellingPostMasteryState,
} from '../src/subjects/spelling/read-model.js';

const TODAY = 18_000;
const DAY_MS = 24 * 60 * 60 * 1000;

test('SPELLING_MODES includes guardian alongside existing modes', () => {
  assert.deepEqual(SPELLING_MODES, ['smart', 'trouble', 'test', 'single', 'guardian']);
  assert.equal(normaliseMode('guardian'), 'guardian');
  assert.equal(normaliseMode('unknown-mode'), 'smart');
  assert.equal(normaliseMode('smart'), 'smart');
});

test('SPELLING_SERVICE_STATE_VERSION is bumped to 2', () => {
  assert.equal(SPELLING_SERVICE_STATE_VERSION, 2);
});

test('GUARDIAN_INTERVALS are the planned schedule', () => {
  assert.deepEqual(GUARDIAN_INTERVALS, [3, 7, 14, 30, 60, 90]);
  assert.equal(GUARDIAN_MAX_REVIEW_LEVEL, 5);
  assert.equal(GUARDIAN_MIN_ROUND_LENGTH, 5);
  assert.equal(GUARDIAN_MAX_ROUND_LENGTH, 8);
  assert.equal(GUARDIAN_DEFAULT_ROUND_LENGTH, 8);
});

test('normaliseGuardianRecord returns a complete shape for a well-formed input', () => {
  const record = normaliseGuardianRecord({
    reviewLevel: 2,
    lastReviewedDay: 17_995,
    nextDueDay: 18_009,
    correctStreak: 3,
    lapses: 1,
    renewals: 0,
    wobbling: false,
  }, TODAY);
  assert.deepEqual(record, {
    reviewLevel: 2,
    lastReviewedDay: 17_995,
    nextDueDay: 18_009,
    correctStreak: 3,
    lapses: 1,
    renewals: 0,
    wobbling: false,
  });
});

test('normaliseGuardianRecord defaults missing fields safely', () => {
  const record = normaliseGuardianRecord({}, TODAY);
  assert.deepEqual(record, {
    reviewLevel: 0,
    lastReviewedDay: null,
    nextDueDay: TODAY,
    correctStreak: 0,
    lapses: 0,
    renewals: 0,
    wobbling: false,
  });
});

test('normaliseGuardianRecord clamps reviewLevel to [0, GUARDIAN_MAX_REVIEW_LEVEL]', () => {
  assert.equal(normaliseGuardianRecord({ reviewLevel: 99 }, TODAY).reviewLevel, GUARDIAN_MAX_REVIEW_LEVEL);
  assert.equal(normaliseGuardianRecord({ reviewLevel: -3 }, TODAY).reviewLevel, 0);
  assert.equal(normaliseGuardianRecord({ reviewLevel: 'nope' }, TODAY).reviewLevel, 0);
  assert.equal(normaliseGuardianRecord({ reviewLevel: 2.7 }, TODAY).reviewLevel, 2);
});

test('normaliseGuardianRecord coerces wobbling to boolean strictly', () => {
  assert.equal(normaliseGuardianRecord({ wobbling: true }, TODAY).wobbling, true);
  assert.equal(normaliseGuardianRecord({ wobbling: false }, TODAY).wobbling, false);
  assert.equal(normaliseGuardianRecord({ wobbling: 'yes' }, TODAY).wobbling, false);
  assert.equal(normaliseGuardianRecord({ wobbling: 1 }, TODAY).wobbling, false);
  assert.equal(normaliseGuardianRecord({}, TODAY).wobbling, false);
});

test('normaliseGuardianRecord handles null/garbage input by returning a default record', () => {
  assert.deepEqual(normaliseGuardianRecord(null, TODAY), {
    reviewLevel: 0,
    lastReviewedDay: null,
    nextDueDay: TODAY,
    correctStreak: 0,
    lapses: 0,
    renewals: 0,
    wobbling: false,
  });
  assert.equal(normaliseGuardianRecord('garbage', TODAY).reviewLevel, 0);
  assert.equal(normaliseGuardianRecord([], TODAY).reviewLevel, 0);
});

test('normaliseGuardianRecord preserves explicit lastReviewedDay === null', () => {
  const record = normaliseGuardianRecord({ lastReviewedDay: null }, TODAY);
  assert.equal(record.lastReviewedDay, null);
});

test('normaliseGuardianRecord rejects negative nextDueDay, falling back to today', () => {
  assert.equal(normaliseGuardianRecord({ nextDueDay: -5 }, TODAY).nextDueDay, TODAY);
  assert.equal(normaliseGuardianRecord({ nextDueDay: 'nope' }, TODAY).nextDueDay, TODAY);
});

test('normaliseGuardianRecord rejects non-integer streak/lapse/renewal counts', () => {
  const record = normaliseGuardianRecord({
    correctStreak: -1,
    lapses: 'abc',
    renewals: 1.5,
  }, TODAY);
  assert.equal(record.correctStreak, 0);
  assert.equal(record.lapses, 0);
  assert.equal(record.renewals, 0);
});

test('normaliseGuardianMap drops entries with empty slug, non-object value, or array value', () => {
  const map = normaliseGuardianMap({
    possess: { reviewLevel: 1, nextDueDay: TODAY },
    ['']: { reviewLevel: 3 },
    lose: null,
    believe: ['not', 'an', 'object'],
    accommodate: { reviewLevel: 'garbage' }, // valid object; normalises to defaults
  }, TODAY);
  assert.deepEqual(Object.keys(map).sort(), ['accommodate', 'possess']);
  assert.equal(map.accommodate.reviewLevel, 0); // clamped
  assert.equal(map.possess.reviewLevel, 1);
});

test('normaliseGuardianMap handles null/undefined input by returning {}', () => {
  assert.deepEqual(normaliseGuardianMap(null, TODAY), {});
  assert.deepEqual(normaliseGuardianMap(undefined, TODAY), {});
  assert.deepEqual(normaliseGuardianMap('garbage', TODAY), {});
  assert.deepEqual(normaliseGuardianMap([], TODAY), {});
});

test('Worker normaliseServerSpellingData back-fills guardian:{} for legacy records', () => {
  const legacy = {
    prefs: { mode: 'smart', yearFilter: 'core' },
    progress: { possess: { stage: 4, attempts: 6, correct: 5, wrong: 1, dueDay: 18_050, lastDay: 17_990, lastResult: true } },
  };
  const result = normaliseServerSpellingData(legacy, TODAY * DAY_MS);
  assert.deepEqual(result.guardian, {});
  assert.equal(result.prefs.mode, 'smart');
  assert.equal(result.progress.possess.stage, 4);
});

test('Worker normaliseServerSpellingData round-trips a guardian map', () => {
  const stored = {
    prefs: {},
    progress: {},
    guardian: {
      possess: { reviewLevel: 1, lastReviewedDay: 17_995, nextDueDay: 18_002, correctStreak: 1, lapses: 0, renewals: 0, wobbling: false },
    },
  };
  const result = normaliseServerSpellingData(stored, TODAY * DAY_MS);
  assert.equal(result.guardian.possess.reviewLevel, 1);
  assert.equal(result.guardian.possess.wobbling, false);
  assert.equal(result.guardian.possess.nextDueDay, 18_002);
});

test('Worker normaliseServerSpellingData falls back to today for malformed guardian entries', () => {
  const stored = {
    prefs: {},
    progress: {},
    guardian: {
      possess: 'this is not a record',
      lose: { reviewLevel: 99, wobbling: 'yes' },
    },
  };
  const result = normaliseServerSpellingData(stored, TODAY * DAY_MS);
  assert.ok(!('possess' in result.guardian), 'garbage value is dropped');
  assert.equal(result.guardian.lose.reviewLevel, GUARDIAN_MAX_REVIEW_LEVEL);
  assert.equal(result.guardian.lose.wobbling, false);
  assert.equal(result.guardian.lose.nextDueDay, TODAY);
});

test('Worker normaliseServerSpellingData defaults nowTs to Date.now() when not supplied', () => {
  const result = normaliseServerSpellingData({});
  // Current day is a stable integer; assert shape plus that nextDueDay was never consulted
  // (guardian is {} so there are no records to check). Just confirm it returns the expected keys.
  assert.deepEqual(Object.keys(result).sort(), ['guardian', 'prefs', 'progress']);
  assert.deepEqual(result.guardian, {});
});

// ----- U2: guardian domain event factories ------------------------------------

const GUARDIAN_SESSION = Object.freeze({
  id: 'session-guardian-1',
  mode: 'guardian',
  type: 'learning',
  uniqueWords: ['possess', 'accommodate', 'believe'],
});

test('SPELLING_EVENT_TYPES gains exactly four guardian event types with kebab-case values', () => {
  assert.equal(SPELLING_EVENT_TYPES.GUARDIAN_RENEWED, 'spelling.guardian.renewed');
  assert.equal(SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED, 'spelling.guardian.wobbled');
  assert.equal(SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED, 'spelling.guardian.recovered');
  assert.equal(SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED, 'spelling.guardian.mission-completed');
  const values = Object.values(SPELLING_EVENT_TYPES);
  assert.equal(values.length, 8, 'exactly 8 event types after U2');
  assert.equal(new Set(values).size, values.length, 'all event types unique');
});

test('createSpellingGuardianRenewedEvent returns a well-formed event', () => {
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    slug: 'possess',
    reviewLevel: 2,
    nextDueDay: 18_014,
    createdAt: 1_780_000_000_000,
  });
  assert.equal(event.type, SPELLING_EVENT_TYPES.GUARDIAN_RENEWED);
  assert.equal(event.subjectId, 'spelling');
  assert.equal(event.learnerId, 'learner-a');
  assert.equal(event.sessionId, 'session-guardian-1');
  assert.equal(event.mode, 'guardian');
  assert.equal(event.createdAt, 1_780_000_000_000);
  assert.equal(event.wordSlug, 'possess');
  assert.equal(event.word, 'possess');
  assert.equal(event.spellingPool, 'core');
  assert.equal(event.reviewLevel, 2);
  assert.equal(event.nextDueDay, 18_014);
});

test('createSpellingGuardianRenewedEvent returns null on missing/unknown slug', () => {
  assert.equal(createSpellingGuardianRenewedEvent({ learnerId: 'a', session: GUARDIAN_SESSION }), null);
  assert.equal(createSpellingGuardianRenewedEvent({ learnerId: 'a', session: GUARDIAN_SESSION, slug: '__unknown__' }), null);
});

test('createSpellingGuardianRenewedEvent falls back to Date.now() when createdAt is invalid', () => {
  const before = Date.now();
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'a',
    session: GUARDIAN_SESSION,
    slug: 'possess',
    reviewLevel: 0,
    createdAt: -1,
  });
  const after = Date.now();
  assert.ok(event.createdAt >= before && event.createdAt <= after);
});

test('createSpellingGuardianRenewedEvent clamps invalid reviewLevel / nextDueDay to safe defaults', () => {
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'a',
    session: GUARDIAN_SESSION,
    slug: 'possess',
    reviewLevel: 'garbage',
    nextDueDay: 'also-garbage',
    createdAt: 1,
  });
  assert.equal(event.reviewLevel, 0);
  assert.equal(event.nextDueDay, null);
});

test('createSpellingGuardianRenewedEvent produces a stable dedupe id for identical inputs', () => {
  const input = {
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    slug: 'possess',
    reviewLevel: 1,
    nextDueDay: 18_003,
    createdAt: 1_780_000_000_000,
  };
  assert.equal(createSpellingGuardianRenewedEvent(input).id, createSpellingGuardianRenewedEvent(input).id);
});

test('createSpellingGuardianWobbledEvent carries lapse count and word metadata', () => {
  const event = createSpellingGuardianWobbledEvent({
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    slug: 'accommodate',
    lapses: 2,
    createdAt: 1_780_000_001_000,
  });
  assert.equal(event.type, SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED);
  assert.equal(event.wordSlug, 'accommodate');
  assert.equal(event.lapses, 2);
});

test('createSpellingGuardianWobbledEvent returns null on missing slug', () => {
  assert.equal(createSpellingGuardianWobbledEvent({ learnerId: 'a', session: GUARDIAN_SESSION }), null);
  assert.equal(createSpellingGuardianWobbledEvent({ learnerId: 'a', session: GUARDIAN_SESSION, slug: 'not-a-word' }), null);
});

test('createSpellingGuardianRecoveredEvent carries renewals + unchanged reviewLevel', () => {
  const event = createSpellingGuardianRecoveredEvent({
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    slug: 'believe',
    renewals: 1,
    reviewLevel: 3,
    createdAt: 1_780_000_002_000,
  });
  assert.equal(event.type, SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED);
  assert.equal(event.wordSlug, 'believe');
  assert.equal(event.renewals, 1);
  assert.equal(event.reviewLevel, 3);
});

test('createSpellingGuardianRecoveredEvent returns null on missing slug', () => {
  assert.equal(createSpellingGuardianRecoveredEvent({ learnerId: 'a', session: GUARDIAN_SESSION }), null);
  assert.equal(createSpellingGuardianRecoveredEvent({ learnerId: 'a', session: GUARDIAN_SESSION, slug: 'unknown' }), null);
});

test('createSpellingGuardianMissionCompletedEvent carries session and mission counts', () => {
  const event = createSpellingGuardianMissionCompletedEvent({
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    renewalCount: 4,
    wobbledCount: 1,
    recoveredCount: 1,
    createdAt: 1_780_000_003_000,
  });
  assert.equal(event.type, SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED);
  assert.equal(event.sessionId, 'session-guardian-1');
  assert.equal(event.totalWords, 3);
  assert.equal(event.renewalCount, 4);
  assert.equal(event.wobbledCount, 1);
  assert.equal(event.recoveredCount, 1);
});

test('createSpellingGuardianMissionCompletedEvent returns null when session.id is missing', () => {
  assert.equal(createSpellingGuardianMissionCompletedEvent({ learnerId: 'a' }), null);
  assert.equal(createSpellingGuardianMissionCompletedEvent({ learnerId: 'a', session: { id: '' } }), null);
});

test('createSpellingGuardianMissionCompletedEvent rejects non-integer and negative counts to 0', () => {
  const event = createSpellingGuardianMissionCompletedEvent({
    learnerId: 'a',
    session: GUARDIAN_SESSION,
    renewalCount: -1,
    wobbledCount: 'nope',
    recoveredCount: 1.5,
  });
  assert.equal(event.renewalCount, 0);
  assert.equal(event.wobbledCount, 0);
  assert.equal(event.recoveredCount, 0);
});

test('all guardian event factories produce deterministic id collisions when inputs match', () => {
  const learnerId = 'learner-a';
  const createdAt = 1_780_000_000_000;
  const renewed1 = createSpellingGuardianRenewedEvent({ learnerId, session: GUARDIAN_SESSION, slug: 'possess', reviewLevel: 1, createdAt });
  const renewed2 = createSpellingGuardianRenewedEvent({ learnerId, session: GUARDIAN_SESSION, slug: 'possess', reviewLevel: 1, createdAt });
  const wobbled1 = createSpellingGuardianWobbledEvent({ learnerId, session: GUARDIAN_SESSION, slug: 'possess', lapses: 0, createdAt });
  const wobbled2 = createSpellingGuardianWobbledEvent({ learnerId, session: GUARDIAN_SESSION, slug: 'possess', lapses: 0, createdAt });
  assert.equal(renewed1.id, renewed2.id);
  assert.equal(wobbled1.id, wobbled2.id);
  assert.notEqual(renewed1.id, wobbled1.id, 'different event types produce different ids even for same slug');
});

// ----- U3: pure scheduler helpers ----------------------------------------------

test('advanceGuardianOnCorrect: fresh record bumps reviewLevel to 1 and schedules +3 days', () => {
  const record = normaliseGuardianRecord({}, TODAY);
  const next = advanceGuardianOnCorrect(record, TODAY);
  assert.equal(next.reviewLevel, 1);
  assert.equal(next.correctStreak, 1);
  assert.equal(next.lastReviewedDay, TODAY);
  assert.equal(next.nextDueDay, TODAY + 3);
  assert.equal(next.wobbling, false);
  // input must not mutate
  assert.equal(record.reviewLevel, 0);
  assert.equal(record.correctStreak, 0);
});

test('advanceGuardianOnCorrect at max reviewLevel stays capped at GUARDIAN_MAX_REVIEW_LEVEL with +90 days', () => {
  const record = normaliseGuardianRecord({ reviewLevel: GUARDIAN_MAX_REVIEW_LEVEL, correctStreak: 9 }, TODAY);
  const next = advanceGuardianOnCorrect(record, TODAY);
  assert.equal(next.reviewLevel, GUARDIAN_MAX_REVIEW_LEVEL);
  assert.equal(next.correctStreak, 10);
  assert.equal(next.nextDueDay, TODAY + 90);
});

test('advanceGuardianOnCorrect on a wobbling record clears wobbling, bumps renewals, preserves reviewLevel', () => {
  const record = normaliseGuardianRecord({
    reviewLevel: 2,
    lastReviewedDay: TODAY - 5,
    nextDueDay: TODAY - 1,
    correctStreak: 0,
    lapses: 2,
    renewals: 1,
    wobbling: true,
  }, TODAY);
  const next = advanceGuardianOnCorrect(record, TODAY);
  assert.equal(next.wobbling, false, 'wobbling cleared');
  assert.equal(next.reviewLevel, 2, 'reviewLevel unchanged on recovery');
  assert.equal(next.renewals, 2, 'renewals bumped');
  assert.equal(next.correctStreak, 1);
  assert.equal(next.lastReviewedDay, TODAY);
  // Schedule resumes using the preserved reviewLevel's interval. Anchor is
  // today (new lastReviewedDay), so nextDueDay = today + GUARDIAN_INTERVALS[2].
  assert.equal(next.nextDueDay, TODAY + GUARDIAN_INTERVALS[2]);
  // input untouched
  assert.equal(record.wobbling, true);
  assert.equal(record.renewals, 1);
});

test('advanceGuardianOnWrong sets wobbling, increments lapses, resets streak, schedules +1 day', () => {
  const record = normaliseGuardianRecord({
    reviewLevel: 3,
    lastReviewedDay: TODAY - 14,
    nextDueDay: TODAY,
    correctStreak: 4,
    lapses: 0,
    renewals: 0,
    wobbling: false,
  }, TODAY);
  const next = advanceGuardianOnWrong(record, TODAY);
  assert.equal(next.wobbling, true);
  assert.equal(next.lapses, 1);
  assert.equal(next.correctStreak, 0);
  assert.equal(next.lastReviewedDay, TODAY);
  assert.equal(next.nextDueDay, TODAY + 1);
  assert.equal(next.reviewLevel, 3, 'reviewLevel unchanged on wrong');
  // input untouched
  assert.equal(record.correctStreak, 4);
  assert.equal(record.wobbling, false);
});

test('advanceGuardianOnWrong applied twice stays wobbling with lapses=2 and nextDueDay=today+1', () => {
  let record = normaliseGuardianRecord({}, TODAY);
  record = advanceGuardianOnWrong(record, TODAY);
  record = advanceGuardianOnWrong(record, TODAY);
  assert.equal(record.wobbling, true);
  assert.equal(record.lapses, 2);
  assert.equal(record.correctStreak, 0);
  assert.equal(record.nextDueDay, TODAY + 1);
});

test('ensureGuardianRecord is idempotent — second call returns the same record instance', () => {
  const map = {};
  const first = ensureGuardianRecord(map, 'possess', TODAY);
  assert.equal(first.reviewLevel, 0);
  assert.equal(first.nextDueDay, TODAY);
  const second = ensureGuardianRecord(map, 'possess', TODAY);
  assert.equal(second, first, 'identical object returned on second call');
  // Map key was created exactly once
  assert.deepEqual(Object.keys(map), ['possess']);
});

test('selectGuardianWords prioritises wobbling-due, then non-wobbling due, then lazy-create', () => {
  // Build a guardian map with 2 wobbling-due, 3 non-wobbling-due, 1 non-due guardian.
  const guardianMap = {
    accommodate: { reviewLevel: 1, lastReviewedDay: TODAY - 2, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
    address: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 3, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
    believe: { reviewLevel: 2, lastReviewedDay: TODAY - 14, nextDueDay: TODAY - 1, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
    bicycle: { reviewLevel: 1, lastReviewedDay: TODAY - 3, nextDueDay: TODAY, correctStreak: 1, lapses: 0, renewals: 0, wobbling: false },
    breath: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY, correctStreak: 0, lapses: 0, renewals: 0, wobbling: false },
    // non-due — top-up only kicks in when selection is below GUARDIAN_MIN_ROUND_LENGTH (5).
    build: { reviewLevel: 3, lastReviewedDay: TODAY - 1, nextDueDay: TODAY + 30, correctStreak: 3, lapses: 0, renewals: 0, wobbling: false },
  };
  // U2: every slug in guardianMap must also have a Mega progress record for
  // `isGuardianEligibleSlug` to clear it. Lazy-create candidates remain
  // slugs NOT in guardianMap with their own Mega stage.
  const progressMap = {
    accommodate: { stage: 4, attempts: 8, correct: 7, wrong: 1 },
    address: { stage: 4, attempts: 8, correct: 7, wrong: 1 },
    believe: { stage: 4, attempts: 8, correct: 7, wrong: 1 },
    bicycle: { stage: 4, attempts: 8, correct: 7, wrong: 1 },
    breath: { stage: 4, attempts: 8, correct: 7, wrong: 1 },
    build: { stage: 4, attempts: 8, correct: 7, wrong: 1 },
    possess: { stage: 4, attempts: 8, correct: 7, wrong: 1 },
    busy: { stage: 4, attempts: 8, correct: 7, wrong: 1 },
    // stage < 4 - not a lazy candidate
    circle: { stage: 2, attempts: 4, correct: 2, wrong: 2 },
  };

  const selected = selectGuardianWords({
    guardianMap,
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    todayDay: TODAY,
    length: 8,
    random: () => 0.5,
  });

  // Wobbling due first (oldest-due, alphabetical tie-break within same dueDay).
  assert.equal(selected[0], 'address', 'oldest wobbling-due first');
  assert.equal(selected[1], 'accommodate');
  // Non-wobbling due next, oldest-due first. believe dueDay=TODAY-1; bicycle/breath dueDay=TODAY (alphabetical).
  assert.equal(selected[2], 'believe');
  assert.equal(selected[3], 'bicycle');
  assert.equal(selected[4], 'breath');
  // Then lazy-create sample - 'busy' and 'possess' (both mega and not in guardianMap).
  // rng=0.5 fisher-yates on ['busy','possess']: i=1, j=floor(0.5*2)=1 → no swap → ['busy','possess']
  assert.equal(selected[5], 'busy');
  assert.equal(selected[6], 'possess');
  // Total length is 7 — above GUARDIAN_MIN_ROUND_LENGTH, so top-up stays off and
  // the non-due 'build' is NOT pulled in.
  assert.equal(selected.length, 7);
  assert.equal(selected.includes('build'), false, 'non-due guardian not top-upped above min length');
});

test('selectGuardianWords tops up with non-due guardians only when below GUARDIAN_MIN_ROUND_LENGTH', () => {
  // Only 2 due guardians → below min length 5 after due+lazy picks. Top-up
  // activates and drains from the non-due guardian pool (oldest lastReviewedDay
  // first).
  const guardianMap = {
    address: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 3, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
    believe: { reviewLevel: 2, lastReviewedDay: TODAY - 14, nextDueDay: TODAY - 1, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
    // non-due guardians for top-up, varying lastReviewedDay
    bicycle: { reviewLevel: 3, lastReviewedDay: TODAY - 20, nextDueDay: TODAY + 30, correctStreak: 3, lapses: 0, renewals: 0, wobbling: false },
    breath: { reviewLevel: 3, lastReviewedDay: TODAY - 5, nextDueDay: TODAY + 30, correctStreak: 3, lapses: 0, renewals: 0, wobbling: false },
    build: { reviewLevel: 3, lastReviewedDay: TODAY - 50, nextDueDay: TODAY + 30, correctStreak: 3, lapses: 0, renewals: 0, wobbling: false },
  };
  const selected = selectGuardianWords({
    guardianMap,
    // U2: every slug in guardianMap needs a Mega progress record to clear
    // the orphan sanitiser. Lazy-create pool stays empty — no extra slugs.
    progressMap: {
      address: { stage: 4 },
      believe: { stage: 4 },
      bicycle: { stage: 4 },
      breath: { stage: 4 },
      build: { stage: 4 },
    },
    wordBySlug: WORD_BY_SLUG,
    todayDay: TODAY,
    length: 5,
    random: () => 0.5,
  });
  // Order: due wobbling, due non-wobbling, then non-due by oldest lastReviewedDay.
  // build (-50) < bicycle (-20) < breath (-5).
  assert.deepEqual(selected, ['address', 'believe', 'build', 'bicycle', 'breath']);
});

test('selectGuardianWords with length=5 clamps at 5 and prefers wobbling-due', () => {
  const guardianMap = {
    accommodate: { reviewLevel: 1, lastReviewedDay: TODAY - 2, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
    address: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 3, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
    believe: { reviewLevel: 2, lastReviewedDay: TODAY - 14, nextDueDay: TODAY - 1, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
    bicycle: { reviewLevel: 1, lastReviewedDay: TODAY - 3, nextDueDay: TODAY, correctStreak: 1, lapses: 0, renewals: 0, wobbling: false },
    breath: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY, correctStreak: 0, lapses: 0, renewals: 0, wobbling: false },
  };
  const selected = selectGuardianWords({
    guardianMap,
    // U2: every slug in guardianMap must also be Mega in progress.
    progressMap: {
      accommodate: { stage: 4 },
      address: { stage: 4 },
      believe: { stage: 4 },
      bicycle: { stage: 4 },
      breath: { stage: 4 },
    },
    wordBySlug: WORD_BY_SLUG,
    todayDay: TODAY,
    length: 5,
  });
  assert.equal(selected.length, 5);
  assert.deepEqual(selected, ['address', 'accommodate', 'believe', 'bicycle', 'breath']);
});

test('selectGuardianWords with empty input returns an empty array', () => {
  const selected = selectGuardianWords({
    guardianMap: {},
    progressMap: {},
    wordBySlug: WORD_BY_SLUG,
    todayDay: TODAY,
  });
  assert.deepEqual(selected, []);
});

test('selectGuardianWords clamps length above 8 back to GUARDIAN_MAX_ROUND_LENGTH', () => {
  const guardianMap = {};
  const progressMap = {};
  for (let i = 0; i < 20; i += 1) {
    const slug = WORDS.filter((w) => w.spellingPool !== 'extra')[i].slug;
    progressMap[slug] = { stage: 4, attempts: 8, correct: 7, wrong: 1 };
  }
  const selected = selectGuardianWords({
    guardianMap,
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    todayDay: TODAY,
    length: 50,
    random: () => 0.5,
  });
  assert.equal(selected.length, GUARDIAN_MAX_ROUND_LENGTH);
});

// ----- U3: session wiring via the real service ---------------------------------

const DAY_MS_TS = 24 * 60 * 60 * 1000;

function makeServiceWithSeed({ now, random, storage = installMemoryStorage() } = {}) {
  const repositories = createLocalPlatformRepositories({ storage });
  const spoken = [];
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random,
    tts: {
      speak(payload) {
        spoken.push(payload);
      },
      stop() {},
      warmup() {},
    },
  });
  return { storage, repositories, service, spoken };
}

function seedAllCoreMega(repositories, learnerId, todayDay) {
  const progress = Object.fromEntries(
    WORDS.filter((word) => word.spellingPool !== 'extra').map((word, index) => [word.slug, {
      stage: 4,
      attempts: 6 + (index % 4),
      correct: 5 + (index % 4),
      wrong: 1,
      dueDay: todayDay + 60,
      lastDay: todayDay - 7,
      lastResult: 'correct',
    }]),
  );
  repositories.subjectStates.writeData(learnerId, 'spelling', { progress });
}

function seedGuardianMap(repositories, learnerId, map) {
  const current = repositories.subjectStates.read(learnerId, 'spelling').data || {};
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    ...current,
    guardian: map,
  });
}

function runGuardianRoundUntilSummary(service, learnerId, state, getAnswerForSlug) {
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

test('startSession({mode: guardian}) returns ok:false with warn feedback when allWordsMega is false', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const { service } = makeServiceWithSeed({ now, random: () => 0.5 });
  const transition = service.startSession('learner-a', { mode: 'guardian' });
  assert.equal(transition.ok, false);
  assert.equal(transition.state.phase, 'dashboard');
  assert.equal(transition.state.session, null);
  assert.equal(transition.state.feedback?.kind, 'warn');
  assert.match(transition.state.feedback.headline, /Guardian Mission unlocks/);
});

test('startSession({mode: guardian}) with allWordsMega starts a guardian session of length 5..8', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);
  const transition = service.startSession('learner-a', { mode: 'guardian' });
  assert.equal(transition.ok, true);
  assert.equal(transition.state.phase, 'session');
  assert.equal(transition.state.session.mode, 'guardian');
  assert.equal(transition.state.session.type, 'learning');
  assert.equal(transition.state.session.label, 'Guardian Mission');
  assert.ok(transition.state.session.uniqueWords.length >= GUARDIAN_MIN_ROUND_LENGTH);
  assert.ok(transition.state.session.uniqueWords.length <= GUARDIAN_MAX_ROUND_LENGTH);
  // All picked slugs must be core
  const pickedWords = transition.state.session.uniqueWords.map((slug) => WORD_BY_SLUG[slug]);
  assert.ok(pickedWords.every((w) => w.spellingPool !== 'extra'));
});

test('Full guardian round with all-correct answers emits N RENEWED + SESSION_COMPLETED + MISSION_COMPLETED', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const initialSlugs = started.state.session.uniqueWords.slice();
  const totalWords = initialSlugs.length;

  const { state: summaryState, events, seenSlugs } = runGuardianRoundUntilSummary(
    service,
    'learner-a',
    started.state,
    (slug, state) => state.session.currentCard.word.word,
  );

  assert.equal(summaryState.phase, 'summary');
  const renewed = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_RENEWED);
  const wobbled = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED);
  const recovered = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED);
  const sessionCompleted = events.filter((e) => e.type === SPELLING_EVENT_TYPES.SESSION_COMPLETED);
  const missionCompleted = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED);

  assert.equal(renewed.length, totalWords, `one RENEWED per word (got ${renewed.length} for ${totalWords} words)`);
  assert.equal(wobbled.length, 0);
  assert.equal(recovered.length, 0);
  assert.equal(sessionCompleted.length, 1);
  assert.equal(missionCompleted.length, 1);

  // MISSION_COMPLETED count fields match
  const mission = missionCompleted[0];
  assert.equal(mission.renewalCount, totalWords);
  assert.equal(mission.wobbledCount, 0);
  assert.equal(mission.recoveredCount, 0);
  assert.equal(mission.totalWords, totalWords);

  // Emission order: RENEWED events before SESSION_COMPLETED before MISSION_COMPLETED
  const sessionCompletedIndex = events.findIndex((e) => e.type === SPELLING_EVENT_TYPES.SESSION_COMPLETED);
  const missionCompletedIndex = events.findIndex((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED);
  const lastRenewedIndex = events.map((e) => e.type).lastIndexOf(SPELLING_EVENT_TYPES.GUARDIAN_RENEWED);
  assert.ok(lastRenewedIndex < sessionCompletedIndex, 'all RENEWED events emitted before SESSION_COMPLETED');
  assert.ok(sessionCompletedIndex < missionCompletedIndex, 'SESSION_COMPLETED before MISSION_COMPLETED');

  // progress.stage untouched for every Guardian word.
  const snapshot = service.getAnalyticsSnapshot('learner-a');
  const rowsBySlug = new Map(snapshot.wordGroups.flatMap((g) => g.words).map((row) => [row.slug, row]));
  for (const slug of seenSlugs) {
    const row = rowsBySlug.get(slug);
    assert.equal(row.progress.stage, 4, `${slug} stage stays at 4`);
  }
  // progress.correct advanced by exactly 1 for each seen slug.
  // (seed had correct = 5 + (index % 4) so exact values differ per slug; just assert the delta is 1)
  for (const slug of seenSlugs) {
    const row = rowsBySlug.get(slug);
    const originalWord = WORDS.find((w) => w.slug === slug);
    const originalIndex = WORDS.filter((w) => w.spellingPool !== 'extra').indexOf(originalWord);
    const expectedCorrect = (5 + (originalIndex % 4)) + 1;
    assert.equal(row.progress.correct, expectedCorrect, `${slug} progress.correct bumped once`);
  }
});

test('Guardian round with a pre-wobbling word emits GUARDIAN_RECOVERED on correct, not RENEWED', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const storage = installMemoryStorage();
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5, storage });
  seedAllCoreMega(repositories, 'learner-a', today);

  // Seed a wobbling guardian record for 'possess' so it gets picked first.
  // With wobbling=true + nextDueDay<=today it wins the wobbling-due bucket.
  seedGuardianMap(repositories, 'learner-a', {
    possess: {
      reviewLevel: 2,
      lastReviewedDay: today - 5,
      nextDueDay: today - 1,
      correctStreak: 0,
      lapses: 1,
      renewals: 0,
      wobbling: true,
    },
  });

  const started = service.startSession('learner-a', { mode: 'guardian' });
  assert.equal(started.ok, true);
  // possess should appear first in the queue (wobbling-due).
  assert.equal(started.state.session.uniqueWords[0], 'possess');
  assert.equal(started.state.session.currentCard.slug, 'possess');

  // Answer possess correctly.
  const submitted = service.submitAnswer('learner-a', started.state, 'possess');
  const recoveredEvents = submitted.events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED);
  const renewedEvents = submitted.events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_RENEWED);
  assert.equal(recoveredEvents.length, 1, 'RECOVERED emitted for wobbling->correct');
  assert.equal(renewedEvents.length, 0, 'no RENEWED emitted on recovery');
  assert.equal(recoveredEvents[0].wordSlug, 'possess');
  assert.equal(recoveredEvents[0].reviewLevel, 2, 'reviewLevel preserved on recovery');
  assert.equal(recoveredEvents[0].renewals, 1);
});

test('Guardian round with a mix of correct and wrong emits correct RENEWED + WOBBLED counts', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const totalWords = started.state.session.uniqueWords.length;

  // Answer the first two wrong, the rest correct.
  let cardCount = 0;
  const { state: summaryState, events } = runGuardianRoundUntilSummary(
    service,
    'learner-a',
    started.state,
    (slug, state) => {
      cardCount += 1;
      if (cardCount <= 2) return 'definitely-wrong';
      return state.session.currentCard.word.word;
    },
  );

  assert.equal(summaryState.phase, 'summary');
  const renewed = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_RENEWED);
  const wobbled = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED);
  const recovered = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED);
  const mission = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED);

  assert.equal(wobbled.length, 2, 'two wrong answers emit two WOBBLED events');
  assert.equal(renewed.length, totalWords - 2);
  assert.equal(recovered.length, 0);
  assert.equal(mission.length, 1);
  assert.equal(mission[0].renewalCount, totalWords - 2);
  assert.equal(mission[0].wobbledCount, 2);
  assert.equal(mission[0].recoveredCount, 0);
  assert.equal(mission[0].totalWords, totalWords);
});

test('Guardian round does not mutate progress.stage/dueDay/lastDay/lastResult even on wrong answers', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const initialSlugs = started.state.session.uniqueWords.slice();

  // Answer everything wrong.
  runGuardianRoundUntilSummary(service, 'learner-a', started.state, () => 'definitely-wrong');

  const snapshot = service.getAnalyticsSnapshot('learner-a');
  const rowsBySlug = new Map(snapshot.wordGroups.flatMap((g) => g.words).map((row) => [row.slug, row]));
  for (const slug of initialSlugs) {
    const row = rowsBySlug.get(slug);
    assert.equal(row.progress.stage, 4, `${slug} stage unchanged after Guardian wrong`);
    assert.equal(row.progress.dueDay, today + 60, `${slug} dueDay unchanged`);
    assert.equal(row.progress.lastDay, today - 7, `${slug} lastDay unchanged`);
    assert.equal(row.progress.lastResult, 'correct', `${slug} lastResult unchanged`);
    // progress.attempts bumped and progress.wrong bumped by 1
    assert.equal(row.progress.wrong, 2, `${slug} progress.wrong bumped`);
  }
});

// ----- U3 review follow-up: CORR-1 regression + ADV-1 top-up priority ---------

test('Guardian feedback body shows the correct number of days until the next check (CORR-1 regression)', () => {
  // After a correct answer on a fresh record (reviewLevel 0->1), the schedule
  // sets nextDueDay = today + GUARDIAN_INTERVALS[0] = today + 3. The feedback
  // body must read "3 days", not "7" (the old bug indexed with updatedRecord.reviewLevel).
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.2 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const firstSlug = started.state.session.currentCard.slug;
  const word = WORD_BY_SLUG[firstSlug];
  const submitted = service.submitAnswer('learner-a', started.state, word.word);

  assert.equal(submitted.state.feedback.kind, 'info');
  assert.match(submitted.state.feedback.body, /Next Guardian check in 3 days\b/);
});

test('Guardian feedback body matches days-until-due for a recovered word (CORR-1 regression)', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);
  // Seed a wobbling record at reviewLevel=2 so the recovery schedule uses
  // GUARDIAN_INTERVALS[2] = 14 days.
  seedGuardianMap(repositories, 'learner-a', {
    possess: {
      reviewLevel: 2,
      lastReviewedDay: today - 5,
      nextDueDay: today - 1,
      correctStreak: 0,
      lapses: 1,
      renewals: 0,
      wobbling: true,
    },
  });

  const started = service.startSession('learner-a', { mode: 'guardian' });
  assert.equal(started.state.session.currentCard.slug, 'possess');
  const submitted = service.submitAnswer('learner-a', started.state, 'possess');

  assert.equal(submitted.state.feedback.headline, 'Recovered.');
  assert.match(submitted.state.feedback.body, /Next Guardian check in 14 days\b/);
});

test('selectGuardianWords top-up prefers wobbling non-due over non-wobbling non-due (ADV-1 regression)', () => {
  const guardianMap = {
    // Two non-due guardians: one wobbling (W), one stable (S). W should surface
    // first during top-up even though both have nextDueDay > today, because
    // wobbling status must not be demoted by the scheduler pushing nextDueDay
    // one day forward after a miss.
    believe: {
      reviewLevel: 1,
      lastReviewedDay: TODAY - 30, // older last review
      nextDueDay: TODAY + 5,        // not due yet
      correctStreak: 1,
      lapses: 0,
      renewals: 0,
      wobbling: false,
    },
    possess: {
      reviewLevel: 0,
      lastReviewedDay: TODAY - 1,
      nextDueDay: TODAY + 1,        // not due yet (wobbling set to +1 after miss)
      correctStreak: 0,
      lapses: 1,
      renewals: 0,
      wobbling: true,
    },
  };
  const progressMap = {
    believe: { stage: 4, attempts: 6, correct: 5, wrong: 1 },
    possess: { stage: 4, attempts: 6, correct: 5, wrong: 1 },
  };
  const selected = selectGuardianWords({
    guardianMap,
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    todayDay: TODAY,
    length: 2,
    random: () => 0.5,
  });
  // length=2 is below GUARDIAN_MIN_ROUND_LENGTH=5 after due is empty and no
  // lazy candidates — top-up fills both slots; wobbling must land first.
  assert.deepEqual(selected, ['possess', 'believe']);
});

// ----- U4: post-mastery read-model selector -----------------------------------

/*
 * U4 tests work over synthesised runtime snapshots so we can hit the exact
 * plan numbers (170 core, 80 extra) without depending on the real statutory
 * list. Each test builds its own snapshot + subjectStateRecord, passes them
 * into the selector directly, and spot-checks the derived fields.
 */

function makeCoreWord(index) {
  return {
    slug: `core-${String(index).padStart(3, '0')}`,
    word: `core-${index}`,
    family: `family-${index % 12}`,
    year: index % 2 === 0 ? '3-4' : '5-6',
    yearLabel: index % 2 === 0 ? 'Years 3-4' : 'Years 5-6',
    spellingPool: 'core',
    accepted: [`core-${index}`],
    sentence: `Sentence for core word ${index}.`,
  };
}

function makeExtraWord(index) {
  return {
    slug: `extra-${String(index).padStart(3, '0')}`,
    word: `extra-${index}`,
    family: `family-extra-${index % 4}`,
    year: 'extra',
    yearLabel: 'Extra',
    spellingPool: 'extra',
    accepted: [`extra-${index}`],
    sentence: `Sentence for extra word ${index}.`,
  };
}

function makeRuntimeSnapshot({ coreCount = 170, extraCount = 0 } = {}) {
  const coreWords = Array.from({ length: coreCount }, (_, i) => makeCoreWord(i + 1));
  const extraWords = Array.from({ length: extraCount }, (_, i) => makeExtraWord(i + 1));
  const words = [...coreWords, ...extraWords];
  const wordBySlug = Object.fromEntries(words.map((word) => [word.slug, word]));
  return { words, wordBySlug, coreWords, extraWords };
}

function secureProgressEntries(words) {
  return Object.fromEntries(
    words.map((word) => [word.slug, {
      stage: 4,
      attempts: 6,
      correct: 5,
      wrong: 1,
      dueDay: TODAY + 60,
      lastDay: TODAY - 7,
      lastResult: true,
    }]),
  );
}

function makeSubjectStateRecord({ progress = {}, guardian = {}, prefs = {} } = {}) {
  return {
    data: {
      prefs,
      progress,
      guardian,
    },
  };
}

const U4_NOW_MS = TODAY * DAY_MS;

test('U4 happy path: 170 secure core words + 170 published core words => allWordsMega true', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.allWordsMega, true);
});

test('U4 edge: 169/170 secure core words => allWordsMega false', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  // Secure all but the last core word.
  const secureSubset = runtimeSnapshot.coreWords.slice(0, 169);
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(secureSubset),
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.allWordsMega, false);
});

test('U4 edge: 170/170 core secure + 50/80 extra secure => allWordsMega true (extra excluded)', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170, extraCount: 80 });
  const progress = {
    ...secureProgressEntries(runtimeSnapshot.coreWords),
    ...secureProgressEntries(runtimeSnapshot.extraWords.slice(0, 50)),
  };
  const subjectStateRecord = makeSubjectStateRecord({ progress });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.allWordsMega, true, 'extra pool does not block or inflate the comparison');
});

test('U4 edge: guardianDueCount === 0 when data.guardian is empty', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    guardian: {},
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.guardianDueCount, 0);
  assert.equal(state.wobblingCount, 0);
});

test('U4 edge: nextGuardianDueDay is null when guardian map is empty; otherwise min(nextDueDay)', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  const emptyRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    guardian: {},
  });
  assert.equal(
    getSpellingPostMasteryState({ subjectStateRecord: emptyRecord, runtimeSnapshot, now: U4_NOW_MS }).nextGuardianDueDay,
    null,
  );

  const seededRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    guardian: {
      [runtimeSnapshot.coreWords[0].slug]: {
        reviewLevel: 2,
        lastReviewedDay: TODAY - 5,
        nextDueDay: TODAY + 14,
        correctStreak: 2,
        lapses: 0,
        renewals: 0,
        wobbling: false,
      },
      [runtimeSnapshot.coreWords[1].slug]: {
        reviewLevel: 0,
        lastReviewedDay: null,
        nextDueDay: TODAY + 3, // min
        correctStreak: 0,
        lapses: 0,
        renewals: 0,
        wobbling: false,
      },
      [runtimeSnapshot.coreWords[2].slug]: {
        reviewLevel: 1,
        lastReviewedDay: TODAY - 2,
        nextDueDay: TODAY + 7,
        correctStreak: 1,
        lapses: 0,
        renewals: 0,
        wobbling: false,
      },
    },
  });
  assert.equal(
    getSpellingPostMasteryState({ subjectStateRecord: seededRecord, runtimeSnapshot, now: U4_NOW_MS }).nextGuardianDueDay,
    TODAY + 3,
  );
});

test('U4 edge: guardianDueCount + wobblingCount track todayDay correctly', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  const [w0, w1, w2, w3] = runtimeSnapshot.coreWords;
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    guardian: {
      [w0.slug]: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
      [w1.slug]: { reviewLevel: 2, lastReviewedDay: TODAY - 2, nextDueDay: TODAY, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
      [w2.slug]: { reviewLevel: 3, lastReviewedDay: TODAY - 1, nextDueDay: TODAY + 30, correctStreak: 3, lapses: 0, renewals: 0, wobbling: false },
      [w3.slug]: { reviewLevel: 1, lastReviewedDay: TODAY - 4, nextDueDay: TODAY + 1, correctStreak: 0, lapses: 2, renewals: 0, wobbling: true },
    },
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.guardianDueCount, 2, 'two records have nextDueDay <= today');
  assert.equal(state.wobblingCount, 2, 'two records are wobbling regardless of due-state');
});

test('U4 edge: recommendedWords.length === 0 when allWordsMega === false', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  // Secure only 10 core words — far short of 170 → allWordsMega false.
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords.slice(0, 10)),
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.allWordsMega, false);
  assert.deepEqual(state.recommendedWords, []);
});

test('U4 edge: recommendedWords is a deterministic preview when allWordsMega === true', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  // Seed guardian records so the selector has due entries to drain first; the
  // preview length should be min(8, available).
  const [w0, w1, w2] = runtimeSnapshot.coreWords;
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    guardian: {
      [w0.slug]: { reviewLevel: 1, lastReviewedDay: TODAY - 2, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
      [w1.slug]: { reviewLevel: 2, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 1, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
      [w2.slug]: { reviewLevel: 0, lastReviewedDay: TODAY - 1, nextDueDay: TODAY, correctStreak: 1, lapses: 0, renewals: 0, wobbling: false },
    },
  });
  const a = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  const b = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.ok(a.recommendedWords.length > 0, 'preview non-empty when learner has graduated + has due guardians');
  assert.ok(a.recommendedWords.length <= GUARDIAN_MAX_ROUND_LENGTH, 'preview bounded by max round length');
  assert.deepEqual(a.recommendedWords, b.recommendedWords, 'deterministic across calls');
  // Preview surfaces the due wobbling word first, then due non-wobbling.
  assert.equal(a.recommendedWords[0], w0.slug, 'wobbling due first');
});

test('U4 edge: postMastery always present on buildSpellingLearnerReadModel output — never undefined', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  const emptyRecord = makeSubjectStateRecord({});
  const output = buildSpellingLearnerReadModel({
    subjectStateRecord: emptyRecord,
    runtimeSnapshot,
    now: U4_NOW_MS,
  });
  assert.ok(output.postMastery, 'postMastery present even with zero secure words');
  assert.equal(output.postMastery.allWordsMega, false);
  assert.equal(output.postMastery.guardianDueCount, 0);
  assert.equal(output.postMastery.wobblingCount, 0);
  assert.deepEqual(output.postMastery.recommendedWords, []);
  assert.equal(output.postMastery.nextGuardianDueDay, null);
});

test('U4 integration: recommendedMode is "guardian" when allWordsMega && guardianDueCount > 0', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  const [w0] = runtimeSnapshot.coreWords;
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    guardian: {
      [w0.slug]: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
    },
  });
  const output = buildSpellingLearnerReadModel({
    subjectStateRecord,
    runtimeSnapshot,
    now: U4_NOW_MS,
  });
  assert.equal(output.postMastery.allWordsMega, true);
  assert.equal(output.postMastery.guardianDueCount, 1);
  assert.equal(output.postMastery.recommendedMode, 'guardian');
});

test('U4 integration: recommendedMode inherits currentFocus.recommendedMode when not (allWordsMega && due)', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  // Case A: not graduated — inherits the non-graduated currentFocus default ('smart').
  const belowMegaRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords.slice(0, 10)),
  });
  const belowMega = buildSpellingLearnerReadModel({
    subjectStateRecord: belowMegaRecord,
    runtimeSnapshot,
    now: U4_NOW_MS,
  });
  assert.equal(belowMega.postMastery.allWordsMega, false);
  assert.equal(belowMega.postMastery.recommendedMode, belowMega.currentFocus.recommendedMode);

  // Case B: graduated but no Guardian duties due — should NOT promote to 'guardian';
  // should inherit currentFocus.recommendedMode instead.
  const graduatedNoDueRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    guardian: {
      [runtimeSnapshot.coreWords[0].slug]: {
        reviewLevel: 3,
        lastReviewedDay: TODAY - 1,
        nextDueDay: TODAY + 30,
        correctStreak: 3,
        lapses: 0,
        renewals: 0,
        wobbling: false,
      },
    },
  });
  const graduatedNoDue = buildSpellingLearnerReadModel({
    subjectStateRecord: graduatedNoDueRecord,
    runtimeSnapshot,
    now: U4_NOW_MS,
  });
  assert.equal(graduatedNoDue.postMastery.allWordsMega, true);
  assert.equal(graduatedNoDue.postMastery.guardianDueCount, 0);
  assert.equal(graduatedNoDue.postMastery.recommendedMode, graduatedNoDue.currentFocus.recommendedMode);
});

test('U4 integration: buildSpellingLearnerReadModel.postMastery matches getSpellingPostMasteryState directly', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  const [w0, w1] = runtimeSnapshot.coreWords;
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    guardian: {
      [w0.slug]: { reviewLevel: 1, lastReviewedDay: TODAY - 2, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
      [w1.slug]: { reviewLevel: 2, lastReviewedDay: TODAY - 3, nextDueDay: TODAY + 14, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
    },
  });
  const direct = getSpellingPostMasteryState({
    subjectStateRecord,
    runtimeSnapshot,
    now: U4_NOW_MS,
  });
  const viaReadModel = buildSpellingLearnerReadModel({
    subjectStateRecord,
    runtimeSnapshot,
    now: U4_NOW_MS,
  }).postMastery;
  // recommendedMode is layered on top of the direct selector output; assert
  // the 5 underlying fields match exactly.
  assert.equal(viaReadModel.allWordsMega, direct.allWordsMega);
  assert.equal(viaReadModel.guardianDueCount, direct.guardianDueCount);
  assert.equal(viaReadModel.wobblingCount, direct.wobblingCount);
  assert.deepEqual(viaReadModel.recommendedWords, direct.recommendedWords);
  assert.equal(viaReadModel.nextGuardianDueDay, direct.nextGuardianDueDay);
});

test('U4 integration: existing legacy fields of buildSpellingLearnerReadModel output are unchanged', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 170 });
  // A partially secured learner so strengths / weaknesses / currentFocus
  // have real content to spot-check.
  const secureSubset = runtimeSnapshot.coreWords.slice(0, 40);
  const dueSubset = runtimeSnapshot.coreWords.slice(40, 60);
  const progress = {
    ...secureProgressEntries(secureSubset),
    ...Object.fromEntries(dueSubset.map((word, i) => [word.slug, {
      stage: 2,
      attempts: 5,
      correct: 3,
      wrong: 2,
      dueDay: TODAY - 1, // due today
      lastDay: TODAY - 2,
      lastResult: i % 2 === 0,
    }])),
  };
  const subjectStateRecord = makeSubjectStateRecord({ progress });
  const output = buildSpellingLearnerReadModel({
    subjectStateRecord,
    runtimeSnapshot,
    now: U4_NOW_MS,
  });

  // progressSnapshot — canonical legacy shape
  assert.equal(output.progressSnapshot.subjectId, 'spelling');
  assert.equal(output.progressSnapshot.totalPublishedWords, 170);
  assert.equal(output.progressSnapshot.trackedWords, 60);
  assert.equal(output.progressSnapshot.secureWords, 40);
  assert.equal(output.progressSnapshot.dueWords, 20);

  // overview is a sibling snapshot — must still be present and non-null.
  assert.equal(output.overview.trackedWords, 60);
  assert.equal(output.overview.secureWords, 40);

  // strengths / weaknesses arrays still populated when there is relevant data.
  assert.ok(Array.isArray(output.strengths));
  assert.ok(Array.isArray(output.weaknesses));
  assert.ok(output.strengths.length > 0, 'strengths populated from secure rows');
  assert.ok(output.weaknesses.length > 0, 'weaknesses populated from due rows');

  // currentFocus preserved with the legacy recommendation shape.
  assert.equal(output.currentFocus.subjectId, 'spelling');
  assert.equal(typeof output.currentFocus.recommendedMode, 'string');
  assert.equal(typeof output.currentFocus.label, 'string');
});

// ----- U5: action routing + Alt+4 shortcut gate -------------------------------

/*
 * U5 tests rely on the full app harness to exercise the module's
 * `spelling-shortcut-start` handler. Unlike the pure U3 scheduler tests,
 * these assertions round-trip through the harness dispatcher → subject
 * module → spelling service, so a regression in the `mode === 'guardian'`
 * gate will surface as an unwanted state mutation rather than a unit
 * assertion.
 */
async function importAppHarness() {
  const mod = await import('./helpers/app-harness.js');
  return mod.createAppHarness;
}

test('U5 action routing: spelling-shortcut-start with mode=guardian is a no-op when allWordsMega is false', async () => {
  const createAppHarness = await importAppHarness();
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  const stateBefore = structuredClone(harness.store.getState().subjectUi.spelling);
  const prefsBefore = structuredClone(harness.services.spelling.getPrefs(learnerId));
  assert.equal(prefsBefore.mode, 'smart');
  assert.equal(stateBefore.phase, 'dashboard');

  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  const stateAfter = harness.store.getState().subjectUi.spelling;
  const prefsAfter = harness.services.spelling.getPrefs(learnerId);
  // No session started, no mode mutation, no phase transition.
  assert.equal(stateAfter.phase, 'dashboard', 'phase must stay on dashboard');
  assert.equal(stateAfter.session, null, 'no session should be created');
  assert.equal(prefsAfter.mode, 'smart', 'pref mode must stay on smart — guardian gate is inert');
});

test('U5 action routing: spelling-shortcut-start with mode=guardian starts a session when allWordsMega is true', async () => {
  const createAppHarness = await importAppHarness();
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });

  // Seed every core word to stage 4 via the subjectStates repository (same
  // proxy the service's storage uses), then open the subject.
  const today = Math.floor(Date.now() / DAY_MS_TS);
  seedAllCoreMega(harness.repositories, learnerId, today);
  harness.dispatch('open-subject', { subjectId: 'spelling' });

  // Sanity check: the service reports post-mastery.
  const postMastery = harness.services.spelling.getPostMasteryState(learnerId);
  assert.equal(postMastery.allWordsMega, true);

  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  const stateAfter = harness.store.getState().subjectUi.spelling;
  const prefsAfter = harness.services.spelling.getPrefs(learnerId);
  assert.equal(prefsAfter.mode, 'guardian', 'pref saved to guardian before startSession');
  assert.equal(stateAfter.phase, 'session', 'Guardian Mission session is in flight');
  assert.equal(stateAfter.session.mode, 'guardian');
  assert.equal(stateAfter.session.label, 'Guardian Mission');
  assert.ok(stateAfter.session.id, 'session id assigned');
});

test('U5 shortcut resolver: Alt+4 maps to spelling-shortcut-start with mode=guardian, regardless of allWordsMega', async () => {
  const { resolveSpellingShortcut } = await import('../src/subjects/spelling/shortcuts.js');
  const appState = {
    route: { subjectId: 'spelling', tab: 'practice' },
    subjectUi: {
      spelling: { phase: 'dashboard' },
    },
  };
  // The keybinding layer stays simple — it only produces the action. The
  // module-level gate decides whether to run it, so the resolver test
  // doesn't care about allWordsMega at all.
  assert.deepEqual(resolveSpellingShortcut({
    key: '4',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'BODY' },
  }, appState), {
    action: 'spelling-shortcut-start',
    data: { mode: 'guardian' },
    preventDefault: true,
  });
});

test('U5 shortcut resolver: Alt+1/2/3 mappings remain intact after Alt+4 addition', async () => {
  const { resolveSpellingShortcut } = await import('../src/subjects/spelling/shortcuts.js');
  const appState = {
    route: { subjectId: 'spelling', tab: 'practice' },
    subjectUi: { spelling: { phase: 'dashboard' } },
  };
  const smart = resolveSpellingShortcut({
    key: '1',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'BODY' },
  }, appState);
  assert.deepEqual(smart, { action: 'spelling-shortcut-start', data: { mode: 'smart' }, preventDefault: true });
  const trouble = resolveSpellingShortcut({
    key: '2',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'BODY' },
  }, appState);
  assert.deepEqual(trouble, { action: 'spelling-shortcut-start', data: { mode: 'trouble' }, preventDefault: true });
  const sats = resolveSpellingShortcut({
    key: '3',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'BODY' },
  }, appState);
  assert.deepEqual(sats, { action: 'spelling-shortcut-start', data: { mode: 'test' }, preventDefault: true });
});

// -----------------------------------------------------------------------------
// U6 action-routing: the spelling-analytics-status-filter handler validates
// incoming values against WORD_BANK_FILTER_IDS — extending the Set in U6
// should make each of the four new Guardian filters round-trip through the
// module handler with no further code change.
// -----------------------------------------------------------------------------

const GUARDIAN_FILTER_IDS = ['guardianDue', 'wobbling', 'renewedRecently', 'neverRenewed'];

for (const filterId of GUARDIAN_FILTER_IDS) {
  test(`U6 action routing: spelling-analytics-status-filter accepts value="${filterId}" via WORD_BANK_FILTER_IDS Set expansion`, async () => {
    const createAppHarness = await importAppHarness();
    const storage = installMemoryStorage();
    const harness = createAppHarness({ storage });
    harness.dispatch('open-subject', { subjectId: 'spelling' });

    // Seed the filter to `all` via the legacy path first, so we can assert
    // the handler actually advanced to the Guardian ID (and didn't silently
    // fall through to the 'all' fallback).
    harness.dispatch('spelling-analytics-status-filter', { value: 'secure' });
    assert.equal(
      harness.store.getState().transientUi.spellingAnalyticsStatusFilter,
      'secure',
      'baseline: legacy filter ID writes to transientUi',
    );

    harness.dispatch('spelling-analytics-status-filter', { value: filterId });
    assert.equal(
      harness.store.getState().transientUi.spellingAnalyticsStatusFilter,
      filterId,
      `${filterId} should be written to transientUi.spellingAnalyticsStatusFilter`,
    );
  });
}

test('U6 action routing: unknown filter IDs still fall back to "all"', async () => {
  // Regression guard: the WORD_BANK_FILTER_IDS Set expansion must not
  // accept arbitrary strings. Any value that is not in the Set collapses
  // back to 'all' (existing contract).
  const createAppHarness = await importAppHarness();
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-analytics-status-filter', { value: 'not-a-real-filter' });
  assert.equal(harness.store.getState().transientUi.spellingAnalyticsStatusFilter, 'all');
});

// U6 (Post-Mega Spelling Guardian Hardening): resetLearner must zero the
// `ks2-spell-guardian-<learnerId>` storage key even when the host wires a
// persistence adapter that lacks a `resetLearner` method. The canonical
// client persistence already wipes the subject-state record; the service
// must not rely on that being present. AE-R7.
// -----------------------------------------------------------------------------

const GUARDIAN_KEY_PREFIX = 'ks2-spell-guardian-';
function guardianKeyFor(learnerId) {
  return `${GUARDIAN_KEY_PREFIX}${learnerId}`;
}

function seedGuardianKeyDirect(storage, learnerId, map) {
  storage.setItem(guardianKeyFor(learnerId), JSON.stringify(map));
}

function readGuardianKeyDirect(storage, learnerId) {
  const raw = storage.getItem(guardianKeyFor(learnerId));
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

test('U6 guardian reset: resetLearner zeros the guardian key when persistence has no resetLearner adapter (AE-R7)', () => {
  // Host uses the raw storage proxy with no persistence.resetLearner hook —
  // e.g. a minimal host that only supplies `storage` to createSpellingService.
  // Before U6 this left ks2-spell-guardian-<learnerId> untouched. Now the
  // service must zero it explicitly.
  const storage = installMemoryStorage();
  const service = createSpellingService({ storage });
  const learnerId = 'learner-u6-no-adapter';

  // Seed a non-empty guardian map directly in storage (bypassing the service).
  seedGuardianKeyDirect(storage, learnerId, {
    possess: {
      reviewLevel: 2,
      lastReviewedDay: 17_995,
      nextDueDay: 18_002,
      correctStreak: 1,
      lapses: 0,
      renewals: 0,
      wobbling: false,
    },
  });
  // Sanity: the seed is visible through the raw storage path.
  assert.deepEqual(readGuardianKeyDirect(storage, learnerId), {
    possess: {
      reviewLevel: 2,
      lastReviewedDay: 17_995,
      nextDueDay: 18_002,
      correctStreak: 1,
      lapses: 0,
      renewals: 0,
      wobbling: false,
    },
  });

  service.resetLearner(learnerId);

  // After reset, the storage key must be present AND contain an empty map.
  const afterReset = readGuardianKeyDirect(storage, learnerId);
  assert.deepEqual(afterReset, {}, 'guardian storage key zeroed to {} after reset');
});

test('U6 guardian reset: resetLearner with canonical persistence.resetLearner still leaves guardian key as {}', () => {
  // Happy path — the canonical client persistence does wipe subject-state
  // (which covers the guardian slot) and the new U6 explicit save is a
  // redundant but idempotent no-op. End state is still {}.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  const learnerId = 'learner-u6-canonical';
  seedAllCoreMega(repositories, learnerId, today);
  // Seed a wobbling guardian record through the canonical repository path.
  seedGuardianMap(repositories, learnerId, {
    possess: {
      reviewLevel: 2,
      lastReviewedDay: today - 5,
      nextDueDay: today - 1,
      correctStreak: 0,
      lapses: 1,
      renewals: 0,
      wobbling: true,
    },
  });
  // Sanity: guardian map is non-empty before reset.
  const preReset = service.getPostMasteryState(learnerId);
  assert.equal(Object.keys(preReset.guardianMap).length, 1);

  service.resetLearner(learnerId);

  // Through the canonical persistence, reading the subject-state's
  // guardian slot now yields {} — both the adapter's subject-state wipe
  // and the U6 explicit save arrive at the same zeroed value.
  const data = repositories.subjectStates.read(learnerId, 'spelling').data || {};
  assert.deepEqual(data.guardian || {}, {}, 'guardian slot zeroed through canonical adapter + U6 explicit save');
  // Service-facing snapshot confirms the user-visible end state.
  const postReset = service.getPostMasteryState(learnerId);
  assert.deepEqual(postReset.guardianMap, {}, 'service view of guardian map is empty after reset');
});

test('U6 guardian reset: resetLearner on a learner with no existing guardian key writes {} without crash', () => {
  // Edge case — cold-start learner with nothing in storage. The new
  // saveGuardianMap(learnerId, {}) is a no-op from the learner's point of
  // view, must not throw, and must leave the storage key set to {}.
  const storage = installMemoryStorage();
  const service = createSpellingService({ storage });
  const learnerId = 'learner-u6-cold';
  assert.equal(
    storage.getItem(guardianKeyFor(learnerId)),
    null,
    'no guardian key before reset',
  );

  // Must not throw.
  service.resetLearner(learnerId);

  assert.deepEqual(
    readGuardianKeyDirect(storage, learnerId),
    {},
    'guardian storage key written as {} even on cold-start learner',
  );
});

test('U6 guardian reset: post-reset getPostMasteryState returns zeroed aggregates', () => {
  // Integration — after reset, the live post-mastery snapshot must show
  // no words mega, no due guardians, no wobbling, and no next due day.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  const learnerId = 'learner-u6-post-reset';
  seedAllCoreMega(repositories, learnerId, today);
  seedGuardianMap(repositories, learnerId, {
    possess: {
      reviewLevel: 1,
      lastReviewedDay: today - 2,
      nextDueDay: today - 1,
      correctStreak: 0,
      lapses: 1,
      renewals: 0,
      wobbling: true,
    },
  });

  service.resetLearner(learnerId);

  const state = service.getPostMasteryState(learnerId);
  assert.equal(state.allWordsMega, false);
  assert.equal(state.guardianDueCount, 0);
  assert.equal(state.wobblingCount, 0);
  assert.equal(state.nextGuardianDueDay, null);
});

test('U6 guardian reset: Worker-side resetLearner behaviour unchanged (still zeros via normaliseServerSpellingData)', () => {
  // Worker persistence.resetLearner already zeros guardian via
  // normaliseServerSpellingData({}). U6 touches only the shared-service
  // path; the worker contract must be unaffected. Assert the snapshot
  // returned by normaliseServerSpellingData({}) contains guardian === {}.
  const snapshot = normaliseServerSpellingData({}, TODAY * DAY_MS);
  assert.deepEqual(snapshot.guardian, {});
  assert.deepEqual(snapshot.progress, {});
});

// -----------------------------------------------------------------------------
// U4 (P1.5 hardening): "I don't know" replaces skip in Guardian sessions.
// Route goes through advanceGuardianOnWrong, emits spelling.guardian.wobbled,
// sets awaitingAdvance=true (mirrors submitGuardianAnswer wrong-path), and
// never mutates progress.stage. Non-Guardian sessions keep legacy
// engine.skipCurrent + enqueueLater semantics byte-identical.
// -----------------------------------------------------------------------------

test('U4 happy path: Guardian "I don\'t know" on a non-wobbling word emits one WOBBLED event, wobbling→true, nextDueDay=today+1, stage unchanged', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const firstSlug = started.state.session.currentCard.slug;

  const skipped = service.skipWord('learner-a', started.state);

  assert.equal(skipped.ok, true);
  const wobbled = skipped.events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED);
  assert.equal(wobbled.length, 1, 'exactly one WOBBLED event per "I don\'t know" click');
  assert.equal(wobbled[0].wordSlug, firstSlug);
  assert.equal(wobbled[0].lapses, 1, 'lapses incremented to 1 on first wobble');

  // No RENEWED / RECOVERED / MISSION_COMPLETED emitted by a mid-round skip.
  assert.equal(skipped.events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_RENEWED).length, 0);
  assert.equal(skipped.events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED).length, 0);
  assert.equal(skipped.events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED).length, 0);

  // Guardian record advanced exactly like a wrong answer.
  const postMastery = service.getPostMasteryState('learner-a');
  const record = postMastery.guardianMap[firstSlug];
  assert.equal(record.wobbling, true);
  assert.equal(record.nextDueDay, today + 1);
  assert.equal(record.lapses, 1);
  assert.equal(record.correctStreak, 0);

  // progress.stage preserved — Mega-never-revoked invariant.
  const snapshot = service.getAnalyticsSnapshot('learner-a');
  const row = snapshot.wordGroups.flatMap((g) => g.words).find((w) => w.slug === firstSlug);
  assert.equal(row.progress.stage, 4);
  assert.equal(row.progress.dueDay, today + 60, 'progress.dueDay preserved');
  assert.equal(row.progress.lastDay, today - 7, 'progress.lastDay preserved');
  assert.equal(row.progress.lastResult, 'correct', 'progress.lastResult preserved');
  assert.equal(row.progress.wrong, 2, 'progress.wrong bumped by 1 (seed was 1)');

  // Skip matches submitGuardianAnswer shape: awaitingAdvance=true, user clicks
  // Continue to advance. Session still points at the skipped slug until then.
  assert.equal(skipped.state.awaitingAdvance, true, 'skip leaves session awaitingAdvance like wrong-answer submit');
  const postSession = skipped.state.session;
  assert.ok(postSession, 'session continues');
  assert.equal(postSession.currentSlug, firstSlug, 'currentSlug stays on skipped slug until continueSession fires');
  assert.equal(Array.isArray(postSession.queue) && postSession.queue.includes(firstSlug), false, 'queue no longer contains the skipped slug');

  // Continue advances past the skipped slug (FIFO) — no re-queue.
  const advanced = service.continueSession('learner-a', skipped.state);
  assert.equal(advanced.state.awaitingAdvance, false);
  assert.notEqual(advanced.state.session.currentSlug, firstSlug, 'continueSession advances past the skipped slug');
});

test('U4 happy path: Guardian "I don\'t know" on an already-wobbling word re-emits WOBBLED, lapses +1, nextDueDay resets to today+1', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  // Seed 'possess' as already wobbling — it wins the wobbling-due bucket.
  seedGuardianMap(repositories, 'learner-a', {
    possess: {
      reviewLevel: 2,
      lastReviewedDay: today - 5,
      nextDueDay: today - 1,
      correctStreak: 0,
      lapses: 1,
      renewals: 0,
      wobbling: true,
    },
  });

  const started = service.startSession('learner-a', { mode: 'guardian' });
  assert.equal(started.state.session.currentCard.slug, 'possess');
  const skipped = service.skipWord('learner-a', started.state);

  const wobbled = skipped.events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED);
  assert.equal(wobbled.length, 1);
  assert.equal(wobbled[0].wordSlug, 'possess');
  assert.equal(wobbled[0].lapses, 2, 'lapses incremented on repeat wobble');

  const postMastery = service.getPostMasteryState('learner-a');
  const record = postMastery.guardianMap.possess;
  assert.equal(record.wobbling, true, 'stays wobbling');
  assert.equal(record.lapses, 2);
  assert.equal(record.nextDueDay, today + 1, 'nextDueDay resets to today+1');

  const snapshot = service.getAnalyticsSnapshot('learner-a');
  const row = snapshot.wordGroups.flatMap((g) => g.words).find((w) => w.slug === 'possess');
  assert.equal(row.progress.stage, 4, 'stage preserved on repeat wobble');
});

test('U4 happy path: "I don\'t know" adds skipped word to summary.mistakes for the practice-only drill pickup (R3 dependency)', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const firstSlug = started.state.session.currentCard.slug;

  // Skip the first word (I don't know), answer the rest correctly.
  const skipped = service.skipWord('learner-a', started.state);
  let current = skipped.state;
  // continue the session (may already be on next card; answer the remainder correctly)
  while (current.phase === 'session') {
    if (current.awaitingAdvance) {
      current = service.continueSession('learner-a', current).state;
      continue;
    }
    const answer = current.session.currentCard.word.word;
    current = service.submitAnswer('learner-a', current, answer).state;
  }
  assert.equal(current.phase, 'summary');
  const mistakeSlugs = current.summary.mistakes.map((m) => m.slug);
  assert.ok(mistakeSlugs.includes(firstSlug), '"I don\'t know" slug appears in summary.mistakes');
  assert.equal(current.summary.mistakes.length, 1, 'only the skipped word fell into mistakes; correct answers did not');
});

test('U4 edge: "I don\'t know" when awaitingAdvance===true is a no-op (no duplicate event, no state mutation)', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const firstSlug = started.state.session.currentCard.slug;
  // First correct answer: leaves awaitingAdvance=true.
  const submitted = service.submitAnswer('learner-a', started.state, started.state.session.currentCard.word.word);
  assert.equal(submitted.state.awaitingAdvance, true);

  const skipped = service.skipWord('learner-a', submitted.state);
  assert.equal(skipped.changed, false, 'skipWord no-ops while awaitingAdvance');
  assert.equal(skipped.events.length, 0, 'no events on no-op skip');
  // Guardian record from the correct answer is unchanged by the no-op skip.
  const postMastery = service.getPostMasteryState('learner-a');
  const record = postMastery.guardianMap[firstSlug];
  assert.equal(record.wobbling, false, 'record stays as correct-answer result, not wobbling');
});

test('U4 edge: "I don\'t know" double-click is a no-op on the second call (awaitingAdvance guard)', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const firstSlug = started.state.session.currentCard.slug;

  const first = service.skipWord('learner-a', started.state);
  // First click: awaitingAdvance becomes true; exactly one WOBBLED event.
  assert.equal(first.state.awaitingAdvance, true);
  const firstWobbled = first.events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED);
  assert.equal(firstWobbled.length, 1, 'first click wobbles once');

  // Second click on the same state: the early awaitingAdvance guard in
  // skipWord returns changed:false with no events.
  const second = service.skipWord('learner-a', first.state);
  assert.equal(second.changed, false, 'second click is a no-op while awaitingAdvance');
  assert.equal(second.events.length, 0, 'second click emits no events');

  const postMastery = service.getPostMasteryState('learner-a');
  assert.equal(postMastery.guardianMap[firstSlug].lapses, 1, 'first slug lapses counted once, not twice');
});

test('U4 integration (wobbledCount correctness): round with 2 wrong answers + 1 "I don\'t know" emits wobbledCount === 3 on mission-completed', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const totalWords = started.state.session.uniqueWords.length;

  let current = started.state;
  const events = [];
  let cardCount = 0;
  while (current.phase === 'session') {
    if (current.awaitingAdvance) {
      const advanced = service.continueSession('learner-a', current);
      events.push(...advanced.events);
      current = advanced.state;
      continue;
    }
    cardCount += 1;
    let transition;
    if (cardCount === 1) {
      // First card: "I don't know"
      transition = service.skipWord('learner-a', current);
    } else if (cardCount <= 3) {
      // Cards 2 and 3: wrong answer
      transition = service.submitAnswer('learner-a', current, 'definitely-wrong');
    } else {
      // Rest: correct
      transition = service.submitAnswer('learner-a', current, current.session.currentCard.word.word);
    }
    events.push(...transition.events);
    current = transition.state;
  }

  assert.equal(current.phase, 'summary');
  const mission = events.find((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED);
  assert.ok(mission, 'mission-completed event emitted');
  assert.equal(mission.wobbledCount, 3, 'wobbledCount aggregates 2 wrong + 1 "I don\'t know"');
  assert.equal(mission.renewalCount, totalWords - 3);
  assert.equal(mission.recoveredCount, 0);

  // Per-word WOBBLED events: exactly 3 across the round.
  const wobbledEvents = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED);
  assert.equal(wobbledEvents.length, 3, 'one WOBBLED event per wobbled slug, no duplicates');
});

test('U4 integration: non-Guardian learning session skip still calls engine.skipCurrent → enqueueLater, slug re-appears in queue, no guardian events', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const { service } = makeServiceWithSeed({ now, random: () => 0.5 });
  // Learning mode (not guardian). Use seeded words to get a round with a
  // predictable first slug.
  const started = service.startSession('learner-a', {
    mode: 'single',
    words: ['possess', 'believe', 'imagine', 'decide'],
    length: 4,
  });
  assert.equal(started.state.session.mode, 'single');
  assert.notEqual(started.state.session.mode, 'guardian');
  const firstSlug = started.state.session.currentSlug;
  const queueBefore = started.state.session.queue.slice();

  const skipped = service.skipWord('learner-a', started.state);

  // No guardian events from a non-Guardian skip.
  assert.equal(skipped.events.filter((e) => e.type?.startsWith?.('spelling.guardian.')).length, 0);
  // Session advances to a different slug.
  assert.notEqual(skipped.state.session.currentSlug, firstSlug, 'skip advanced past the first slug');
  // Legacy enqueueLater: the skipped slug is still reachable in the round
  // (queue + currentSlug). Either in queue, or it will be picked up later.
  const queueAfter = skipped.state.session.queue;
  const reachable = [skipped.state.session.currentSlug, ...queueAfter];
  assert.ok(reachable.includes(firstSlug), 'legacy skip re-queues slug (reachable later in round)');
  // Sanity: the legacy info feedback headline is still the non-Guardian one.
  assert.equal(skipped.state.feedback?.headline, 'Skipped for now.');
});

test('U4 edge: FIFO-consistent queue after Guardian "I don\'t know" — skipped slug never re-queued (continueSession advances to next)', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const initialSlugs = started.state.session.uniqueWords.slice();
  const firstSlug = started.state.session.currentSlug;

  const skipped = service.skipWord('learner-a', started.state);
  // After skip, queue has the skipped slug removed. Continue to move on.
  assert.equal(Array.isArray(skipped.state.session.queue) && skipped.state.session.queue.includes(firstSlug), false, 'queue does not contain the skipped slug');
  const advanced = service.continueSession('learner-a', skipped.state);
  const post = advanced.state.session;
  const reachable = [post.currentSlug, ...post.queue].filter(Boolean);
  for (const slug of initialSlugs) {
    if (slug === firstSlug) {
      assert.equal(reachable.includes(slug), false, `${slug} must not be re-queued after Guardian skip`);
    } else {
      // Each remaining slug appears exactly once on the reachable path
      // (current + queue), preserving FIFO.
      assert.equal(reachable.filter((s) => s === slug).length, 1, `${slug} appears exactly once on the FIFO path`);
    }
  }
});

test('U4 edge: Guardian "I don\'t know" sets session.guardianResults[slug] to "wobbled" for mission-completed aggregation', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const firstSlug = started.state.session.currentCard.slug;
  const skipped = service.skipWord('learner-a', started.state);

  assert.equal(skipped.state.session.guardianResults[firstSlug], 'wobbled');
});

test('U4 edge: Guardian "I don\'t know" surfaces a "Wobbling" feedback so the user knows the click registered', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const skipped = service.skipWord('learner-a', started.state);

  // Feedback mirrors the wrong-answer Guardian body so the UI shows the
  // correct answer via feedback.answer (like submitGuardianAnswer does for
  // wrong answers).
  assert.equal(skipped.state.feedback?.kind, 'warn');
  assert.equal(skipped.state.feedback?.headline, 'Wobbling.');
  assert.match(skipped.state.feedback?.body || '', /will return tomorrow/);
  assert.ok(skipped.state.feedback?.answer, 'feedback.answer present so Cloze can reveal the word after skip');
});

test('U4 edge: continueSession after Guardian skip plays the audio cue for the next card', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS_TS);
  const { service, repositories } = makeServiceWithSeed({ now, random: () => 0.5 });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const skipped = service.skipWord('learner-a', started.state);
  const advanced = service.continueSession('learner-a', skipped.state);

  // continueSession's non-done branch returns an audio cue — same as the
  // correct-answer Guardian flow. Without this, the learner would see the
  // next card's prompt without hearing it.
  assert.ok(advanced.audio, 'continueSession returns an audio cue for the freshly-advanced card');
});

// -----------------------------------------------------------------------------
// U3 action-routing: Guardian-safe summary drill. The `spelling-drill-all` and
// `spelling-drill-single` handlers branch on `ui.summary?.mode === 'guardian'`
// to force `practiceOnly: true` on the dispatched session, which short-circuits
// at `legacy-engine.js:763` before `applyLearningOutcome` can ever touch
// `progress.stage`. Guardian origin never demotes Mega; non-Guardian origin is
// byte-identical to the legacy path (characterisation coverage below).
// -----------------------------------------------------------------------------

function submitForm(harness, typed) {
  const formData = new FormData();
  formData.set('typed', typed);
  harness.dispatch('spelling-submit-form', { formData });
}

function runLegacyLearningRoundWithOneWrongWord(harness) {
  // Cycle the first word through retry → correction → correct so the word
  // ends up in `summary.mistakes` but the round actually finalises (correction
  // requires a matching answer before we can advance). The remaining words
  // (if any in a multi-word round) are answered correctly on the first try.
  const firstAnswer = harness.store.getState().subjectUi.spelling.session.currentCard.word.word;
  submitForm(harness, 'zzzwrong-question');
  submitForm(harness, 'zzzwrong-retry');
  submitForm(harness, firstAnswer);
  for (let guard = 0; guard < 40; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      harness.dispatch('spelling-continue');
      continue;
    }
    submitForm(harness, ui.session.currentCard.word.word);
  }
}

function runGuardianRoundAllWrong(harness) {
  // Guardian sessions are single-attempt — one wrong answer is enough to
  // push the word into `summary.mistakes`. Loop through until phase flips
  // off 'session'.
  for (let guard = 0; guard < 40; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      harness.dispatch('spelling-continue');
      continue;
    }
    submitForm(harness, 'zzzwrongguardian');
  }
}

function runPracticeOnlyRoundAllWrong(harness) {
  // Practice-only drill uses the legacy learning surface (retry → correction
  // → next), but `practiceOnly: true` short-circuits `applyLearningOutcome`
  // at `legacy-engine.js:763`. We must still type the correct answer in
  // correction phase to advance, otherwise the session stalls — this is a
  // fixture constraint, not a product assertion.
  for (let guard = 0; guard < 200; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      harness.dispatch('spelling-continue');
      continue;
    }
    const sessionPhase = ui.session?.phase;
    if (sessionPhase === 'correction') {
      // Type the correct answer to escape the correction phase without
      // demoting (practiceOnly gates the demotion regardless of whether we
      // type correct here).
      submitForm(harness, ui.session.currentCard.word.word);
    } else {
      submitForm(harness, 'zzzwrongpractice');
    }
  }
}

test('U3 characterisation: legacy Smart Review summary drill keeps mode="trouble" + practiceOnly=false', async () => {
  // Baseline that must survive the U3 change: a Smart Review summary
  // dispatching `spelling-drill-all` starts a `mode: 'trouble'` session with
  // `practiceOnly` left unset (defaults to false inside `startSession`).
  // We assert on session shape — the public contract is that session
  // carries `mode: 'trouble'` and does NOT carry `practiceOnly: true`.
  const createAppHarness = await importAppHarness();
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  runLegacyLearningRoundWithOneWrongWord(harness);
  const summary = harness.store.getState().subjectUi.spelling.summary;
  assert.equal(summary.mode, 'smart', 'sanity: smart-review origin');
  assert.ok(summary.mistakes.length >= 1, 'at least one mistake expected');

  harness.dispatch('spelling-drill-all');

  const session = harness.store.getState().subjectUi.spelling.session;
  assert.equal(session.mode, 'trouble', 'Smart-origin drill routes into mode=trouble');
  assert.notEqual(session.practiceOnly, true, 'Smart-origin drill must NOT set practiceOnly (legacy behaviour)');
});

test('U3 characterisation: legacy Smart Review summary drill-single keeps mode="single" + practiceOnly=false', async () => {
  // Complement: `spelling-drill-single` must also stay on legacy behaviour
  // for non-Guardian origins (the existing chip path that Smart Review
  // learners tap one word at a time).
  const createAppHarness = await importAppHarness();
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  runLegacyLearningRoundWithOneWrongWord(harness);
  const summary = harness.store.getState().subjectUi.spelling.summary;
  const mistakeSlug = summary.mistakes[0]?.slug;
  assert.ok(mistakeSlug, 'at least one mistake with a slug expected');

  harness.dispatch('spelling-drill-single', { slug: mistakeSlug });

  const session = harness.store.getState().subjectUi.spelling.session;
  assert.equal(session.mode, 'single', 'Smart-origin drill-single stays on mode=single');
  assert.notEqual(session.practiceOnly, true, 'Smart-origin drill-single must NOT set practiceOnly');
});

test('U3 happy path: Guardian summary drill-all dispatch starts mode=trouble + practiceOnly=true', async () => {
  const createAppHarness = await importAppHarness();
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  const today = Math.floor(Date.now() / DAY_MS_TS);

  seedAllCoreMega(harness.repositories, learnerId, today);
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');
  assert.equal(harness.store.getState().subjectUi.spelling.session.mode, 'guardian');

  runGuardianRoundAllWrong(harness);
  const summary = harness.store.getState().subjectUi.spelling.summary;
  assert.equal(summary.mode, 'guardian', 'sanity: guardian-origin summary');
  assert.ok(summary.mistakes.length >= 1, 'guardian round of all-wrong must yield at least one mistake');

  harness.dispatch('spelling-drill-all');

  const session = harness.store.getState().subjectUi.spelling.session;
  assert.equal(session.mode, 'trouble', 'Guardian-origin drill-all routes into mode=trouble (not a new mode)');
  assert.equal(session.practiceOnly, true, 'Guardian-origin drill-all must set practiceOnly=true to short-circuit demotion');
  // The session words must match the mistake slugs — not a fresh selection.
  const mistakeSlugs = new Set(summary.mistakes.map((m) => m.slug));
  for (const slug of session.uniqueWords) {
    assert.ok(mistakeSlugs.has(slug), `session word ${slug} must come from summary.mistakes`);
  }
});

test('U3 error path: practice-only drill after Guardian leaves progress.stage/dueDay/lastDay unchanged on wrong', async () => {
  // The big invariant: a wrong answer during the practice-only drill must
  // NEVER demote a Mega word. `practiceOnly: true` short-circuits at
  // `legacy-engine.js:763` before `applyLearningOutcome` runs. We assert on
  // the `progress` snapshot before / after the drill — stage/dueDay/lastDay/
  // lastResult are byte-identical, only attempts/correct/wrong bump.
  const createAppHarness = await importAppHarness();
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  const today = Math.floor(Date.now() / DAY_MS_TS);

  seedAllCoreMega(harness.repositories, learnerId, today);
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  runGuardianRoundAllWrong(harness);

  const summary = harness.store.getState().subjectUi.spelling.summary;
  const drillSlug = summary.mistakes[0]?.slug;
  assert.ok(drillSlug, 'Guardian all-wrong round must produce at least one mistake');

  // Snapshot the progress record + guardian record before the drill.
  const snapshotBefore = structuredClone(
    harness.services.spelling.getAnalyticsSnapshot(learnerId).wordGroups
      .flatMap((g) => g.words)
      .find((r) => r.slug === drillSlug),
  );
  const guardianBefore = structuredClone(
    harness.services.spelling.getPostMasteryState(learnerId).guardianMap[drillSlug] || null,
  );

  // Dispatch the Practice button path.
  harness.dispatch('spelling-drill-all');
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');
  assert.equal(harness.store.getState().subjectUi.spelling.session.practiceOnly, true);

  // Answer the practice-only round — correction-phase requires a valid
  // answer to advance (fixture plumbing, not a product gate).
  runPracticeOnlyRoundAllWrong(harness);

  const snapshotAfter = harness.services.spelling.getAnalyticsSnapshot(learnerId).wordGroups
    .flatMap((g) => g.words)
    .find((r) => r.slug === drillSlug);
  const guardianAfter = harness.services.spelling.getPostMasteryState(learnerId).guardianMap[drillSlug] || null;

  // progress.stage must NOT have moved — the Mega invariant.
  assert.equal(snapshotAfter.progress.stage, snapshotBefore.progress.stage, `${drillSlug} stage must stay at Mega (4)`);
  assert.equal(snapshotAfter.progress.stage, 4, `${drillSlug} stage should be Mega (4)`);
  // dueDay / lastDay / lastResult must also stay pinned — the whole point of
  // practiceOnly is not just stage but the full scheduling snapshot.
  assert.equal(snapshotAfter.progress.dueDay, snapshotBefore.progress.dueDay, `${drillSlug} dueDay unchanged`);
  assert.equal(snapshotAfter.progress.lastDay, snapshotBefore.progress.lastDay, `${drillSlug} lastDay unchanged`);
  assert.equal(snapshotAfter.progress.lastResult, snapshotBefore.progress.lastResult, `${drillSlug} lastResult unchanged`);

  // guardian.wobbling / nextDueDay must be byte-identical to pre-drill.
  if (guardianBefore) {
    assert.equal(guardianAfter.wobbling, guardianBefore.wobbling, `${drillSlug} guardian.wobbling unchanged`);
    assert.equal(guardianAfter.nextDueDay, guardianBefore.nextDueDay, `${drillSlug} guardian.nextDueDay unchanged`);
    assert.equal(guardianAfter.reviewLevel, guardianBefore.reviewLevel, `${drillSlug} guardian.reviewLevel unchanged`);
    assert.equal(guardianAfter.lapses, guardianBefore.lapses, `${drillSlug} guardian.lapses unchanged`);
  }
});

test('U3 integration: practice-only drill summary renders without guardian-specific cards', async () => {
  // The practice-only drill uses `mode: 'trouble'`, so when it finalises the
  // summary scene must NOT render Guardian-specific cards. This is the
  // "edge case" scenario in the plan — practice rounds complete but do not
  // mint `mission-completed` events or decorate the summary with Vault copy.
  const createAppHarness = await importAppHarness();
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  const today = Math.floor(Date.now() / DAY_MS_TS);

  seedAllCoreMega(harness.repositories, learnerId, today);
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  runGuardianRoundAllWrong(harness);
  harness.dispatch('spelling-drill-all');
  // Finish the practice round by submitting correct answers.
  for (let guard = 0; guard < 200; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      harness.dispatch('spelling-continue');
      continue;
    }
    submitForm(harness, ui.session.currentCard.word.word);
  }

  const summary = harness.store.getState().subjectUi.spelling.summary;
  assert.equal(summary.mode, 'trouble', 'practice-only summary inherits mode=trouble, not guardian');
});

// ----- U2: Orphan sanitiser (selector + read-model) --------------------------
//
// Content hot-swap can leave `guardianMap[slug]` / `progressMap[slug]` pointing
// at a slug the current content bundle no longer publishes (removed from the
// statutory list) or has demoted from core to extra. The orphan sanitiser
// keeps the read-side filters and the selector in lockstep — persisted
// storage is untouched (no delete) so a content rollback that re-introduces
// the slug finds its record intact.

test('U2: GUARDIAN_SECURE_STAGE is re-exported from service-contract (single source of truth)', () => {
  assert.equal(GUARDIAN_SECURE_STAGE, 4);
});

test('U2: isGuardianEligibleSlug returns true for a known core stage-4 slug', () => {
  const progressMap = { possess: { stage: 4 } };
  const wordBySlug = { possess: { slug: 'possess', spellingPool: 'core' } };
  assert.equal(isGuardianEligibleSlug('possess', progressMap, wordBySlug), true);
});

test('U2: isGuardianEligibleSlug returns false for an unknown slug (content hot-swap removal)', () => {
  const progressMap = { ghostword: { stage: 4 } };
  const wordBySlug = {};
  assert.equal(isGuardianEligibleSlug('ghostword', progressMap, wordBySlug), false);
});

test('U2: isGuardianEligibleSlug returns false when word has been demoted to spellingPool=extra', () => {
  const progressMap = { demoted: { stage: 4 } };
  const wordBySlug = { demoted: { slug: 'demoted', spellingPool: 'extra' } };
  assert.equal(isGuardianEligibleSlug('demoted', progressMap, wordBySlug), false);
});

test('U2: isGuardianEligibleSlug returns false when progress stage is below GUARDIAN_SECURE_STAGE', () => {
  const wordBySlug = { weak: { slug: 'weak', spellingPool: 'core' } };
  assert.equal(isGuardianEligibleSlug('weak', { weak: { stage: 3 } }, wordBySlug), false);
  assert.equal(isGuardianEligibleSlug('weak', { weak: { stage: 0 } }, wordBySlug), false);
  assert.equal(isGuardianEligibleSlug('weak', { weak: {} }, wordBySlug), false, 'missing stage treated as 0');
  assert.equal(isGuardianEligibleSlug('weak', {}, wordBySlug), false, 'missing record treated as 0');
});

test('U2: isGuardianEligibleSlug tolerates null / garbage inputs without throwing', () => {
  assert.equal(isGuardianEligibleSlug('', {}, {}), false);
  assert.equal(isGuardianEligibleSlug(null, null, null), false);
  assert.equal(isGuardianEligibleSlug(undefined, undefined, undefined), false);
  assert.equal(isGuardianEligibleSlug('slug', null, { slug: { spellingPool: 'core' } }), false);
  assert.equal(isGuardianEligibleSlug('slug', { slug: { stage: 4 } }, null), false);
});

test('U2 selector bucket 1 (wobbling-due): orphan slug skipped', () => {
  // An orphan wobbling-due entry sits alongside a known one. The known slug
  // is surfaced; the orphan never appears in the selection.
  const guardianMap = {
    accommodate: { reviewLevel: 1, lastReviewedDay: TODAY - 2, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
    ghostword: { reviewLevel: 1, lastReviewedDay: TODAY - 2, nextDueDay: TODAY - 2, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
  };
  const progressMap = {
    accommodate: { stage: 4, attempts: 6, correct: 5, wrong: 1 },
    ghostword: { stage: 4, attempts: 6, correct: 5, wrong: 1 },
  };
  const selected = selectGuardianWords({
    guardianMap,
    progressMap,
    wordBySlug: WORD_BY_SLUG, // runtime does NOT know 'ghostword'
    todayDay: TODAY,
    length: 8,
    random: () => 0.5,
  });
  assert.equal(selected.includes('ghostword'), false, 'orphan never appears in bucket 1');
  assert.equal(selected.includes('accommodate'), true);
});

test('U2 selector bucket 2 (non-wobbling-due): orphan slug skipped', () => {
  const guardianMap = {
    believe: { reviewLevel: 2, lastReviewedDay: TODAY - 14, nextDueDay: TODAY - 1, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
    ghostword: { reviewLevel: 2, lastReviewedDay: TODAY - 14, nextDueDay: TODAY - 2, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
  };
  const progressMap = {
    believe: { stage: 4, attempts: 6, correct: 5, wrong: 1 },
    ghostword: { stage: 4, attempts: 6, correct: 5, wrong: 1 },
  };
  const selected = selectGuardianWords({
    guardianMap,
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    todayDay: TODAY,
    length: 8,
    random: () => 0.5,
  });
  assert.equal(selected.includes('ghostword'), false, 'orphan never appears in bucket 2');
  assert.equal(selected.includes('believe'), true);
});

test('U2 selector bucket 4 (non-due top-up): orphan slug skipped', () => {
  // Only one due non-wobbling + several non-due guardians. Selector below
  // GUARDIAN_MIN_ROUND_LENGTH=5, so the top-up engages. The orphan non-due
  // slug must be skipped even inside the top-up pool.
  const guardianMap = {
    address: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 3, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
    believe: { reviewLevel: 2, lastReviewedDay: TODAY - 14, nextDueDay: TODAY - 1, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
    bicycle: { reviewLevel: 3, lastReviewedDay: TODAY - 20, nextDueDay: TODAY + 30, correctStreak: 3, lapses: 0, renewals: 0, wobbling: false },
    breath: { reviewLevel: 3, lastReviewedDay: TODAY - 5, nextDueDay: TODAY + 30, correctStreak: 3, lapses: 0, renewals: 0, wobbling: false },
    ghostword: { reviewLevel: 3, lastReviewedDay: TODAY - 80, nextDueDay: TODAY + 30, correctStreak: 3, lapses: 0, renewals: 0, wobbling: false },
  };
  const progressMap = {
    address: { stage: 4 },
    believe: { stage: 4 },
    bicycle: { stage: 4 },
    breath: { stage: 4 },
    ghostword: { stage: 4 },
  };
  const selected = selectGuardianWords({
    guardianMap,
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    todayDay: TODAY,
    length: 5,
    random: () => 0.5,
  });
  assert.equal(selected.includes('ghostword'), false, 'orphan never surfaces through the top-up bucket');
});

test('U2 selector bucket 3 (lazy-create) existing guard: extra-pool words are not lazy-created', () => {
  // The pre-U2 guard already rejects unknown slugs. U2 tightens the lazy-create
  // candidate filter so pool=extra words are also rejected (they must never
  // graduate into Guardian protection).
  const wordBySlug = {
    ...WORD_BY_SLUG,
    // Synthesise an 'extra' mega word — pool=extra must NOT qualify for lazy-create.
    fakeextra: { slug: 'fakeextra', spellingPool: 'extra' },
  };
  const progressMap = {
    fakeextra: { stage: 4, attempts: 6, correct: 5, wrong: 1 },
    possess: { stage: 4, attempts: 6, correct: 5, wrong: 1 },
  };
  const selected = selectGuardianWords({
    guardianMap: {},
    progressMap,
    wordBySlug,
    todayDay: TODAY,
    length: 8,
    random: () => 0.5,
  });
  assert.equal(selected.includes('fakeextra'), false, 'extra-pool slug must not be lazy-created');
  assert.equal(selected.includes('possess'), true, 'core-pool stage-4 still lazy-creates');
});

test('U2 selector: orphan slug with wobbling: true + nextDueDay <= today still skipped', () => {
  // Edge: the orphan slug is maximally appealing (wobbling + overdue), but
  // wordBySlug does not know it. The selector must still skip.
  const guardianMap = {
    ghostword: { reviewLevel: 0, lastReviewedDay: TODAY - 10, nextDueDay: TODAY - 5, correctStreak: 0, lapses: 3, renewals: 0, wobbling: true },
  };
  const progressMap = { ghostword: { stage: 4 } };
  const selected = selectGuardianWords({
    guardianMap,
    progressMap,
    wordBySlug: {},
    todayDay: TODAY,
    length: 5,
    random: () => 0.5,
  });
  assert.deepEqual(selected, [], 'no orphan surfaces even when wobbling + due');
});

test('U2 selector: 10 known + 2 orphan entries all due → picks up to 8 known, zero orphan', () => {
  // Mirror the plan "happy path" scenario: 10 known + 2 orphan entries, all due.
  // Use real WORD_BY_SLUG slugs so wordBySlug lookups succeed.
  const knownSlugs = WORDS.filter((w) => w.spellingPool !== 'extra').slice(0, 10).map((w) => w.slug);
  const guardianMap = {};
  const progressMap = {};
  for (let i = 0; i < knownSlugs.length; i += 1) {
    guardianMap[knownSlugs[i]] = {
      reviewLevel: 1,
      lastReviewedDay: TODAY - (i + 1),
      nextDueDay: TODAY - 1,
      correctStreak: 1,
      lapses: 0,
      renewals: 0,
      wobbling: false,
    };
    progressMap[knownSlugs[i]] = { stage: 4 };
  }
  // Add two orphan guardian records for slugs NOT in WORD_BY_SLUG.
  guardianMap.ghostword1 = {
    reviewLevel: 0, lastReviewedDay: TODAY - 2, nextDueDay: TODAY - 2, correctStreak: 0, lapses: 0, renewals: 0, wobbling: false,
  };
  guardianMap.ghostword2 = {
    reviewLevel: 0, lastReviewedDay: TODAY - 2, nextDueDay: TODAY - 2, correctStreak: 0, lapses: 0, renewals: 0, wobbling: true,
  };
  progressMap.ghostword1 = { stage: 4 };
  progressMap.ghostword2 = { stage: 4 };
  const selected = selectGuardianWords({
    guardianMap,
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    todayDay: TODAY,
    length: 8,
    random: () => 0.5,
  });
  assert.equal(selected.length, 8, 'selector hits its 8-word target using known slugs only');
  assert.equal(selected.includes('ghostword1'), false);
  assert.equal(selected.includes('ghostword2'), false);
  for (const slug of selected) {
    assert.equal(knownSlugs.includes(slug), true, `selected slug ${slug} must be one of the 10 known candidates`);
  }
});

// ----- U2 read-model: getSpellingPostMasteryState counts respect orphan filter ----

test('U2 read-model: guardianDueCount ignores orphan slugs', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 10 });
  const [w0, w1, w2] = runtimeSnapshot.coreWords;
  const subjectStateRecord = makeSubjectStateRecord({
    progress: {
      ...secureProgressEntries(runtimeSnapshot.coreWords),
      ghostword: { stage: 4, attempts: 6, correct: 5, wrong: 1, dueDay: TODAY + 30, lastDay: TODAY - 7, lastResult: true },
    },
    guardian: {
      [w0.slug]: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: false },
      [w1.slug]: { reviewLevel: 2, lastReviewedDay: TODAY - 2, nextDueDay: TODAY, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
      [w2.slug]: { reviewLevel: 1, lastReviewedDay: TODAY - 1, nextDueDay: TODAY + 30, correctStreak: 1, lapses: 0, renewals: 0, wobbling: false },
      // Orphan: not in runtimeSnapshot.wordBySlug, but due today.
      ghostword: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: false },
    },
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.guardianDueCount, 2, 'orphan ghostword excluded from due count');
});

test('U2 read-model: wobblingCount ignores orphan slugs', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 10 });
  const [w0, w1] = runtimeSnapshot.coreWords;
  const subjectStateRecord = makeSubjectStateRecord({
    progress: {
      ...secureProgressEntries(runtimeSnapshot.coreWords),
      ghostword: { stage: 4, attempts: 6, correct: 5, wrong: 1, dueDay: TODAY + 30, lastDay: TODAY - 7, lastResult: true },
    },
    guardian: {
      [w0.slug]: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
      [w1.slug]: { reviewLevel: 2, lastReviewedDay: TODAY - 2, nextDueDay: TODAY, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
      ghostword: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 5, renewals: 0, wobbling: true },
    },
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.wobblingCount, 1, 'orphan ghostword excluded from wobbling count');
});

test('U2 read-model: nextGuardianDueDay ignores orphan slugs even when orphan has the earliest dueDay', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 10 });
  const [w0, w1] = runtimeSnapshot.coreWords;
  const subjectStateRecord = makeSubjectStateRecord({
    progress: {
      ...secureProgressEntries(runtimeSnapshot.coreWords),
      ghostword: { stage: 4, attempts: 6, correct: 5, wrong: 1, dueDay: TODAY + 30, lastDay: TODAY - 7, lastResult: true },
    },
    guardian: {
      [w0.slug]: { reviewLevel: 2, lastReviewedDay: TODAY - 2, nextDueDay: TODAY + 14, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
      [w1.slug]: { reviewLevel: 1, lastReviewedDay: TODAY - 1, nextDueDay: TODAY + 7, correctStreak: 1, lapses: 0, renewals: 0, wobbling: false },
      // Orphan's dueDay is earliest of all — must still be ignored.
      ghostword: { reviewLevel: 0, lastReviewedDay: TODAY - 1, nextDueDay: TODAY + 1, correctStreak: 0, lapses: 0, renewals: 0, wobbling: false },
    },
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.nextGuardianDueDay, TODAY + 7, 'ghostword (today+1) not considered for earliest-due');
});

test('U2 read-model: pool-demoted slug (core → extra) excluded from guardianDueCount and wobblingCount', () => {
  // Content bundle release demotes a previously-core word to extra. Guardian
  // counts must drop the slug; persistence still carries the record.
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 10 });
  // Force one of the runtime words to become 'extra' for this test only.
  const demotedSlug = runtimeSnapshot.coreWords[0].slug;
  const demotedRuntime = {
    words: runtimeSnapshot.words.map((w) => (w.slug === demotedSlug ? { ...w, spellingPool: 'extra', year: 'extra', yearLabel: 'Extra' } : w)),
    wordBySlug: {
      ...runtimeSnapshot.wordBySlug,
      [demotedSlug]: { ...runtimeSnapshot.wordBySlug[demotedSlug], spellingPool: 'extra', year: 'extra', yearLabel: 'Extra' },
    },
    coreWords: runtimeSnapshot.coreWords.slice(1),
    extraWords: [{ ...runtimeSnapshot.coreWords[0], spellingPool: 'extra', year: 'extra', yearLabel: 'Extra' }],
  };
  const subjectStateRecord = makeSubjectStateRecord({
    progress: {
      ...secureProgressEntries(demotedRuntime.coreWords),
      [demotedSlug]: { stage: 4, attempts: 6, correct: 5, wrong: 1, dueDay: TODAY + 30, lastDay: TODAY - 7, lastResult: true },
    },
    guardian: {
      [demotedSlug]: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 2, renewals: 0, wobbling: true },
    },
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot: demotedRuntime, now: U4_NOW_MS });
  assert.equal(state.guardianDueCount, 0, 'demoted-to-extra slug not counted as guardian-due');
  assert.equal(state.wobblingCount, 0, 'demoted-to-extra slug not counted as wobbling');
});

test('U2 read-model: legacy-demoted slug (stage < GUARDIAN_SECURE_STAGE) excluded from counts', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 10 });
  const [w0, w1] = runtimeSnapshot.coreWords;
  const progress = secureProgressEntries(runtimeSnapshot.coreWords);
  // Force w0's stage down to 3 (legacy-engine wrong answer path).
  progress[w0.slug] = { ...progress[w0.slug], stage: 3 };
  const subjectStateRecord = makeSubjectStateRecord({
    progress,
    guardian: {
      [w0.slug]: { reviewLevel: 0, lastReviewedDay: TODAY - 3, nextDueDay: TODAY - 1, correctStreak: 0, lapses: 2, renewals: 0, wobbling: true },
      [w1.slug]: { reviewLevel: 2, lastReviewedDay: TODAY - 2, nextDueDay: TODAY, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
    },
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: U4_NOW_MS });
  assert.equal(state.guardianDueCount, 1, 'stage-3 record excluded; only w1 remains');
  assert.equal(state.wobblingCount, 0, 'stage-3 record excluded from wobbling count');
});
