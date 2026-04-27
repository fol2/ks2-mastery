import test from 'node:test';
import assert from 'node:assert/strict';

import {
  stageFor,
  PUNCTUATION_MASTERED_THRESHOLDS,
} from '../src/platform/game/monsters.js';
import {
  createPunctuationMasteryKey,
  PUNCTUATION_RELEASE_ID,
} from '../shared/punctuation/content.js';
import { punctuationSessionSummaryStage } from '../shared/punctuation/service.js';
import {
  progressForPunctuationMonster,
  recordPunctuationRewardUnitMastery,
  punctuationMonsterSummaryFromState,
} from '../src/platform/game/monster-system.js';
import { monsterSummaryFromState } from '../src/platform/game/mastery/spelling.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 1. Count-based stage thresholds — boundary tests
// ---------------------------------------------------------------------------

test('stageFor with PUNCTUATION_MASTERED_THRESHOLDS: 0 mastered -> stage 0', () => {
  assert.equal(stageFor(0, PUNCTUATION_MASTERED_THRESHOLDS), 0);
});

test('stageFor with PUNCTUATION_MASTERED_THRESHOLDS: 1 mastered -> stage 1', () => {
  assert.equal(stageFor(1, PUNCTUATION_MASTERED_THRESHOLDS), 1);
});

test('stageFor with PUNCTUATION_MASTERED_THRESHOLDS: 2 mastered -> stage 2 (Claspin invariant)', () => {
  // Claspin has 2 units. Under the old ratio-based algorithm, 2/2 = 100%
  // would yield stage 4 (Mega). Under count-based thresholds, 2 mastered
  // matches threshold[2] = 2, so stage = 2 — NOT Mega.
  assert.equal(stageFor(2, PUNCTUATION_MASTERED_THRESHOLDS), 2);
});

test('stageFor with PUNCTUATION_MASTERED_THRESHOLDS: 3 mastered -> stage 2', () => {
  assert.equal(stageFor(3, PUNCTUATION_MASTERED_THRESHOLDS), 2);
});

test('stageFor with PUNCTUATION_MASTERED_THRESHOLDS: 4 mastered -> stage 3', () => {
  assert.equal(stageFor(4, PUNCTUATION_MASTERED_THRESHOLDS), 3);
});

test('stageFor with PUNCTUATION_MASTERED_THRESHOLDS: 6 mastered -> stage 3', () => {
  // 6 >= threshold[3] = 4 but < threshold[4] = 14, so stage 3.
  assert.equal(stageFor(6, PUNCTUATION_MASTERED_THRESHOLDS), 3);
});

test('stageFor with PUNCTUATION_MASTERED_THRESHOLDS: 13 mastered -> stage 3', () => {
  assert.equal(stageFor(13, PUNCTUATION_MASTERED_THRESHOLDS), 3);
});

test('stageFor with PUNCTUATION_MASTERED_THRESHOLDS: 14 mastered -> stage 4 (Mega)', () => {
  assert.equal(stageFor(14, PUNCTUATION_MASTERED_THRESHOLDS), 4);
});

test('stageFor with PUNCTUATION_MASTERED_THRESHOLDS: 15 mastered -> stage 4 (above max)', () => {
  assert.equal(stageFor(15, PUNCTUATION_MASTERED_THRESHOLDS), 4);
});

// ---------------------------------------------------------------------------
// 2. progressForPunctuationMonster uses count-based thresholds
// ---------------------------------------------------------------------------

test('progressForPunctuationMonster returns stage 0 for empty state', () => {
  const progress = progressForPunctuationMonster({}, 'claspin', { publishedTotal: 2 });
  assert.equal(progress.stage, 0);
  assert.equal(progress.mastered, 0);
});

test('progressForPunctuationMonster: Claspin 2/2 is stage 2, not Mega', () => {
  const state = {
    claspin: {
      mastered: [
        masteryKey('apostrophe', 'apostrophe-contractions-core'),
        masteryKey('apostrophe', 'apostrophe-possession-core'),
      ],
      caught: true,
      publishedTotal: 2,
    },
  };
  const progress = progressForPunctuationMonster(state, 'claspin', { publishedTotal: 2 });
  assert.equal(progress.mastered, 2);
  assert.equal(progress.stage, 2, 'Claspin 2/2 must be stage 2 under count-based thresholds');
});

test('progressForPunctuationMonster: Quoral 14/14 is stage 4 (Mega)', () => {
  // Build a state with all 14 mastery keys on the quoral grand monster.
  const allKeys = [
    masteryKey('endmarks', 'sentence-endings-core'),
    masteryKey('apostrophe', 'apostrophe-contractions-core'),
    masteryKey('apostrophe', 'apostrophe-possession-core'),
    masteryKey('speech', 'speech-core'),
    masteryKey('comma_flow', 'list-commas-core'),
    masteryKey('comma_flow', 'fronted-adverbials-core'),
    masteryKey('comma_flow', 'comma-clarity-core'),
    masteryKey('structure', 'parenthesis-core'),
    masteryKey('structure', 'colons-core'),
    masteryKey('structure', 'semicolon-lists-core'),
    masteryKey('structure', 'bullet-points-core'),
    masteryKey('boundary', 'semicolons-core'),
    masteryKey('boundary', 'dash-clauses-core'),
    masteryKey('boundary', 'hyphens-core'),
  ];
  const state = {
    quoral: { mastered: allKeys, caught: true, publishedTotal: 14 },
  };
  const progress = progressForPunctuationMonster(state, 'quoral', { publishedTotal: 14 });
  assert.equal(progress.mastered, 14);
  assert.equal(progress.stage, 4, 'Quoral 14/14 must reach stage 4 (Mega)');
});

// ---------------------------------------------------------------------------
// 3. maxStageEver persistence
// ---------------------------------------------------------------------------

test('maxStageEver is written on stage advance', () => {
  const repository = makeRepository();
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-a',
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    masteryKey: masteryKey('endmarks', 'sentence-endings-core'),
    monsterId: 'pealark',
    publishedTotal: 5,
    aggregatePublishedTotal: 14,
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.equal(state.pealark.maxStageEver, 1, 'first mastery should set maxStageEver to 1');
  assert.equal(state.quoral.maxStageEver, 1, 'aggregate should also set maxStageEver to 1');
});

test('maxStageEver does not decrease (defensive)', () => {
  // Simulate a scenario where a monster had maxStageEver = 3 from a previous
  // session and a new mastery key brings the count to a level that would
  // normally compute a lower stage. maxStageEver must not decrease.
  const repository = makeRepository({
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      maxStageEver: 3,
      branch: 'b1',
    },
    quoral: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 14,
      maxStageEver: 3,
      branch: 'b1',
    },
  });

  // Record a second mastery key — brings pealark to 2 mastered = stage 2,
  // which is LESS than maxStageEver 3.
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-a',
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    masteryKey: masteryKey('speech', 'speech-core'),
    monsterId: 'pealark',
    publishedTotal: 5,
    aggregatePublishedTotal: 14,
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.equal(state.pealark.maxStageEver, 3, 'maxStageEver must not decrease below the stored high-water mark');
  assert.equal(state.quoral.maxStageEver, 3, 'aggregate maxStageEver must not decrease below the stored high-water mark');
});

// ---------------------------------------------------------------------------
// 4. Event emission — caught, evolve, mega
// ---------------------------------------------------------------------------

test('recordPunctuationRewardUnitMastery emits caught event on first mastery', () => {
  const repository = makeRepository();
  const events = recordPunctuationRewardUnitMastery({
    learnerId: 'learner-a',
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    masteryKey: masteryKey('endmarks', 'sentence-endings-core'),
    monsterId: 'pealark',
    publishedTotal: 5,
    aggregatePublishedTotal: 14,
    gameStateRepository: repository,
    random: () => 0,
  });

  const caughtEvents = events.filter((e) => e.kind === 'caught');
  assert.equal(caughtEvents.length, 2, 'caught for direct monster + grand aggregate');
  assert.ok(caughtEvents.some((e) => e.monsterId === 'pealark'));
  assert.ok(caughtEvents.some((e) => e.monsterId === 'quoral'));
});

test('recordPunctuationRewardUnitMastery emits evolve on stage advance', () => {
  const repository = makeRepository();

  // First mastery: caught (stage 0 -> 1)
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

  // Second mastery: stage 1 -> 2 should be evolve
  const events = recordPunctuationRewardUnitMastery({
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

  const evolveEvents = events.filter((e) => e.kind === 'evolve');
  assert.ok(evolveEvents.some((e) => e.monsterId === 'claspin'), 'Claspin must evolve at 2 mastered');
});

test('recordPunctuationRewardUnitMastery emits mega when grand reaches stage 4', () => {
  const repository = makeRepository();
  const allUnits = [
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
  ];

  let megaFound = false;
  for (const [clusterId, rewardUnitId, monsterId, publishedTotal] of allUnits) {
    const events = recordPunctuationRewardUnitMastery({
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
    if (events.some((e) => e.kind === 'mega' && e.monsterId === 'quoral')) {
      megaFound = true;
    }
  }

  assert.ok(megaFound, 'Grand aggregate (quoral) must emit mega at 14/14 mastered');
  const quoralProgress = progressForPunctuationMonster(repository.state(), 'quoral', { publishedTotal: 14 });
  assert.equal(quoralProgress.stage, 4);
  assert.equal(repository.state().quoral.maxStageEver, 4, 'maxStageEver must be 4 at Mega');
});

// ---------------------------------------------------------------------------
// 5. Cross-subject aggregator call signature unchanged
// ---------------------------------------------------------------------------

test('monsterSummaryFromState returns Spelling entries and does not throw', () => {
  // Verify the Spelling-side aggregator still works with an empty state.
  // This confirms the cross-subject call signature is unchanged.
  const summary = monsterSummaryFromState({});
  assert.ok(Array.isArray(summary));
  assert.ok(summary.length > 0, 'monsterSummaryFromState must return at least one Spelling entry');
  assert.ok(summary.every((entry) => entry.subjectId === 'spelling'));
});

test('punctuationMonsterSummaryFromState returns consistent results', () => {
  const summary = punctuationMonsterSummaryFromState({});
  assert.ok(Array.isArray(summary));
  assert.equal(summary.length, 4, 'active roster has 4 monsters');
  assert.ok(summary.every((entry) => entry.subjectId === 'punctuation'));
  for (const entry of summary) {
    assert.ok('stage' in entry.progress, 'progress must include stage');
    assert.ok('mastered' in entry.progress, 'progress must include mastered');
    assert.ok('caught' in entry.progress, 'progress must include caught');
  }
});

// ---------------------------------------------------------------------------
// 6. Oracle replay — existing reward tests remain green
//    The 11 tests in punctuation-rewards.test.js exercise the full
//    recordPunctuationRewardUnitMastery pathway. Running `npm test` confirms
//    all 11 pass with the new count-based algorithm.
// ---------------------------------------------------------------------------

test('Claspin 2/2 under count-based thresholds no longer reaches Mega (stage 4)', () => {
  // This is the critical behavioural change: the old ratio-based algorithm
  // would map Claspin 2/2 -> stage 4. The count-based algorithm maps it
  // to stage 2 instead.
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
  const progress = progressForPunctuationMonster(repository.state(), 'claspin', { publishedTotal: 2 });
  assert.equal(progress.stage, 2, 'Claspin 2/2 must be stage 2 (NOT stage 4 / Mega)');
  assert.equal(progress.mastered, 2);
});

// ---------------------------------------------------------------------------
// 7. Parity: punctuationSessionSummaryStage vs stageFor(n, PUNCTUATION_MASTERED_THRESHOLDS)
//    The service helper is an inlined copy of the platform stageFor logic.
//    This test asserts both return identical results for all n in 0..15.
// ---------------------------------------------------------------------------

test('punctuationSessionSummaryStage matches stageFor(n, PUNCTUATION_MASTERED_THRESHOLDS) for n=0..15', () => {
  for (let n = 0; n <= 15; n++) {
    const fromStageFor = stageFor(n, PUNCTUATION_MASTERED_THRESHOLDS);
    const fromSummary = punctuationSessionSummaryStage(n);
    assert.equal(
      fromSummary,
      fromStageFor,
      `Parity mismatch at n=${n}: stageFor returned ${fromStageFor}, punctuationSessionSummaryStage returned ${fromSummary}`,
    );
  }
});
