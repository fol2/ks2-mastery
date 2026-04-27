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

test('evidence tier: repeatIndependentWin requires 2+ distinct independent correct', () => {
  const conceptNode = { attempts: 3, correct: 3, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 3 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: false, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, true);
  assert.equal(result.repeatIndependentWin, true);
  assert.equal(result.variedPractice, false);
});

test('evidence tier: variedPractice requires 2+ distinct templateId', () => {
  const conceptNode = { attempts: 2, correct: 2, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 2 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.variedPractice, true);
});

test('evidence tier: variedPractice false with only 1 template', () => {
  const conceptNode = { attempts: 3, correct: 3, wrong: 0, strength: 0.6, intervalDays: 2, correctStreak: 3 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
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

test('evidence tier: retainedAfterSecure requires secure + later independent correct', () => {
  // Concept is secured (intervalDays >= 7) and has a later independent correct
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.secureConfidence, true);
  assert.equal(result.retainedAfterSecure, true);
});

test('evidence tier: retainedAfterSecure false when no independent correct in recentAttempts', () => {
  // Concept is secured but no independent correct in recent attempts
  const conceptNode = { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: false, supportLevelAtScoring: 2 },
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

test('evidence tier: supported answer (worked/faded) does not unlock firstIndependentWin', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: false, supportLevelAtScoring: 2 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, false);
});

test('evidence tier: only matching conceptId entries count', () => {
  const conceptNode = { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 };
  const recentAttempts = [
    // Different concept — should be ignored
    { conceptId: 'tense_aspect', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
  assert.equal(result.firstIndependentWin, false);
});

test('evidence tier: all 5 tiers true for fully evidenced concept', () => {
  const conceptNode = { attempts: 15, correct: 14, wrong: 1, strength: 0.90, intervalDays: 14, correctStreak: 8 };
  const recentAttempts = [
    { conceptId: 'clauses', templateId: 'tmpl-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'clauses', templateId: 'tmpl-c', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const result = deriveGrammarConceptStarEvidence({ conceptId: 'clauses', conceptNode, recentAttempts });
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

test('star computation: Bracehart 6 concepts all fully evidenced → 100 Stars', () => {
  const concepts = ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object'];
  const result = computeGrammarMonsterStars('bracehart', allEvidenceForConcepts(concepts));
  assert.equal(result.stars, 100);
  assert.equal(result.starMax, 100);
});

test('star computation: Couronnail 3 concepts all fully evidenced → 100 Stars', () => {
  const concepts = ['word_classes', 'standard_english', 'formality'];
  const result = computeGrammarMonsterStars('couronnail', allEvidenceForConcepts(concepts));
  assert.equal(result.stars, 100);
  assert.equal(result.starMax, 100);
});

test('star computation: Chronalyx 4 concepts all fully evidenced → 100 Stars', () => {
  const concepts = ['tense_aspect', 'modal_verbs', 'adverbials', 'pronouns_cohesion'];
  const result = computeGrammarMonsterStars('chronalyx', allEvidenceForConcepts(concepts));
  assert.equal(result.stars, 100);
  assert.equal(result.starMax, 100);
});

test('star computation: Concordium 18 concepts all fully evidenced → 100 Stars', () => {
  const concepts = [
    'sentence_functions', 'word_classes', 'noun_phrases', 'adverbials',
    'clauses', 'relative_clauses', 'tense_aspect', 'standard_english',
    'pronouns_cohesion', 'formality', 'active_passive', 'subject_object',
    'modal_verbs', 'parenthesis_commas', 'speech_punctuation',
    'apostrophes_possession', 'boundary_punctuation', 'hyphen_ambiguity',
  ];
  const result = computeGrammarMonsterStars('concordium', allEvidenceForConcepts(concepts));
  assert.equal(result.stars, 100);
  assert.equal(result.starMax, 100);
});

test('star computation: no evidence → 0 Stars', () => {
  const result = computeGrammarMonsterStars('bracehart', noEvidenceForConcepts(
    ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object'],
  ));
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
  const map = noEvidenceForConcepts(
    ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object'],
  );
  map.clauses = { ...map.clauses, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('bracehart', map);
  // conceptBudget = 100/6 = 16.667; 16.667 * 0.05 = 0.833; floor(0.833) = 0
  // But per-monster floor: any evidence → at least 1 Star
  assert.equal(result.stars, 1);
});

test('star computation: Concordium 1 concept firstIndependentWin → floor guarantee 1 Star', () => {
  const concepts = [
    'sentence_functions', 'word_classes', 'noun_phrases', 'adverbials',
    'clauses', 'relative_clauses', 'tense_aspect', 'standard_english',
    'pronouns_cohesion', 'formality', 'active_passive', 'subject_object',
    'modal_verbs', 'parenthesis_commas', 'speech_punctuation',
    'apostrophes_possession', 'boundary_punctuation', 'hyphen_ambiguity',
  ];
  const map = noEvidenceForConcepts(concepts);
  map.clauses = { ...map.clauses, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('concordium', map);
  // conceptBudget = 100/18 = 5.556; 5.556 * 0.05 = 0.278; floor(0.278) = 0
  // But per-monster floor → 1 Star
  assert.equal(result.stars, 1);
});

test('star computation: Concordium 18 concepts each firstIndependentWin only → 4 Stars (floating-point floor)', () => {
  const concepts = [
    'sentence_functions', 'word_classes', 'noun_phrases', 'adverbials',
    'clauses', 'relative_clauses', 'tense_aspect', 'standard_english',
    'pronouns_cohesion', 'formality', 'active_passive', 'subject_object',
    'modal_verbs', 'parenthesis_commas', 'speech_punctuation',
    'apostrophes_possession', 'boundary_punctuation', 'hyphen_ambiguity',
  ];
  const map = firstWinOnlyForConcepts(concepts);
  const result = computeGrammarMonsterStars('concordium', map);
  // Ideal: 18 * (100/18 * 0.05) = 5.0, but IEEE 754 yields 4.999999999999999.
  // floor(4.999...) = 4. This is the correct floored result per the plan's
  // "floor applies only to the final total" rule.
  assert.equal(result.stars, 4);
});

test('star computation: empty conceptEvidenceMap → 0 Stars', () => {
  const result = computeGrammarMonsterStars('bracehart', {});
  assert.equal(result.stars, 0);
});

test('star computation: result includes stageName and displayStage', () => {
  const concepts = ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object'];
  const map = noEvidenceForConcepts(concepts);
  map.clauses = { ...map.clauses, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('bracehart', map);
  assert.equal(result.stars, 1);
  assert.equal(result.stageName, 'Egg found');
  assert.equal(typeof result.displayStage, 'number');
});

test('star computation: result includes nextMilestoneStars and nextMilestoneLabel', () => {
  const concepts = ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object'];
  const map = noEvidenceForConcepts(concepts);
  map.clauses = { ...map.clauses, firstIndependentWin: true };
  const result = computeGrammarMonsterStars('bracehart', map);
  assert.equal(result.nextMilestoneStars, 15);
  assert.equal(result.nextMilestoneLabel, 'Hatched');
});

test('star computation: Mega has no next milestone', () => {
  const concepts = ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object'];
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

test('star computation: Bracehart partial — 3/6 concepts firstIndependentWin only', () => {
  const concepts = ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object'];
  const map = noEvidenceForConcepts(concepts);
  map.sentence_functions.firstIndependentWin = true;
  map.clauses.firstIndependentWin = true;
  map.relative_clauses.firstIndependentWin = true;
  const result = computeGrammarMonsterStars('bracehart', map);
  // conceptBudget = 100/6 = 16.667; 3 * 16.667 * 0.05 = 2.5; floor(2.5) = 2
  assert.equal(result.stars, 2);
});

test('star computation: Couronnail 1 concept all tiers → floor(33.33 * 1.0) = 33', () => {
  const concepts = ['word_classes', 'standard_english', 'formality'];
  const map = noEvidenceForConcepts(concepts);
  map.word_classes = {
    firstIndependentWin: true,
    repeatIndependentWin: true,
    variedPractice: true,
    secureConfidence: true,
    retainedAfterSecure: true,
  };
  const result = computeGrammarMonsterStars('couronnail', map);
  // conceptBudget = 100/3 = 33.333; 33.333 * 1.0 = 33.333; floor = 33
  assert.equal(result.stars, 33);
});

test('star computation: Bracehart secure only (no retention) → capped at ~40%', () => {
  const concepts = ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object'];
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
  // Each concept: 16.667 * (0.05+0.10+0.10+0.15) = 16.667 * 0.40 = 6.667
  // Total: 6 * 6.667 = 40.0; floor = 40
  assert.equal(result.stars, 40);
});
