import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPunctuationMasteryKey,
  PUNCTUATION_RELEASE_ID,
} from '../shared/punctuation/content.js';
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

function masteryKey(clusterId, rewardUnitId) {
  return createPunctuationMasteryKey({ clusterId, rewardUnitId });
}

const endmarkEvent = Object.freeze({
  id: 'punctuation.unit-secured:learner-a:r1:endmarks',
  type: PUNCTUATION_EVENT_TYPES.UNIT_SECURED,
  subjectId: 'punctuation',
  learnerId: 'learner-a',
  releaseId: PUNCTUATION_RELEASE_ID,
  clusterId: 'endmarks',
  rewardUnitId: 'sentence-endings-core',
  masteryKey: masteryKey('endmarks', 'sentence-endings-core'),
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
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    masteryKey: masteryKey('apostrophe', 'apostrophe-contractions-core'),
    monsterId: 'claspin',
    publishedTotal: 2,
    aggregatePublishedTotal: 10,
    gameStateRepository: repository,
    random: () => 0,
  });
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-a',
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
    masteryKey: masteryKey('apostrophe', 'apostrophe-possession-core'),
    monsterId: 'claspin',
    publishedTotal: 2,
    aggregatePublishedTotal: 10,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.equal(progressForPunctuationMonster(repository.state(), 'claspin', { publishedTotal: 2 }).stage, 4);
});

test('Comma / Flow cluster reaches stage 4 when all published units are secure', () => {
  const repository = makeRepository();
  for (const rewardUnitId of ['list-commas-core', 'fronted-adverbials-core', 'comma-clarity-core']) {
    recordPunctuationRewardUnitMastery({
      learnerId: 'learner-a',
      releaseId: PUNCTUATION_RELEASE_ID,
      clusterId: 'comma_flow',
      rewardUnitId,
      masteryKey: masteryKey('comma_flow', rewardUnitId),
      monsterId: 'curlune',
      publishedTotal: 3,
      aggregatePublishedTotal: 10,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  assert.equal(progressForPunctuationMonster(repository.state(), 'curlune', { publishedTotal: 3 }).stage, 4);
});

test('Boundary cluster reaches stage 4 when all published units are secure', () => {
  const repository = makeRepository();
  for (const rewardUnitId of ['semicolons-core', 'dash-clauses-core', 'hyphens-core']) {
    recordPunctuationRewardUnitMastery({
      learnerId: 'learner-a',
      releaseId: PUNCTUATION_RELEASE_ID,
      clusterId: 'boundary',
      rewardUnitId,
      masteryKey: masteryKey('boundary', rewardUnitId),
      monsterId: 'hyphang',
      publishedTotal: 3,
      aggregatePublishedTotal: 10,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  assert.equal(progressForPunctuationMonster(repository.state(), 'hyphang', { publishedTotal: 3 }).stage, 4);
});

test('published-release aggregate reaches stage 4 only for current published denominator', () => {
  const repository = makeRepository();
  for (const [clusterId, rewardUnitId, monsterId, publishedTotal] of [
    ['endmarks', 'sentence-endings-core', 'pealark', 1],
    ['apostrophe', 'apostrophe-contractions-core', 'claspin', 2],
    ['apostrophe', 'apostrophe-possession-core', 'claspin', 2],
    ['speech', 'speech-core', 'quoral', 1],
    ['comma_flow', 'list-commas-core', 'curlune', 3],
    ['comma_flow', 'fronted-adverbials-core', 'curlune', 3],
    ['comma_flow', 'comma-clarity-core', 'curlune', 3],
    ['boundary', 'semicolons-core', 'hyphang', 3],
    ['boundary', 'dash-clauses-core', 'hyphang', 3],
    ['boundary', 'hyphens-core', 'hyphang', 3],
  ]) {
    recordPunctuationRewardUnitMastery({
      learnerId: 'learner-a',
      releaseId: PUNCTUATION_RELEASE_ID,
      clusterId,
      rewardUnitId,
      masteryKey: masteryKey(clusterId, rewardUnitId),
      monsterId,
      publishedTotal,
      aggregatePublishedTotal: 10,
      gameStateRepository: repository,
      random: () => 0,
    });
  }
  const carillon = progressForPunctuationMonster(repository.state(), 'carillon', { publishedTotal: 10 });
  assert.equal(carillon.mastered, 10);
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
