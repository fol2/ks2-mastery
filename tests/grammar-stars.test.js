// Tests for U2 — Grammar Phase 5 Star display model and evidence-tier derivation.
//
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U2).
// Module under test: shared/grammar/grammar-stars.js.
//
// Structure:
//  1. Constants — pin GRAMMAR_MONSTER_STAR_MAX, weights, thresholds.
//  2. deriveGrammarConceptStarEvidence — evidence tier detection from mastery
//     node + recentAttempts.
//  3. computeGrammarMonsterStars — per-monster Star totals from evidence maps.
//  4. grammarStarStageFor — stage 0-4 derivation from Stars.
//  5. grammarStarStageName — child-facing label strings.
//  6. Per-monster integration — Bracehart, Chronalyx, Couronnail, Concordium.
//  7. Edge cases — null nodes, NaN, empty evidence, floor guarantee.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_MONSTER_STAR_MAX,
  GRAMMAR_STAR_STAGE_THRESHOLDS,
  GRAMMAR_CONCEPT_STAR_WEIGHTS,
  deriveGrammarConceptStarEvidence,
  computeGrammarMonsterStars,
  grammarStarStageFor,
  grammarStarDisplayStage,
  grammarStarStageName,
} from '../shared/grammar/grammar-stars.js';
import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_MONSTER_CONCEPTS,
} from '../shared/grammar/grammar-concept-roster.js';

// ---------------------------------------------------------------------------
// 1. Constants
// ---------------------------------------------------------------------------

test('GRAMMAR_MONSTER_STAR_MAX === 100', () => {
  assert.equal(GRAMMAR_MONSTER_STAR_MAX, 100);
});

test('GRAMMAR_STAR_STAGE_THRESHOLDS shape', () => {
  assert.deepEqual(GRAMMAR_STAR_STAGE_THRESHOLDS, {
    egg: 1,
    hatch: 15,
    evolve2: 35,
    evolve3: 65,
    mega: 100,
  });
  assert.ok(Object.isFrozen(GRAMMAR_STAR_STAGE_THRESHOLDS));
});

test('GRAMMAR_CONCEPT_STAR_WEIGHTS sum === 1.0', () => {
  const sum = Object.values(GRAMMAR_CONCEPT_STAR_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(sum, 1.0, `Weights sum to ${sum}, expected 1.0`);
  assert.deepEqual(GRAMMAR_CONCEPT_STAR_WEIGHTS, {
    firstIndependentWin: 0.05,
    repeatIndependentWin: 0.10,
    variedPractice: 0.10,
    secureConfidence: 0.15,
    retainedAfterSecure: 0.60,
  });
  assert.ok(Object.isFrozen(GRAMMAR_CONCEPT_STAR_WEIGHTS));
});

// ---------------------------------------------------------------------------
// 2. deriveGrammarConceptStarEvidence
// ---------------------------------------------------------------------------

test('evidence tier: concept with 1 independent correct → firstIndependentWin only', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, true);
  assert.equal(result.repeatIndependentWin, false);
  assert.equal(result.variedPractice, false);
  assert.equal(result.secureConfidence, false);
  assert.equal(result.retainedAfterSecure, false);
});

test('evidence tier: repeatIndependentWin requires 2+ distinct independent correct (production shape)', () => {
  const conceptNode = { attempts: 3, correct: 3, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 3 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: false }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, true);
  assert.equal(result.repeatIndependentWin, true);
  assert.equal(result.variedPractice, false);
});

test('evidence tier: variedPractice requires 2+ distinct templateId (production shape)', () => {
  const conceptNode = { attempts: 2, correct: 2, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 2 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, true);
});

test('evidence tier: variedPractice false with only 1 template (production shape)', () => {
  const conceptNode = { attempts: 3, correct: 3, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 3 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, false);
});

test('evidence tier: secureConfidence from status secured', () => {
  const conceptNode = { attempts: 10, correct: 9, wrong: 1, strength: 0.85, intervalDays: 8, correctStreak: 5 };
  const recentAttempts = [];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.secureConfidence, true);
});

test('evidence tier: secureConfidence from threshold heuristic (strength >= 0.82, interval >= 7, streak >= 3)', () => {
  const conceptNode = { attempts: 8, correct: 7, wrong: 1, strength: 0.82, intervalDays: 7, correctStreak: 3 };
  const recentAttempts = [];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.secureConfidence, true);
});

test('evidence tier: secureConfidence false when strength < 0.82', () => {
  const conceptNode = { attempts: 8, correct: 7, wrong: 1, strength: 0.81, intervalDays: 7, correctStreak: 3 };
  const recentAttempts = [];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.secureConfidence, false);
});

test('evidence tier: secureConfidence false when intervalDays < 7', () => {
  const conceptNode = { attempts: 8, correct: 7, wrong: 1, strength: 0.85, intervalDays: 6, correctStreak: 3 };
  const recentAttempts = [];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.secureConfidence, false);
});

test('evidence tier: secureConfidence false when correctStreak < 3', () => {
  const conceptNode = { attempts: 8, correct: 7, wrong: 1, strength: 0.85, intervalDays: 8, correctStreak: 2 };
  const recentAttempts = [];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.secureConfidence, false);
});

test('evidence tier: retainedAfterSecure requires secure + post-secure independent correct (ADV-003+U3, production shape)', () => {
  // Concept is secured (intervalDays: 14). securedAtTs ≈ nowTs - 14d.
  // At least 1 independent correct must have createdAt > securedAtTs.
  const nowTs = 1_700_000_000_000; // fixed reference
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 3 * 86400000 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 1 * 86400000 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, true);
});

test('evidence tier: retainedAfterSecure false with only 1 independent correct (ADV-003, production shape)', () => {
  // The attempt lacks createdAt, so it is excluded from the temporal scan.
  // Under the U3 temporal gate, retainedAfterSecure requires at least one
  // independent correct with createdAt after the estimated secure date.
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, false);
});

test('evidence tier: retainedAfterSecure false when no independent correct in recentAttempts (production shape)', () => {
  // Concept is secured but no independent correct in recent attempts
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: false, supportLevelAtScoring: 2 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, false);
});

test('evidence tier: retainedAfterSecure false when not secured (intervalDays < 7)', () => {
  const conceptNode = { attempts: 5, correct: 5, wrong: 0, strength: 0.7, intervalDays: 3, correctStreak: 5 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.secureConfidence, false);
  assert.equal(result.retainedAfterSecure, false);
});

test('evidence tier: supported answer (worked/faded) does not unlock firstIndependentWin (production shape)', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: false, supportLevelAtScoring: 2 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, false);
});

test('evidence tier: only matching conceptId entries count (production shape)', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    // Different concept — should be ignored
    { conceptIds: ['tense_aspect'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, false);
});

test('evidence tier: all 5 tiers true for fully evidenced concept', () => {
  const nowTs = 1_700_000_000_000;
  const conceptNode = { attempts: 15, correct: 14, wrong: 1, strength: 0.90, intervalDays: 14, correctStreak: 8 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 3 * 86400000 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 2 * 86400000 },
    { conceptId: 'clauses', templateId: 'tmpl-c', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 1 * 86400000 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.firstIndependentWin, true);
  assert.equal(result.repeatIndependentWin, true);
  assert.equal(result.variedPractice, true);
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, true);
});

test('evidence tier: null/undefined conceptNode → all false', () => {
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode: null, recentAttempts: [] });
  assert.equal(result.firstIndependentWin, false);
  assert.equal(result.repeatIndependentWin, false);
  assert.equal(result.variedPractice, false);
  assert.equal(result.secureConfidence, false);
  assert.equal(result.retainedAfterSecure, false);
});

test('evidence tier: undefined conceptNode → all false', () => {
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode: undefined, recentAttempts: [] });
  assert.equal(result.firstIndependentWin, false);
  assert.equal(result.repeatIndependentWin, false);
  assert.equal(result.variedPractice, false);
  assert.equal(result.secureConfidence, false);
  assert.equal(result.retainedAfterSecure, false);
});

test('evidence tier: NaN strength/attempts → defensive normalisation, all false', () => {
  const conceptNode = { attempts: NaN, correct: NaN, wrong: NaN, strength: NaN, intervalDays: NaN, correctStreak: NaN };
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts: [] });
  assert.equal(result.firstIndependentWin, false);
  assert.equal(result.repeatIndependentWin, false);
  assert.equal(result.variedPractice, false);
  assert.equal(result.secureConfidence, false);
  assert.equal(result.retainedAfterSecure, false);
});

// ---------------------------------------------------------------------------
// 3. computeGrammarMonsterStars
// ---------------------------------------------------------------------------

// Helper: build a conceptEvidenceMap where all concepts for a monster have
// all tiers unlocked.
function allEvidenceForConcepts(conceptIds) {
  const map = {};
  for (const id of conceptIds) {
    map[id] = {
      firstIndependentWin: true,
      repeatIndependentWin: true,
      variedPractice: true,
      secureConfidence: true,
      retainedAfterSecure: true,
    };
  }
  return map;
}

function noEvidenceForConcepts(conceptIds) {
  const map = {};
  for (const id of conceptIds) {
    map[id] = {
      firstIndependentWin: false,
      repeatIndependentWin: false,
      variedPractice: false,
      secureConfidence: false,
      retainedAfterSecure: false,
    };
  }
  return map;
}

function firstWinOnlyForConcepts(conceptIds) {
  const map = {};
  for (const id of conceptIds) {
    map[id] = {
      firstIndependentWin: true,
      repeatIndependentWin: false,
      variedPractice: false,
      secureConfidence: false,
      retainedAfterSecure: false,
    };
  }
  return map;
}

test('star computation: Bracehart owned concepts all fully evidenced → 100 Stars', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const result = computeGrammarMonsterStars('bracehart', allEvidenceForConcepts(concepts));
  assert.equal(result.stars, 100);
  assert.equal(result.starMax, 100);
});

test('star computation: Couronnail owned concepts all fully evidenced → 100 Stars', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.couronnail;
  const result = computeGrammarMonsterStars('couronnail', allEvidenceForConcepts(concepts));
  assert.equal(result.stars, 100);
  assert.equal(result.starMax, 100);
});

test('star computation: Chronalyx 4 concepts all fully evidenced → 100 Stars', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.chronalyx;
  const result = computeGrammarMonsterStars('chronalyx', allEvidenceForConcepts(concepts));
  assert.equal(result.stars, 100);
  assert.equal(result.starMax, 100);
});

test('star computation: Concordium 18 concepts all fully evidenced → 100 Stars', () => {
  const concepts = GRAMMAR_AGGREGATE_CONCEPTS;
  const result = computeGrammarMonsterStars('concordium', allEvidenceForConcepts(concepts));
  assert.equal(result.stars, 100);
  assert.equal(result.starMax, 100);
});

test('star computation: no evidence → 0 Stars', () => {
  const result = computeGrammarMonsterStars('bracehart', noEvidenceForConcepts(GRAMMAR_MONSTER_CONCEPTS.bracehart));
  assert.equal(result.stars, 0);
});

test('star computation: concept with only supported answers → 0 Stars', () => {
  const map = {
    sentence_functions: { firstIndependentWin: false, repeatIndependentWin: false, variedPractice: false, secureConfidence: false, retainedAfterSecure: false },
    clauses: { firstIndependentWin: false, repeatIndependentWin: false, variedPractice: false, secureConfidence: false, retainedAfterSecure: false },
    relative_clauses: { firstIndependentWin: false, repeatIndependentWin: false, variedPractice: false, secureConfidence: false, retainedAfterSecure: false },
    noun_phrases: { firstIndependentWin: false, repeatIndependentWin: false, variedPractice: false, secureConfidence: false, retainedAfterSecure: false },
    active_passive: { firstIndependentWin: false, repeatIndependentWin: false, variedPractice: false, secureConfidence: false, retainedAfterSecure: false },
    subject_object: { firstIndependentWin: false, repeatIndependentWin: false, variedPractice: false, secureConfidence: false, retainedAfterSecure: false },
  };
  const result = computeGrammarMonsterStars('bracehart', map);
  assert.equal(result.stars, 0);
});

test('star computation: Bracehart 1 concept firstIndependentWin only → floor guarantee 1 Star', () => {
  const map = noEvidenceForConcepts(GRAMMAR_MONSTER_CONCEPTS.bracehart);
  map.clauses = { ...map.clauses, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('bracehart', map);
  // conceptBudget = 100/9 = 11.111; 11.111 * 0.05 = 0.556; floor(0.556) = 0
  // But per-monster floor: any evidence → at least 1 Star
  assert.equal(result.stars, 1);
});

test('star computation: Concordium 1 concept firstIndependentWin → floor guarantee 1 Star', () => {
  const concepts = GRAMMAR_AGGREGATE_CONCEPTS;
  const map = noEvidenceForConcepts(concepts);
  map.clauses = { ...map.clauses, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('concordium', map);
  // conceptBudget = 100/18 = 5.556; 5.556 * 0.05 = 0.278; floor(0.278) = 0
  // But per-monster floor → 1 Star
  assert.equal(result.stars, 1);
});

test('star computation: Concordium 18 concepts each firstIndependentWin only → 5 Stars (epsilon-aware floor)', () => {
  const concepts = GRAMMAR_AGGREGATE_CONCEPTS;
  const map = firstWinOnlyForConcepts(concepts);
  const result = computeGrammarMonsterStars('concordium', map);
  // Ideal: 18 * (100/18 * 0.05) = 5.0. Without epsilon, IEEE 754 yields
  // 4.999... → floor = 4. With epsilon-aware floor (ADV-002), correctly = 5.
  assert.equal(result.stars, 5);
});

test('star computation: empty conceptEvidenceMap → 0 Stars', () => {
  const result = computeGrammarMonsterStars('bracehart', {});
  assert.equal(result.stars, 0);
});

test('star computation: result includes stageName and displayStage', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const map = noEvidenceForConcepts(concepts);
  map.clauses = { ...map.clauses, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('bracehart', map);
  assert.equal(result.stars, 1);
  assert.equal(result.stageName, 'Egg found');
  assert.equal(typeof result.displayStage, 'number');
});

test('star computation: result includes nextMilestoneStars and nextMilestoneLabel', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const map = noEvidenceForConcepts(concepts);
  map.clauses = { ...map.clauses, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('bracehart', map);
  assert.equal(result.nextMilestoneStars, 15);
  assert.equal(result.nextMilestoneLabel, 'Hatched');
});

test('star computation: Mega has no next milestone', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const result = computeGrammarMonsterStars('bracehart', allEvidenceForConcepts(concepts));
  assert.equal(result.stars, 100);
  assert.equal(result.nextMilestoneStars, null);
  assert.equal(result.nextMilestoneLabel, null);
});

// ---------------------------------------------------------------------------
// 4. grammarStarStageFor — stage 0-4
// ---------------------------------------------------------------------------

test('grammarStarStageFor: 0 Stars → stage 0', () => {
  assert.equal(grammarStarStageFor(0), 0);
});

test('grammarStarStageFor: 1 Star → stage 1', () => {
  assert.equal(grammarStarStageFor(1), 1);
});

test('grammarStarStageFor: 14 Stars → stage 1', () => {
  assert.equal(grammarStarStageFor(14), 1);
});

test('grammarStarStageFor: 15 Stars → stage 2', () => {
  assert.equal(grammarStarStageFor(15), 2);
});

test('grammarStarStageFor: 34 Stars → stage 2', () => {
  assert.equal(grammarStarStageFor(34), 2);
});

test('grammarStarStageFor: 35 Stars → stage 2', () => {
  // 35 is evolve2 threshold but internal stage is still 2
  assert.equal(grammarStarStageFor(35), 2);
});

test('grammarStarStageFor: 64 Stars → stage 2', () => {
  assert.equal(grammarStarStageFor(64), 2);
});

test('grammarStarStageFor: 65 Stars → stage 3', () => {
  assert.equal(grammarStarStageFor(65), 3);
});

test('grammarStarStageFor: 99 Stars → stage 3', () => {
  assert.equal(grammarStarStageFor(99), 3);
});

test('grammarStarStageFor: 100 Stars → stage 4', () => {
  assert.equal(grammarStarStageFor(100), 4);
});

test('grammarStarStageFor: negative Stars → stage 0', () => {
  assert.equal(grammarStarStageFor(-5), 0);
});

test('grammarStarStageFor: NaN → stage 0', () => {
  assert.equal(grammarStarStageFor(NaN), 0);
});

// ---------------------------------------------------------------------------
// 5. grammarStarDisplayStage — 0-5 for 6 named stages
// ---------------------------------------------------------------------------

test('grammarStarDisplayStage: 0 → 0 (Not found)', () => {
  assert.equal(grammarStarDisplayStage(0), 0);
});

test('grammarStarDisplayStage: 1 → 1 (Egg)', () => {
  assert.equal(grammarStarDisplayStage(1), 1);
});

test('grammarStarDisplayStage: 15 → 2 (Hatched)', () => {
  assert.equal(grammarStarDisplayStage(15), 2);
});

test('grammarStarDisplayStage: 35 → 3 (Growing)', () => {
  assert.equal(grammarStarDisplayStage(35), 3);
});

test('grammarStarDisplayStage: 65 → 4 (Nearly Mega)', () => {
  assert.equal(grammarStarDisplayStage(65), 4);
});

test('grammarStarDisplayStage: 100 → 5 (Mega)', () => {
  assert.equal(grammarStarDisplayStage(100), 5);
});

// ---------------------------------------------------------------------------
// 6. grammarStarStageName
// ---------------------------------------------------------------------------

test('grammarStarStageName: child-facing labels', () => {
  assert.equal(grammarStarStageName(0), 'Not found yet');
  assert.equal(grammarStarStageName(1), 'Egg found');
  assert.equal(grammarStarStageName(14), 'Egg found');
  assert.equal(grammarStarStageName(15), 'Hatched');
  assert.equal(grammarStarStageName(34), 'Hatched');
  assert.equal(grammarStarStageName(35), 'Growing');
  assert.equal(grammarStarStageName(64), 'Growing');
  assert.equal(grammarStarStageName(65), 'Nearly Mega');
  assert.equal(grammarStarStageName(99), 'Nearly Mega');
  assert.equal(grammarStarStageName(100), 'Mega');
});

// ---------------------------------------------------------------------------
// 7. Per-monster budget math integration
// ---------------------------------------------------------------------------

test('star computation: Bracehart partial — 3/9 concepts firstIndependentWin only', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const map = noEvidenceForConcepts(concepts);
  map.sentence_functions.firstIndependentWin = true;
  map.clauses.firstIndependentWin = true;
  map.relative_clauses.firstIndependentWin = true;
  const result = computeGrammarMonsterStars('bracehart', map);
  // conceptBudget = 100/9 = 11.111; 3 * 11.111 * 0.05 = 1.667; floor = 1
  assert.equal(result.stars, 1);
});

test('star computation: Couronnail 1 concept all tiers → floor(20.0 * 1.0) = 20', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.couronnail;
  const map = noEvidenceForConcepts(concepts);
  map.word_classes = {
    firstIndependentWin: true,
    repeatIndependentWin: true,
    variedPractice: true,
    secureConfidence: true,
    retainedAfterSecure: true,
  };
  const result = computeGrammarMonsterStars('couronnail', map);
  // conceptBudget = 100/5 = 20; floor = 20
  assert.equal(result.stars, 20);
});

test('star computation: Bracehart secure only (no retention) → capped at ~40%', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.bracehart;
  const map = {};
  for (const id of concepts) {
    map[id] = {
      firstIndependentWin: true,
      repeatIndependentWin: true,
      variedPractice: true,
      secureConfidence: true,
      retainedAfterSecure: false, // no retention evidence
    };
  }
  const result = computeGrammarMonsterStars('bracehart', map);
  // Each concept: 11.111 * (0.05+0.10+0.10+0.15) = 11.111 * 0.40 = 4.444
  // Total: 9 * 4.444 = 40.0, but floating-point flooring lands at 39.
  assert.ok(result.stars >= 39 && result.stars <= 40);
});

// ---------------------------------------------------------------------------
// 8. ADV-001: Nudge gate — supportLevelAtScoring: 0 with firstAttemptIndependent: false
// ---------------------------------------------------------------------------

test('evidence tier: nudge attempt (supportLevel 0, firstAttemptIndependent false) does NOT unlock firstIndependentWin (ADV-001, production shape)', () => {
  // A nudge attempt: the child got it wrong first, then retried correctly.
  // supportLevelAtScoring is 0 (no external support was rendered), but
  // firstAttemptIndependent is false because the first attempt was wrong.
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', supportLevelAtScoring: 0, firstAttemptIndependent: false, supportUsed: 'nudge' },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, false, 'Nudge attempts must not unlock independent tiers');
});

// ---------------------------------------------------------------------------
// 9. TEST-001: Unknown monsterId
// ---------------------------------------------------------------------------

test('star computation: unknown monsterId → 0 Stars with full result shape', () => {
  const result = computeGrammarMonsterStars('nonexistent', {});
  assert.equal(result.stars, 0);
  assert.equal(result.starMax, 100);
  assert.equal(result.displayStage, 0);
  assert.equal(result.stageName, 'Not found yet');
  assert.equal(result.nextMilestoneStars, 1);
  assert.equal(result.nextMilestoneLabel, 'Egg found');
});

// ---------------------------------------------------------------------------
// 10. TEST-002: OR-condition arm — supportLevelAtScoring: 0 alone is insufficient
// ---------------------------------------------------------------------------

test('evidence tier: supportLevelAtScoring 0 alone (firstAttemptIndependent false) does NOT trigger firstIndependentWin (TEST-002)', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, supportLevelAtScoring: 0, firstAttemptIndependent: false },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, false);
});

// ---------------------------------------------------------------------------
// 11. TEST-003: variedPractice defensive guard — empty/null templateId
// ---------------------------------------------------------------------------

test('evidence tier: variedPractice false with empty-string templateId (production shape)', () => {
  const conceptNode = { attempts: 2, correct: 2, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 2 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: '', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: '', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, false);
});

test('evidence tier: variedPractice false with null templateId (production shape)', () => {
  const conceptNode = { attempts: 2, correct: 2, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 2 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: null, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: null, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, false);
});

// ---------------------------------------------------------------------------
// U1: Production-shape attempt contract tests
// ---------------------------------------------------------------------------

test('U1 CHAR: production-shape { conceptIds, result.correct } → firstIndependentWin = true', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true, score: 1, maxScore: 1 }, templateId: 'tpl-1', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: Date.now() },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, true, 'Production-shape attempt must unlock firstIndependentWin');
});

test('U1 CHAR: production-shape multi-concept → both concepts get evidence', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { conceptIds: ['clauses', 'phrases'], result: { correct: true }, templateId: 'tpl-1', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const clausesResult = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  const phrasesResult = deriveGrammarConceptStarEvidence({ conceptId: 'phrases', conceptNode, recentAttempts });
  assert.equal(clausesResult.firstIndependentWin, true, 'clauses must get evidence');
  assert.equal(phrasesResult.firstIndependentWin, true, 'phrases must get evidence');
});

test('U1 CHAR: production-shape result.correct false → no evidence', () => {
  const conceptNode = { attempts: 1, correct: 0, wrong: 1, strength: 0.3, intervalDays: 1, correctStreak: 0 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: false }, templateId: 'tpl-1', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, false);
});

test('U1 CHAR: empty conceptIds array → matches nothing → 0 evidence', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { conceptIds: [], result: { correct: true }, templateId: 'tpl-1', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, false);
});

test('U1 CHAR: conceptIds not an array → falls back to flat matching', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { conceptIds: 'clauses', conceptId: 'clauses', correct: true, templateId: 'tpl-1', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, true, 'Falls back to flat conceptId when conceptIds is not an array');
});

test('U1 CHAR: missing both conceptId and conceptIds → 0 evidence, no crash', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { result: { correct: true }, templateId: 'tpl-1', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, false);
});

test('U1 CONTRACT: production-shape and flat-shape produce identical Stars', () => {
  // ADV-U3-005: Include createdAt + nowTs so retainedAfterSecure exercises the
  // actual temporal gate, not the degenerate "no createdAt" fallback.
  const nowTs = Date.now();
  const createdAt = nowTs - 3 * 86400000; // 3 days ago; intervalDays: 14 → securedAtTs = nowTs - 14d → post-secure
  const conceptNode = { attempts: 15, correct: 14, wrong: 1, strength: 0.90, intervalDays: 14, correctStreak: 8 };
  const productionAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-c', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt },
  ];
  const flatAttempts = [
    { conceptId: 'clauses', correct: true, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt },
    { conceptId: 'clauses', correct: true, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt },
    { conceptId: 'clauses', correct: true, templateId: 'tmpl-c', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt },
  ];
  const productionResult = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts: productionAttempts, nowTs });
  const flatResult = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts: flatAttempts, nowTs });
  assert.deepEqual(productionResult, flatResult, 'Production-shape and flat-shape must produce identical evidence');
  // Verify retainedAfterSecure was actually exercised through the temporal gate.
  assert.equal(productionResult.retainedAfterSecure, true, 'CONTRACT: retainedAfterSecure must be true via temporal gate');
});

test('U1 CHAR: production-shape repeatIndependentWin with 2+ independent correct', () => {
  const conceptNode = { attempts: 3, correct: 3, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 3 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, true);
  assert.equal(result.repeatIndependentWin, true);
});

test('U1 CHAR: production-shape variedPractice with 2+ distinct templateIds', () => {
  const conceptNode = { attempts: 2, correct: 2, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 2 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, true);
});

test('U1 CHAR: production-shape all 5 tiers true for fully evidenced concept', () => {
  const nowTs = 1_700_000_000_000;
  const conceptNode = { attempts: 15, correct: 14, wrong: 1, strength: 0.90, intervalDays: 14, correctStreak: 8 };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 3 * 86400000 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 2 * 86400000 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-c', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 1 * 86400000 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.firstIndependentWin, true);
  assert.equal(result.repeatIndependentWin, true);
  assert.equal(result.variedPractice, true);
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, true);
});

// ---------------------------------------------------------------------------
// 12. TEST-004: Floor guarantee tests for Chronalyx and Couronnail
// ---------------------------------------------------------------------------

test('star computation: Chronalyx 1 concept firstIndependentWin only → floor guarantee 1 Star', () => {
  const concepts = ['tense_aspect', 'modal_verbs', 'adverbials', 'pronouns_cohesion'];
  const map = noEvidenceForConcepts(concepts);
  map.tense_aspect = { ...map.tense_aspect, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('chronalyx', map);
  // conceptBudget = 100/4 = 25; 25 * 0.05 = 1.25; floor(1.25) = 1
  assert.equal(result.stars, 1);
});

test('star computation: Couronnail 1 concept firstIndependentWin only → floor guarantee 1 Star', () => {
  const concepts = GRAMMAR_MONSTER_CONCEPTS.couronnail;
  const map = noEvidenceForConcepts(concepts);
  map.word_classes = { ...map.word_classes, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('couronnail', map);
  // conceptBudget = 100/5 = 20; 20 * 0.05 = 1
  assert.equal(result.stars, 1);
});

// ---------------------------------------------------------------------------
// 13. ADV-002: IEEE 754 epsilon floor test — Concordium evolve2 boundary
// ---------------------------------------------------------------------------

test('star computation: Concordium 18 concepts evolve2 boundary — weight 0.35 → 35 Stars (ADV-002)', () => {
  // Weight 0.35 = repeat(0.10) + varied(0.10) + secure(0.15).
  // Ideal: 18 * (100/18 * 0.35) = 35.0, but IEEE 754 yields 34.999...
  // Without epsilon floor this gives 34 (stage 2); with epsilon → 35 (stage 3).
  const concepts = GRAMMAR_AGGREGATE_CONCEPTS;
  const map = {};
  for (const id of concepts) {
    map[id] = {
      firstIndependentWin: false,
      repeatIndependentWin: true,
      variedPractice: true,
      secureConfidence: true,
      retainedAfterSecure: false,
    };
  }
  const result = computeGrammarMonsterStars('concordium', map);
  assert.equal(result.stars, 35, 'Epsilon-aware floor must yield 35 at the evolve2 boundary');
  assert.equal(result.displayStage, 3, 'Display stage 3 = Growing');
});

// ---------------------------------------------------------------------------
// 14. TEST-005: Integration test — deriveGrammarConceptStarEvidence → computeGrammarMonsterStars
// ---------------------------------------------------------------------------

test('phase5 integration: derive evidence for each Couronnail concept then compute Stars (production shape)', () => {
  // Simulate a learner who has 2 independent corrects across 2 templates
  // for each Couronnail concept, with a secured mastery node.
  const couronnailConcepts = GRAMMAR_MONSTER_CONCEPTS.couronnail;
  const nowTs = 1_700_000_000_000;

  // Build shared recent attempts: 2 independent corrects per concept, 2 templates.
  // Uses production shape (conceptIds array, result.correct nested).
  // U3: createdAt must be post-secure for retainedAfterSecure.
  const recentAttempts = couronnailConcepts.flatMap((conceptId) => [
    { conceptIds: [conceptId], result: { correct: true, score: 1, maxScore: 1 }, templateId: `${conceptId}-tmpl-a`, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 3 * 86400000 },
    { conceptIds: [conceptId], result: { correct: true, score: 1, maxScore: 1 }, templateId: `${conceptId}-tmpl-b`, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 1 * 86400000 },
  ]);

  // Secured mastery node per concept.
  const securedNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };

  // Derive evidence for each concept and collect into map.
  const evidenceMap = {};
  for (const conceptId of couronnailConcepts) {
    evidenceMap[conceptId] = deriveGrammarConceptStarEvidence({
      conceptId,
      conceptNode: securedNode,
      recentAttempts,
      nowTs,
    });
  }

  // Each concept should have all 5 tiers true.
  for (const conceptId of couronnailConcepts) {
    assert.equal(evidenceMap[conceptId].firstIndependentWin, true, `${conceptId}: firstIndependentWin`);
    assert.equal(evidenceMap[conceptId].repeatIndependentWin, true, `${conceptId}: repeatIndependentWin`);
    assert.equal(evidenceMap[conceptId].variedPractice, true, `${conceptId}: variedPractice`);
    assert.equal(evidenceMap[conceptId].secureConfidence, true, `${conceptId}: secureConfidence`);
    assert.equal(evidenceMap[conceptId].retainedAfterSecure, true, `${conceptId}: retainedAfterSecure`);
  }

  // Feed into computeGrammarMonsterStars → expect 100 Stars.
  const result = computeGrammarMonsterStars('couronnail', evidenceMap);
  assert.equal(result.stars, 100);
  assert.equal(result.stageName, 'Mega');
  assert.equal(result.displayStage, 5);
});

// ---------------------------------------------------------------------------
// U2: variedPractice correctness gate
// ---------------------------------------------------------------------------

test('U2: 2 correct on distinct templates → variedPractice = true', () => {
  const conceptNode = { attempts: 2, correct: 2, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 2 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, true);
});

test('U2: 3 correct on 2 templates + 1 wrong on 3rd → variedPractice = true (2 correct-distinct is enough)', () => {
  const conceptNode = { attempts: 4, correct: 3, wrong: 1, strength: 0.6, intervalDays: 2, correctStreak: 2 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-c', correct: false, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, true, '2 correct-distinct templates suffice even with a wrong on a 3rd');
});

test('U2: 2 wrong-only on distinct templates → variedPractice = false', () => {
  const conceptNode = { attempts: 2, correct: 0, wrong: 2, strength: 0.3, intervalDays: 1, correctStreak: 0 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: false, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: false, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, false, 'Wrong-answer-only exposure must not contribute');
});

test('U2: 1 correct on template A + 1 wrong on template B → variedPractice = false (only 1 correct-distinct)', () => {
  const conceptNode = { attempts: 2, correct: 1, wrong: 1, strength: 0.4, intervalDays: 1, correctStreak: 0 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: false, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, false, 'Only 1 correct-distinct template is insufficient');
});

test('U2: 2 correct on same template → variedPractice = false', () => {
  const conceptNode = { attempts: 2, correct: 2, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 2 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, false, 'Same template repeated does not prove varied practice');
});

// ---------------------------------------------------------------------------
// U3: retainedAfterSecure temporal proof
// ---------------------------------------------------------------------------

test('U3: concept secured (intervalDays: 14), independent correct 3 days ago → retainedAfterSecure = true', () => {
  const nowTs = 1_700_000_000_000;
  // securedAtTs = nowTs - 14 * 86400000 = nowTs - 1_209_600_000
  // createdAt = nowTs - 3d = well after securedAtTs
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 3 * 86400000 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, true);
});

test('U3: concept secured (intervalDays: 7), independent correct 1 day ago → retainedAfterSecure = true', () => {
  const nowTs = 1_700_000_000_000;
  // securedAtTs = nowTs - 7d; createdAt = nowTs - 1d → post-secure
  const conceptNode = { attempts: 10, correct: 9, wrong: 1, strength: 0.85, intervalDays: 7, correctStreak: 4 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 1 * 86400000 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, true);
});

test('U3: concept secured (intervalDays: 14), all independent corrects BEFORE estimated secure date → retainedAfterSecure = false', () => {
  const nowTs = 1_700_000_000_000;
  // securedAtTs = nowTs - 14d. Both createdAt values are 20d and 18d ago → before securedAtTs.
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 20 * 86400000 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 18 * 86400000 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, false, 'All corrects predate estimated secure date');
});

test('U3: concept just became secure (intervalDays: 7), only 2 independent corrects from initial learning burst, both predate secure → retainedAfterSecure = false', () => {
  const nowTs = 1_700_000_000_000;
  // securedAtTs = nowTs - 7d. Both corrects are from 10d and 9d ago → before securedAtTs.
  const conceptNode = { attempts: 8, correct: 7, wrong: 1, strength: 0.82, intervalDays: 7, correctStreak: 3 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 10 * 86400000 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 9 * 86400000 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, false, 'Initial learning burst corrects predate secure status');
});

test('U3: concept not yet secure (intervalDays: 6) → secureConfidence = false → retainedAfterSecure = false regardless', () => {
  const nowTs = 1_700_000_000_000;
  // intervalDays: 6 < 7 → secureConfidence = false; retainedAfterSecure must also be false
  const conceptNode = { attempts: 5, correct: 5, wrong: 0, strength: 0.80, intervalDays: 6, correctStreak: 5 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 1 * 86400000 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: nowTs - 2 * 86400000 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.secureConfidence, false);
  assert.equal(result.retainedAfterSecure, false, 'Not yet secure → retainedAfterSecure must be false');
});

test('U3: recentAttempts entry missing createdAt → excluded from temporal scan', () => {
  const nowTs = 1_700_000_000_000;
  // Concept is secured; 2 independent corrects but neither has createdAt.
  // With no valid timestamps, no temporal proof can be established.
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, false, 'Missing createdAt entries cannot provide temporal proof');
});

test('TG-001: createdAt: 0 (legacy epoch) does NOT satisfy temporal gate', () => {
  // createdAt: 0 is a valid number (typeof 0 === "number", isFinite(0) === true),
  // so it is NOT excluded from the temporal scan. However, epoch 1970 is always
  // before any modern securedAtTs, so 0 > securedAtTs is false.
  const nowTs = 1_700_000_000_000;
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, false, 'Epoch-zero createdAt must not satisfy temporal gate');
});

test('TG-002: createdAt exactly equal to securedAtTs → retainedAfterSecure = false (strict >)', () => {
  // The temporal gate uses strict > (createdAt > securedAtTs). An attempt
  // created at exactly the estimated secure moment does not count as post-secure.
  const nowTs = 1_700_000_000_000;
  const intervalDays = 14;
  const securedAtTs = nowTs - intervalDays * 86400000;
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays, correctStreak: 6 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: securedAtTs },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts, nowTs });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, false, 'Boundary-equal createdAt must not satisfy strict > temporal gate');
});
