// P5-U11 — End-to-end integration tests for the Grammar Star progression
// journey. Drives full learner journeys through the Star pipeline: first
// correct -> Egg -> gradual evidence -> Hatch -> Growing -> Nearly Mega ->
// Mega, across all four active monsters.
//
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U11).
//
// Patterns followed:
//   - tests/grammar-rewards.test.js — makeRepository, securedEvent, rewardEventsFromGrammarEvents
//   - tests/grammar-star-staging.test.js — progressForGrammarMonster with conceptNodes
//
// Verifies:
//  1. Full 0->100 Star journey for Bracehart (6 concepts)
//  2. Full 0->100 Star journey for Couronnail (3 concepts)
//  3. Concordium accumulates from cross-cluster evidence
//  4. Writing Try -> 0 Stars
//  5. Supported answers -> no independent tiers
//  6. Spelling parity regression check
//  7. Stars increase monotonically
//  8. Events fire in correct order
//  9. starHighWater ratchets up

import test from 'node:test';
import assert from 'node:assert/strict';

import { rewardEventsFromGrammarEvents } from '../src/subjects/grammar/event-hooks.js';
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
  computeGrammarMonsterStars,
  deriveGrammarConceptStarEvidence,
} from '../shared/grammar/grammar-stars.js';
import {
  buildGrammarDashboardModel,
  buildGrammarMonsterStripModel,
} from '../src/subjects/grammar/components/grammar-view-model.js';

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

function securedEvent(conceptId, overrides = {}) {
  return {
    id: `grammar.secured.learner-e2e.${conceptId}.request-1`,
    type: 'grammar.concept-secured',
    subjectId: 'grammar',
    learnerId: 'learner-e2e',
    contentReleaseId: GRAMMAR_REWARD_RELEASE_ID,
    conceptId,
    masteryKey: grammarMasteryKey(conceptId),
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Build full-evidence conceptNodes and recentAttempts for a list of concepts.
 * Each concept gets: secure strength/interval/streak + 2 independent corrects
 * + 2 distinct templates = all 5 evidence tiers unlocked.
 */
function fullEvidenceForConcepts(conceptIds) {
  const conceptNodes = {};
  const recentAttempts = [];
  for (const conceptId of conceptIds) {
    conceptNodes[conceptId] = {
      attempts: 10,
      correct: 8,
      wrong: 2,
      strength: 0.90,
      intervalDays: 14,
      correctStreak: 5,
    };
    recentAttempts.push(
      { conceptId, templateId: `${conceptId}-tmpl-1`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
      { conceptId, templateId: `${conceptId}-tmpl-2`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    );
  }
  return { conceptNodes, recentAttempts };
}

/**
 * Build partial evidence (firstIndependentWin only) for a single concept.
 */
function firstWinEvidenceForConcept(conceptId) {
  const conceptNodes = {
    [conceptId]: {
      attempts: 1, correct: 1, wrong: 0, strength: 0.3, intervalDays: 0, correctStreak: 1,
    },
  };
  const recentAttempts = [
    { conceptId, templateId: `${conceptId}-tmpl-1`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  return { conceptNodes, recentAttempts };
}

// =============================================================================
// 1. Full 0->100 Star journey for Bracehart (6 concepts)
// =============================================================================

test('star e2e: full 0->100 Star journey for Bracehart (6 concepts)', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  assert.equal(concepts.length, 6, 'Bracehart has 6 concepts');

  const repository = makeRepository();
  const allEvents = [];
  let prevStars = 0;
  let prevStarHighWater = 0;

  // Secure concepts one by one.
  for (let i = 0; i < concepts.length; i += 1) {
    const conceptId = concepts[i];
    const events = recordGrammarConceptMastery({
      learnerId: 'learner-bracehart-e2e',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
    const bracehartEvents = events.filter((e) => e.monsterId === 'bracehart');
    allEvents.push(...bracehartEvents);

    // Build evidence for all concepts secured so far.
    const securedSoFar = concepts.slice(0, i + 1);
    const { conceptNodes, recentAttempts } = fullEvidenceForConcepts(securedSoFar);

    const progress = progressForGrammarMonster(repository.state(), 'bracehart', {
      conceptTotal: 6,
      conceptNodes,
      recentAttempts,
    });

    // Stars increase monotonically.
    assert.ok(progress.stars >= prevStars,
      `step ${i}: stars ${progress.stars} >= prev ${prevStars}`);
    // starHighWater ratchets up.
    assert.ok(progress.starHighWater >= prevStarHighWater,
      `step ${i}: starHighWater ${progress.starHighWater} >= prev ${prevStarHighWater}`);

    prevStars = progress.stars;
    prevStarHighWater = progress.starHighWater;
  }

  // After all 6 concepts with full evidence: should reach 100 Stars.
  const { conceptNodes, recentAttempts } = fullEvidenceForConcepts(concepts);
  const finalProgress = progressForGrammarMonster(repository.state(), 'bracehart', {
    conceptTotal: 6,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(finalProgress.stars, 100, 'Bracehart reaches 100 Stars with full evidence');
  assert.equal(finalProgress.stageName, 'Mega');
  assert.equal(finalProgress.stage, 4);

  // Event ordering: first is caught, last is mega.
  const kinds = allEvents.map((e) => e.kind);
  assert.equal(kinds[0], 'caught', 'first event is caught');
  assert.equal(kinds[kinds.length - 1], 'mega', 'last event is mega');
  // caught appears exactly once.
  assert.equal(kinds.filter((k) => k === 'caught').length, 1, 'caught exactly once');
  // mega appears exactly once.
  assert.equal(kinds.filter((k) => k === 'mega').length, 1, 'mega exactly once');
});

// =============================================================================
// 2. Full 0->100 Star journey for Couronnail (3 concepts)
// =============================================================================

test('star e2e: full 0->100 Star journey for Couronnail (3 concepts) — gradual, not jump-to-Mega', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.couronnail;
  assert.equal(concepts.length, 3, 'Couronnail has 3 concepts');

  const repository = makeRepository();
  const allEvents = [];
  const starSnapshots = [];

  // Secure concepts one by one.
  for (const conceptId of concepts) {
    const events = recordGrammarConceptMastery({
      learnerId: 'learner-couronnail-e2e',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
    const couronnailEvents = events.filter((e) => e.monsterId === 'couronnail');
    allEvents.push(...couronnailEvents);

    const progress = progressForGrammarMonster(repository.state(), 'couronnail', {
      conceptTotal: 3,
    });
    starSnapshots.push(progress.stars);
  }

  // Monotonic increase in Stars.
  for (let i = 1; i < starSnapshots.length; i += 1) {
    assert.ok(starSnapshots[i] >= starSnapshots[i - 1],
      `star snapshot ${i}: ${starSnapshots[i]} >= ${starSnapshots[i - 1]}`);
  }

  // With 3 concepts secured but NO evidence tiers (conceptNodes not passed),
  // Stars come from the legacy floor. Now test with full evidence.
  const { conceptNodes, recentAttempts } = fullEvidenceForConcepts(concepts);
  const finalProgress = progressForGrammarMonster(repository.state(), 'couronnail', {
    conceptTotal: 3,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(finalProgress.stars, 100, 'Couronnail reaches 100 Stars with full evidence');
  assert.equal(finalProgress.stageName, 'Mega');

  // Event ordering.
  const kinds = allEvents.map((e) => e.kind);
  assert.equal(kinds[0], 'caught', 'first Couronnail event is caught');
  assert.equal(kinds[kinds.length - 1], 'mega', 'last Couronnail event is mega');
});

// =============================================================================
// 3. Concordium accumulates from cross-cluster evidence
// =============================================================================

test('star e2e: Concordium Stars increase from cross-cluster concept evidence', () => {
  const repository = makeRepository();
  let prevStars = 0;

  // Secure one concept from each direct cluster.
  const crossClusterConcepts = [
    'sentence_functions', // Bracehart
    'tense_aspect',       // Chronalyx
    'word_classes',       // Couronnail
  ];

  for (const conceptId of crossClusterConcepts) {
    recordGrammarConceptMastery({
      learnerId: 'learner-concordium-cross',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });

    // Build evidence for all concepts secured so far.
    const securedSoFar = crossClusterConcepts.slice(
      0, crossClusterConcepts.indexOf(conceptId) + 1,
    );
    const { conceptNodes, recentAttempts } = fullEvidenceForConcepts(securedSoFar);

    const progress = progressForGrammarMonster(repository.state(), 'concordium', {
      conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
      conceptNodes,
      recentAttempts,
    });

    assert.ok(progress.stars >= prevStars,
      `Concordium Stars after ${conceptId}: ${progress.stars} >= ${prevStars}`);
    assert.ok(progress.stars >= 1, 'Concordium has at least 1 Star after any evidence');
    prevStars = progress.stars;
  }

  // After 3 cross-cluster concepts with full evidence: Stars should reflect
  // 3/18 concepts fully evidenced -> floor(3 * (100/18) * 1.0) = floor(16.67) = 16 Stars.
  assert.ok(prevStars >= 16, `Concordium Stars after 3 cross-cluster concepts: ${prevStars} >= 16`);
});

// =============================================================================
// 4. Writing Try -> 0 Stars (invariant 5)
// =============================================================================

test('star e2e: Writing Try (transfer-evidence-saved) produces 0 Star changes', () => {
  // Set up a learner with 1 concept secured and some stars.
  const repository = makeRepository();
  recordGrammarConceptMastery({
    learnerId: 'learner-wt-e2e',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });

  const stateBefore = repository.state();
  const progressBefore = progressForGrammarMonster(stateBefore, 'bracehart', {
    conceptTotal: 6,
  });

  // Fire a transfer-evidence-saved event (Writing Try).
  const transferEvent = {
    id: 'grammar.transfer-evidence-saved.learner-wt-e2e.req-1.adverbial-opener',
    type: 'grammar.transfer-evidence-saved',
    subjectId: 'grammar',
    learnerId: 'learner-wt-e2e',
    contentReleaseId: GRAMMAR_REWARD_RELEASE_ID,
    promptId: 'adverbial-opener',
    savedAt: 1,
    nonScored: true,
    createdAt: Date.now(),
  };
  const events = rewardEventsFromGrammarEvents([transferEvent], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // Zero reward events from transfer-evidence-saved.
  assert.deepEqual(events, [], 'Writing Try produces zero reward events');

  // Stars unchanged.
  const stateAfter = repository.state();
  const progressAfter = progressForGrammarMonster(stateAfter, 'bracehart', {
    conceptTotal: 6,
  });
  assert.equal(progressAfter.stars, progressBefore.stars,
    'Stars unchanged after Writing Try');
  assert.equal(progressAfter.starHighWater, progressBefore.starHighWater,
    'starHighWater unchanged after Writing Try');
});

// =============================================================================
// 5. Supported answers -> no independent tiers
// =============================================================================

test('star e2e: supported (worked/faded) answers do not unlock firstIndependentWin tier', () => {
  const conceptId = 'sentence_functions';

  // Create recentAttempts with only supported answers (supportLevel > 0,
  // firstAttemptIndependent = false).
  const recentAttempts = [
    {
      conceptId,
      templateId: `${conceptId}-tmpl-1`,
      correct: true,
      firstAttemptIndependent: false,
      supportLevelAtScoring: 2,
    },
    {
      conceptId,
      templateId: `${conceptId}-tmpl-2`,
      correct: true,
      firstAttemptIndependent: false,
      supportLevelAtScoring: 1,
    },
  ];

  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 2, correct: 2, wrong: 0, strength: 0.5, intervalDays: 0, correctStreak: 2 },
    recentAttempts,
  });

  assert.equal(evidence.firstIndependentWin, false,
    'supported answers do not unlock firstIndependentWin');
  assert.equal(evidence.repeatIndependentWin, false,
    'supported answers do not unlock repeatIndependentWin');
  // variedPractice is template-based, so it can be true regardless of support.
  assert.equal(evidence.variedPractice, true,
    'variedPractice is template-based, so 2 distinct templates = true');
  assert.equal(evidence.retainedAfterSecure, false,
    'supported answers do not unlock retainedAfterSecure');

  // Compute Stars: only variedPractice unlocked = 10% weight.
  const conceptEvidenceMap = { [conceptId]: evidence };
  const result = computeGrammarMonsterStars('bracehart', conceptEvidenceMap);
  // 1 of 6 concepts with variedPractice only: floor(100/6 * 0.10) = floor(1.67) = 1 Star.
  assert.equal(result.stars, 1, 'supported-only answers produce minimal Stars from variedPractice');
});

test('star e2e: nudge attempts (firstAttemptIndependent=false, supportLevel=0) do not unlock independent tiers', () => {
  const conceptId = 'clauses';

  // ADV-001 scenario: child got it wrong, retried correctly. supportLevel=0
  // but firstAttemptIndependent=false.
  const recentAttempts = [
    {
      conceptId,
      templateId: `${conceptId}-tmpl-1`,
      correct: true,
      firstAttemptIndependent: false,
      supportLevelAtScoring: 0,
    },
  ];

  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 1, correct: 1, wrong: 0, strength: 0.3, intervalDays: 0, correctStreak: 1 },
    recentAttempts,
  });

  assert.equal(evidence.firstIndependentWin, false,
    'nudge attempt (firstAttemptIndependent=false) does not unlock firstIndependentWin');
});

// =============================================================================
// 6. Spelling parity regression check
// =============================================================================

test('star e2e: Spelling monster state is untouched by Grammar Star operations', () => {
  const repository = makeRepository({
    pealark: { mastered: ['some-word'], caught: true, level: 5 },
  });

  // Secure multiple Grammar concepts.
  for (const conceptId of ['sentence_functions', 'clauses', 'word_classes']) {
    recordGrammarConceptMastery({
      learnerId: 'learner-parity-e2e',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  const state = repository.state();

  // Spelling monster (pealark) state unchanged.
  assert.deepEqual(state.pealark.mastered, ['some-word'],
    'Spelling pealark mastered list unchanged');
  assert.equal(state.pealark.caught, true, 'Spelling pealark caught unchanged');
  assert.equal(state.pealark.level, 5, 'Spelling pealark level unchanged');

  // No Spelling monsters were created or modified.
  const spellingMonsters = ['pealark', 'quoral', 'rexby', 'stellox', 'umber'];
  for (const monsterId of spellingMonsters) {
    if (monsterId === 'pealark') continue; // already checked
    assert.equal(state[monsterId], undefined,
      `Spelling monster ${monsterId} should not be created by Grammar operations`);
  }
});

// =============================================================================
// 7. Star journey with incremental evidence tiers
// =============================================================================

test('star e2e: incremental evidence tiers produce monotonically increasing Stars for Bracehart', () => {
  const conceptId = 'sentence_functions';
  const starValues = [];

  // Tier 1: firstIndependentWin only.
  const evidence1 = { firstIndependentWin: true, repeatIndependentWin: false, variedPractice: false, secureConfidence: false, retainedAfterSecure: false };
  const result1 = computeGrammarMonsterStars('bracehart', { [conceptId]: evidence1 });
  starValues.push(result1.stars);

  // Tier 2: + repeatIndependentWin.
  const evidence2 = { ...evidence1, repeatIndependentWin: true };
  const result2 = computeGrammarMonsterStars('bracehart', { [conceptId]: evidence2 });
  starValues.push(result2.stars);

  // Tier 3: + variedPractice.
  const evidence3 = { ...evidence2, variedPractice: true };
  const result3 = computeGrammarMonsterStars('bracehart', { [conceptId]: evidence3 });
  starValues.push(result3.stars);

  // Tier 4: + secureConfidence.
  const evidence4 = { ...evidence3, secureConfidence: true };
  const result4 = computeGrammarMonsterStars('bracehart', { [conceptId]: evidence4 });
  starValues.push(result4.stars);

  // Tier 5: + retainedAfterSecure (all tiers unlocked).
  const evidence5 = { ...evidence4, retainedAfterSecure: true };
  const result5 = computeGrammarMonsterStars('bracehart', { [conceptId]: evidence5 });
  starValues.push(result5.stars);

  // Monotonically non-decreasing.
  for (let i = 1; i < starValues.length; i += 1) {
    assert.ok(starValues[i] >= starValues[i - 1],
      `tier ${i}: ${starValues[i]} >= ${starValues[i - 1]}`);
  }

  // First tier produces at least 1 Star (floor guarantee).
  assert.ok(starValues[0] >= 1, 'firstIndependentWin produces at least 1 Star');

  // All tiers on 1 concept of 6: floor(100/6 * 1.0) = floor(16.67) = 16 Stars.
  assert.equal(starValues[4], 16,
    'all 5 tiers on 1/6 concept = floor(100/6 * 1.0) = 16 Stars');
});

// =============================================================================
// 8. Concordium with full 18-concept journey
// =============================================================================

test('star e2e: Concordium full 18-concept journey reaches 100 Stars', () => {
  const repository = makeRepository();
  const concordiumEventKinds = [];

  // Secure all 18 aggregate concepts.
  for (const conceptId of GRAMMAR_AGGREGATE_CONCEPTS) {
    const events = recordGrammarConceptMastery({
      learnerId: 'learner-concordium-full-e2e',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
    const concordiumEvents = events.filter((e) => e.monsterId === 'concordium');
    concordiumEventKinds.push(...concordiumEvents.map((e) => e.kind));
  }

  // First event is caught.
  assert.equal(concordiumEventKinds[0], 'caught', 'Concordium first event is caught');

  // Last event is mega.
  assert.equal(concordiumEventKinds[concordiumEventKinds.length - 1], 'mega',
    'Concordium last event is mega');

  // With full evidence: 100 Stars.
  const { conceptNodes, recentAttempts } = fullEvidenceForConcepts(GRAMMAR_AGGREGATE_CONCEPTS);
  const progress = progressForGrammarMonster(repository.state(), 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(progress.stars, 100, 'Concordium with full evidence = 100 Stars');
  assert.equal(progress.stageName, 'Mega');
});

// =============================================================================
// 9. No event double-fire in full journey
// =============================================================================

test('star e2e: full Bracehart journey emits at most 1 event per monster per recordGrammarConceptMastery call', () => {
  const repository = makeRepository();

  for (const conceptId of GRAMMAR_MONSTER_CONCEPTS.bracehart) {
    const events = recordGrammarConceptMastery({
      learnerId: 'learner-no-double-e2e',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
    const byMonster = {};
    for (const event of events) {
      byMonster[event.monsterId] = (byMonster[event.monsterId] || 0) + 1;
    }
    for (const [monsterId, count] of Object.entries(byMonster)) {
      assert.equal(count, 1,
        `${conceptId}: at most 1 event for ${monsterId}, got ${count}`);
    }
  }
});

// =============================================================================
// 10. Dashboard model integration — monsterStrip + concordiumProgress compose
// =============================================================================

test('star e2e: dashboard model after full Bracehart journey shows preserved concordiumProgress and monsterStrip shape', () => {
  const repository = makeRepository();

  // Secure all 6 Bracehart concepts.
  for (const conceptId of GRAMMAR_MONSTER_CONCEPTS.bracehart) {
    recordGrammarConceptMastery({
      learnerId: 'learner-dashboard-e2e',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  const state = repository.state();
  const dashboard = buildGrammarDashboardModel({}, null, state);

  // concordiumProgress has 6 mastered (Bracehart concepts are also in Concordium).
  assert.equal(dashboard.concordiumProgress.mastered, 6);
  assert.equal(dashboard.concordiumProgress.total, 18);

  // monsterStrip has 4 entries with correct shape.
  assert.equal(dashboard.monsterStrip.length, 4);
  assert.deepEqual(
    dashboard.monsterStrip.map((e) => e.monsterId),
    ['bracehart', 'chronalyx', 'couronnail', 'concordium'],
  );

  // Without conceptNodes, dashboard's monsterStrip reads from starHighWater.
  // For post-P5 fresh learners, starHighWater was seeded at 0 (before first
  // write mastered count was 0 -> legacy stage 0 -> floor 0). The reward layer
  // does not compute Stars from evidence — that happens on the client read
  // path. So the dashboard model's monsterStrip correctly shows starHighWater
  // values. The key assertion is that the shape is valid and both
  // concordiumProgress and monsterStrip coexist.
  for (const entry of dashboard.monsterStrip) {
    assert.equal(typeof entry.stars, 'number', `${entry.monsterId} has numeric stars`);
    assert.equal(entry.starMax, 100, `${entry.monsterId} starMax is 100`);
    assert.equal(typeof entry.stageName, 'string', `${entry.monsterId} has stageName`);
  }

  // Bracehart has 6/6 mastered — the stage should reflect legacy stage 4 (Mega).
  // But starHighWater=0 for post-P5 learners: the internal stage uses
  // max(legacyStage, starStage). Legacy stage = 4 (6/6 = 1.0), star stage = 0.
  // max(4, 0) = 4. The progress.stage is 4 (Mega).
  const bracehartProgress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  assert.equal(bracehartProgress.stage, 4, 'Bracehart at Mega via legacy ratio');
});

// =============================================================================
// 11. Monster strip model integration — all 4 monsters present
// =============================================================================

test('star e2e: monster strip model after mixed cross-cluster journey shows correct monster state', () => {
  const repository = makeRepository();

  // Secure concepts across all clusters.
  const concepts = [
    'sentence_functions', // Bracehart
    'tense_aspect',       // Chronalyx
    'word_classes',       // Couronnail
    'speech_punctuation', // Concordium-only
  ];

  for (const conceptId of concepts) {
    recordGrammarConceptMastery({
      learnerId: 'learner-strip-e2e',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  const state = repository.state();
  const strip = buildGrammarMonsterStripModel(state, null, null);

  // All 4 active monsters present.
  assert.equal(strip.length, 4);
  const ids = strip.map((e) => e.monsterId);
  assert.deepEqual(ids, ['bracehart', 'chronalyx', 'couronnail', 'concordium']);

  // Without conceptNodes, Stars come from starHighWater (seeded at 0 for
  // fresh post-P5 learners — the legacy floor is NOT applied when
  // starHighWater is explicitly present). The strip model correctly shows
  // Stars=0 when starHighWater=0 and conceptNodes are null. Stars are only
  // non-zero when the client provides conceptNodes (read-time derivation)
  // or when starHighWater has been updated from a client-computed value.
  //
  // The key assertion here is structural: the strip has 4 entries, each has
  // the correct shape, and no reserved monsters leak in.
  for (const entry of strip) {
    assert.equal(typeof entry.stars, 'number', `${entry.monsterId} has numeric stars`);
    assert.equal(entry.starMax, 100, `${entry.monsterId} starMax is 100`);
    assert.equal(typeof entry.stageName, 'string', `${entry.monsterId} has stageName`);
    assert.equal(typeof entry.stageIndex, 'number', `${entry.monsterId} has stageIndex`);
  }

  // When conceptNodes are provided, Stars reflect the actual evidence.
  const securedConcepts = ['sentence_functions', 'tense_aspect', 'word_classes', 'speech_punctuation'];
  const { conceptNodes, recentAttempts } = fullEvidenceForConcepts(securedConcepts);
  const stripWithEvidence = buildGrammarMonsterStripModel(state, conceptNodes, recentAttempts);
  const bracehartEvidence = stripWithEvidence.find((e) => e.monsterId === 'bracehart');
  assert.ok(bracehartEvidence.stars >= 1, 'Bracehart has >= 1 Star with evidence');
  const chronalyxEvidence = stripWithEvidence.find((e) => e.monsterId === 'chronalyx');
  assert.ok(chronalyxEvidence.stars >= 1, 'Chronalyx has >= 1 Star with evidence');
  const concordiumEvidence = stripWithEvidence.find((e) => e.monsterId === 'concordium');
  assert.ok(concordiumEvidence.stars >= 1, 'Concordium has >= 1 Star with evidence');

  // No reserved monsters.
  assert.equal(ids.includes('glossbloom'), false);
  assert.equal(ids.includes('loomrill'), false);
  assert.equal(ids.includes('mirrane'), false);
});

// =============================================================================
// 12. Legacy migration in e2e context — pre-P5 Couronnail Mega preserved
// =============================================================================

test('star e2e: pre-P5 Couronnail at Mega (3/3 mastered) -> Stars >= 100 after migration', () => {
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
  assert.equal(progress.stars, 100, 'Pre-P5 Couronnail Mega preserved at 100 Stars');
  assert.equal(progress.stageName, 'Mega');

  // Dashboard model also shows Mega for Couronnail.
  const dashboard = buildGrammarDashboardModel({}, null, state);
  const couronnail = dashboard.monsterStrip.find((e) => e.monsterId === 'couronnail');
  assert.equal(couronnail.stars, 100, 'Dashboard monsterStrip shows Mega for pre-P5 Couronnail');
  assert.equal(couronnail.stageName, 'Mega');
});

// =============================================================================
// 13. Full Chronalyx journey (4 concepts) with evidence
// =============================================================================

test('star e2e: full Chronalyx 0->100 Star journey (4 concepts)', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.chronalyx;
  assert.equal(concepts.length, 4, 'Chronalyx has 4 concepts');

  const repository = makeRepository();
  let prevStars = 0;

  for (const conceptId of concepts) {
    recordGrammarConceptMastery({
      learnerId: 'learner-chronalyx-e2e',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });

    const securedSoFar = concepts.slice(0, concepts.indexOf(conceptId) + 1);
    const { conceptNodes, recentAttempts } = fullEvidenceForConcepts(securedSoFar);

    const progress = progressForGrammarMonster(repository.state(), 'chronalyx', {
      conceptTotal: 4,
      conceptNodes,
      recentAttempts,
    });

    assert.ok(progress.stars >= prevStars,
      `Chronalyx after ${conceptId}: ${progress.stars} >= ${prevStars}`);
    prevStars = progress.stars;
  }

  // Full evidence on all 4 concepts = 100 Stars.
  const { conceptNodes, recentAttempts } = fullEvidenceForConcepts(concepts);
  const finalProgress = progressForGrammarMonster(repository.state(), 'chronalyx', {
    conceptTotal: 4,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(finalProgress.stars, 100, 'Chronalyx reaches 100 Stars');
  assert.equal(finalProgress.stageName, 'Mega');
});

// =============================================================================
// 14. Stage threshold boundary assertions
// =============================================================================

test('star e2e: Star thresholds produce correct stage labels at boundary values', () => {
  const thresholdTests = [
    { stars: 0, expectedStage: 'Not found yet', expectedIndex: 0 },
    { stars: 1, expectedStage: 'Egg found', expectedIndex: 1 },
    { stars: 14, expectedStage: 'Egg found', expectedIndex: 1 },
    { stars: 15, expectedStage: 'Hatched', expectedIndex: 2 },
    { stars: 34, expectedStage: 'Hatched', expectedIndex: 2 },
    { stars: 35, expectedStage: 'Growing', expectedIndex: 3 },
    { stars: 64, expectedStage: 'Growing', expectedIndex: 3 },
    { stars: 65, expectedStage: 'Nearly Mega', expectedIndex: 4 },
    { stars: 99, expectedStage: 'Nearly Mega', expectedIndex: 4 },
    { stars: 100, expectedStage: 'Mega', expectedIndex: 5 },
  ];

  for (const { stars, expectedStage, expectedIndex } of thresholdTests) {
    const state = {
      bracehart: {
        mastered: [],
        caught: stars >= 1,
        starHighWater: stars,
      },
    };
    const strip = buildGrammarMonsterStripModel(state, null, null);
    const bracehart = strip.find((e) => e.monsterId === 'bracehart');
    assert.equal(bracehart.stars, stars, `stars=${stars}`);
    assert.equal(bracehart.stageName, expectedStage,
      `stars=${stars} -> stageName="${expectedStage}"`);
    assert.equal(bracehart.stageIndex, expectedIndex,
      `stars=${stars} -> stageIndex=${expectedIndex}`);
  }
});

// =============================================================================
// 15. Cross-subject isolation — Grammar operations do not affect Punctuation
// =============================================================================

test('star e2e: Grammar operations leave Punctuation monster state untouched', () => {
  const repository = makeRepository({
    // Simulate a Punctuation monster.
    umbrax: { mastered: ['some-punct-concept'], caught: true, level: 3 },
  });

  // Secure Grammar concepts.
  for (const conceptId of GRAMMAR_MONSTER_CONCEPTS.bracehart.slice(0, 3)) {
    recordGrammarConceptMastery({
      learnerId: 'learner-punct-parity',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  const state = repository.state();
  // Punctuation monster untouched.
  assert.deepEqual(state.umbrax.mastered, ['some-punct-concept']);
  assert.equal(state.umbrax.caught, true);
  assert.equal(state.umbrax.level, 3);
});
