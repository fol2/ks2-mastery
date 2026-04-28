// Tests for U5 — Grammar Star Debug Model.
//
// Module under test: shared/grammar/grammar-star-debug.js.
//
// Structure:
//  1. Fresh learner: 0 Stars, source 'live', empty conceptEvidence
//  2. 42-Star Bracehart: per-concept tier breakdown with 6 concepts
//  3. Concordium at Mega: all 18 concepts × 5 tiers → 100 Stars
//  4. Legacy learner: starHighWater=35, computed=12 → source 'highWater', warning
//  5. Missing conceptNodes: source 'highWater' when rewardEntry present
//  6. Missing rewardEntry: displayStars from live derivation only
//  7. Redaction: output never contains correctAnswer, acceptedAnswers, etc.
//  8. Redaction: output never contains raw attempt objects
//  9. retentionEstimate: concept with retainedAfterSecure has securedAtEstimate

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGrammarStarDebugModel } from '../shared/grammar/grammar-star-debug.js';
import { GRAMMAR_AGGREGATE_CONCEPTS } from '../shared/grammar/grammar-concept-roster.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW_TS = 1_700_000_000_000;

/** Secured mastery node with post-secure temporal proof available. */
function securedNode(intervalDays = 14) {
  return { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays, correctStreak: 6 };
}

/** Build 2 independent corrects for a concept, both post-secure. */
function postSecureAttempts(conceptId, intervalDays = 14) {
  return [
    { conceptId, templateId: `${conceptId}-a`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: NOW_TS - 3 * 86400000 },
    { conceptId, templateId: `${conceptId}-b`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: NOW_TS - 1 * 86400000 },
  ];
}

/** Full 5-tier evidence for every concept of a monster. */
function fullEvidenceInputs(conceptIds) {
  const nodes = {};
  let attempts = [];
  for (const id of conceptIds) {
    nodes[id] = securedNode(14);
    attempts = attempts.concat(postSecureAttempts(id, 14));
  }
  return { nodes, attempts };
}

// ---------------------------------------------------------------------------
// 1. Fresh learner: 0 Stars, source 'live', empty conceptEvidence
// ---------------------------------------------------------------------------

test('fresh learner: 0 Stars, source live, empty conceptEvidence', () => {
  const result = buildGrammarStarDebugModel({
    monsterId: 'bracehart',
    conceptNodes: {
      sentence_functions: null,
      clauses: null,
      relative_clauses: null,
      noun_phrases: null,
      active_passive: null,
      subject_object: null,
    },
    recentAttempts: [],
    rewardEntry: null,
    nowTs: NOW_TS,
  });

  assert.equal(result.displayStars, 0);
  assert.equal(result.computedLiveStars, 0);
  assert.equal(result.source, 'live');
  assert.equal(result.conceptEvidence.length, 6);
  for (const ce of result.conceptEvidence) {
    assert.equal(ce.tiers.firstIndependentWin, false);
    assert.equal(ce.tiers.repeatIndependentWin, false);
    assert.equal(ce.tiers.variedPractice, false);
    assert.equal(ce.tiers.secureConfidence, false);
    assert.equal(ce.tiers.retainedAfterSecure, false);
    assert.equal(ce.starsContributed, 0);
  }
  assert.equal(result.name, 'Bracehart');
  assert.equal(result.stageName, 'Not found yet');
  assert.equal(result.warnings.length, 0);
});

// ---------------------------------------------------------------------------
// 2. 42-Star Bracehart: partial per-concept tier breakdown
// ---------------------------------------------------------------------------

test('42-Star Bracehart: correct per-concept tier breakdown with 6 concepts', () => {
  // Bracehart has 6 concepts. Budget per concept = 100/6 ≈ 16.667.
  // We give 4 concepts all tiers except retainedAfterSecure (weight 0.40 each)
  // and 2 concepts firstIndependentWin + repeatIndependentWin (weight 0.15 each).
  // Expected: 4 × 16.667 × 0.40 + 2 × 16.667 × 0.15 = 26.667 + 5.0 = 31.667
  // That gives ~31. Let's try a different split.
  //
  // For 42 Stars from 6 concepts:
  // Give 3 concepts full 5 tiers (weight 1.0 each → 3 × 16.667 = 50)
  // Give 1 concept first 3 tiers (weight 0.25 → 16.667 × 0.25 = 4.167)
  // Give 2 concepts nothing → 0
  // Total: 50 + 4.167 = 54.167 → too high
  //
  // Simpler: give all 6 concepts firstIndependentWin(0.05) + repeatIndependentWin(0.10)
  // + variedPractice(0.10) = 0.25 each → 6 × 16.667 × 0.25 = 25
  // Plus give 2 concepts secureConfidence(0.15) → 2 × 16.667 × 0.15 = 5
  // Plus give 1 concept retainedAfterSecure(0.60) → 16.667 × 0.60 = 10
  // Total: 25 + 5 + 10 = 40. Still not 42.
  //
  // Give all 6 first 3 tiers (0.25) = 25
  // Give 4 concepts secureConfidence (+0.15 each) → 4 × 2.5 = 10
  // Give 1 concept retainedAfterSecure (+0.60) → 10
  // Total: 25 + 10 + 10 = 45 → too high
  //
  // Better: 6 concepts, each 100/6 = 16.667 budget.
  // Concept 1-2: all 5 tiers (1.0) → 2 × 16.667 = 33.333
  // Concept 3: first + repeat + varied (0.25) → 4.167
  // Concept 4: first + repeat (0.15) → 2.5
  // Concept 5: first only (0.05) → 0.833
  // Concept 6: nothing → 0
  // Total: 33.333 + 4.167 + 2.5 + 0.833 = 40.833 → floor = 40
  //
  // Need total just above 42. Try:
  // Concept 1-2: all 5 tiers (1.0) → 33.333
  // Concept 3: first + repeat + varied + secure (0.40) → 6.667
  // Concept 4: first + repeat (0.15) → 2.5
  // Concept 5-6: nothing → 0
  // Total: 33.333 + 6.667 + 2.5 = 42.5 → floor = 42 ✓

  const bracehartConcepts = ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object'];

  const conceptNodes = {};
  const recentAttempts = [];

  // Concepts 1-2: sentence_functions, clauses — all 5 tiers
  for (const id of ['sentence_functions', 'clauses']) {
    conceptNodes[id] = securedNode(14);
    recentAttempts.push(...postSecureAttempts(id));
  }

  // Concept 3: relative_clauses — first + repeat + varied + secure (no retention)
  conceptNodes['relative_clauses'] = { attempts: 10, correct: 9, wrong: 1, strength: 0.85, intervalDays: 8, correctStreak: 4 };
  recentAttempts.push(
    { conceptId: 'relative_clauses', templateId: 'rc-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: NOW_TS - 20 * 86400000 },
    { conceptId: 'relative_clauses', templateId: 'rc-b', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: NOW_TS - 19 * 86400000 },
  );

  // Concept 4: noun_phrases — first + repeat only
  conceptNodes['noun_phrases'] = { attempts: 3, correct: 3, wrong: 0, strength: 0.5, intervalDays: 2, correctStreak: 3 };
  recentAttempts.push(
    { conceptId: 'noun_phrases', templateId: 'np-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptId: 'noun_phrases', templateId: 'np-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  );

  // Concepts 5-6: active_passive, subject_object — nothing
  conceptNodes['active_passive'] = null;
  conceptNodes['subject_object'] = null;

  const result = buildGrammarStarDebugModel({
    monsterId: 'bracehart',
    conceptNodes,
    recentAttempts,
    rewardEntry: { starHighWater: 0, legacyStage: 0 },
    nowTs: NOW_TS,
  });

  assert.equal(result.displayStars, 42, `Expected 42 Stars, got ${result.displayStars}`);
  assert.equal(result.computedLiveStars, 42);
  assert.equal(result.source, 'live');
  assert.equal(result.conceptEvidence.length, 6);

  // Check sentence_functions has all 5 tiers
  const sf = result.conceptEvidence.find(c => c.conceptId === 'sentence_functions');
  assert.equal(sf.tiers.firstIndependentWin, true);
  assert.equal(sf.tiers.retainedAfterSecure, true);

  // Check relative_clauses has secure but not retained
  const rc = result.conceptEvidence.find(c => c.conceptId === 'relative_clauses');
  assert.equal(rc.tiers.secureConfidence, true);
  assert.equal(rc.tiers.retainedAfterSecure, false);

  // Check active_passive has nothing
  const ap = result.conceptEvidence.find(c => c.conceptId === 'active_passive');
  assert.equal(ap.tiers.firstIndependentWin, false);
  assert.equal(ap.starsContributed, 0);
});

// ---------------------------------------------------------------------------
// 3. Concordium at Mega: all 18 concepts × 5 tiers → 100 Stars
// ---------------------------------------------------------------------------

test('Concordium at Mega: all 18 concepts with all 5 tiers → 100 Stars', () => {
  const { nodes, attempts } = fullEvidenceInputs(GRAMMAR_AGGREGATE_CONCEPTS);
  const result = buildGrammarStarDebugModel({
    monsterId: 'concordium',
    conceptNodes: nodes,
    recentAttempts: attempts,
    rewardEntry: { starHighWater: 100, legacyStage: 0 },
    nowTs: NOW_TS,
  });

  assert.equal(result.displayStars, 100);
  assert.equal(result.computedLiveStars, 100);
  assert.equal(result.name, 'Concordium');
  assert.equal(result.stageName, 'Mega');
  assert.equal(result.displayStage, 5);
  assert.equal(result.nextMilestone, null);
  assert.equal(result.source, 'live');
  assert.equal(result.conceptEvidence.length, 18);
  assert.equal(result.warnings.length, 0);

  // Every concept should have all 5 tiers true
  for (const ce of result.conceptEvidence) {
    assert.equal(ce.tiers.firstIndependentWin, true, `${ce.conceptId}: firstIndependentWin`);
    assert.equal(ce.tiers.repeatIndependentWin, true, `${ce.conceptId}: repeatIndependentWin`);
    assert.equal(ce.tiers.variedPractice, true, `${ce.conceptId}: variedPractice`);
    assert.equal(ce.tiers.secureConfidence, true, `${ce.conceptId}: secureConfidence`);
    assert.equal(ce.tiers.retainedAfterSecure, true, `${ce.conceptId}: retainedAfterSecure`);
    assert.ok(ce.starsContributed > 0, `${ce.conceptId}: starsContributed > 0`);
  }
});

// ---------------------------------------------------------------------------
// 4. Legacy learner: starHighWater=35, computed=12 → source 'highWater'
// ---------------------------------------------------------------------------

test('legacy learner: starHighWater=35, computedStars=12 → source highWater, warning present', () => {
  // Give Chronalyx (4 concepts) partial evidence → computed ~12 Stars.
  // Chronalyx budget per concept = 100/4 = 25.
  // 4 concepts × firstIndependentWin(0.05) + repeatIndependentWin(0.10) = 0.15
  // 4 × 25 × 0.15 = 15. Adjust: give 3 concepts 0.15, 1 concept 0.05.
  // 3 × 25 × 0.15 + 1 × 25 × 0.05 = 11.25 + 1.25 = 12.5 → floor = 12 ✓

  const conceptNodes = {};
  const recentAttempts = [];
  const chronConcepts = ['tense_aspect', 'modal_verbs', 'adverbials', 'pronouns_cohesion'];

  // First 3 concepts: first + repeat (0.15 weight)
  for (const id of ['tense_aspect', 'modal_verbs', 'adverbials']) {
    conceptNodes[id] = { attempts: 3, correct: 3, wrong: 0, strength: 0.5, intervalDays: 2, correctStreak: 3 };
    recentAttempts.push(
      { conceptId: id, templateId: `${id}-a`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
      { conceptId: id, templateId: `${id}-a`, correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    );
  }

  // 4th concept: first only (0.05 weight)
  conceptNodes['pronouns_cohesion'] = { attempts: 1, correct: 1, wrong: 0, strength: 0.3, intervalDays: 1, correctStreak: 1 };
  recentAttempts.push(
    { conceptId: 'pronouns_cohesion', templateId: 'pc-a', correct: true, firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  );

  const result = buildGrammarStarDebugModel({
    monsterId: 'chronalyx',
    conceptNodes,
    recentAttempts,
    rewardEntry: { starHighWater: 35, legacyStage: 0 },
    nowTs: NOW_TS,
  });

  assert.equal(result.computedLiveStars, 12);
  assert.equal(result.starHighWater, 35);
  assert.equal(result.displayStars, 35);
  assert.equal(result.source, 'highWater');
  assert.ok(result.warnings.includes('High-water evidence'));
});

// ---------------------------------------------------------------------------
// 5. Missing conceptNodes: source 'highWater' when rewardEntry present
// ---------------------------------------------------------------------------

test('missing conceptNodes: computedLiveStars=0, source highWater from rewardEntry', () => {
  const result = buildGrammarStarDebugModel({
    monsterId: 'couronnail',
    conceptNodes: null,
    recentAttempts: [],
    rewardEntry: { starHighWater: 20, legacyStage: 0 },
    nowTs: NOW_TS,
  });

  assert.equal(result.computedLiveStars, 0);
  assert.equal(result.displayStars, 20);
  assert.equal(result.starHighWater, 20);
  assert.equal(result.source, 'highWater');
  assert.equal(result.conceptEvidence.length, 0);
  assert.ok(result.warnings.includes('High-water evidence'));
});

// ---------------------------------------------------------------------------
// 6. Missing rewardEntry: displayStars from live derivation only
// ---------------------------------------------------------------------------

test('missing rewardEntry: displayStars from live derivation only', () => {
  // Give Couronnail (3 concepts) full evidence → 100 Stars computed.
  const couronnailConcepts = ['word_classes', 'standard_english', 'formality'];
  const { nodes, attempts } = fullEvidenceInputs(couronnailConcepts);

  const result = buildGrammarStarDebugModel({
    monsterId: 'couronnail',
    conceptNodes: nodes,
    recentAttempts: attempts,
    rewardEntry: null,
    nowTs: NOW_TS,
  });

  assert.equal(result.computedLiveStars, 100);
  assert.equal(result.displayStars, 100);
  assert.equal(result.starHighWater, 0);
  assert.equal(result.source, 'live');
  assert.equal(result.warnings.length, 0);
});

// ---------------------------------------------------------------------------
// 7. Redaction: output never contains sensitive answer fields
// ---------------------------------------------------------------------------

test('redaction: output never contains correctAnswer, acceptedAnswers, templateClosure, aiPrompt, aiOutput', () => {
  const { nodes, attempts } = fullEvidenceInputs(['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object']);
  const result = buildGrammarStarDebugModel({
    monsterId: 'bracehart',
    conceptNodes: nodes,
    recentAttempts: attempts,
    rewardEntry: { starHighWater: 50, legacyStage: 0 },
    nowTs: NOW_TS,
  });

  const json = JSON.stringify(result);
  const forbidden = ['correctAnswer', 'acceptedAnswers', 'templateClosure', 'aiPrompt', 'aiOutput', 'reviewCopy'];
  for (const key of forbidden) {
    assert.equal(json.includes(key), false, `Output must not contain "${key}"`);
  }
});

// ---------------------------------------------------------------------------
// 8. Redaction: output never contains raw attempt objects
// ---------------------------------------------------------------------------

test('redaction: output never contains raw attempt objects', () => {
  const recentAttempts = [
    {
      conceptId: 'clauses',
      templateId: 'tmpl-a',
      correct: true,
      firstAttemptIndependent: true,
      supportLevelAtScoring: 0,
      createdAt: NOW_TS - 86400000,
      correctAnswer: 'The cat sat on the mat.',
      acceptedAnswers: ['The cat sat on the mat.'],
      templateClosure: { fn: 'closure' },
      aiPrompt: 'Generate a question',
      aiOutput: 'AI generated output',
    },
  ];

  const result = buildGrammarStarDebugModel({
    monsterId: 'bracehart',
    conceptNodes: { clauses: securedNode(14) },
    recentAttempts,
    rewardEntry: null,
    nowTs: NOW_TS,
  });

  const json = JSON.stringify(result);

  // Must not contain raw attempt markers
  assert.equal(json.includes('The cat sat on the mat'), false, 'Raw answer text must not appear');
  assert.equal(json.includes('Generate a question'), false, 'aiPrompt content must not appear');
  assert.equal(json.includes('AI generated output'), false, 'aiOutput content must not appear');
  assert.equal(json.includes('templateClosure'), false, 'templateClosure must not appear');
  assert.equal(json.includes('supportLevelAtScoring'), false, 'Raw attempt fields must not appear');

  // Verify the evidence is still correct despite redaction
  const clausesEvidence = result.conceptEvidence.find(c => c.conceptId === 'clauses');
  assert.equal(clausesEvidence.tiers.firstIndependentWin, true);
});

// ---------------------------------------------------------------------------
// 9. retentionEstimate: concept with retainedAfterSecure has securedAtEstimate
// ---------------------------------------------------------------------------

test('retentionEstimate: concept with retainedAfterSecure includes securedAtEstimate', () => {
  const intervalDays = 14;
  const conceptNodes = {
    word_classes: securedNode(intervalDays),
    standard_english: null,
    formality: null,
  };
  const recentAttempts = postSecureAttempts('word_classes', intervalDays);

  const result = buildGrammarStarDebugModel({
    monsterId: 'couronnail',
    conceptNodes,
    recentAttempts,
    rewardEntry: null,
    nowTs: NOW_TS,
  });

  const wc = result.conceptEvidence.find(c => c.conceptId === 'word_classes');
  assert.equal(wc.tiers.retainedAfterSecure, true);
  assert.ok(wc.retentionEstimate !== null, 'retentionEstimate must be present');
  assert.equal(wc.retentionEstimate.estimateMethod, 'intervalDays');
  assert.equal(wc.retentionEstimate.securedAtEstimate, NOW_TS - intervalDays * 86400000);

  // Concepts without retainedAfterSecure should have null retentionEstimate
  const se = result.conceptEvidence.find(c => c.conceptId === 'standard_english');
  assert.equal(se.tiers.retainedAfterSecure, false);
  assert.equal(se.retentionEstimate, null);
});

// ---------------------------------------------------------------------------
// Additional coverage: shape contract
// ---------------------------------------------------------------------------

test('result shape: all required top-level keys present', () => {
  const result = buildGrammarStarDebugModel({
    monsterId: 'bracehart',
    conceptNodes: null,
    recentAttempts: [],
    rewardEntry: null,
    nowTs: NOW_TS,
  });

  const requiredKeys = [
    'monsterId', 'name', 'displayStars', 'starHighWater', 'computedLiveStars',
    'legacyFloor', 'stageName', 'displayStage', 'nextMilestone', 'source',
    'conceptEvidence', 'rejectedCategories', 'warnings',
  ];
  for (const key of requiredKeys) {
    assert.ok(key in result, `Missing required key: ${key}`);
  }
});

test('rejectedCategories: fixed list of 7 known categories', () => {
  const result = buildGrammarStarDebugModel({
    monsterId: 'bracehart',
    conceptNodes: null,
    recentAttempts: [],
    rewardEntry: null,
    nowTs: NOW_TS,
  });

  assert.deepEqual(result.rejectedCategories, [
    'wrong_answer',
    'supported_attempt',
    'pre_secure_correct',
    'missing_timestamp',
    'wrong_concept',
    'duplicate_tier',
    'non_scored_event',
  ]);
});

test('nextMilestone: Egg found at stage 0', () => {
  const result = buildGrammarStarDebugModel({
    monsterId: 'bracehart',
    conceptNodes: null,
    recentAttempts: [],
    rewardEntry: null,
    nowTs: NOW_TS,
  });

  assert.deepEqual(result.nextMilestone, { stars: 1, label: 'Egg found' });
});

test('legacyFloor: source legacyFloor when legacy stage is dominant', () => {
  // No conceptNodes (computedLiveStars = 0), no starHighWater, but legacyStage = 3 → floor = 35
  const result = buildGrammarStarDebugModel({
    monsterId: 'bracehart',
    conceptNodes: null,
    recentAttempts: [],
    rewardEntry: { starHighWater: 0, legacyStage: 3 },
    nowTs: NOW_TS,
  });

  assert.equal(result.displayStars, 35);
  assert.equal(result.legacyFloor, 35);
  assert.equal(result.source, 'legacyFloor');
});
