// Tests for U4 — Stage gates, starHighWater latch, and no-downgrade migration.
//
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U4).
//
// Verifies:
//  1. progressForGrammarMonster returns Star fields (stars, starMax, displayStage, stageName, starHighWater).
//  2. Stage thresholds map Stars to correct internal stage 0-4 and display stage 0-5.
//  3. starHighWater latch: display Stars = max(computed, persisted high-water).
//  4. Legacy migration: pre-P5 learners with no starHighWater get a Star floor from their old stage.
//  5. recordGrammarConceptMastery preserves starHighWater on written state.
//  6. Migration path never emits events (silent normalisation only).
//  7. Corrupted starHighWater (NaN, negative) treated as 0.
//  8. Existing Concordium invariant 200-random ratchet passes (via grammar-concordium-invariant.test.js import).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_REWARD_RELEASE_ID,
  grammarMasteryKey,
  progressForGrammarMonster,
  recordGrammarConceptMastery,
} from '../src/platform/game/monster-system.js';

import {
  GRAMMAR_MONSTER_STAR_MAX,
  GRAMMAR_STAR_STAGE_THRESHOLDS,
  applyStarHighWaterLatch,
  grammarStarStageFor,
  grammarStarDisplayStage,
  grammarStarStageName,
  legacyStarFloorFromStage,
} from '../shared/grammar/grammar-stars.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeRepository(initialState = {}) {
  let state = clone(initialState);
  let writes = 0;
  return {
    read() { return clone(state); },
    write(_learnerId, _systemId, nextState) {
      writes += 1;
      state = clone(nextState);
      return clone(state);
    },
    state() { return clone(state); },
    writeCount() { return writes; },
  };
}

// =============================================================================
// 1. Star stage thresholds — grammarStarStageFor (internal 0-4)
// =============================================================================

test('U4 star staging: 0 Stars -> stage 0', () => {
  assert.equal(grammarStarStageFor(0), 0);
});

test('U4 star staging: 1 Star -> stage 1', () => {
  assert.equal(grammarStarStageFor(1), 1);
});

test('U4 star staging: 14 Stars -> stage 1 (below hatch)', () => {
  assert.equal(grammarStarStageFor(14), 1);
});

test('U4 star staging: 15 Stars -> stage 2 (hatched)', () => {
  assert.equal(grammarStarStageFor(15), 2);
});

test('U4 star staging: 35 Stars -> stage 2 (still internal stage 2)', () => {
  assert.equal(grammarStarStageFor(35), 2);
});

test('U4 star staging: 64 Stars -> stage 2', () => {
  assert.equal(grammarStarStageFor(64), 2);
});

test('U4 star staging: 65 Stars -> stage 3 (nearly mega)', () => {
  assert.equal(grammarStarStageFor(65), 3);
});

test('U4 star staging: 99 Stars -> stage 3', () => {
  assert.equal(grammarStarStageFor(99), 3);
});

test('U4 star staging: 100 Stars -> stage 4 (mega)', () => {
  assert.equal(grammarStarStageFor(100), 4);
});

// =============================================================================
// 2. Display stages — grammarStarDisplayStage (0-5, 6 named stages)
// =============================================================================

test('U4 display stage: 0 Stars -> display 0 (Not found yet)', () => {
  assert.equal(grammarStarDisplayStage(0), 0);
  assert.equal(grammarStarStageName(0), 'Not found yet');
});

test('U4 display stage: 1 Star -> display 1 (Egg found)', () => {
  assert.equal(grammarStarDisplayStage(1), 1);
  assert.equal(grammarStarStageName(1), 'Egg found');
});

test('U4 display stage: 15 Stars -> display 2 (Hatched)', () => {
  assert.equal(grammarStarDisplayStage(15), 2);
  assert.equal(grammarStarStageName(15), 'Hatched');
});

test('U4 display stage: 35 Stars -> display 3 (Growing)', () => {
  assert.equal(grammarStarDisplayStage(35), 3);
  assert.equal(grammarStarStageName(35), 'Growing');
});

test('U4 display stage: 65 Stars -> display 4 (Nearly Mega)', () => {
  assert.equal(grammarStarDisplayStage(65), 4);
  assert.equal(grammarStarStageName(65), 'Nearly Mega');
});

test('U4 display stage: 100 Stars -> display 5 (Mega)', () => {
  assert.equal(grammarStarDisplayStage(100), 5);
  assert.equal(grammarStarStageName(100), 'Mega');
});

// =============================================================================
// 3. progressForGrammarMonster — Star fields present
// =============================================================================

test('U4 progress: fresh learner, 0 mastered, no starHighWater -> stars=0, stage 0, stageName "Not found yet"', () => {
  const state = {};
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  assert.equal(progress.stars, 0);
  assert.equal(progress.starMax, 100);
  assert.equal(progress.displayStage, 0);
  assert.equal(progress.stageName, 'Not found yet');
  assert.equal(progress.starHighWater, 0);
  assert.equal(progress.stage, 0);
  assert.equal(progress.caught, false);
});

test('U4 progress: learner with starHighWater=42, no conceptNodes -> stars=42 from latch', () => {
  const state = {
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      starHighWater: 42,
    },
  };
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  assert.equal(progress.stars, 42);
  assert.equal(progress.starHighWater, 42);
  assert.equal(progress.stageName, 'Growing');
  assert.equal(progress.displayStage, 3);
  // Internal stage: max(legacyStage, starDerivedStage). Legacy 1/6 -> stage 1.
  // Star stage 42 -> stage 2. Max = 2.
  assert.equal(progress.stage, 2);
  assert.equal(progress.caught, true);
});

test('U4 progress: starMax is always 100', () => {
  for (const monsterId of ['bracehart', 'chronalyx', 'couronnail', 'concordium']) {
    const progress = progressForGrammarMonster({}, monsterId, {
      conceptTotal: GRAMMAR_MONSTER_CONCEPTS[monsterId]?.length || GRAMMAR_AGGREGATE_CONCEPTS.length,
    });
    assert.equal(progress.starMax, GRAMMAR_MONSTER_STAR_MAX, `${monsterId} starMax should be 100`);
  }
});

// =============================================================================
// 4. starHighWater latch — monotonicity guarantee
// =============================================================================

test('U4 latch: starHighWater=42, derived=38 -> display=42 (latch holds)', () => {
  const result = applyStarHighWaterLatch({
    computedStars: 38,
    starHighWater: 42,
    legacyStage: 0,
  });
  assert.equal(result.displayStars, 42);
  assert.equal(result.updatedHighWater, 42);
});

test('U4 latch: starHighWater=42, derived=50 -> display=50, latch updates to 50', () => {
  const result = applyStarHighWaterLatch({
    computedStars: 50,
    starHighWater: 42,
    legacyStage: 0,
  });
  assert.equal(result.displayStars, 50);
  assert.equal(result.updatedHighWater, 50);
});

test('U4 latch: starHighWater=0, derived=0, legacyStage=3 -> display=35 (legacy floor)', () => {
  const result = applyStarHighWaterLatch({
    computedStars: 0,
    starHighWater: 0,
    legacyStage: 3,
  });
  assert.equal(result.displayStars, 35);
  assert.equal(result.updatedHighWater, 35);
});

test('U4 latch: corrupted starHighWater (NaN) -> treated as 0, derived Stars win', () => {
  const result = applyStarHighWaterLatch({
    computedStars: 25,
    starHighWater: NaN,
    legacyStage: 0,
  });
  assert.equal(result.displayStars, 25);
  assert.equal(result.updatedHighWater, 25);
});

test('U4 latch: corrupted starHighWater (negative) -> treated as 0', () => {
  const result = applyStarHighWaterLatch({
    computedStars: 10,
    starHighWater: -5,
    legacyStage: 0,
  });
  assert.equal(result.displayStars, 10);
  assert.equal(result.updatedHighWater, 10);
});

test('U4 latch: corrupted starHighWater (Infinity) -> treated as 0', () => {
  const result = applyStarHighWaterLatch({
    computedStars: 10,
    starHighWater: Infinity,
    legacyStage: 0,
  });
  assert.equal(result.displayStars, 10);
  assert.equal(result.updatedHighWater, 10);
});

test('U4 latch: display Stars capped at GRAMMAR_MONSTER_STAR_MAX (100)', () => {
  const result = applyStarHighWaterLatch({
    computedStars: 150,
    starHighWater: 200,
    legacyStage: 4,
  });
  assert.equal(result.displayStars, 100);
  assert.equal(result.updatedHighWater, 100);
});

// =============================================================================
// 5. Legacy migration — no-downgrade for pre-P5 learners
// =============================================================================

test('U4 legacy: legacyStarFloorFromStage maps correctly', () => {
  assert.equal(legacyStarFloorFromStage(0), 0);
  assert.equal(legacyStarFloorFromStage(1), 1);
  assert.equal(legacyStarFloorFromStage(2), 15);
  assert.equal(legacyStarFloorFromStage(3), 35);
  assert.equal(legacyStarFloorFromStage(4), 100);
});

test('U4 legacy: legacyStarFloorFromStage handles edge values', () => {
  assert.equal(legacyStarFloorFromStage(-1), 0);
  assert.equal(legacyStarFloorFromStage(5), 100);  // clamped to 4
  assert.equal(legacyStarFloorFromStage(NaN), 0);
  assert.equal(legacyStarFloorFromStage(undefined), 0);
});

test('U4 legacy: pre-P5 Bracehart caught (1/6 mastered, no starHighWater) -> Egg found preserved', () => {
  const state = {
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      // No starHighWater field — pre-P5 learner.
    },
  };
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  // Legacy stage for 1/6 = stage 1 -> floor = 1 Star.
  assert.ok(progress.stars >= 1, 'Egg found preserved via legacy floor');
  assert.equal(progress.caught, true);
  assert.ok(progress.stage >= 1, 'stage >= 1 (Egg found)');
});

test('U4 legacy: pre-P5 Couronnail Mega (3/3 mastered, no starHighWater) -> Mega preserved (floor=100)', () => {
  const state = {
    couronnail: {
      mastered: [
        grammarMasteryKey('word_classes'),
        grammarMasteryKey('standard_english'),
        grammarMasteryKey('formality'),
      ],
      caught: true,
      conceptTotal: 3,
      // No starHighWater — pre-P5 learner.
    },
  };
  const progress = progressForGrammarMonster(state, 'couronnail', {
    conceptTotal: 3,
  });
  // Legacy stage 3/3 = 1.0 ratio -> stage 4 -> floor = 100 Stars.
  assert.equal(progress.stars, 100, 'Mega preserved: floor = 100');
  assert.equal(progress.stage, 4, 'Mega stage preserved');
  assert.equal(progress.stageName, 'Mega');
  assert.equal(progress.displayStage, 5);
});

test('U4 legacy: pre-P5 Concordium stage 3 keeps high-water floor but stays visually gated without direct breadth', () => {
  const keys = GRAMMAR_AGGREGATE_CONCEPTS.slice(0, 14).map((c) => grammarMasteryKey(c));
  const state = {
    concordium: {
      mastered: keys,
      caught: true,
      conceptTotal: 18,
      // No starHighWater — pre-P5 learner.
    },
  };
  const progress = progressForGrammarMonster(state, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  // Legacy stage: 14/18 = 0.778 -> stage 3 -> floor = 35 Star high-water.
  // Display remains gated until enough direct monsters have been found.
  assert.ok(progress.starHighWater >= 35, 'high-water floor preserved');
  assert.equal(progress.stars, 0, 'display Stars are gated');
  assert.equal(progress.displayState, 'not-found', 'Concordium remains hidden without direct breadth');
});

test('U4 legacy: pre-P5 learner with no Grammar state -> 0 Stars, no migration needed', () => {
  const state = {};
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  assert.equal(progress.stars, 0);
  assert.equal(progress.stage, 0);
  assert.equal(progress.caught, false);
});

test('U4 legacy: post-P5 learner with starHighWater present -> migration path skipped', () => {
  const state = {
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      starHighWater: 5,  // Post-P5 learner.
    },
  };
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  // starHighWater=5 is present -> legacy floor is NOT applied.
  // Without conceptNodes, computedStars=0, so display = max(0, 5, 0) = 5.
  assert.equal(progress.stars, 5);
  assert.equal(progress.starHighWater, 5);
});

test('U4 legacy: starHighWater=0 explicitly present skips legacy floor (post-P5 at zero)', () => {
  // A post-P5 learner who has written starHighWater: 0 once should NOT
  // get the legacy floor applied. The check is for field existence, not truthiness.
  const state = {
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      starHighWater: 0,
    },
  };
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  // Legacy stage 1/6 -> stage 1. Legacy floor would be 1.
  // But starHighWater field is present (0), so legacy floor = 0.
  // computedStars = 0 (no conceptNodes). display = max(0, 0, 0) = 0.
  assert.equal(progress.stars, 0);
  // stage is still max(legacyStage=1, starDerivedStage=0) = 1 for backward compat.
  assert.equal(progress.stage, 1);
});

// =============================================================================
// 6. recordGrammarConceptMastery preserves starHighWater
// =============================================================================

test('U4 record: recordGrammarConceptMastery preserves existing starHighWater on aggregate entry', () => {
  const repository = makeRepository({
    concordium: {
      mastered: [],
      caught: false,
      starHighWater: 25,
    },
  });
  recordGrammarConceptMastery({
    learnerId: 'learner-hw',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.ok(state.concordium.starHighWater >= 25,
    'starHighWater preserved on aggregate entry after write');
});

test('U4 record: recordGrammarConceptMastery preserves existing starHighWater on direct entry', () => {
  const repository = makeRepository({
    bracehart: {
      mastered: [],
      caught: false,
      starHighWater: 15,
    },
  });
  recordGrammarConceptMastery({
    learnerId: 'learner-hw-direct',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.ok(state.bracehart.starHighWater >= 15,
    'starHighWater preserved on direct entry after write');
});

test('U4 record: recordGrammarConceptMastery seeds starHighWater from legacy floor when absent (pre-P5 learner)', () => {
  // A fresh learner with no prior state: 0 mastered -> legacy stage 0 -> floor 0.
  const repository = makeRepository();
  recordGrammarConceptMastery({
    learnerId: 'learner-fresh',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  // After recording the first concept, the entry now has 1 mastered key.
  // But seedStarHighWater reads mastered count BEFORE the new key is appended
  // (from the aggregateEntry snapshot), so for a truly fresh learner the
  // pre-write mastered count is 0 -> legacy stage 0 -> floor 0.
  assert.equal(state.concordium.starHighWater, 0, 'aggregate starHighWater seeded from legacy floor (0 mastered -> 0)');
  assert.equal(state.bracehart.starHighWater, 0, 'direct starHighWater seeded from legacy floor (0 mastered -> 0)');
});

test('U4 record: recordGrammarConceptMastery normalises corrupted starHighWater to 0', () => {
  const repository = makeRepository({
    concordium: {
      mastered: [],
      caught: false,
      starHighWater: NaN,
    },
    bracehart: {
      mastered: [],
      caught: false,
      starHighWater: -10,
    },
  });
  recordGrammarConceptMastery({
    learnerId: 'learner-corrupt',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.equal(state.concordium.starHighWater, 0, 'NaN normalised to 0');
  assert.equal(state.bracehart.starHighWater, 0, 'negative normalised to 0');
});

// =============================================================================
// 7. Migration path never emits events
// =============================================================================

test('U4 migration: legacy learner reads via progressForGrammarMonster without event emission', () => {
  // This test verifies that reading a legacy learner's progress (the migration
  // path) is pure computation — no events are emitted. Only
  // recordGrammarConceptMastery emits events, and it is not called here.
  const state = {
    couronnail: {
      mastered: [
        grammarMasteryKey('word_classes'),
        grammarMasteryKey('standard_english'),
        grammarMasteryKey('formality'),
      ],
      caught: true,
      conceptTotal: 3,
    },
  };
  // progressForGrammarMonster is a pure function — it returns a value and
  // has no side effects. The migration floor is computed at read time.
  const progress = progressForGrammarMonster(state, 'couronnail', {
    conceptTotal: 3,
  });
  // The function returns normally — no events, no state mutation.
  assert.equal(progress.stars, 100);
  assert.equal(progress.stage, 4);
});

test('U4 migration: first recordGrammarConceptMastery on legacy learner does NOT emit migration events', () => {
  // A legacy Concordium learner with 9/18 mastered (stage 2) gets a
  // legacy floor of 15 Stars. When the next concept is secured, the
  // reward pipeline should emit normal caught/evolve events based on
  // the before/after comparison, NOT extra events for the migration floor.
  const keys = GRAMMAR_AGGREGATE_CONCEPTS.slice(0, 9).map((c) => grammarMasteryKey(c));
  const repository = makeRepository({
    concordium: {
      mastered: keys,
      caught: true,
      conceptTotal: 18,
    },
    bracehart: {
      mastered: [
        grammarMasteryKey('sentence_functions'),
        grammarMasteryKey('clauses'),
      ],
      caught: true,
      conceptTotal: 6,
    },
  });
  // Secure a new concept that is NOT in the existing mastered list.
  // relative_clauses is a Bracehart concept not yet mastered.
  const events = recordGrammarConceptMastery({
    learnerId: 'learner-legacy-migrate',
    conceptId: 'relative_clauses',
    gameStateRepository: repository,
    random: () => 0,
  });
  // Should only emit normal reward events (levelup or evolve), not
  // extra migration events.
  for (const event of events) {
    assert.equal(event.type, 'reward.monster',
      'only reward.monster events emitted (no migration artifacts)');
    assert.ok(
      ['caught', 'evolve', 'mega', 'levelup'].includes(event.kind),
      `event kind ${event.kind} is a normal reward kind`,
    );
  }
});

// =============================================================================
// 8. progressForGrammarMonster with conceptNodes — Star computation
// =============================================================================

test('U4 progress with conceptNodes: Bracehart with full evidence on all owned concepts -> 100 Stars', () => {
  const state = {
    bracehart: {
      mastered: GRAMMAR_MONSTER_CONCEPTS.bracehart.map((c) => grammarMasteryKey(c)),
      caught: true,
    },
  };
  // Build conceptNodes with full evidence signals.
  const conceptNodes = {};
  const recentAttempts = [];
  for (const conceptId of GRAMMAR_MONSTER_CONCEPTS.bracehart) {
    conceptNodes[conceptId] = {
      attempts: 10,
      correct: 8,
      wrong: 2,
      strength: 0.90,
      intervalDays: 14,
      correctStreak: 5,
    };
    // Two independent corrects with different templates.
    recentAttempts.push(
      { conceptId, templateId: `${conceptId}-tmpl-1`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
      { conceptId, templateId: `${conceptId}-tmpl-2`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    );
  }
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: GRAMMAR_MONSTER_CONCEPTS.bracehart.length,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(progress.stars, 100, 'Full evidence on all concepts = 100 Stars');
  assert.equal(progress.stage, 4, 'Mega stage');
  assert.equal(progress.stageName, 'Mega');
});

test('U4 progress with conceptNodes: single firstIndependentWin on Concordium is gated without direct breadth', () => {
  const conceptId = 'sentence_functions';
  const conceptNodes = {
    [conceptId]: { attempts: 1, correct: 1, wrong: 0, strength: 0.3, intervalDays: 0, correctStreak: 1 },
  };
  const recentAttempts = [
    { conceptId, templateId: 'tmpl-1', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const state = {};
  const progress = progressForGrammarMonster(state, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(progress.starHighWater, 1, 'raw high-water still records the evidence');
  assert.equal(progress.stars, 0, 'display Stars are gated');
  assert.equal(progress.caught, false, 'Concordium is not caught before direct breadth');
});

test('U4 progress with conceptNodes: Concordium first evidence displays once two direct monsters are found', () => {
  const conceptId = 'sentence_functions';
  const conceptNodes = {
    [conceptId]: { attempts: 1, correct: 1, wrong: 0, strength: 0.3, intervalDays: 0, correctStreak: 1 },
  };
  const recentAttempts = [
    { conceptId, templateId: 'tmpl-1', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const state = {
    bracehart: { starHighWater: 1, caught: true },
    couronnail: { starHighWater: 1, caught: true },
  };
  const progress = progressForGrammarMonster(state, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(progress.stars, 1, 'floor guarantee displays after direct breadth gate');
  assert.equal(progress.caught, true, 'Concordium is caught after direct breadth gate');
});

test('U4 progress without conceptNodes: falls back to 0 computed Stars + legacy floor', () => {
  const state = {
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
    },
  };
  // No conceptNodes passed — legacy path.
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  // computedStars = 0 (no conceptNodes). Legacy stage = 1 (1/6 mastered).
  // No starHighWater field -> legacy floor from stage 1 = 1 Star.
  assert.equal(progress.stars, 1, 'Legacy floor from stage 1 = 1 Star');
  assert.ok(progress.stage >= 1);
});

// =============================================================================
// 9. Backward compatibility — existing callers without Star params
// =============================================================================

test('U4 backward compat: progressForGrammarMonster called without Star options matches legacy stage', () => {
  // Verify existing callers that don't pass conceptNodes still get the same
  // stage as the old grammarStageFor function would have produced.
  const testCases = [
    { mastered: 0, total: 6, expectedLegacyStage: 0 },
    { mastered: 1, total: 6, expectedLegacyStage: 1 },
    { mastered: 3, total: 6, expectedLegacyStage: 2 },
    { mastered: 5, total: 6, expectedLegacyStage: 3 },
    { mastered: 6, total: 6, expectedLegacyStage: 4 },
    { mastered: 9, total: 18, expectedLegacyStage: 2 },
    { mastered: 14, total: 18, expectedLegacyStage: 3 },
    { mastered: 18, total: 18, expectedLegacyStage: 4 },
  ];
  for (const { mastered, total, expectedLegacyStage } of testCases) {
    const keys = GRAMMAR_AGGREGATE_CONCEPTS.slice(0, mastered).map((c) => grammarMasteryKey(c));
    const state = {
      concordium: {
        mastered: keys,
        caught: mastered > 0,
        conceptTotal: total,
      },
    };
    const progress = progressForGrammarMonster(state, 'concordium', {
      conceptTotal: total,
    });
    assert.ok(progress.stage >= expectedLegacyStage,
      `mastered=${mastered}/${total}: stage ${progress.stage} >= legacy ${expectedLegacyStage}`);
  }
});

// =============================================================================
// 10. Concordium 200-random ratchet still passes with new staging
// =============================================================================

function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

test('U4 Concordium ratchet: 200 seeded random sequences hold stage + stars ratchet with Star staging', () => {
  const SEED = 42;
  const sequenceRng = makeSeededRandom(SEED);
  for (let i = 0; i < 200; i += 1) {
    const length = 20 + Math.floor(sequenceRng() * 41);
    const actionRng = makeSeededRandom(SEED + i * 31 + 1);
    const repository = makeRepository();

    let maxStage = 0;
    let maxStars = 0;
    let maxCaught = false;

    for (let step = 0; step < length; step += 1) {
      const conceptId = GRAMMAR_AGGREGATE_CONCEPTS[
        Math.floor(actionRng() * GRAMMAR_AGGREGATE_CONCEPTS.length)
      ];
      const roll = actionRng();
      if (roll < 0.55) {
        recordGrammarConceptMastery({
          learnerId: `learner-${i}`,
          conceptId,
          gameStateRepository: repository,
          random: () => 0,
        });
      }
      // else: wrong answer or transfer save — no reward pipeline call.

      const state = repository.state();
      const concordium = progressForGrammarMonster(state, 'concordium', {
        conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
      });

      assert.ok(concordium.stage >= maxStage,
        `seq=${i} step=${step}: stage ${concordium.stage} < prior max ${maxStage}`);
      assert.ok(concordium.stars >= maxStars,
        `seq=${i} step=${step}: stars ${concordium.stars} < prior max ${maxStars}`);
      if (maxCaught) {
        assert.ok(concordium.caught,
          `seq=${i} step=${step}: caught flipped back to false`);
      }

      maxStage = Math.max(maxStage, concordium.stage);
      maxStars = Math.max(maxStars, concordium.stars);
      maxCaught = maxCaught || concordium.caught;
    }
  }
});

// =============================================================================
// 11. Integration: starHighWater roundtrip through record
// =============================================================================

test('U4 integration: starHighWater survives across multiple recordGrammarConceptMastery calls', () => {
  // Start with starHighWater=30 on Bracehart.
  const repository = makeRepository({
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      starHighWater: 30,
    },
  });

  // Record a second concept for Bracehart.
  recordGrammarConceptMastery({
    learnerId: 'learner-roundtrip',
    conceptId: 'clauses',
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();
  assert.ok(state.bracehart.starHighWater >= 30,
    'starHighWater preserved after second concept mastered');

  // Record a third concept.
  recordGrammarConceptMastery({
    learnerId: 'learner-roundtrip',
    conceptId: 'relative_clauses',
    gameStateRepository: repository,
    random: () => 0,
  });

  const state2 = repository.state();
  assert.ok(state2.bracehart.starHighWater >= 30,
    'starHighWater still preserved after third concept mastered');
});

// =============================================================================
// 12. HIGH fix: pre-P5 Concordium round-trip — starHighWater seeded from legacy floor
// =============================================================================

test('U4 review fix: pre-P5 Concordium 14/18 mastered preserves stored floor while display gate can hide it', () => {
  // Pre-P5 learner with 14 of 18 Concordium concepts mastered.
  // Legacy stage: 14/18 = 0.778 -> stage 3 -> floor = 35 Stars.
  const keys = GRAMMAR_AGGREGATE_CONCEPTS.slice(0, 14).map((c) => grammarMasteryKey(c));
  const repository = makeRepository({
    concordium: {
      mastered: keys,
      caught: true,
      conceptTotal: 18,
      // No starHighWater — pre-P5 learner.
    },
  });

  // Step 1: read progress — floor is preserved in starHighWater, while
  // display Stars stay hidden until the direct-monster breadth gate passes.
  const state1 = repository.state();
  const progress1 = progressForGrammarMonster(state1, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.ok(progress1.starHighWater >= 35,
    `Before record: starHighWater=${progress1.starHighWater} should be >= 35 from legacy floor`);
  assert.equal(progress1.stars, 0, 'Before record: display Stars are gated');

  // Step 2: record concept 15 via recordGrammarConceptMastery.
  const concept15 = GRAMMAR_AGGREGATE_CONCEPTS[14];
  recordGrammarConceptMastery({
    learnerId: 'learner-pre-p5-roundtrip',
    conceptId: concept15,
    gameStateRepository: repository,
    random: () => 0,
  });

  // Step 3: read progress again — stored high-water must still be >= 35.
  const state2 = repository.state();
  const progress2 = progressForGrammarMonster(state2, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.ok(progress2.starHighWater >= 35,
    `After record: starHighWater=${progress2.starHighWater} should be >= 35 — legacy floor must not be erased by write`);
  assert.equal(progress2.stars, 0, 'After record: display Stars remain gated');
  // The written starHighWater must be at least the legacy floor.
  assert.ok(state2.concordium.starHighWater >= 35,
    `Persisted starHighWater=${state2.concordium.starHighWater} should be >= 35`);
});

// =============================================================================
// 13. P1: Chronalyx legacy migration — pre-P5 with 2/4 mastered
// =============================================================================

test('U4 review: pre-P5 Chronalyx 2/4 mastered (stage 2) -> floor Stars=15 -> "Hatched" preserved', () => {
  const state = {
    chronalyx: {
      mastered: [
        grammarMasteryKey('tense_aspect'),
        grammarMasteryKey('modal_verbs'),
      ],
      caught: true,
      conceptTotal: 4,
      // No starHighWater — pre-P5 learner.
    },
  };
  const progress = progressForGrammarMonster(state, 'chronalyx', {
    conceptTotal: 4,
  });
  // Legacy stage: 2/4 = 0.5 -> stage 2 -> floor = 15 Stars.
  assert.ok(progress.stars >= 15,
    `Chronalyx stars=${progress.stars} should be >= 15 from legacy floor`);
  assert.ok(progress.stageName === 'Hatched' || progress.stageName === 'Growing' || progress.stageName === 'Nearly Mega' || progress.stageName === 'Mega',
    `stageName="${progress.stageName}" should be at least Hatched`);
  assert.ok(progress.displayStage >= 2,
    `displayStage=${progress.displayStage} should be >= 2 (Hatched)`);
});

// =============================================================================
// 14. P2: String-typed starHighWater from D1
// =============================================================================

test('U4 review: string-typed starHighWater ("42") treated as numeric 42', () => {
  const state = {
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      starHighWater: '42',  // D1 returns strings for numeric columns.
    },
  };
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  assert.equal(progress.stars, 42,
    'String "42" treated as numeric 42 via Number coercion');
  assert.equal(progress.starHighWater, 42);
});

test('U4 review: string-typed starHighWater ("42") preserved through recordGrammarConceptMastery', () => {
  const repository = makeRepository({
    concordium: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      starHighWater: '42',
    },
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      starHighWater: '15',
    },
  });
  recordGrammarConceptMastery({
    learnerId: 'learner-string-hw',
    conceptId: 'clauses',
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();
  assert.ok(state.concordium.starHighWater >= 42,
    `aggregate starHighWater=${state.concordium.starHighWater} should be >= 42`);
  assert.ok(state.bracehart.starHighWater >= 15,
    `direct starHighWater=${state.bracehart.starHighWater} should be >= 15`);
});

// =============================================================================
// 15. P2: Concordium conceptNodes — all 18 concepts with full evidence -> 100 Stars
// =============================================================================

test('U4 review: Concordium with full conceptNodes evidence for all 18 concepts -> 100 Stars', () => {
  const state = {
    concordium: {
      mastered: GRAMMAR_AGGREGATE_CONCEPTS.map((c) => grammarMasteryKey(c)),
      caught: true,
    },
  };
  // Build conceptNodes with full evidence signals for every aggregate concept.
  const conceptNodes = {};
  const recentAttempts = [];
  for (const conceptId of GRAMMAR_AGGREGATE_CONCEPTS) {
    conceptNodes[conceptId] = {
      attempts: 10,
      correct: 8,
      wrong: 2,
      strength: 0.90,
      intervalDays: 14,
      correctStreak: 5,
    };
    // Two independent corrects with different templates.
    recentAttempts.push(
      { conceptId, templateId: `${conceptId}-tmpl-1`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
      { conceptId, templateId: `${conceptId}-tmpl-2`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    );
  }
  const progress = progressForGrammarMonster(state, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(progress.stars, 100,
    'Full evidence on all 18 Concordium concepts = 100 Stars');
  assert.equal(progress.stage, 4, 'Mega stage');
  assert.equal(progress.stageName, 'Mega');
  assert.equal(progress.displayStage, 5);
});
