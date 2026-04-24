import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_EVENT_TYPES } from '../shared/punctuation/events.js';
import { rewardEventsFromPunctuationEvents } from '../src/subjects/punctuation/event-hooks.js';
import {
  progressForPunctuationMonster,
  recordPunctuationRewardUnitMastery,
} from '../src/platform/game/monster-system.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRepository(initialState = {}) {
  let state = clone(initialState);
  let writes = 0;
  return {
    read() {
      return clone(state);
    },
    write(_learnerId, _systemId, nextState) {
      writes += 1;
      state = clone(nextState);
      return clone(state);
    },
    state() {
      return clone(state);
    },
    writes() {
      return writes;
    },
  };
}

const endmarkEvent = Object.freeze({
  id: 'punctuation.unit-secured:learner-a:r1:endmarks',
  type: PUNCTUATION_EVENT_TYPES.UNIT_SECURED,
  subjectId: 'punctuation',
  learnerId: 'learner-a',
  releaseId: 'punctuation-r1-endmarks-apostrophe-speech',
  clusterId: 'endmarks',
  rewardUnitId: 'sentence-endings-core',
  masteryKey: 'punctuation:punctuation-r1-endmarks-apostrophe-speech:endmarks:sentence-endings-core',
  createdAt: 1,
});

test('first secure Punctuation unit records a cluster monster and the grand aggregate once', () => {
  const repository = makeRepository();
  const events = rewardEventsFromPunctuationEvents([endmarkEvent], {
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();

  assert.equal(events.some((event) => event.monsterId === 'pealark'), true);
  assert.equal(events.some((event) => event.monsterId === 'carillon'), true);
  assert.deepEqual(state.pealark.mastered, [endmarkEvent.masteryKey]);
  assert.deepEqual(state.carillon.mastered, [endmarkEvent.masteryKey]);

  const duplicate = rewardEventsFromPunctuationEvents([endmarkEvent], {
    gameStateRepository: repository,
    random: () => 0.9,
  });
  assert.deepEqual(duplicate, []);
  assert.equal(repository.state().pealark.mastered.length, 1);
});

test('Apostrophe cluster reaches stage 4 when all published units are secure', () => {
  const repository = makeRepository();
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-a',
    releaseId: 'punctuation-r1-endmarks-apostrophe-speech',
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    masteryKey: 'punctuation:punctuation-r1-endmarks-apostrophe-speech:apostrophe:apostrophe-contractions-core',
    monsterId: 'claspin',
    publishedTotal: 2,
    aggregatePublishedTotal: 4,
    gameStateRepository: repository,
    random: () => 0,
  });
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-a',
    releaseId: 'punctuation-r1-endmarks-apostrophe-speech',
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
    masteryKey: 'punctuation:punctuation-r1-endmarks-apostrophe-speech:apostrophe:apostrophe-possession-core',
    monsterId: 'claspin',
    publishedTotal: 2,
    aggregatePublishedTotal: 4,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.equal(progressForPunctuationMonster(repository.state(), 'claspin', { publishedTotal: 2 }).stage, 4);
});

test('published-release aggregate reaches stage 4 only for current published denominator', () => {
  const repository = makeRepository();
  for (const [clusterId, rewardUnitId, monsterId, publishedTotal] of [
    ['endmarks', 'sentence-endings-core', 'pealark', 1],
    ['apostrophe', 'apostrophe-contractions-core', 'claspin', 2],
    ['apostrophe', 'apostrophe-possession-core', 'claspin', 2],
    ['speech', 'speech-core', 'quoral', 1],
  ]) {
    recordPunctuationRewardUnitMastery({
      learnerId: 'learner-a',
      releaseId: 'punctuation-r1-endmarks-apostrophe-speech',
      clusterId,
      rewardUnitId,
      masteryKey: `punctuation:punctuation-r1-endmarks-apostrophe-speech:${clusterId}:${rewardUnitId}`,
      monsterId,
      publishedTotal,
      aggregatePublishedTotal: 4,
      gameStateRepository: repository,
      random: () => 0,
    });
  }
  const carillon = progressForPunctuationMonster(repository.state(), 'carillon', { publishedTotal: 4 });
  assert.equal(carillon.mastered, 4);
  assert.equal(carillon.stage, 4);
});

test('generated-template expansion does not change release-scoped mastery keys', () => {
  const repository = makeRepository();
  const first = rewardEventsFromPunctuationEvents([endmarkEvent], {
    gameStateRepository: repository,
    random: () => 0,
  });
  const generatedFamilyDuplicate = {
    ...endmarkEvent,
    id: 'punctuation.unit-secured:learner-a:r1:endmarks:generated-family',
    itemId: 'generated-sentence-ending-99',
    generatorFamilyId: 'gen_sentence_endings_insert',
  };
  const second = rewardEventsFromPunctuationEvents([generatedFamilyDuplicate], {
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.ok(first.length >= 1);
  assert.deepEqual(second, []);
});
