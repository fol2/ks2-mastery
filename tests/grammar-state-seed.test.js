// U7 — Unit tests for Grammar state-seeding infrastructure.
//
// Verifies that each seed factory returns a frozen object with the correct
// shape and expected field values. These are pure data tests with zero
// Playwright dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  seedFreshLearner,
  seedEggState,
  seedPreHatch,
  seedPreGrowing,
  seedPreNearlyMega,
  seedPreMega,
  seedConcordium17of18,
  seedWeakDueConcepts,
  seedWritingTryEvidence,
  validateSeedShape,
} from './helpers/grammar-state-seed.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_SEEDS = [
  ['seedFreshLearner', seedFreshLearner],
  ['seedEggState', seedEggState],
  ['seedPreHatch', seedPreHatch],
  ['seedPreGrowing', seedPreGrowing],
  ['seedPreNearlyMega', seedPreNearlyMega],
  ['seedPreMega', seedPreMega],
  ['seedConcordium17of18', seedConcordium17of18],
  ['seedWeakDueConcepts', seedWeakDueConcepts],
  ['seedWritingTryEvidence', seedWritingTryEvidence],
];

const MONSTER_IDS = ['bracehart', 'chronalyx', 'couronnail', 'concordium'];

// ---------------------------------------------------------------------------
// Structural tests — apply to every seed
// ---------------------------------------------------------------------------

for (const [name, factory] of ALL_SEEDS) {
  test(`${name} — returns a frozen object`, () => {
    const seed = factory();
    assert.ok(Object.isFrozen(seed), 'top-level seed must be frozen');
    assert.ok(Object.isFrozen(seed.rewardState), 'rewardState must be frozen');
    assert.ok(Object.isFrozen(seed.analytics), 'analytics must be frozen');
  });

  test(`${name} — has rewardState and analytics keys`, () => {
    const seed = factory();
    assert.ok('rewardState' in seed, 'missing rewardState');
    assert.ok('analytics' in seed, 'missing analytics');
  });

  test(`${name} — validateSeedShape passes`, () => {
    const seed = factory();
    assert.doesNotThrow(() => validateSeedShape(seed));
    assert.equal(validateSeedShape(seed), true);
  });

  test(`${name} — all four monsters present in rewardState`, () => {
    const seed = factory();
    for (const mid of MONSTER_IDS) {
      assert.ok(mid in seed.rewardState, `missing monster ${mid}`);
    }
  });

  test(`${name} — analytics.concepts is a non-empty array`, () => {
    const seed = factory();
    assert.ok(Array.isArray(seed.analytics.concepts));
    assert.ok(seed.analytics.concepts.length > 0, 'concepts must not be empty');
  });

  test(`${name} — analytics.progressSnapshot has all monsters`, () => {
    const seed = factory();
    for (const mid of MONSTER_IDS) {
      assert.ok(mid in seed.analytics.progressSnapshot, `missing snapshot for ${mid}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Seed-specific value assertions
// ---------------------------------------------------------------------------

test('seedFreshLearner — starHighWater is 0 for all monsters', () => {
  const seed = seedFreshLearner();
  for (const mid of MONSTER_IDS) {
    assert.equal(
      seed.rewardState[mid].starHighWater,
      0,
      `${mid}.starHighWater must be 0`,
    );
  }
});

test('seedFreshLearner — caught is false for all monsters', () => {
  const seed = seedFreshLearner();
  for (const mid of MONSTER_IDS) {
    assert.equal(seed.rewardState[mid].caught, false, `${mid}.caught must be false`);
  }
});

test('seedFreshLearner — mastered is empty for all monsters', () => {
  const seed = seedFreshLearner();
  for (const mid of MONSTER_IDS) {
    assert.equal(seed.rewardState[mid].mastered.length, 0, `${mid}.mastered must be empty`);
  }
});

test('seedEggState — bracehart.starHighWater is 1 and caught is true', () => {
  const seed = seedEggState();
  assert.equal(seed.rewardState.bracehart.starHighWater, 1);
  assert.equal(seed.rewardState.bracehart.caught, true);
});

test('seedEggState — other monsters remain at 0', () => {
  const seed = seedEggState();
  for (const mid of ['chronalyx', 'couronnail', 'concordium']) {
    assert.equal(seed.rewardState[mid].starHighWater, 0, `${mid}.starHighWater must be 0`);
    assert.equal(seed.rewardState[mid].caught, false, `${mid}.caught must be false`);
  }
});

test('seedPreHatch — bracehart.starHighWater is 14', () => {
  const seed = seedPreHatch();
  assert.equal(seed.rewardState.bracehart.starHighWater, 14);
  assert.equal(seed.rewardState.bracehart.caught, true);
});

test('seedPreGrowing — bracehart.starHighWater is 34', () => {
  const seed = seedPreGrowing();
  assert.equal(seed.rewardState.bracehart.starHighWater, 34);
});

test('seedPreNearlyMega — bracehart.starHighWater is 64', () => {
  const seed = seedPreNearlyMega();
  assert.equal(seed.rewardState.bracehart.starHighWater, 64);
});

test('seedPreMega — bracehart.starHighWater is 99', () => {
  const seed = seedPreMega();
  assert.equal(seed.rewardState.bracehart.starHighWater, 99);
  assert.equal(seed.rewardState.bracehart.caught, true);
  // All 6 bracehart concepts should be mastered.
  assert.equal(seed.rewardState.bracehart.mastered.length, 6);
});

test('seedConcordium17of18 — concordium has 17 mastered entries', () => {
  const seed = seedConcordium17of18();
  assert.equal(seed.rewardState.concordium.mastered.length, 17);
  assert.equal(seed.rewardState.concordium.caught, true);
  assert.equal(seed.rewardState.concordium.starHighWater, 94);
});

test('seedConcordium17of18 — direct monsters are proportionally populated', () => {
  const seed = seedConcordium17of18();
  // All direct monsters should be caught (all their concepts are in the first 17).
  assert.equal(seed.rewardState.bracehart.caught, true);
  assert.equal(seed.rewardState.chronalyx.caught, true);
  assert.equal(seed.rewardState.couronnail.caught, true);
});

test('seedWeakDueConcepts — bracehart has low starHighWater with 1 mastered', () => {
  const seed = seedWeakDueConcepts();
  assert.equal(seed.rewardState.bracehart.starHighWater, 3);
  assert.equal(seed.rewardState.bracehart.caught, true);
  assert.equal(seed.rewardState.bracehart.mastered.length, 1);
});

test('seedWritingTryEvidence — has transferLane with prompts and evidence', () => {
  const seed = seedWritingTryEvidence();
  assert.ok(seed.rewardState.transferLane, 'must have transferLane');
  assert.ok(Array.isArray(seed.rewardState.transferLane.prompts), 'must have prompts array');
  assert.ok(Array.isArray(seed.rewardState.transferLane.evidence), 'must have evidence array');
  assert.ok(seed.rewardState.transferLane.prompts.length > 0, 'prompts must not be empty');
  assert.ok(seed.rewardState.transferLane.evidence.length > 0, 'evidence must not be empty');
});

// ---------------------------------------------------------------------------
// validateSeedShape — negative cases
// ---------------------------------------------------------------------------

test('validateSeedShape — rejects null', () => {
  assert.throws(() => validateSeedShape(null), /non-null object/);
});

test('validateSeedShape — rejects missing rewardState', () => {
  assert.throws(() => validateSeedShape({ analytics: {} }), /rewardState/);
});

test('validateSeedShape — rejects missing analytics', () => {
  const partial = {
    rewardState: {
      bracehart: { mastered: [], caught: false, starHighWater: 0, releaseId: 'x' },
      chronalyx: { mastered: [], caught: false, starHighWater: 0, releaseId: 'x' },
      couronnail: { mastered: [], caught: false, starHighWater: 0, releaseId: 'x' },
      concordium: { mastered: [], caught: false, starHighWater: 0, releaseId: 'x' },
    },
  };
  assert.throws(() => validateSeedShape(partial), /analytics/);
});

test('validateSeedShape — rejects monster with non-boolean caught', () => {
  const bad = {
    rewardState: {
      bracehart: { mastered: [], caught: 'yes', starHighWater: 0, releaseId: 'x' },
      chronalyx: { mastered: [], caught: false, starHighWater: 0, releaseId: 'x' },
      couronnail: { mastered: [], caught: false, starHighWater: 0, releaseId: 'x' },
      concordium: { mastered: [], caught: false, starHighWater: 0, releaseId: 'x' },
    },
    analytics: { concepts: [], progressSnapshot: {} },
  };
  assert.throws(() => validateSeedShape(bad), /caught.*boolean/);
});

// ---------------------------------------------------------------------------
// Immutability proof — attempting to mutate a seed throws
// ---------------------------------------------------------------------------

test('seeds are deeply frozen — mutation throws in strict mode', () => {
  const seed = seedFreshLearner();
  assert.throws(() => { seed.rewardState.bracehart.caught = true; }, TypeError);
  assert.throws(() => { seed.rewardState.bracehart.mastered.push('x'); }, TypeError);
  assert.throws(() => { seed.analytics.concepts.push({}); }, TypeError);
});
