// Phase 6 U8 — End-to-end trust contract tests for Grammar Star evidence.
//
// Every test in this file exercises the trust pipeline using PRODUCTION-SHAPE
// attempts (the { conceptIds, result, templateId, firstAttemptIndependent,
// supportLevelAtScoring, createdAt } shape that the command handler emits).
//
// The six trust defects from the Phase 6 product acceptance criteria:
//   1. Production shape normalisation (conceptIds[], result.correct)
//   2. variedPractice correct-only gate
//   3. retainedAfterSecure temporal proof with nowTs
//   4. Sub-secure starHighWater persistence across session boundaries
//   5. Egg from sub-secure evidence (caught event, no duplicate)
//   6. Dashboard evidence pass-through (Stars with evidence > Stars without)
//
// Plus zero-Star inflation paths and Spelling parity check.
//
// Patterns followed:
//   - tests/grammar-star-e2e.test.js (makeRepository, progressForGrammarMonster)
//   - tests/grammar-star-persistence.test.js (updateGrammarStarHighWater)
//   - tests/grammar-star-events.test.js (rewardEventsFromGrammarEvents)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_REWARD_RELEASE_ID,
  grammarMasteryKey,
  progressForGrammarMonster,
  recordGrammarConceptMastery,
  updateGrammarStarHighWater,
} from '../src/platform/game/monster-system.js';

import {
  GRAMMAR_EVENT_TYPES,
  rewardEventsFromGrammarEvents,
} from '../src/subjects/grammar/event-hooks.js';

import {
  computeGrammarMonsterStars,
  deriveGrammarConceptStarEvidence,
  GRAMMAR_MONSTER_STAR_MAX,
} from '../shared/grammar/grammar-stars.js';

import {
  buildGrammarDashboardModel,
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

/**
 * Build a PRODUCTION-SHAPE attempt. This is the canonical shape emitted by the
 * command handler: { conceptIds: [...], result: { correct, score, maxScore },
 * templateId, firstAttemptIndependent, supportLevelAtScoring, createdAt }.
 */
function prodAttempt(conceptId, templateId, {
  correct = true,
  firstAttemptIndependent = true,
  supportLevelAtScoring = 0,
  createdAt = Date.now(),
} = {}) {
  return {
    conceptIds: [conceptId],
    result: { correct, score: correct ? 1 : 0, maxScore: 1 },
    templateId,
    firstAttemptIndependent,
    supportLevelAtScoring,
    createdAt,
  };
}

/**
 * Build a secure conceptNode for a concept (high strength, long interval,
 * sustained correct streak). Matches the secureConfidence threshold:
 * strength >= 0.82, intervalDays >= 7, correctStreak >= 3.
 */
function secureNode() {
  return {
    attempts: 10,
    correct: 8,
    wrong: 2,
    strength: 0.90,
    intervalDays: 14,
    correctStreak: 5,
  };
}

/**
 * Build full evidence (conceptNodes + recentAttempts) for a list of concepts
 * using production-shape attempts. Each concept gets a secure node + 2
 * independent correct attempts on 2 distinct templates with post-secure
 * createdAt timestamps.
 */
function fullProductionEvidenceForConcepts(conceptIds, { nowTs = Date.now() } = {}) {
  const conceptNodes = {};
  const recentAttempts = [];
  for (const conceptId of conceptIds) {
    const node = secureNode();
    conceptNodes[conceptId] = node;
    // Post-secure timestamp: nowTs - (intervalDays - 1) days (within secure window)
    const postSecureTs = nowTs - ((node.intervalDays - 1) * 86400000);
    recentAttempts.push(
      prodAttempt(conceptId, `${conceptId}-tmpl-1`, { createdAt: postSecureTs }),
      prodAttempt(conceptId, `${conceptId}-tmpl-2`, { createdAt: postSecureTs + 1000 }),
    );
  }
  return { conceptNodes, recentAttempts };
}

// =============================================================================
// Trust defect 1 — Production shape: full 0->100 Star journey for Bracehart
// =============================================================================

test('trust 1: full 0->100 Star journey for Bracehart using production-shape attempts', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  assert.equal(concepts.length, 9, 'Bracehart has 9 concepts');

  const repository = makeRepository();
  const nowTs = Date.now();
  let prevStars = 0;

  // Secure concepts one by one, building incremental evidence each step.
  for (let i = 0; i < concepts.length; i += 1) {
    const conceptId = concepts[i];
    recordGrammarConceptMastery({
      learnerId: 'learner-trust-1',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });

    // Build full production evidence for all secured concepts so far.
    const securedSoFar = concepts.slice(0, i + 1);
    const { conceptNodes, recentAttempts } = fullProductionEvidenceForConcepts(securedSoFar, { nowTs });

    const progress = progressForGrammarMonster(repository.state(), 'bracehart', {
      conceptTotal: concepts.length,
      conceptNodes,
      recentAttempts,
    });

    // Stars increase monotonically.
    assert.ok(progress.stars >= prevStars,
      `step ${i}: stars ${progress.stars} >= prev ${prevStars}`);
    prevStars = progress.stars;
  }

  // After all 9 concepts with full production evidence: 100 Stars.
  const { conceptNodes, recentAttempts } = fullProductionEvidenceForConcepts(concepts, { nowTs });
  const finalProgress = progressForGrammarMonster(repository.state(), 'bracehart', {
    conceptTotal: concepts.length,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(finalProgress.stars, 100, 'Bracehart reaches 100 Stars with full production evidence');
  assert.equal(finalProgress.stageName, 'Mega');
});

test('trust 1: evidence tiers unlock incrementally via production-shape attempts', () => {
  const conceptId = 'sentence_functions';
  const nowTs = Date.now();

  // Tier 1: single independent correct -> firstIndependentWin
  const ev1 = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 1, correct: 1, wrong: 0, strength: 0.3, intervalDays: 0, correctStreak: 1 },
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', { createdAt: nowTs }),
    ],
    nowTs,
  });
  assert.equal(ev1.firstIndependentWin, true, 'tier 1: firstIndependentWin');
  assert.equal(ev1.repeatIndependentWin, false, 'tier 1: no repeatIndependentWin yet');

  // Tier 2: second independent correct -> repeatIndependentWin
  const ev2 = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 2, correct: 2, wrong: 0, strength: 0.4, intervalDays: 0, correctStreak: 2 },
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', { createdAt: nowTs }),
      prodAttempt(conceptId, 'tpl-a', { createdAt: nowTs + 1000 }),
    ],
    nowTs,
  });
  assert.equal(ev2.repeatIndependentWin, true, 'tier 2: repeatIndependentWin');
  assert.equal(ev2.variedPractice, false, 'tier 2: no variedPractice (same template)');

  // Tier 3: 2 distinct templates correct -> variedPractice
  const ev3 = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 2, correct: 2, wrong: 0, strength: 0.4, intervalDays: 0, correctStreak: 2 },
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', { createdAt: nowTs }),
      prodAttempt(conceptId, 'tpl-b', { createdAt: nowTs + 1000 }),
    ],
    nowTs,
  });
  assert.equal(ev3.variedPractice, true, 'tier 3: variedPractice');
  assert.equal(ev3.secureConfidence, false, 'tier 3: no secureConfidence yet');

  // Tier 4: secure node -> secureConfidence
  const ev4 = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: secureNode(),
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', { createdAt: nowTs }),
      prodAttempt(conceptId, 'tpl-b', { createdAt: nowTs + 1000 }),
    ],
    nowTs,
  });
  assert.equal(ev4.secureConfidence, true, 'tier 4: secureConfidence');

  // Tier 5: post-secure correct -> retainedAfterSecure
  const node = secureNode();
  const postSecureTs = nowTs - ((node.intervalDays - 1) * 86400000);
  const ev5 = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: node,
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', { createdAt: postSecureTs }),
      prodAttempt(conceptId, 'tpl-b', { createdAt: postSecureTs + 1000 }),
    ],
    nowTs,
  });
  assert.equal(ev5.retainedAfterSecure, true, 'tier 5: retainedAfterSecure');
});

// =============================================================================
// Trust defect 2 — variedPractice correct-only gate
// =============================================================================

test('trust 2: wrong-only answers on 3 distinct templates do NOT unlock variedPractice', () => {
  const conceptId = 'clauses';
  const nowTs = Date.now();

  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 3, correct: 0, wrong: 3, strength: 0.1, intervalDays: 0, correctStreak: 0 },
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-wrong-1', { correct: false, createdAt: nowTs }),
      prodAttempt(conceptId, 'tpl-wrong-2', { correct: false, createdAt: nowTs + 1000 }),
      prodAttempt(conceptId, 'tpl-wrong-3', { correct: false, createdAt: nowTs + 2000 }),
    ],
    nowTs,
  });

  assert.equal(evidence.variedPractice, false,
    'wrong-only answers on 3 distinct templates do NOT unlock variedPractice');
  assert.equal(evidence.firstIndependentWin, false,
    'wrong answers do not unlock firstIndependentWin');
});

test('trust 2: correct answers on 2 distinct templates DO unlock variedPractice', () => {
  const conceptId = 'clauses';
  const nowTs = Date.now();

  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 2, correct: 2, wrong: 0, strength: 0.5, intervalDays: 0, correctStreak: 2 },
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-correct-a', { createdAt: nowTs }),
      prodAttempt(conceptId, 'tpl-correct-b', { createdAt: nowTs + 1000 }),
    ],
    nowTs,
  });

  assert.equal(evidence.variedPractice, true,
    'correct answers on 2 distinct templates unlock variedPractice');
});

test('trust 2: mix of 2 wrong + 1 correct on distinct templates does NOT unlock variedPractice', () => {
  const conceptId = 'clauses';
  const nowTs = Date.now();

  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 3, correct: 1, wrong: 2, strength: 0.3, intervalDays: 0, correctStreak: 0 },
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', { correct: false, createdAt: nowTs }),
      prodAttempt(conceptId, 'tpl-b', { correct: false, createdAt: nowTs + 1000 }),
      prodAttempt(conceptId, 'tpl-c', { correct: true, createdAt: nowTs + 2000 }),
    ],
    nowTs,
  });

  assert.equal(evidence.variedPractice, false,
    'only 1 correct template means variedPractice stays false');
});

// =============================================================================
// Trust defect 3 — Temporal retention (retainedAfterSecure)
// =============================================================================

test('trust 3: all independent corrects predate secure -> retainedAfterSecure = false', () => {
  const conceptId = 'tense_aspect';
  const nowTs = Date.now();
  const node = secureNode();
  // Estimated securedAtTs = nowTs - intervalDays * 86400000
  const securedAtTs = nowTs - (node.intervalDays * 86400000);
  // All corrects BEFORE securedAtTs
  const preSecureTs = securedAtTs - 86400000;

  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: node,
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', { createdAt: preSecureTs }),
      prodAttempt(conceptId, 'tpl-b', { createdAt: preSecureTs + 1000 }),
    ],
    nowTs,
  });

  assert.equal(evidence.secureConfidence, true, 'concept is secure');
  assert.equal(evidence.retainedAfterSecure, false,
    'all corrects predate secure -> retainedAfterSecure = false');
});

test('trust 3: new independent correct after secure -> retainedAfterSecure = true', () => {
  const conceptId = 'tense_aspect';
  const nowTs = Date.now();
  const node = secureNode();
  const securedAtTs = nowTs - (node.intervalDays * 86400000);
  // One correct AFTER securedAtTs
  const postSecureTs = securedAtTs + 86400000;

  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: node,
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', { createdAt: postSecureTs }),
      prodAttempt(conceptId, 'tpl-b', { createdAt: postSecureTs + 1000 }),
    ],
    nowTs,
  });

  assert.equal(evidence.secureConfidence, true, 'concept is secure');
  assert.equal(evidence.retainedAfterSecure, true,
    'post-secure correct -> retainedAfterSecure = true');
});

test('trust 3: non-independent post-secure correct does NOT unlock retainedAfterSecure', () => {
  const conceptId = 'tense_aspect';
  const nowTs = Date.now();
  const node = secureNode();
  const securedAtTs = nowTs - (node.intervalDays * 86400000);
  const postSecureTs = securedAtTs + 86400000;

  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: node,
    recentAttempts: [
      // Post-secure but NOT independent (firstAttemptIndependent=false)
      prodAttempt(conceptId, 'tpl-a', {
        createdAt: postSecureTs,
        firstAttemptIndependent: false,
      }),
      prodAttempt(conceptId, 'tpl-b', {
        createdAt: postSecureTs + 1000,
        firstAttemptIndependent: false,
      }),
    ],
    nowTs,
  });

  assert.equal(evidence.secureConfidence, true, 'concept is secure');
  assert.equal(evidence.retainedAfterSecure, false,
    'non-independent post-secure corrects do NOT unlock retainedAfterSecure');
});

// =============================================================================
// Trust defect 4 — Sub-secure starHighWater persistence across session boundary
// =============================================================================

test('trust 4: first independent correct -> Stars >= 1 -> starHighWater persisted', () => {
  const repository = makeRepository();
  const conceptId = 'sentence_functions';
  const nowTs = Date.now();

  // Step 1: record concept mastery (concept-secured)
  recordGrammarConceptMastery({
    learnerId: 'learner-trust-4',
    conceptId,
    gameStateRepository: repository,
    random: () => 0,
  });

  // Step 2: derive Stars from production evidence (sub-secure: just firstIndependentWin)
  const conceptNodes = {
    [conceptId]: { attempts: 1, correct: 1, wrong: 0, strength: 0.3, intervalDays: 0, correctStreak: 1 },
  };
  const recentAttempts = [
    prodAttempt(conceptId, 'tpl-a', { createdAt: nowTs }),
  ];

  const progress = progressForGrammarMonster(repository.state(), 'bracehart', {
    conceptTotal: GRAMMAR_MONSTER_CONCEPTS.bracehart.length,
    conceptNodes,
    recentAttempts,
  });

  assert.ok(progress.stars >= 1, 'first independent correct produces >= 1 Star');

  // Step 3: persist starHighWater via updateGrammarStarHighWater
  updateGrammarStarHighWater({
    learnerId: 'learner-trust-4',
    monsterId: 'bracehart',
    conceptId,
    computedStars: progress.stars,
    gameStateRepository: repository,
    random: () => 0,
  });

  const stateAfterPersist = repository.state();
  assert.ok(stateAfterPersist.bracehart.starHighWater >= 1,
    'starHighWater persisted >= 1');

  // Step 4: simulate session boundary (conceptNodes gone, recentAttempts cleared)
  const progressAfterBoundary = progressForGrammarMonster(repository.state(), 'bracehart', {
    conceptTotal: GRAMMAR_MONSTER_CONCEPTS.bracehart.length,
    // No conceptNodes or recentAttempts — simulates cleared session
  });

  assert.ok(progressAfterBoundary.stars >= 1,
    'Stars survive session boundary via starHighWater latch');
  assert.ok(progressAfterBoundary.starHighWater >= 1,
    'starHighWater holds after session boundary');
});

test('trust 4: starHighWater ratchets monotonically across multiple evidence updates', () => {
  const repository = makeRepository();
  const conceptId = 'sentence_functions';

  // First update: Stars = 1
  updateGrammarStarHighWater({
    learnerId: 'learner-trust-4-ratchet',
    monsterId: 'bracehart',
    conceptId,
    computedStars: 1,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(repository.state().bracehart.starHighWater, 1, 'initial: starHighWater=1');

  // Second update: Stars = 5
  updateGrammarStarHighWater({
    learnerId: 'learner-trust-4-ratchet',
    monsterId: 'bracehart',
    conceptId,
    computedStars: 5,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(repository.state().bracehart.starHighWater, 5, 'raised: starHighWater=5');

  // Third update: lower Stars = 2 -> must not decrease
  updateGrammarStarHighWater({
    learnerId: 'learner-trust-4-ratchet',
    monsterId: 'bracehart',
    conceptId,
    computedStars: 2,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(repository.state().bracehart.starHighWater, 5,
    'starHighWater never decreases (still 5 after update with 2)');
});

// =============================================================================
// Trust defect 5 — Egg from sub-secure evidence
// =============================================================================

test('trust 5: first independent correct -> caught event fires -> caught:true persisted', () => {
  const repository = makeRepository();
  const conceptId = 'sentence_functions';

  // Sub-secure evidence: Star via star-evidence-updated event (no concept-secured needed)
  const events = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-trust-5',
      conceptId,
      monsterId: 'bracehart',
      computedStars: 1,
      createdAt: Date.now(),
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // caught event fired
  const caughtEvents = events.filter(
    (e) => e.monsterId === 'bracehart' && e.kind === 'caught',
  );
  assert.equal(caughtEvents.length, 1, 'exactly one Bracehart caught event');

  // caught:true persisted
  const state = repository.state();
  assert.equal(state.bracehart.caught, true, 'caught:true persisted');
  assert.equal(state.bracehart.starHighWater, 1, 'starHighWater=1 persisted');

  // mastered[] remains empty (star-evidence does not add to mastered[])
  assert.deepEqual(state.bracehart.mastered || [], [], 'mastered[] empty (sub-secure)');
});

test('trust 5: concept-secured later does NOT fire duplicate caught event', () => {
  const repository = makeRepository();
  const conceptId = 'sentence_functions';

  // Phase 1: sub-secure evidence catches the monster
  rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-trust-5-dedup',
      conceptId,
      monsterId: 'bracehart',
      computedStars: 2,
      createdAt: Date.now(),
    },
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-trust-5-dedup',
      conceptId,
      monsterId: 'concordium',
      computedStars: 1,
      createdAt: Date.now(),
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // Verify both caught
  const stateMid = repository.state();
  assert.equal(stateMid.bracehart.caught, true, 'Bracehart caught after phase 1');
  assert.equal(stateMid.concordium.caught, true, 'Concordium caught after phase 1');

  // Phase 2: concept-secured fires later
  const securedEvents = recordGrammarConceptMastery({
    learnerId: 'learner-trust-5-dedup',
    conceptId,
    gameStateRepository: repository,
    random: () => 0,
  });

  // No duplicate caught events
  const duplicateCaught = securedEvents.filter((e) => e.kind === 'caught');
  assert.equal(duplicateCaught.length, 0,
    'concept-secured does NOT fire duplicate caught after sub-secure evidence');

  // mastered[] now populated
  const statePost = repository.state();
  const key = grammarMasteryKey(conceptId);
  assert.ok(statePost.bracehart.mastered.includes(key), 'mastered[] updated');
});

// =============================================================================
// Trust defect 6 — Dashboard evidence pass-through
// =============================================================================

test('trust 6: buildGrammarDashboardModel with evidence produces higher Stars than with null evidence', () => {
  const repository = makeRepository();
  const conceptId = 'sentence_functions';
  const nowTs = Date.now();

  // Record one concept secured
  recordGrammarConceptMastery({
    learnerId: 'learner-trust-6',
    conceptId,
    gameStateRepository: repository,
    random: () => 0,
  });

  // Persist a low starHighWater (sub-secure)
  updateGrammarStarHighWater({
    learnerId: 'learner-trust-6',
    monsterId: 'bracehart',
    conceptId,
    computedStars: 1,
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  // Dashboard WITHOUT evidence (null conceptNodes): reads from starHighWater only
  const dashNoEvidence = buildGrammarDashboardModel({}, null, state, null, null);
  const bracehartNoEvidence = dashNoEvidence.monsterStrip.find(
    (e) => e.monsterId === 'bracehart',
  );

  // Dashboard WITH evidence: derives higher Stars from concept evidence
  const node = secureNode();
  const postSecureTs = nowTs - ((node.intervalDays - 1) * 86400000);
  const conceptNodes = { [conceptId]: node };
  const recentAttempts = [
    prodAttempt(conceptId, 'tpl-a', { createdAt: postSecureTs }),
    prodAttempt(conceptId, 'tpl-b', { createdAt: postSecureTs + 1000 }),
  ];
  const dashWithEvidence = buildGrammarDashboardModel(
    {}, null, state, conceptNodes, recentAttempts,
  );
  const bracehartWithEvidence = dashWithEvidence.monsterStrip.find(
    (e) => e.monsterId === 'bracehart',
  );

  assert.ok(bracehartWithEvidence.stars > bracehartNoEvidence.stars,
    `Dashboard with evidence (${bracehartWithEvidence.stars}) > without (${bracehartNoEvidence.stars})`);
});

test('trust 6: dashboard monsterStrip shape is valid with production evidence', () => {
  const repository = makeRepository();
  const nowTs = Date.now();

  // Secure multiple concepts
  for (const conceptId of GRAMMAR_MONSTER_CONCEPTS.bracehart.slice(0, 3)) {
    recordGrammarConceptMastery({
      learnerId: 'learner-trust-6-shape',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  const state = repository.state();
  const securedConcepts = GRAMMAR_MONSTER_CONCEPTS.bracehart.slice(0, 3);
  const { conceptNodes, recentAttempts } = fullProductionEvidenceForConcepts(securedConcepts, { nowTs });

  const dashboard = buildGrammarDashboardModel({}, null, state, conceptNodes, recentAttempts);

  // All 4 monsters present
  assert.equal(dashboard.monsterStrip.length, 4, '4 monsters in strip');
  const ids = dashboard.monsterStrip.map((e) => e.monsterId);
  assert.deepEqual(ids, ['bracehart', 'chronalyx', 'couronnail', 'concordium']);

  // Each entry has correct shape
  for (const entry of dashboard.monsterStrip) {
    assert.equal(typeof entry.stars, 'number', `${entry.monsterId} has numeric stars`);
    assert.equal(entry.starMax, 100, `${entry.monsterId} starMax is 100`);
    assert.equal(typeof entry.stageName, 'string', `${entry.monsterId} has stageName`);
    assert.equal(typeof entry.stageIndex, 'number', `${entry.monsterId} has stageIndex`);
  }

  // Bracehart has evidence -> Stars > 0
  const bracehart = dashboard.monsterStrip.find((e) => e.monsterId === 'bracehart');
  assert.ok(bracehart.stars >= 1, 'Bracehart Stars >= 1 with evidence');
});

// =============================================================================
// Zero-Star inflation paths
// =============================================================================

test('zero-inflation: Writing Try (no correct answer) -> 0 Stars, 0 events', () => {
  const repository = makeRepository();
  recordGrammarConceptMastery({
    learnerId: 'learner-zero-wt',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });

  const stateBefore = repository.state();
  const progressBefore = progressForGrammarMonster(stateBefore, 'bracehart', {
    conceptTotal: GRAMMAR_MONSTER_CONCEPTS.bracehart.length,
  });

  // Fire a transfer-evidence-saved event (Writing Try)
  const transferEvent = {
    id: 'grammar.transfer-evidence-saved.learner-zero-wt.req-1.adverbial-opener',
    type: 'grammar.transfer-evidence-saved',
    subjectId: 'grammar',
    learnerId: 'learner-zero-wt',
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

  assert.deepEqual(events, [], 'Writing Try produces zero reward events');

  const stateAfter = repository.state();
  const progressAfter = progressForGrammarMonster(stateAfter, 'bracehart', {
    conceptTotal: GRAMMAR_MONSTER_CONCEPTS.bracehart.length,
  });
  assert.equal(progressAfter.stars, progressBefore.stars,
    'Stars unchanged after Writing Try');
});

test('zero-inflation: AI explanation -> 0 Stars (misconception-seen is non-scored)', () => {
  const repository = makeRepository();

  const events = rewardEventsFromGrammarEvents([
    {
      type: 'grammar.misconception-seen',
      subjectId: 'grammar',
      learnerId: 'learner-zero-ai',
      conceptIds: ['sentence_functions'],
      createdAt: Date.now(),
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.deepEqual(events, [], 'AI explanation produces zero reward events');
  assert.equal(repository.writeCount(), 0, 'zero writes from AI explanation');
});

test('zero-inflation: supported (worked/faded) answers produce no independent-tier credit', () => {
  const conceptId = 'relative_clauses';
  const nowTs = Date.now();

  // All attempts are supported (firstAttemptIndependent=false)
  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 3, correct: 3, wrong: 0, strength: 0.5, intervalDays: 0, correctStreak: 3 },
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', {
        correct: true,
        firstAttemptIndependent: false,
        supportLevelAtScoring: 2,
        createdAt: nowTs,
      }),
      prodAttempt(conceptId, 'tpl-b', {
        correct: true,
        firstAttemptIndependent: false,
        supportLevelAtScoring: 1,
        createdAt: nowTs + 1000,
      }),
    ],
    nowTs,
  });

  assert.equal(evidence.firstIndependentWin, false,
    'supported answers do not unlock firstIndependentWin');
  assert.equal(evidence.repeatIndependentWin, false,
    'supported answers do not unlock repeatIndependentWin');
  assert.equal(evidence.retainedAfterSecure, false,
    'supported answers do not unlock retainedAfterSecure');
  // variedPractice IS unlocked (template-based, correct-only gate, independent not required)
  assert.equal(evidence.variedPractice, true,
    'variedPractice is template-based so 2 distinct correct templates unlock it');
});

test('zero-inflation: wrong-only template exposure produces no variedPractice', () => {
  const conceptId = 'noun_phrases';
  const nowTs = Date.now();

  const evidence = deriveGrammarConceptStarEvidence({
    conceptId,
    conceptNode: { attempts: 5, correct: 0, wrong: 5, strength: 0.1, intervalDays: 0, correctStreak: 0 },
    recentAttempts: [
      prodAttempt(conceptId, 'tpl-a', { correct: false, createdAt: nowTs }),
      prodAttempt(conceptId, 'tpl-b', { correct: false, createdAt: nowTs + 1000 }),
      prodAttempt(conceptId, 'tpl-c', { correct: false, createdAt: nowTs + 2000 }),
    ],
    nowTs,
  });

  assert.equal(evidence.variedPractice, false,
    'wrong-only template exposure does not unlock variedPractice');
  assert.equal(evidence.firstIndependentWin, false, 'no independent tiers from wrong answers');
});

test('zero-inflation: computedStars=0 in star-evidence-updated produces zero persistence', () => {
  const repository = makeRepository();

  const events = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-zero-stars',
      conceptId: 'sentence_functions',
      monsterId: 'bracehart',
      computedStars: 0,
      createdAt: Date.now(),
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.deepEqual(events, [], 'zero Stars produces zero events');
  assert.equal(repository.writeCount(), 0, 'zero writes for zero Stars');
});

// =============================================================================
// Parity check — Spelling unaffected by Grammar changes
// =============================================================================

test('parity: Spelling monster state is unaffected by Grammar Star operations', () => {
  const repository = makeRepository({
    pealark: { mastered: ['some-word'], caught: true, level: 5 },
  });

  // Secure Grammar concepts and fire star-evidence events
  for (const conceptId of GRAMMAR_MONSTER_CONCEPTS.bracehart.slice(0, 3)) {
    recordGrammarConceptMastery({
      learnerId: 'learner-parity',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  // Also fire star-evidence-updated events
  rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-parity',
      conceptId: 'sentence_functions',
      monsterId: 'bracehart',
      computedStars: 5,
      createdAt: Date.now(),
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  // Spelling monster (pealark) unchanged
  assert.deepEqual(state.pealark.mastered, ['some-word'],
    'Spelling pealark mastered list unchanged');
  assert.equal(state.pealark.caught, true, 'Spelling pealark caught unchanged');
  assert.equal(state.pealark.level, 5, 'Spelling pealark level unchanged');

  // No other Spelling monsters created
  const spellingMonsters = ['quoral', 'rexby', 'stellox', 'umber'];
  for (const monsterId of spellingMonsters) {
    assert.equal(state[monsterId], undefined,
      `Spelling monster ${monsterId} should not be created by Grammar operations`);
  }
});

// =============================================================================
// Production-shape round-trip: deriveEvidence -> computeStars -> progressForMonster
// =============================================================================

test('trust round-trip: production-shape attempts flow through derive -> compute -> progress', () => {
  const repository = makeRepository();
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const nowTs = Date.now();

  // Secure all Bracehart concepts
  for (const conceptId of concepts) {
    recordGrammarConceptMastery({
      learnerId: 'learner-round-trip',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
  }

  // Build production evidence for all Bracehart concepts
  const { conceptNodes, recentAttempts } = fullProductionEvidenceForConcepts(concepts, { nowTs });

  // Step 1: derive evidence for each concept
  const evidenceMap = {};
  for (const conceptId of concepts) {
    evidenceMap[conceptId] = deriveGrammarConceptStarEvidence({
      conceptId,
      conceptNode: conceptNodes[conceptId],
      recentAttempts,
      nowTs,
    });
  }

  // Verify all 5 tiers unlocked for each concept
  for (const conceptId of concepts) {
    const ev = evidenceMap[conceptId];
    assert.equal(ev.firstIndependentWin, true, `${conceptId}: firstIndependentWin`);
    assert.equal(ev.repeatIndependentWin, true, `${conceptId}: repeatIndependentWin`);
    assert.equal(ev.variedPractice, true, `${conceptId}: variedPractice`);
    assert.equal(ev.secureConfidence, true, `${conceptId}: secureConfidence`);
    assert.equal(ev.retainedAfterSecure, true, `${conceptId}: retainedAfterSecure`);
  }

  // Step 2: compute Stars from evidence map
  const starResult = computeGrammarMonsterStars('bracehart', evidenceMap);
  assert.equal(starResult.stars, 100, 'computeGrammarMonsterStars returns 100');

  // Step 3: progressForGrammarMonster integrates with state
  const progress = progressForGrammarMonster(repository.state(), 'bracehart', {
    conceptTotal: concepts.length,
    conceptNodes,
    recentAttempts,
  });
  assert.equal(progress.stars, 100, 'progressForGrammarMonster returns 100 Stars');
  assert.equal(progress.stageName, 'Mega', 'stage is Mega');
  assert.equal(progress.starMax, GRAMMAR_MONSTER_STAR_MAX, 'starMax is 100');
});
