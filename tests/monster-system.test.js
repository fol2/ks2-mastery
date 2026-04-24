import test from 'node:test';
import assert from 'node:assert/strict';

import {
  derivePhaeton,
  ensureMonsterBranches,
  monsterIdForSpellingWord,
  monsterSummary,
  monsterSummaryFromSpellingAnalytics,
  progressForMonster,
  recordMonsterMastery,
} from '../src/platform/game/monster-system.js';

function masteredWords(count, prefix = 'word') {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeGameStateRepository(initialState = {}) {
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
    writes() {
      return writes;
    },
  };
}

test('direct spelling monsters evolve at 10, 30, 60 and 100 secure words', () => {
  const cases = [
    [0, 0],
    [9, 0],
    [10, 1],
    [29, 1],
    [30, 2],
    [59, 2],
    [60, 3],
    [90, 3],
    [99, 3],
    [100, 4],
  ];

  for (const [secureWords, expectedStage] of cases) {
    const state = {
      inklet: {
        caught: secureWords > 0,
        mastered: masteredWords(secureWords),
      },
    };

    assert.equal(progressForMonster(state, 'inklet').stage, expectedStage, `${secureWords} secure words`);
  }
});

test('Vellhorn follows the direct spelling monster stage thresholds', () => {
  const state = {
    vellhorn: {
      caught: true,
      mastered: masteredWords(100, 'extra'),
    },
  };

  assert.equal(progressForMonster(state, 'vellhorn').stage, 4);
});

test('direct spelling monsters unlock stage 0 from the first secure word', () => {
  const cases = [
    [0, false, 0],
    [1, true, 0],
    [9, true, 0],
    [10, true, 1],
  ];

  for (const [secureWords, expectedCaught, expectedStage] of cases) {
    const state = {
      inklet: {
        caught: false,
        mastered: masteredWords(secureWords),
      },
    };
    const progress = progressForMonster(state, 'inklet');

    assert.equal(progress.caught, expectedCaught, `${secureWords} secure words caught state`);
    assert.equal(progress.stage, expectedStage, `${secureWords} secure words stage`);
  }
});

test('Phaeton evolves from combined secure spelling words without requiring both pools', () => {
  const cases = [
    [{ inklet: 24, glimmerbug: 0 }, 0],
    [{ inklet: 25, glimmerbug: 0 }, 1],
    [{ inklet: 94, glimmerbug: 0 }, 1],
    [{ inklet: 95, glimmerbug: 0 }, 2],
    [{ inklet: 144, glimmerbug: 0 }, 2],
    [{ inklet: 145, glimmerbug: 0 }, 3],
    [{ inklet: 200, glimmerbug: 0 }, 3],
    [{ inklet: 212, glimmerbug: 0 }, 3],
    [{ inklet: 213, glimmerbug: 0 }, 4],
  ];

  for (const [{ inklet, glimmerbug }, expectedStage] of cases) {
    const state = {
      inklet: { caught: inklet > 0, mastered: masteredWords(inklet, 'inklet') },
      glimmerbug: { caught: glimmerbug > 0, mastered: masteredWords(glimmerbug, 'glimmerbug') },
    };
    const combined = inklet + glimmerbug;

    assert.equal(derivePhaeton(state).stage, expectedStage, `${combined} combined secure words`);
  }
});

test('Phaeton ignores Extra spelling progress from Vellhorn', () => {
  const state = {
    inklet: { caught: true, mastered: masteredWords(24, 'inklet') },
    glimmerbug: { caught: false, mastered: [] },
    vellhorn: { caught: true, mastered: masteredWords(22, 'extra') },
  };

  assert.equal(derivePhaeton(state).mastered, 24);
  assert.equal(derivePhaeton(state).stage, 0);
});

test('Phaeton unlocks stage 0 from three combined secure words', () => {
  const cases = [
    [{ inklet: 0, glimmerbug: 0 }, false, 0],
    [{ inklet: 1, glimmerbug: 0 }, false, 0],
    [{ inklet: 2, glimmerbug: 0 }, false, 0],
    [{ inklet: 3, glimmerbug: 0 }, true, 0],
    [{ inklet: 24, glimmerbug: 0 }, true, 0],
    [{ inklet: 25, glimmerbug: 0 }, true, 1],
  ];

  for (const [{ inklet, glimmerbug }, expectedCaught, expectedStage] of cases) {
    const state = {
      inklet: { caught: false, mastered: masteredWords(inklet, 'inklet') },
      glimmerbug: { caught: false, mastered: masteredWords(glimmerbug, 'glimmerbug') },
    };
    const progress = derivePhaeton(state);
    const combined = inklet + glimmerbug;

    assert.equal(progress.caught, expectedCaught, `${combined} combined secure words caught state`);
    assert.equal(progress.stage, expectedStage, `${combined} combined secure words stage`);
  }
});

test('monster branches are assigned once and preserved for existing learner state', () => {
  const repository = makeGameStateRepository({
    inklet: {
      branch: 'b1',
      caught: true,
      mastered: masteredWords(12),
    },
  });

  const state = ensureMonsterBranches('learner-a', repository, { random: () => 0.75 });

  assert.equal(state.inklet.branch, 'b1');
  assert.equal(state.glimmerbug.branch, 'b2');
  assert.equal(state.phaeton.branch, 'b2');
  assert.equal(state.vellhorn.branch, 'b2');
  assert.equal(progressForMonster(state, 'inklet').branch, 'b1');
  assert.equal(derivePhaeton(state).branch, 'b2');
});

test('spelling monster routing maps Extra words to Vellhorn while preserving core bands', () => {
  assert.equal(monsterIdForSpellingWord({ spellingPool: 'core', yearBand: '3-4' }), 'inklet');
  assert.equal(monsterIdForSpellingWord({ spellingPool: 'core', yearBand: '5-6' }), 'glimmerbug');
  assert.equal(monsterIdForSpellingWord({ spellingPool: 'extra', yearBand: 'extra' }), 'vellhorn');
  assert.equal(monsterIdForSpellingWord({ year: 'extra' }), 'vellhorn');
});

test('recording mastery stores the selected branch on reward events', () => {
  const repository = makeGameStateRepository();
  const events = recordMonsterMastery('learner-a', 'inklet', 'possess', repository, { random: () => 0.75 });
  const state = repository.read('learner-a', 'monster-codex');

  assert.equal(state.inklet.branch, 'b2');
  assert.equal(state.glimmerbug.branch, 'b2');
  assert.equal(state.vellhorn.branch, 'b2');
  assert.equal(state.bracehart, undefined);
  assert.equal(state.pealark, undefined);
  assert.equal(events[0].previous.branch, 'b2');
  assert.equal(events[0].next.branch, 'b2');
});

test('fallback monster summary initialises spelling branches only', () => {
  const repository = makeGameStateRepository();

  const summary = monsterSummary('learner-a', repository);
  const state = repository.read('learner-a', 'monster-codex');

  assert.equal(summary.some((entry) => entry.subjectId === 'grammar'), false);
  assert.equal(summary.some((entry) => entry.subjectId === 'punctuation'), false);
  assert.ok(state.inklet.branch);
  assert.ok(state.glimmerbug.branch);
  assert.ok(state.phaeton.branch);
  assert.ok(state.vellhorn.branch);
  assert.equal(state.bracehart, undefined);
  assert.equal(state.pealark, undefined);
});

test('Extra mastery updates Vellhorn without emitting aggregate Phaeton rewards or duplicate progress', () => {
  const repository = makeGameStateRepository();
  const firstEvents = recordMonsterMastery('learner-a', 'vellhorn', 'mollusc', repository, { random: () => 0.25 });
  const duplicateEvents = recordMonsterMastery('learner-a', 'vellhorn', 'mollusc', repository, { random: () => 0.75 });
  const state = repository.read('learner-a', 'monster-codex');

  assert.equal(firstEvents.length, 1);
  assert.equal(firstEvents[0].monsterId, 'vellhorn');
  assert.equal(firstEvents.some((event) => event.monsterId === 'phaeton'), false);
  assert.deepEqual(duplicateEvents, []);
  assert.deepEqual(state.vellhorn.mastered, ['mollusc']);
  assert.equal(derivePhaeton(state).mastered, 0);
});

test('analytics summaries use persisted monster branches while deriving current progress', () => {
  const repository = makeGameStateRepository({
    inklet: { branch: 'b2' },
    glimmerbug: { branch: 'b1' },
    phaeton: { branch: 'b2' },
    vellhorn: { branch: 'b1' },
  });
  const analytics = {
    wordGroups: [
      {
        words: [
          { slug: 'possess', status: 'secure', year: '3-4' },
          { slug: 'necessary', status: 'secure', year: '5-6' },
          { slug: 'mollusc', status: 'secure', year: 'extra', spellingPool: 'extra' },
        ],
      },
    ],
  };

  const summary = monsterSummaryFromSpellingAnalytics(analytics, {
    learnerId: 'learner-a',
    gameStateRepository: repository,
  });

  assert.equal(summary.find((entry) => entry.monster.id === 'inklet').progress.branch, 'b2');
  assert.equal(summary.find((entry) => entry.monster.id === 'glimmerbug').progress.branch, 'b1');
  assert.equal(summary.find((entry) => entry.monster.id === 'phaeton').progress.branch, 'b2');
  assert.equal(summary.find((entry) => entry.monster.id === 'vellhorn').progress.branch, 'b1');
  assert.equal(summary.find((entry) => entry.monster.id === 'inklet').progress.mastered, 1);
  assert.equal(summary.find((entry) => entry.monster.id === 'vellhorn').progress.mastered, 1);
  assert.equal(summary.find((entry) => entry.monster.id === 'phaeton').progress.mastered, 2);
});

test('analytics summaries can project branches without writing during render', () => {
  const repository = makeGameStateRepository();
  const analytics = {
    wordGroups: [
      { words: [{ slug: 'possess', status: 'secure', year: '3-4' }] },
    ],
  };

  const summary = monsterSummaryFromSpellingAnalytics(analytics, {
    learnerId: 'learner-a',
    gameStateRepository: repository,
    persistBranches: false,
  });

  assert.equal(repository.writes(), 0);
  assert.equal(summary.find((entry) => entry.monster.id === 'inklet').progress.mastered, 1);
  assert.equal(summary.find((entry) => entry.monster.id === 'vellhorn').progress.mastered, 0);
});

test('redacted analytics uses public monster projection state without writing during render', () => {
  const repository = makeGameStateRepository({
    inklet: { masteredCount: 12, caught: true, branch: 'b1' },
    glimmerbug: { masteredCount: 4, caught: true, branch: 'b2' },
    phaeton: { masteredCount: 16, caught: true, branch: 'b1' },
    vellhorn: { masteredCount: 1, caught: true, branch: 'b2' },
  });
  const analytics = {
    wordGroups: [],
    wordBank: { source: 'server-read-model-api' },
  };

  const summary = monsterSummaryFromSpellingAnalytics(analytics, {
    learnerId: 'learner-a',
    gameStateRepository: repository,
    persistBranches: false,
  });

  assert.equal(repository.writes(), 0);
  assert.equal(summary.find((entry) => entry.monster.id === 'inklet').progress.mastered, 12);
  assert.equal(summary.find((entry) => entry.monster.id === 'inklet').progress.stage, 1);
  assert.equal(summary.find((entry) => entry.monster.id === 'glimmerbug').progress.mastered, 4);
  assert.equal(summary.find((entry) => entry.monster.id === 'phaeton').progress.mastered, 16);
  assert.equal(summary.find((entry) => entry.monster.id === 'phaeton').progress.caught, true);
  assert.equal(summary.find((entry) => entry.monster.id === 'vellhorn').progress.branch, 'b2');
});
