import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalisePunctuationMonsterState,
  progressForPunctuationMonster,
  reservedPunctuationMonsterEntries,
} from '../src/platform/game/mastery/punctuation.js';
import {
  PUNCTUATION_GRAND_MONSTER_ID,
  PUNCTUATION_RESERVED_MONSTER_IDS,
} from '../src/platform/game/mastery/shared.js';
import { PUNCTUATION_RELEASE_ID, createPunctuationMasteryKey } from '../shared/punctuation/content.js';

function key(clusterId, rewardUnitId) {
  return createPunctuationMasteryKey({ clusterId, rewardUnitId });
}

test('grand monster id is quoral after Phase 2 flip', () => {
  assert.equal(PUNCTUATION_GRAND_MONSTER_ID, 'quoral');
});

test('reserved monster ids expose colisk, hyphang, carillon', () => {
  assert.deepEqual([...PUNCTUATION_RESERVED_MONSTER_IDS], ['colisk', 'hyphang', 'carillon']);
});

test('fresh learner state passes through the normaliser unchanged', () => {
  const view = normalisePunctuationMonsterState({});
  assert.deepEqual(view, {});
});

test('pre-flip carillon mastered keys union into quoral grand view', () => {
  const masteryKeys = [
    key('endmarks', 'sentence-endings-core'),
    key('apostrophe', 'apostrophe-contractions-core'),
  ];
  const state = {
    carillon: {
      mastered: masteryKeys,
      publishedTotal: 14,
      caught: true,
    },
  };
  const view = normalisePunctuationMonsterState(state);
  assert.equal(view.quoral.caught, true);
  assert.deepEqual(view.quoral.mastered.sort(), masteryKeys.sort());
});

test('stored quoral.publishedTotal=1 is overridden to 14 via progressForPunctuationMonster', () => {
  const speechKey = key('speech', 'speech-core');
  const state = {
    quoral: {
      mastered: [speechKey],
      publishedTotal: 1, // Pre-flip value when Quoral was a direct Speech monster.
      caught: true,
    },
  };
  const progress = progressForPunctuationMonster(state, 'quoral', { publishedTotal: 14 });
  assert.equal(progress.publishedTotal, 14, 'grand monster must read the release denominator');
  assert.equal(progress.mastered, 1);
  assert.equal(progress.stage, 1, '1 of 14 should be stage 1, not stage 4');
});

test('mixed state: carillon mastered + quoral speech-core both count in grand view', () => {
  const carillonKeys = [
    key('endmarks', 'sentence-endings-core'),
    key('apostrophe', 'apostrophe-possession-core'),
  ];
  const speechKey = key('speech', 'speech-core');
  const state = {
    carillon: {
      mastered: carillonKeys,
      publishedTotal: 14,
      caught: true,
    },
    quoral: {
      mastered: [speechKey],
      publishedTotal: 1,
      caught: true,
    },
  };
  const view = normalisePunctuationMonsterState(state);
  const combined = new Set(view.quoral.mastered);
  assert.equal(combined.has(speechKey), true);
  assert.equal(combined.has(carillonKeys[0]), true);
  assert.equal(combined.has(carillonKeys[1]), true);
  assert.equal(combined.size, 3, 'union dedupes identical keys');
  const progress = progressForPunctuationMonster(state, 'quoral', { publishedTotal: 14 });
  assert.equal(progress.mastered, 3);
  assert.equal(progress.publishedTotal, 14);
});

test('duplicate keys across carillon and quoral dedupe in the union', () => {
  const sharedKey = key('speech', 'speech-core');
  const state = {
    carillon: {
      mastered: [sharedKey],
      publishedTotal: 14,
      caught: true,
    },
    quoral: {
      mastered: [sharedKey],
      publishedTotal: 1,
      caught: true,
    },
  };
  const view = normalisePunctuationMonsterState(state);
  assert.equal(view.quoral.mastered.length, 1, 'shared key must appear once in union');
});

test('normaliser is referentially transparent — state is not mutated on read', () => {
  const originalCarillon = {
    mastered: [key('endmarks', 'sentence-endings-core')],
    publishedTotal: 14,
    caught: true,
  };
  const state = {
    carillon: originalCarillon,
    quoral: { mastered: [], caught: false },
  };
  const frozenBefore = JSON.stringify(state);
  const view1 = normalisePunctuationMonsterState(state);
  const view2 = normalisePunctuationMonsterState(state);
  const frozenAfter = JSON.stringify(state);
  assert.equal(frozenBefore, frozenAfter, 'input state must not be mutated');
  assert.deepEqual(view1, view2, 'repeated calls must produce equivalent views');
  // Stored entry remains untouched
  assert.deepEqual(state.carillon, originalCarillon);
});

test('normaliser handles malformed mastery keys without throwing', () => {
  const state = {
    carillon: {
      mastered: ['', null, undefined, 0, key('endmarks', 'sentence-endings-core')],
      publishedTotal: 14,
      caught: true,
    },
  };
  const view = normalisePunctuationMonsterState(state);
  // Only the valid string key survives
  assert.equal(view.quoral.mastered.length, 1);
  assert.equal(view.quoral.mastered[0], key('endmarks', 'sentence-endings-core'));
});

test('reserved entries stay readable via reservedPunctuationMonsterEntries', () => {
  const state = {
    colisk: { mastered: ['old-colisk-key'], caught: true, publishedTotal: 4 },
    carillon: { mastered: [], caught: true, publishedTotal: 14 },
  };
  const reserved = reservedPunctuationMonsterEntries(state);
  assert.deepEqual(reserved.colisk.mastered, ['old-colisk-key']);
  assert.equal(reserved.carillon.caught, true);
  assert.equal(reserved.hyphang, null);
});

test('reserved entries are preserved as stored after the normaliser runs', () => {
  const state = {
    colisk: { mastered: ['old-colisk-key'], caught: true, publishedTotal: 4 },
  };
  normalisePunctuationMonsterState(state);
  assert.deepEqual(state.colisk, { mastered: ['old-colisk-key'], caught: true, publishedTotal: 4 });
});

test('post-flip quoral without any pre-flip carillon passes through unchanged', () => {
  const speechKey = key('speech', 'speech-core');
  const state = {
    quoral: {
      mastered: [speechKey],
      publishedTotal: 14,
      caught: true,
      branch: 'b2',
    },
  };
  const view = normalisePunctuationMonsterState(state);
  assert.equal(view.quoral, state.quoral, 'identity preserved when no pre-flip data to union');
});

test('direct monster progress reads normalised carillon evidence via grand view only', () => {
  // A key stored on carillon should appear in the quoral grand view, but
  // should NOT leak into a direct monster (pealark) progress read.
  const endmarkKey = key('endmarks', 'sentence-endings-core');
  const state = {
    carillon: {
      mastered: [endmarkKey],
      publishedTotal: 14,
      caught: true,
    },
  };
  const pealark = progressForPunctuationMonster(state, 'pealark', { publishedTotal: 5 });
  assert.equal(pealark.mastered, 0, 'carillon evidence must not leak into direct monster progress');
  const quoral = progressForPunctuationMonster(state, 'quoral', { publishedTotal: 14 });
  assert.equal(quoral.mastered, 1);
});
