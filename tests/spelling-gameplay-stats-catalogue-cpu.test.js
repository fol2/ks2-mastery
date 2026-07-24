// Free-tier CPU: catalogue walks on every spelling command must not scan the
// full published word list when the content release is already known.
//
// Prod remeasure (build 6c6f6f4): Nelson wrong→correct CF cpuTime p50≈18ms on
// Free 10ms. One contributor is per-command O(catalogue) fingerprint / Map
// rebuilds over ~1480 words even when only one session slug changed.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  spellingGameplayStatsAreCurrent,
  spellingGameplayStatsWithDueSchedule,
  updateSpellingGameplayStats,
} from '../worker/src/subjects/spelling/gameplay-state.js';

const RELEASE = { releaseId: 'rel-cpu-cut-1', publishedVersion: 7 };
const CATALOGUE_SIZE = 1_480;

function buildCatalogue(size = CATALOGUE_SIZE) {
  return Array.from({ length: size }, (_, index) => ({
    slug: `word-${index}`,
    // Match taxonomy helpers: statutory core uses year '3-4' / '5-6'.
    year: index % 2 === 0 ? '3-4' : '5-6',
    spellingPool: index % 2 === 0 ? 'y3y4' : 'y5y6',
    coverageTier: index % 5 === 0 ? 'secure-extension' : 'core',
  }));
}

function countingCatalogue(words) {
  let iterations = 0;
  const proxy = new Proxy(words, {
    get(target, property, receiver) {
      if (property === Symbol.iterator) {
        return function* iterate() {
          for (const word of target) {
            iterations += 1;
            yield word;
          }
        };
      }
      if (property === 'length') return target.length;
      if (property === 'map' || property === 'filter' || property === 'forEach') {
        return (...args) => {
          iterations += target.length;
          return Reflect.apply(target[property], target, args);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    words: proxy,
    get iterations() {
      return iterations;
    },
    reset() {
      iterations = 0;
    },
  };
}

test('updateSpellingGameplayStats reuses release catalogue without rescanning all words', () => {
  const rawWords = buildCatalogue();
  const counted = countingCatalogue(rawWords);
  const previousData = {
    progress: {
      'word-0': { stage: 0, attempts: 0, correct: 0, wrong: 0, dueDay: 1 },
    },
  };
  const nextData = {
    progress: {
      'word-0': { stage: 0, attempts: 1, correct: 0, wrong: 1, dueDay: 1 },
    },
  };

  const seeded = spellingGameplayStatsWithDueSchedule(
    {},
    rawWords,
    previousData,
    RELEASE,
  );
  assert.equal(typeof seeded.catalogueV1?.fingerprint, 'string');
  const catalogueRef = seeded.catalogueV1;

  counted.reset();
  const updated = updateSpellingGameplayStats(
    seeded,
    counted.words,
    previousData,
    nextData,
    Date.UTC(2026, 0, 2),
    RELEASE,
  );

  assert.equal(updated.catalogueV1?.fingerprint, catalogueRef.fingerprint);
  assert.deepEqual(updated.catalogueV1?.pools, catalogueRef.pools);
  // One changed slug may scan until found, but must not walk the full catalogue
  // for fingerprint / pool totals / Map construction.
  assert.ok(
    counted.iterations < CATALOGUE_SIZE,
    `expected partial catalogue touch, got ${counted.iterations} iterations`,
  );
  assert.ok(
    counted.iterations <= 32,
    `expected tiny session-shaped scan, got ${counted.iterations} iterations`,
  );
});

test('spellingGameplayStatsAreCurrent is O(1) for a release-bound catalogue', () => {
  const rawWords = buildCatalogue();
  const seeded = spellingGameplayStatsWithDueSchedule(
    {},
    rawWords,
    { progress: {} },
    RELEASE,
  );
  const counted = countingCatalogue(rawWords);
  counted.reset();

  assert.equal(
    spellingGameplayStatsAreCurrent(seeded, counted.words, RELEASE),
    true,
  );
  assert.equal(
    counted.iterations,
    0,
    `release-bound currency check must not scan words; scanned ${counted.iterations}`,
  );
});
