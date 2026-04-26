// Contract tests for `src/subjects/spelling/events.js` factories and the
// `__setDefaultSpellingWordBySlug` test-only setter introduced in the
// 2026-04-26 hotfix that decoupled events.js from the content dataset.
//
// Deliberately does NOT import `tests/helpers/seed-spelling-events-default.js`
// — these tests own the seed lifecycle via the setter and assert both the
// seeded and unseeded paths. Node's `--test` runs each test file in its own
// subprocess, so the setter's module-scoped state is scoped to this file
// and cannot leak into other test files.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __setDefaultSpellingWordBySlug,
  createSpellingGuardianRenewedEvent,
  createSpellingWordSecuredEvent,
} from '../src/subjects/spelling/events.js';
import { WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';

const SESSION = Object.freeze({ id: 'session-1', mode: 'guardian', type: 'learning', uniqueWords: ['possess'] });

// Every test resets the seed explicitly so the file's test order does not
// affect the outcome and a future append can reorder freely.
function resetSeed() {
  __setDefaultSpellingWordBySlug(null);
}

test('no seed + no explicit wordMeta: factory returns null for a known slug', () => {
  resetSeed();
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'a', session: SESSION, slug: 'possess', reviewLevel: 1, createdAt: 1,
  });
  assert.equal(event, null);
});

test('explicit wordMeta wins over the seeded default', () => {
  // Seed a stub that maps "possess" to a fake family, then pass an explicit
  // map with the real family for the same slug. The event must carry the
  // explicit map's values — proving callers can override the seed.
  __setDefaultSpellingWordBySlug({ possess: { slug: 'possess', word: 'possess', family: 'STUB', year: '5-6', spellingPool: 'core' } });
  const explicit = { possess: { slug: 'possess', word: 'possess', family: 'REAL', year: '5-6', spellingPool: 'core' } };
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'a', session: SESSION, slug: 'possess', reviewLevel: 1, createdAt: 1, wordMeta: explicit,
  });
  assert.equal(event.family, 'REAL');
  resetSeed();
});

test('seeded default is used when no explicit wordMeta is passed', () => {
  __setDefaultSpellingWordBySlug(WORD_BY_SLUG);
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'a', session: SESSION, slug: 'possess', reviewLevel: 1, createdAt: 1,
  });
  assert.ok(event);
  assert.equal(event.wordSlug, 'possess');
  resetSeed();
});

test('__setDefaultSpellingWordBySlug(null) clears the seed', () => {
  __setDefaultSpellingWordBySlug(WORD_BY_SLUG);
  __setDefaultSpellingWordBySlug(null);
  const event = createSpellingWordSecuredEvent({
    learnerId: 'a', session: SESSION, slug: 'possess', stage: 4, createdAt: 1,
  });
  assert.equal(event, null);
});

// Coercion contract — every non-plain-object input must collapse to the
// "no-map" state (factories return null). This prevents a future refactor
// that "helpfully" accepts Maps/arrays from silently changing behaviour.
const NON_OBJECT_INPUTS = [
  ['undefined', undefined],
  ['string', 'not-a-map'],
  ['number', 42],
  ['true', true],
  ['false', false],
];

for (const [label, value] of NON_OBJECT_INPUTS) {
  test(`__setDefaultSpellingWordBySlug coerces ${label} to the no-map state`, () => {
    __setDefaultSpellingWordBySlug(WORD_BY_SLUG);
    __setDefaultSpellingWordBySlug(value);
    const event = createSpellingGuardianRenewedEvent({
      learnerId: 'a', session: SESSION, slug: 'possess', reviewLevel: 1, createdAt: 1,
    });
    assert.equal(event, null);
    resetSeed();
  });
}

// Arrays and Maps DO pass `typeof === 'object'`, so they are retained by
// the setter. The factory's `map[slug]` lookup then returns undefined
// (Arrays: numeric-only indexing; Maps: must use `.get()`), and the
// factory collapses to `null`. Documents the edge-case: test code that
// misuses these shapes fails closed, not silently with wrong data.
test('array input passes the setter but factory still returns null (fail-closed)', () => {
  __setDefaultSpellingWordBySlug([]);
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'a', session: SESSION, slug: 'possess', reviewLevel: 1, createdAt: 1,
  });
  assert.equal(event, null);
  resetSeed();
});

test('Map instance passes the setter but factory still returns null (fail-closed)', () => {
  const map = new Map();
  map.set('possess', { slug: 'possess', word: 'possess', family: 'x', year: '5-6', spellingPool: 'core' });
  __setDefaultSpellingWordBySlug(map);
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'a', session: SESSION, slug: 'possess', reviewLevel: 1, createdAt: 1,
  });
  assert.equal(event, null);
  resetSeed();
});
