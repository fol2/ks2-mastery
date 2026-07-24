// Free-tier CPU: every spelling command was re-normalising the full published
// snapshot (~1480 words) inside resolveLearnerVisibleSpellingSnapshot, even when
// the isolate content cache returned the same snapshot object. Prod Nelson
// wrong→correct stayed at CF cpuTime p50≈16–18ms after catalogue + working-set
// cuts; this visibility pass alone is several ms of Worker CPU per request.

import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

import { resolveLearnerVisibleSpellingSnapshot } from '../src/subjects/spelling/content/model.js';

function loadPublishedSnapshot() {
  const buf = readFileSync('dist/worker/content/spelling-published-snapshot-E6KEEB35.bin');
  return JSON.parse(gunzipSync(buf).toString('utf8'));
}

function countingWordsSnapshot(raw) {
  let wordIterations = 0;
  const words = new Proxy(raw.words, {
    get(target, property, receiver) {
      if (property === Symbol.iterator) {
        return function* iterate() {
          for (const word of target) {
            wordIterations += 1;
            yield word;
          }
        };
      }
      if (property === 'length') return target.length;
      if (property === 'map' || property === 'filter' || property === 'forEach' || property === 'entries') {
        return (...args) => {
          wordIterations += target.length;
          return Reflect.apply(target[property], target, args);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    snapshot: { ...raw, words },
    get wordIterations() { return wordIterations; },
    reset() { wordIterations = 0; },
  };
}

test('resolveLearnerVisibleSpellingSnapshot reuses isolate-cached snapshot without rewalking words', () => {
  const raw = loadPublishedSnapshot();
  const counted = countingWordsSnapshot(raw);
  const now = Date.UTC(2026, 6, 24);

  const first = resolveLearnerVisibleSpellingSnapshot(counted.snapshot, { now, env: {} });
  assert.ok(first.words.length > 1000, 'expected the published catalogue to remain visible');
  const firstIterations = counted.wordIterations;
  assert.ok(firstIterations >= raw.words.length, 'first resolve must walk the catalogue once');

  counted.reset();
  const second = resolveLearnerVisibleSpellingSnapshot(counted.snapshot, { now: now + 1_000, env: {} });
  assert.equal(second.words.length, first.words.length);
  assert.equal(
    counted.wordIterations,
    0,
    `cached resolve must not rewalk words; saw ${counted.wordIterations} iterations`,
  );
  assert.equal(second, first, 'cached resolve should return the same visible snapshot object');
});

test('scheduled pool visibility cache invalidates when the schedule elapses', () => {
  const now = Date.UTC(2026, 6, 24);
  const snapshot = {
    generatedAt: now,
    pools: [
      {
        id: 'core',
        active: true,
        visibility: { state: 'scheduled', scheduledAt: now + 30_000 },
      },
    ],
    rewardTracks: [],
    words: [
      {
        slug: 'possess',
        word: 'possess',
        year: '3-4',
        spellingPool: 'core',
        sentences: ['I possess a book.'],
      },
    ],
  };

  const before = resolveLearnerVisibleSpellingSnapshot(snapshot, { now, env: {} });
  assert.equal(before.words.length, 0, 'scheduled pool must stay hidden before scheduledAt');

  const after = resolveLearnerVisibleSpellingSnapshot(snapshot, { now: now + 60_000, env: {} });
  assert.equal(after.words.length, 1, 'scheduled pool must become visible after scheduledAt');
  assert.notEqual(after, before);
});
