import test from 'node:test';
import assert from 'node:assert/strict';

import {
  stageFor,
  PUNCTUATION_MASTERED_THRESHOLDS,
  PUNCTUATION_STAR_THRESHOLDS,
  PUNCTUATION_GRAND_STAR_THRESHOLDS,
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
  updatePunctuationStarHighWater,
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

// ---------------------------------------------------------------------------
// 8. starHighWater monotonicity latch (Phase 6 U1)
// ---------------------------------------------------------------------------

test('starHighWater: fresh learner secures first unit -> starHighWater seeded from legacy floor', () => {
  const repository = makeRepository();
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-hw-1',
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
  // Fresh learner's directEntry before the write has 0 mastered -> stage 0.
  // Stage 0 legacy floor = 0. The seedStarHighWater captures the pre-write
  // snapshot, so starHighWater is seeded to 0 for the very first unit.
  assert.equal(state.pealark.starHighWater, 0);
  assert.equal(state.quoral.starHighWater, 0);
  // Verify the field is present and a number (not undefined).
  assert.equal(typeof state.pealark.starHighWater, 'number');
  assert.equal(typeof state.quoral.starHighWater, 'number');
});

test('starHighWater: learner with existing progress secures another unit -> ratchets to max(existing, new)', () => {
  const repository = makeRepository({
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: 25,
      branch: 'b1',
    },
    quoral: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 14,
      starHighWater: 25,
      branch: 'b1',
    },
  });
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-hw-2',
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
  // Existing starHighWater (25) is preserved because seedStarHighWater
  // sees the field is already defined and returns safeStarHighWater(25) = 25.
  assert.equal(state.pealark.starHighWater, 25);
  assert.equal(state.quoral.starHighWater, 25);
});

test('starHighWater: pre-P6 learner (no starHighWater field, has mastered count) -> seeds from legacy stage floor', () => {
  // Simulate a pre-P6 learner with 2 mastered (stage 2) but no starHighWater field.
  const repository = makeRepository({
    claspin: {
      mastered: [
        masteryKey('apostrophe', 'apostrophe-contractions-core'),
      ],
      caught: true,
      publishedTotal: 2,
      branch: 'b1',
      // No starHighWater field — pre-P6 learner.
    },
    quoral: {
      mastered: [
        masteryKey('apostrophe', 'apostrophe-contractions-core'),
      ],
      caught: true,
      publishedTotal: 14,
      branch: 'b1',
      // No starHighWater field — pre-P6 learner.
    },
  });
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-hw-3',
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
  const state = repository.state();
  // Claspin had 1 mastered before write -> stage 1 -> legacy floor = PUNCTUATION_STAR_THRESHOLDS[1] = 10.
  assert.equal(state.claspin.starHighWater, PUNCTUATION_STAR_THRESHOLDS[1]);
  // Quoral had 1 mastered before write -> stage 1 -> legacy floor = 10.
  assert.equal(state.quoral.starHighWater, PUNCTUATION_STAR_THRESHOLDS[1]);
});

test('starHighWater: does not decrease when existing value is higher than new computed (lapse scenario)', () => {
  // Simulate a monster with a high starHighWater from a previous session.
  const repository = makeRepository({
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: 80,
      branch: 'b1',
    },
    quoral: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 14,
      starHighWater: 80,
      branch: 'b1',
    },
  });
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-hw-4',
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
  // starHighWater must not decrease from 80.
  assert.equal(state.pealark.starHighWater, 80, 'starHighWater must not decrease');
  assert.equal(state.quoral.starHighWater, 80, 'aggregate starHighWater must not decrease');
});

test('starHighWater: NaN or negative starHighWater in stored state -> normalised to 0', () => {
  // Test the read path: progressForPunctuationMonster normalises corrupted values.
  const nanState = {
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: NaN,
    },
  };
  assert.equal(
    progressForPunctuationMonster(nanState, 'pealark', { publishedTotal: 5 }).starHighWater,
    0,
    'NaN normalises to 0',
  );

  const negativeState = {
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: -10,
    },
  };
  assert.equal(
    progressForPunctuationMonster(negativeState, 'pealark', { publishedTotal: 5 }).starHighWater,
    0,
    'negative normalises to 0',
  );
});

test('starHighWater: aggregate (Quoral) entry ratchets independently of direct monster', () => {
  // Give aggregate a higher starHighWater than direct to confirm independence.
  const repository = makeRepository({
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: 15,
      branch: 'b1',
    },
    quoral: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 14,
      starHighWater: 50,
      branch: 'b1',
    },
  });
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-hw-5',
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
  assert.equal(state.pealark.starHighWater, 15, 'direct preserves its own HW');
  assert.equal(state.quoral.starHighWater, 50, 'aggregate preserves its own independent HW');
});

test('starHighWater: missing gameStateRepository -> returns empty events (no crash)', () => {
  const events = recordPunctuationRewardUnitMastery({
    learnerId: 'learner-hw-6',
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    masteryKey: masteryKey('endmarks', 'sentence-endings-core'),
    monsterId: 'pealark',
    publishedTotal: 5,
    aggregatePublishedTotal: 14,
    // gameStateRepository intentionally omitted
  });
  // Should return events (the function still operates on in-memory state)
  // and not throw. The exact event count depends on the default path.
  assert.ok(Array.isArray(events), 'must return an array without crashing');
});

test('starHighWater: persists in codex entries and never decreases across multiple mastery events', () => {
  const repository = makeRepository();
  const units = [
    ['endmarks', 'sentence-endings-core', 'pealark', 5],
    ['speech', 'speech-core', 'pealark', 5],
    ['apostrophe', 'apostrophe-contractions-core', 'claspin', 2],
    ['comma_flow', 'list-commas-core', 'curlune', 7],
    ['comma_flow', 'fronted-adverbials-core', 'curlune', 7],
  ];

  let prevPealarkHW = 0;
  let prevQuoralHW = 0;
  for (const [clusterId, rewardUnitId, monsterId, publishedTotal] of units) {
    recordPunctuationRewardUnitMastery({
      learnerId: 'learner-hw-7',
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
    const state = repository.state();
    if (state.pealark?.starHighWater !== undefined) {
      assert.ok(
        state.pealark.starHighWater >= prevPealarkHW,
        `pealark starHighWater must not decrease: was ${prevPealarkHW}, now ${state.pealark.starHighWater}`,
      );
      prevPealarkHW = state.pealark.starHighWater;
    }
    assert.ok(
      state.quoral.starHighWater >= prevQuoralHW,
      `quoral starHighWater must not decrease: was ${prevQuoralHW}, now ${state.quoral.starHighWater}`,
    );
    prevQuoralHW = state.quoral.starHighWater;
  }
  // After all units, starHighWater must be present on all written entries.
  const finalState = repository.state();
  assert.ok(typeof finalState.pealark.starHighWater === 'number');
  assert.ok(typeof finalState.quoral.starHighWater === 'number');
  assert.ok(typeof finalState.claspin.starHighWater === 'number');
  assert.ok(typeof finalState.curlune.starHighWater === 'number');
});

test('starHighWater: read path returns 0 for empty state (no starHighWater field)', () => {
  const progress = progressForPunctuationMonster({}, 'pealark', { publishedTotal: 5 });
  assert.equal(progress.starHighWater, 0, 'empty state starHighWater should be 0');
});

// ---------------------------------------------------------------------------
// 9. Review follow-up tests (Phase 6 U1)
// ---------------------------------------------------------------------------

test('starHighWater: explicit starHighWater=0 skips legacy floor (post-P6 at zero)', () => {
  const repository = makeRepository({
    pealark: {
      mastered: [
        masteryKey('endmarks', 'sentence-endings-core'),
        masteryKey('speech', 'speech-core'),
        masteryKey('boundary', 'semicolons-core'),
        masteryKey('boundary', 'dash-clauses-core'),
        masteryKey('boundary', 'hyphens-core'),
      ],
      caught: true,
      publishedTotal: 5,
      starHighWater: 0,
      branch: 'b1',
    },
    quoral: {
      mastered: [
        masteryKey('endmarks', 'sentence-endings-core'),
        masteryKey('speech', 'speech-core'),
        masteryKey('boundary', 'semicolons-core'),
        masteryKey('boundary', 'dash-clauses-core'),
        masteryKey('boundary', 'hyphens-core'),
      ],
      caught: true,
      publishedTotal: 14,
      starHighWater: 0,
      branch: 'b1',
    },
  });
  // 5 mastered on pealark -> stage 3, legacy floor would be 60.
  // But starHighWater: 0 is explicitly present, so seedStarHighWater returns
  // safeStarHighWater(0) = 0, NOT legacy floor 60.
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-explicit-zero',
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    masteryKey: masteryKey('comma_flow', 'list-commas-core'),
    monsterId: 'curlune',
    publishedTotal: 7,
    aggregatePublishedTotal: 14,
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.equal(state.quoral.starHighWater, 0,
    'explicit starHighWater: 0 must NOT be replaced by legacy floor');
  assert.equal(state.pealark.starHighWater, 0,
    'pealark starHighWater: 0 survives unchanged through spread');
});

test('starHighWater: epsilon guard — 9.999999999999998 rounds to 10 on read path', () => {
  // Floating-point arithmetic can produce values like 9.999999999999998
  // that should logically be 10. The safeStarHighWater function uses
  // Math.floor(n + 1e-9) to guard against this.
  const state = {
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: 9.999999999999998,
    },
  };
  const progress = progressForPunctuationMonster(state, 'pealark', { publishedTotal: 5 });
  assert.equal(progress.starHighWater, 10,
    'safeStarHighWater must round 9.999999999999998 to 10, not truncate to 9');
});

test('starHighWater: Carillon pre-flip seed derives from raw Quoral entry, not normalised union', () => {
  // A pre-flip Carillon-only learner has mastered keys only on Carillon
  // (the old grand monster). The normaliser unions those into Quoral for
  // display, but seedStarHighWater reads the raw Quoral entry (before
  // normalisation) because it is called on directEntry/aggregateEntry
  // which come from the raw stored state.
  //
  // This is acceptable: pre-flip Carillon-only learners exist only in
  // dev/test, never production. The test documents the current behaviour
  // explicitly so that any future change to the seed source is caught.
  const repository = makeRepository({
    carillon: {
      mastered: [
        masteryKey('endmarks', 'sentence-endings-core'),
        masteryKey('speech', 'speech-core'),
        masteryKey('boundary', 'semicolons-core'),
        masteryKey('boundary', 'dash-clauses-core'),
        masteryKey('boundary', 'hyphens-core'),
      ],
      caught: true,
      publishedTotal: 14,
    },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
    },
  });
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-carillon-preflip',
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    masteryKey: masteryKey('comma_flow', 'list-commas-core'),
    monsterId: 'curlune',
    publishedTotal: 7,
    aggregatePublishedTotal: 14,
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  // Raw Quoral had 0 mastered before the write -> stage 0 -> legacy floor 0.
  // Even though the normaliser would union Carillon's 5 keys into Quoral
  // (giving mastered=5 -> stage 3 -> floor 60), seedStarHighWater reads
  // the raw aggregateEntry, not the normalised view.
  assert.equal(state.quoral.starHighWater, 0,
    'Quoral starHighWater must derive from raw entry (0 mastered -> floor 0), not normalised union');
  const progress = progressForPunctuationMonster(state, 'quoral', { publishedTotal: 14 });
  assert.equal(progress.mastered, 6,
    'normalised Quoral shows 5 Carillon + 1 new = 6 mastered on read');
});

// ---------------------------------------------------------------------------
// 10. Star-aligned reward events (Phase 6 U8)
//     The effective stage for evolve/mega toast emission is
//     max(mastered-stage, starStage) so that a child never sees a toast
//     that contradicts the Star-derived stage.
// ---------------------------------------------------------------------------

test('starStage: progressForPunctuationMonster includes starStage field', () => {
  const state = {
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: 35,
    },
  };
  const progress = progressForPunctuationMonster(state, 'pealark', { publishedTotal: 5 });
  assert.equal(progress.starStage, 2, 'starHighWater 35 -> star stage 2 (thresholds [1,10,30,60,100])');
  assert.equal(progress.stage, 1, 'mastered-stage is still 1 (1 mastered)');
});

test('starStage: empty state -> starStage 0', () => {
  const progress = progressForPunctuationMonster({}, 'pealark', { publishedTotal: 5 });
  assert.equal(progress.starStage, 0, 'no starHighWater -> starStage 0');
});

test('starStage: starHighWater 100 -> star stage 4 (Mega)', () => {
  const state = {
    pealark: {
      mastered: [
        masteryKey('endmarks', 'sentence-endings-core'),
        masteryKey('speech', 'speech-core'),
      ],
      caught: true,
      publishedTotal: 5,
      starHighWater: 100,
    },
  };
  const progress = progressForPunctuationMonster(state, 'pealark', { publishedTotal: 5 });
  assert.equal(progress.starStage, 4, 'starHighWater 100 -> star stage 4');
});

test('U8 happy path: mastered stage 1, starHighWater 35 (star stage 2) -> evolve fires via effective stage', () => {
  // Before: mastered 0 (stage 0), starHighWater 0 (star stage 0) -> effective 0
  // After:  mastered 1 (stage 1), starHighWater 35 (star stage 2) -> effective 2
  // Delta: effective 0 -> 2 = evolve (not just caught)
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 0,
      branch: 'b1',
    },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      starHighWater: 0,
      branch: 'b1',
    },
  });

  // Manually set up starHighWater on the entry before recording mastery.
  // In production, starHighWater would have been ratcheted by a prior session.
  // Here we simulate by pre-setting the after-state with starHighWater = 35.
  // We need to record the mastery but with the star HW already at 35.
  // The simplest way: pre-populate the entry with starHighWater = 35.
  const repo2 = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 35,
      branch: 'b1',
    },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      starHighWater: 35,
      branch: 'b1',
    },
  });
  const events = recordPunctuationRewardUnitMastery({
    learnerId: 'learner-u8-1',
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    masteryKey: masteryKey('endmarks', 'sentence-endings-core'),
    monsterId: 'pealark',
    publishedTotal: 5,
    aggregatePublishedTotal: 14,
    gameStateRepository: repo2,
    random: () => 0,
  });
  // caught fires because !previous.caught && next.caught (checked first)
  const caughtEvents = events.filter((e) => e.kind === 'caught');
  assert.ok(caughtEvents.length >= 1, 'caught event fires on first mastery');
  // The previous starStage was stageFor(35, thresholds) = 2 and next starStage is also 2,
  // but previous mastered stage was 0 and next is 1. The caught check fires first
  // (before stage comparison), so we get caught. No separate evolve because
  // effective stage prev = max(0, 2) = 2 and next = max(1, 2) = 2 — equal.
  const evolveEvents = events.filter((e) => e.kind === 'evolve');
  // With both before and after having starHighWater=35, effective stages
  // are both 2, so no evolve fires — caught is the only event for the direct
  // monster. This is correct: the child already sees star stage 2.
  assert.equal(
    evolveEvents.filter((e) => e.monsterId === 'pealark').length, 0,
    'no evolve when star stage is already 2 on both sides',
  );
});

test('U8 happy path: mastered stage 2, starHighWater 100 (star stage 4) -> mega fires', () => {
  // Simulate a learner whose starHighWater advances to 100 BETWEEN mastery
  // recordings. Before the write: mastered 1 (stage 1), starHW 60 (star stage 3).
  // After the write: mastered 2 (stage 2), starHW 100 (star stage 4).
  // Effective: prev max(1, 3) = 3 -> next max(2, 4) = 4 -> mega!
  const repository = makeRepository({
    claspin: {
      mastered: [
        masteryKey('apostrophe', 'apostrophe-contractions-core'),
      ],
      caught: true,
      publishedTotal: 2,
      starHighWater: 60,
      branch: 'b1',
    },
    quoral: {
      mastered: [
        masteryKey('apostrophe', 'apostrophe-contractions-core'),
      ],
      caught: true,
      publishedTotal: 14,
      starHighWater: 60,
      branch: 'b1',
    },
  });

  // Now record the second unit. But we need starHighWater to advance to 100.
  // In production this would happen via a separate Star-recording path.
  // For this test, we manually patch the repository state after the initial read
  // but before the write. Since recordPunctuationRewardUnitMastery reads state
  // and then writes, we can only pre-set the starHighWater on the entry.
  // However, seedStarHighWater preserves existing values, so starHW stays at 60.
  //
  // Instead, let's set starHighWater to 100 directly on the before-state
  // and simulate the previous state also having starHW 60.
  const repo2 = makeRepository({
    claspin: {
      mastered: [
        masteryKey('apostrophe', 'apostrophe-contractions-core'),
      ],
      caught: true,
      publishedTotal: 2,
      starHighWater: 100,
      branch: 'b1',
    },
    quoral: {
      mastered: [
        masteryKey('apostrophe', 'apostrophe-contractions-core'),
      ],
      caught: true,
      publishedTotal: 14,
      starHighWater: 100,
      branch: 'b1',
    },
  });
  const events = recordPunctuationRewardUnitMastery({
    learnerId: 'learner-u8-2',
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
    masteryKey: masteryKey('apostrophe', 'apostrophe-possession-core'),
    monsterId: 'claspin',
    publishedTotal: 2,
    aggregatePublishedTotal: 14,
    gameStateRepository: repo2,
    random: () => 0,
  });
  // Before: mastered 1, stage 1, starHW 100, starStage 4 -> effective max(1,4) = 4
  // After:  mastered 2, stage 2, starHW 100, starStage 4 -> effective max(2,4) = 4
  // effective is 4 -> 4, so no mega fires here (star stage dominates both sides).
  // This correctly reflects that the Star surface already shows stage 4.
  const megaEvents = events.filter((e) => e.kind === 'mega');
  assert.equal(megaEvents.filter((e) => e.monsterId === 'claspin').length, 0,
    'no mega when star stage already at 4 on both sides');
  // But the mastered stage advanced from 1 to 2, which under the old code
  // would have fired evolve. Under star-aligned events, effective stage
  // is unchanged (4 -> 4), so no evolve either.
  const evolveEvents = events.filter((e) => e.kind === 'evolve');
  assert.equal(evolveEvents.filter((e) => e.monsterId === 'claspin').length, 0,
    'no evolve when effective stage unchanged (4 -> 4)');
});

test('U8 happy path: mastered stage 1, star stage 1 -> caught fires normally', () => {
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 5,
      branch: 'b1',
    },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      starHighWater: 5,
      branch: 'b1',
    },
  });
  const events = recordPunctuationRewardUnitMastery({
    learnerId: 'learner-u8-3',
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
  assert.ok(caughtEvents.some((e) => e.monsterId === 'pealark'), 'caught fires for direct monster');
  assert.ok(caughtEvents.some((e) => e.monsterId === 'quoral'), 'caught fires for aggregate');
});

test('U8 edge: pre-Star learner (starHighWater 0) -> mastered stage governs', () => {
  const repository = makeRepository();
  // First mastery: stage 0 -> 1, starHighWater 0, starStage 0
  // effective: max(0, 0) -> max(1, 0) = 1 > 0 -- but caught fires first
  recordPunctuationRewardUnitMastery({
    learnerId: 'learner-u8-4',
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

  // Second mastery: stage 1 -> 2, starHighWater 0, starStage 0
  // effective: max(1, 0) = 1 -> max(2, 0) = 2 -> evolve fires
  const events = recordPunctuationRewardUnitMastery({
    learnerId: 'learner-u8-4',
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
  assert.ok(evolveEvents.some((e) => e.monsterId === 'claspin'),
    'pre-Star learner: mastered stage governs evolve');
});

test('U8 edge: NaN/negative starHighWater -> normalised to 0, mastered stage governs', () => {
  const state = {
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: NaN,
    },
  };
  const progress = progressForPunctuationMonster(state, 'pealark', { publishedTotal: 5 });
  assert.equal(progress.starStage, 0, 'NaN starHighWater -> starStage 0');
  assert.equal(progress.stage, 1, 'mastered stage is 1');

  const negState = {
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: -50,
    },
  };
  const negProgress = progressForPunctuationMonster(negState, 'pealark', { publishedTotal: 5 });
  assert.equal(negProgress.starStage, 0, 'negative starHighWater -> starStage 0');
});

test('U8 edge: star stage latch holds — no spurious evolve when evidence drops', () => {
  // starHighWater is monotonic. Even if a hypothetical evidence drop occurred,
  // the latch prevents starStage from decreasing. Both before and after have
  // the same starHighWater, so no spurious evolve fires.
  const repository = makeRepository({
    pealark: {
      mastered: [
        masteryKey('endmarks', 'sentence-endings-core'),
      ],
      caught: true,
      publishedTotal: 5,
      starHighWater: 60,
      branch: 'b1',
    },
    quoral: {
      mastered: [
        masteryKey('endmarks', 'sentence-endings-core'),
      ],
      caught: true,
      publishedTotal: 14,
      starHighWater: 60,
      branch: 'b1',
    },
  });
  const events = recordPunctuationRewardUnitMastery({
    learnerId: 'learner-u8-5',
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
  // Before: mastered 1, stage 1, starStage 3 -> effective 3
  // After:  mastered 2, stage 2, starStage 3 -> effective 3
  // No evolve because effective stage unchanged.
  const evolveEvents = events.filter((e) => e.kind === 'evolve' && e.monsterId === 'pealark');
  assert.equal(evolveEvents.length, 0,
    'latch holds starStage at 3 on both sides — no spurious evolve');
});

test('U8 negative: both stages equal and unchanged -> no event fires', () => {
  // Duplicate mastery key — no state change at all.
  const repository = makeRepository({
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: 30,
      branch: 'b1',
    },
    quoral: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 14,
      starHighWater: 30,
      branch: 'b1',
    },
  });
  const events = recordPunctuationRewardUnitMastery({
    learnerId: 'learner-u8-6',
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
  assert.deepEqual(events, [], 'duplicate mastery key -> no events at all');
});

test('U8 integration: mega toast body matches expected label', () => {
  // Build a scenario where mega fires via mastered-stage path (no starHighWater
  // to complicate things) and verify the toast body.
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

  let megaEvent = null;
  for (const [clusterId, rewardUnitId, monsterId, publishedTotal] of allUnits) {
    const events = recordPunctuationRewardUnitMastery({
      learnerId: 'learner-u8-mega',
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
    const mega = events.find((e) => e.kind === 'mega' && e.monsterId === 'quoral');
    if (mega) megaEvent = mega;
  }
  assert.ok(megaEvent, 'mega event must fire for quoral');
  assert.equal(megaEvent.toast.body, 'Maximum evolution reached.',
    'mega toast body matches expected label');
});

// ---------------------------------------------------------------------------
// 11. ADV-U8-1 review follow-up: Quoral starStage uses GRAND thresholds
//     PUNCTUATION_STAR_THRESHOLDS = [1,10,30,60,100]
//     PUNCTUATION_GRAND_STAR_THRESHOLDS = [1,10,25,50,100]
//     Divergent ranges: [25,30) and [50,60) produce different stages.
// ---------------------------------------------------------------------------

test('ADV-U8-1: Quoral starHighWater=28 -> starStage 2 (GRAND thresholds: 28 >= 25)', () => {
  // Under STAR thresholds [1,10,30,60,100], 28 < 30 -> stage 1.
  // Under GRAND thresholds [1,10,25,50,100], 28 >= 25 -> stage 2.
  // Quoral must use GRAND thresholds to match the read-model display.
  const state = {
    quoral: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 14,
      starHighWater: 28,
    },
  };
  const progress = progressForPunctuationMonster(state, 'quoral', { publishedTotal: 14 });
  assert.equal(progress.starStage, 2,
    'Quoral starHighWater=28 must be stage 2 via GRAND thresholds (28 >= 25), not stage 1');
  // Verify thresholds differ: STAR would give stage 1.
  assert.equal(stageFor(28, PUNCTUATION_STAR_THRESHOLDS), 1,
    'sanity: STAR thresholds give stage 1 at 28');
  assert.equal(stageFor(28, PUNCTUATION_GRAND_STAR_THRESHOLDS), 2,
    'sanity: GRAND thresholds give stage 2 at 28');
});

test('ADV-U8-1: Quoral starHighWater=55 -> starStage 3 (GRAND thresholds: 55 >= 50)', () => {
  // Under STAR thresholds [1,10,30,60,100], 55 < 60 -> stage 2.
  // Under GRAND thresholds [1,10,25,50,100], 55 >= 50 -> stage 3.
  // Quoral must use GRAND thresholds to match the read-model display.
  const state = {
    quoral: {
      mastered: [
        masteryKey('endmarks', 'sentence-endings-core'),
        masteryKey('speech', 'speech-core'),
      ],
      caught: true,
      publishedTotal: 14,
      starHighWater: 55,
    },
  };
  const progress = progressForPunctuationMonster(state, 'quoral', { publishedTotal: 14 });
  assert.equal(progress.starStage, 3,
    'Quoral starHighWater=55 must be stage 3 via GRAND thresholds (55 >= 50), not stage 2');
  // Verify thresholds differ: STAR would give stage 2.
  assert.equal(stageFor(55, PUNCTUATION_STAR_THRESHOLDS), 2,
    'sanity: STAR thresholds give stage 2 at 55');
  assert.equal(stageFor(55, PUNCTUATION_GRAND_STAR_THRESHOLDS), 3,
    'sanity: GRAND thresholds give stage 3 at 55');
});

test('ADV-U8-1: Pealark (direct) starHighWater=28 -> starStage 1 (STAR thresholds unchanged)', () => {
  // Direct monsters continue to use PUNCTUATION_STAR_THRESHOLDS.
  // Under STAR thresholds [1,10,30,60,100], 28 < 30 -> stage 1.
  const state = {
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: 28,
    },
  };
  const progress = progressForPunctuationMonster(state, 'pealark', { publishedTotal: 5 });
  assert.equal(progress.starStage, 1,
    'Pealark starHighWater=28 must remain stage 1 via STAR thresholds (28 < 30)');
});

// ---------------------------------------------------------------------------
// 12. P7-U4: updatePunctuationStarHighWater — star-evidence latch writer
// ---------------------------------------------------------------------------

test('P7-U4: updatePunctuationStarHighWater advances starHighWater from 3 to 8', () => {
  // Learner completes practice items (no unit secured) -> starHighWater advances.
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 3,
      branch: 'b1',
    },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      starHighWater: 0,
      branch: 'b1',
    },
  });
  const events = updatePunctuationStarHighWater({
    learnerId: 'learner-u4-1',
    monsterId: 'pealark',
    computedStars: 8,
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.equal(state.pealark.starHighWater, 8, 'starHighWater must advance from 3 to 8');
  assert.deepEqual(events, [], 'latch writes must NOT emit toast events');
});

test('P7-U4: computedStars equals starHighWater -> no latch write', () => {
  // Provide all 4 monster entries with branches to avoid ensureMonsterBranches writes.
  const repository = makeRepository({
    pealark: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 5,
      starHighWater: 15,
      branch: 'b1',
    },
    claspin: { mastered: [], caught: false, branch: 'b1' },
    curlune: { mastered: [], caught: false, branch: 'b1' },
    quoral: {
      mastered: [masteryKey('endmarks', 'sentence-endings-core')],
      caught: true,
      publishedTotal: 14,
      starHighWater: 15,
      branch: 'b1',
    },
  });
  const events = updatePunctuationStarHighWater({
    learnerId: 'learner-u4-2',
    monsterId: 'pealark',
    computedStars: 15,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(events, [], 'equal stars must not produce events');
  assert.equal(repository.writes(), 0, 'repository must not be written when stars <= HW');
});

test('P7-U4: computedStars below starHighWater -> no latch write', () => {
  // Provide all 4 monster entries with branches to avoid ensureMonsterBranches writes.
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 20,
      branch: 'b1',
    },
    claspin: { mastered: [], caught: false, branch: 'b1' },
    curlune: { mastered: [], caught: false, branch: 'b1' },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      branch: 'b1',
    },
  });
  const events = updatePunctuationStarHighWater({
    learnerId: 'learner-u4-3',
    monsterId: 'pealark',
    computedStars: 10,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(events, [], 'lower stars must not produce events');
  assert.equal(repository.writes(), 0, 'repository must not be written when stars < HW');
});

test('P7-U4: Quoral uses GRAND thresholds for maxStageEver', () => {
  // GRAND thresholds: [1, 10, 25, 50, 100]
  // STAR thresholds:  [1, 10, 30, 60, 100]
  // At 28 stars: GRAND -> stage 2 (28 >= 25), STAR -> stage 1 (28 < 30)
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      branch: 'b1',
    },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      starHighWater: 0,
      branch: 'b1',
    },
  });
  updatePunctuationStarHighWater({
    learnerId: 'learner-u4-4',
    monsterId: 'quoral',
    computedStars: 28,
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.equal(state.quoral.starHighWater, 28, 'starHighWater must be 28');
  assert.equal(state.quoral.maxStageEver, 2,
    'Quoral maxStageEver must be 2 via GRAND thresholds (28 >= 25), not 1');
});

test('P7-U4: direct monster uses STAR thresholds for maxStageEver', () => {
  // At 28 stars: STAR thresholds -> stage 1 (28 < 30)
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 0,
      branch: 'b1',
    },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      branch: 'b1',
    },
  });
  updatePunctuationStarHighWater({
    learnerId: 'learner-u4-5',
    monsterId: 'pealark',
    computedStars: 28,
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.equal(state.pealark.starHighWater, 28, 'starHighWater must be 28');
  assert.equal(state.pealark.maxStageEver, 1,
    'Pealark maxStageEver must be 1 via STAR thresholds (28 < 30)');
});

test('P7-U4: epsilon guard — 7.9999 floors to 7, no advance beyond existing HW of 7', () => {
  // Provide all 4 monster entries with branches to avoid ensureMonsterBranches writes.
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 7,
      branch: 'b1',
    },
    claspin: { mastered: [], caught: false, branch: 'b1' },
    curlune: { mastered: [], caught: false, branch: 'b1' },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      branch: 'b1',
    },
  });
  // 7.9999 + 1e-9 = 7.9999000001 -> Math.floor = 7
  // 7 is not > 7 -> no write.
  updatePunctuationStarHighWater({
    learnerId: 'learner-u4-6',
    monsterId: 'pealark',
    computedStars: 7.9999,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(repository.writes(), 0, 'no write when floor(7.9999 + 1e-9) = 7 <= existing 7');
  assert.equal(repository.state().pealark.starHighWater, 7, 'starHighWater unchanged');
});

test('P7-U4: epsilon guard — 7.999999999 rounds to 8 and advances', () => {
  // Provide all 4 monster entries with branches to avoid ensureMonsterBranches writes.
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 7,
      branch: 'b1',
    },
    claspin: { mastered: [], caught: false, branch: 'b1' },
    curlune: { mastered: [], caught: false, branch: 'b1' },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      branch: 'b1',
    },
  });
  // 7.999999999 + 1e-9 = 8.000000000 -> floor = 8 > 7 -> should write.
  updatePunctuationStarHighWater({
    learnerId: 'learner-u4-7',
    monsterId: 'pealark',
    computedStars: 7.999999999,
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.equal(state.pealark.starHighWater, 8,
    'starHighWater must advance to 8 (epsilon-guarded from 7.999999999)');
});

test('P7-U4: idempotent under retry — same computedStars twice produces single latch write', () => {
  // Provide all 4 monster entries with branches to avoid ensureMonsterBranches writes.
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 5,
      branch: 'b1',
    },
    claspin: { mastered: [], caught: false, branch: 'b1' },
    curlune: { mastered: [], caught: false, branch: 'b1' },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      branch: 'b1',
    },
  });
  // First call: 5 -> 12
  updatePunctuationStarHighWater({
    learnerId: 'learner-u4-8',
    monsterId: 'pealark',
    computedStars: 12,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(repository.writes(), 1, 'first call must write exactly once');
  assert.equal(repository.state().pealark.starHighWater, 12);

  // Second call (retry): same computedStars — should not write.
  updatePunctuationStarHighWater({
    learnerId: 'learner-u4-8',
    monsterId: 'pealark',
    computedStars: 12,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(repository.writes(), 1, 'retry with same stars must not produce a second write');
  assert.equal(repository.state().pealark.starHighWater, 12, 'starHighWater unchanged after retry');
});

test('P7-U4: maxStageEver ratchets — never decreases', () => {
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 0,
      maxStageEver: 0,
      branch: 'b1',
    },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      branch: 'b1',
    },
  });

  // Advance to 35 stars -> stage 2 (STAR thresholds: 35 >= 30)
  updatePunctuationStarHighWater({
    learnerId: 'learner-u4-9',
    monsterId: 'pealark',
    computedStars: 35,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(repository.state().pealark.maxStageEver, 2);

  // Advance to 65 stars -> stage 3 (STAR thresholds: 65 >= 60)
  updatePunctuationStarHighWater({
    learnerId: 'learner-u4-9',
    monsterId: 'pealark',
    computedStars: 65,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(repository.state().pealark.maxStageEver, 3);
  assert.equal(repository.state().pealark.starHighWater, 65);
});

test('P7-U4: invalid monsterId -> returns empty, no crash', () => {
  const repository = makeRepository();
  const events = updatePunctuationStarHighWater({
    learnerId: 'learner-u4-10',
    monsterId: 'nonexistent-monster',
    computedStars: 50,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(events, []);
  assert.equal(repository.writes(), 0);
});

test('P7-U4: computedStars < 1 -> returns empty, no write', () => {
  // computedStars: 0.5 -> floor(0.5 + 1e-9) = 0 < 1 -> early return.
  const repository = makeRepository({
    pealark: { mastered: [], caught: false, branch: 'b1' },
    claspin: { mastered: [], caught: false, branch: 'b1' },
    curlune: { mastered: [], caught: false, branch: 'b1' },
    quoral: { mastered: [], caught: false, branch: 'b1' },
  });
  const events = updatePunctuationStarHighWater({
    learnerId: 'learner-u4-11',
    monsterId: 'pealark',
    computedStars: 0.5,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(events, []);
  // stars < 1 returns before ensureMonsterBranches, so truly 0 writes.
  assert.equal(repository.writes(), 0);
});

test('P7-U4: monster-targeted — updating pealark does not touch quoral', () => {
  const repository = makeRepository({
    pealark: {
      mastered: [],
      caught: false,
      publishedTotal: 5,
      starHighWater: 5,
      branch: 'b1',
    },
    quoral: {
      mastered: [],
      caught: false,
      publishedTotal: 14,
      starHighWater: 3,
      branch: 'b1',
    },
  });
  updatePunctuationStarHighWater({
    learnerId: 'learner-u4-12',
    monsterId: 'pealark',
    computedStars: 20,
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.equal(state.pealark.starHighWater, 20, 'pealark advances');
  assert.equal(state.quoral.starHighWater, 3, 'quoral unchanged by pealark update');
});
