// Contract tests for `__setDefaultSpellingWordBySlug` and the fallback
// path in `src/subjects/spelling/events.js`. Deliberately does NOT import
// `tests/helpers/seed-spelling-events-default.js` — these tests own the
// seed lifecycle via the setter and assert both seeded and unseeded paths.

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
  // Pin against the real seeded record (not just truthiness) so a future
  // fallback stub returning `{ wordSlug: slug }` cannot pass silently.
  const seeded = WORD_BY_SLUG.possess;
  assert.equal(event.wordSlug, seeded.slug);
  assert.equal(event.word, seeded.word);
  assert.equal(event.family, seeded.family);
  assert.equal(event.yearBand, seeded.year);
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

// Coercion contract — every non-object primitive must collapse to the
// "no-map" state at the setter boundary (factories return null). Object-
// shaped misuse (Arrays, Maps) is covered separately below.
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
