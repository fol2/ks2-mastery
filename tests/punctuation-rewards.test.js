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

  // Under the Phase 2 roster: endmarks -> pealark (direct) + quoral (grand).
  assert.equal(events.some((event) => event.monsterId === 'pealark'), true);
  assert.equal(events.some((event) => event.monsterId === 'quoral'), true);
  assert.deepEqual(state.pealark.mastered, [endmarkEvent.masteryKey]);
  assert.deepEqual(state.quoral.mastered, [endmarkEvent.masteryKey]);

  const duplicate = rewardEventsFromPunctuationEvents([endmarkEvent], {
    gameStateRepository: repository,
    random: () => 0.9,
  });
  assert.deepEqual(duplicate, []);
  assert.equal(repository.state().pealark.mastered.length, 1);
});

test('current release monster progress ignores mastery keys from previous releases', () => {
  const oldReleaseId = 'punctuation-r3-endmarks-apostrophe-speech-comma-flow-boundary';
  const oldMasteryKey = createPunctuationMasteryKey({
    releaseId: oldReleaseId,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
  });
  const repository = makeRepository({
    // Pealark covers endmarks + speech + boundary under the Phase 2 roster.
    // Quoral (grand) covers the full 14-unit release.
    pealark: { mastered: [oldMasteryKey], caught: true, publishedTotal: 5 },
    quoral: { mastered: [oldMasteryKey], caught: true, publishedTotal: 14 },
  });

  assert.equal(progressForPunctuationMonster(repository.state(), 'pealark', { publishedTotal: 5 }).mastered, 0);
  assert.equal(progressForPunctuationMonster(repository.state(), 'quoral', { publishedTotal: 14 }).mastered, 0);

  rewardEventsFromPunctuationEvents([endmarkEvent], {
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  const pealark = progressForPunctuationMonster(state, 'pealark', { publishedTotal: 5 });
  const quoral = progressForPunctuationMonster(state, 'quoral', { publishedTotal: 14 });

  assert.deepEqual(state.pealark.mastered, [oldMasteryKey, endmarkEvent.masteryKey]);
  assert.deepEqual(pealark.masteredList, [endmarkEvent.masteryKey]);
  assert.equal(pealark.mastered, 1);
  assert.equal(quoral.mastered, 1);
});

test('previous release reward events cannot reserve current release mastery keys', () => {
  const oldReleaseId = 'punctuation-r3-endmarks-apostrophe-speech-comma-flow-boundary';
  const oldEvent = {
    ...endmarkEvent,
    id: 'punctuation.unit-secured:learner-a:r2:endmarks',
    releaseId: oldReleaseId,
    masteryKey: createPunctuationMasteryKey({
      releaseId: oldReleaseId,
      clusterId: 'endmarks',
      rewardUnitId: 'sentence-endings-core',
    }),
  };
  const repository = makeRepository();

  assert.deepEqual(rewardEventsFromPunctuationEvents([oldEvent], {
    gameStateRepository: repository,
    random: () => 0,
  }), []);
  assert.deepEqual(repository.state(), {});
  assert.equal(repository.writes(), 0);

  const currentEvents = rewardEventsFromPunctuationEvents([endmarkEvent], {
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(currentEvents.some((event) => event.monsterId === 'pealark'), true);
  assert.deepEqual(repository.state().pealark.mastered, [endmarkEvent.masteryKey]);
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
    aggregatePublishedTotal: 14,
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
    aggregatePublishedTotal: 14,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.equal(progressForPunctuationMonster(repository.state(), 'claspin', { publishedTotal: 2 }).stage, 4);
});

test('Curlune reaches stage 4 when all published comma_flow + structure units are secure', () => {
  // Phase 2 roster: Curlune covers comma_flow (3) + structure (4) = 7 units.
  const repository = makeRepository();
  const curluneUnits = [
    ['comma_flow', 'list-commas-core'],
    ['comma_flow', 'fronted-adverbials-core'],
    ['comma_flow', 'comma-clarity-core'],
    ['structure', 'parenthesis-core'],
    ['structure', 'colons-core'],
    ['structure', 'semicolon-lists-core'],
    ['structure', 'bullet-points-core'],
  ];
  for (const [clusterId, rewardUnitId] of curluneUnits) {
    recordPunctuationRewardUnitMastery({
      learnerId: 'learner-a',
      releaseId: PUNCTUATION_RELEASE_ID,
      clusterId,
      rewardUnitId,
      masteryKey: masteryKey(clusterId, rewardUnitId),
      monsterId: 'curlune',
      publishedTotal: 7,
      aggregatePublishedTotal: 14,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  assert.equal(progressForPunctuationMonster(repository.state(), 'curlune', { publishedTotal: 7 }).stage, 4);
});

test('Pealark reaches stage 4 when all published endmarks + speech + boundary units are secure', () => {
  // Phase 2 roster: Pealark covers endmarks (1) + speech (1) + boundary (3) = 5 units.
  const repository = makeRepository();
  const pealarkUnits = [
    ['endmarks', 'sentence-endings-core'],
    ['speech', 'speech-core'],
    ['boundary', 'semicolons-core'],
    ['boundary', 'dash-clauses-core'],
    ['boundary', 'hyphens-core'],
  ];
  for (const [clusterId, rewardUnitId] of pealarkUnits) {
    recordPunctuationRewardUnitMastery({
      learnerId: 'learner-a',
      releaseId: PUNCTUATION_RELEASE_ID,
      clusterId,
      rewardUnitId,
      masteryKey: masteryKey(clusterId, rewardUnitId),
      monsterId: 'pealark',
      publishedTotal: 5,
      aggregatePublishedTotal: 14,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  assert.equal(progressForPunctuationMonster(repository.state(), 'pealark', { publishedTotal: 5 }).stage, 4);
});

test('published-release aggregate reaches stage 4 only for current published denominator', () => {
  // Phase 2 cluster -> monster remap. Grand aggregate is now Quoral.
  const repository = makeRepository();
  for (const [clusterId, rewardUnitId, monsterId, publishedTotal] of [
    ['endmarks', 'sentence-endings-core', 'pealark', 5],
    ['apostrophe', 'apostrophe-contractions-core', 'claspin', 2],
    ['apostrophe', 'apostrophe-possession-core', 'claspin', 2],
    ['speech', 'speech-core', 'pealark', 5],
    ['comma_flow', 'list-commas-core', 'curlune', 7],
    ['comma_flow', 'fronted-adverbials-core', 'curlune', 7],
    ['comma_flow', 'comma-clarity-core', 'curlune', 7],
    ['structure', 'parenthesis-core', 'curlune', 7],
    ['structure', 'colons-core', 'curlune', 7],
    ['structure', 'semicolon-lists-core', 'curlune', 7],
    ['structure', 'bullet-points-core', 'curlune', 7],
    ['boundary', 'semicolons-core', 'pealark', 5],
    ['boundary', 'dash-clauses-core', 'pealark', 5],
    ['boundary', 'hyphens-core', 'pealark', 5],
  ]) {
    recordPunctuationRewardUnitMastery({
      learnerId: 'learner-a',
      releaseId: PUNCTUATION_RELEASE_ID,
      clusterId,
      rewardUnitId,
      masteryKey: masteryKey(clusterId, rewardUnitId),
      monsterId,
      publishedTotal,
      aggregatePublishedTotal: 14,
      gameStateRepository: repository,
      random: () => 0,
    });
  }
  const quoral = progressForPunctuationMonster(repository.state(), 'quoral', { publishedTotal: 14 });
  assert.equal(quoral.mastered, 14);
  assert.equal(quoral.stage, 4);
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

// --------------- U7: projection-layer dedupe across roster flip -----------

import {
  combineCommandEvents,
  terminalRewardToken,
} from '../worker/src/projections/events.js';

test('terminalRewardToken uses (learnerId, monsterId, kind, releaseId)', () => {
  const token = terminalRewardToken({
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    monsterId: 'quoral',
    releaseId: 'punctuation-r4-full-14-skill-structure',
  });
  assert.equal(token, 'reward.monster.terminal:learner-a:quoral:caught:punctuation-r4-full-14-skill-structure');
});

test('terminalRewardToken returns null for non-terminal transitions', () => {
  assert.equal(terminalRewardToken({ type: 'reward.monster', kind: 'levelup', learnerId: 'a', monsterId: 'quoral' }), null);
  assert.equal(terminalRewardToken({ type: 'reward.monster', kind: 'evolve', learnerId: 'a', monsterId: 'quoral' }), null);
  assert.equal(terminalRewardToken({ type: 'punctuation.unit-secured', learnerId: 'a' }), null);
  assert.equal(terminalRewardToken(null), null);
});

test('cross-flip caught events dedupe to one terminal transition per (learner, monster, release)', () => {
  // Simulate pre-flip + post-flip caught events for the same learner and
  // monster within the same release. The id-based dedupe keeps both (the
  // cluster segment differs), but the terminal token collapses them.
  const preFlip = {
    id: 'reward.monster:learner-a:punctuation:r4:speech:speech-core:quoral:caught',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    monsterId: 'quoral',
    releaseId: 'punctuation-r4-full-14-skill-structure',
    clusterId: 'speech',
  };
  const postFlip = {
    id: 'reward.monster:learner-a:punctuation:r4:published_release:speech-core:quoral:caught',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    monsterId: 'quoral',
    releaseId: 'punctuation-r4-full-14-skill-structure',
    clusterId: 'published_release',
  };
  // Case A: pre-flip is already persisted; post-flip arrives fresh.
  const combined = combineCommandEvents({
    domainEvents: [postFlip],
    existingEvents: [preFlip],
  });
  assert.equal(combined.events.length, 0, 'post-flip duplicate collapses against existing pre-flip row');

  // Case B: both arrive together as new events.
  const fresh = combineCommandEvents({
    domainEvents: [preFlip, postFlip],
  });
  assert.equal(fresh.events.length, 1, 'batch of pre + post emits only one terminal');
  assert.equal(fresh.events[0].clusterId, 'speech', 'first-in-wins (pre-flip id retained)');
});

test('cross-release caught events remain distinct — future release re-emits', () => {
  const r4 = {
    id: 'reward.monster:learner-a:punctuation:r4:published_release:speech-core:quoral:caught',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    monsterId: 'quoral',
    releaseId: 'punctuation-r4-full-14-skill-structure',
  };
  const r5 = {
    ...r4,
    id: 'reward.monster:learner-a:punctuation:r5:published_release:speech-core:quoral:caught',
    releaseId: 'punctuation-r5-future',
  };
  const combined = combineCommandEvents({
    domainEvents: [r5],
    existingEvents: [r4],
  });
  assert.equal(combined.events.length, 1, 'new release must still emit a terminal transition');
  assert.equal(combined.events[0].releaseId, 'punctuation-r5-future');
});

test('mega across flip also dedupes by terminal token', () => {
  const preFlipMega = {
    id: 'reward.monster:learner-a:punctuation:r4:speech:speech-core:quoral:mega',
    type: 'reward.monster',
    kind: 'mega',
    learnerId: 'learner-a',
    monsterId: 'quoral',
    releaseId: 'punctuation-r4-full-14-skill-structure',
  };
  const postFlipMega = {
    ...preFlipMega,
    id: 'reward.monster:learner-a:punctuation:r4:published_release:bullet-points-core:quoral:mega',
  };
  const combined = combineCommandEvents({
    domainEvents: [postFlipMega],
    existingEvents: [preFlipMega],
  });
  assert.equal(combined.events.length, 0, 'mega dedupes by (learner, monster, kind, release)');
});

test('caught and mega coexist for the same (learner, monster, release)', () => {
  // Terminal dedupe keys on `kind`, so caught and mega with identical
  // (learner, monster, release) must both survive — they are separate
  // milestones a learner is entitled to celebrate.
  const caught = {
    id: 'reward.monster:learner-a:punctuation:r4:speech:speech-core:quoral:caught',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    monsterId: 'quoral',
    releaseId: 'punctuation-r4-full-14-skill-structure',
  };
  const mega = {
    ...caught,
    id: 'reward.monster:learner-a:punctuation:r4:published_release:bullet-points-core:quoral:mega',
    kind: 'mega',
  };
  const combined = combineCommandEvents({ domainEvents: [caught, mega] });
  assert.equal(combined.events.length, 2, 'caught and mega are distinct milestones');
  assert.deepEqual(combined.events.map((event) => event.kind).sort(), ['caught', 'mega']);
});

test('levelup and evolve are unaffected by terminal dedupe', () => {
  const existing = {
    id: 'reward.monster:learner-a:punctuation:r4:speech:speech-core:quoral:levelup',
    type: 'reward.monster',
    kind: 'levelup',
    learnerId: 'learner-a',
    monsterId: 'quoral',
    releaseId: 'punctuation-r4-full-14-skill-structure',
  };
  const next = {
    ...existing,
    id: 'reward.monster:learner-a:punctuation:r4:published_release:speech-core:quoral:levelup',
  };
  const combined = combineCommandEvents({
    domainEvents: [next],
    existingEvents: [existing],
  });
  // levelup / evolve are id-deduped only (different ids -> both survive).
  // This is deliberate: only caught / mega represent terminal milestones.
  assert.equal(combined.events.length, 1);
});
