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
