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
