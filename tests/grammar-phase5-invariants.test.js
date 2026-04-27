// Tests for U1 — Grammar Phase 5 invariants scope-lock.
//
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U1).
// Invariants: docs/plans/james/grammar/grammar-phase5-invariants.md.
//
// This file pins the non-negotiable contracts for Phase 5 before any code
// unit ships. The assertions here are module-load hard gates — they fail
// fast on import if the underlying constants have drifted.
//
// Structure:
//  1. Denominator-freeze hard gate (invariant 15, preserving P4 invariant 7).
//  2. Active monster roster assertion (invariant 11, preserving P4 invariant 8).
//  3. Concept-to-monster mapping completeness (all 18 aggregate concepts map).
//  4. Phase 5 Star constants contract documentation (invariants 1, 3, 5, 6).
//
// NOTE: The Star constants module (`shared/grammar/grammar-stars.js`) does not
// exist yet — U2 creates it. This U1 test pins only the denominator freeze
// and the structural contracts that are already testable from the existing
// module surface. The Star constant pins (GRAMMAR_MONSTER_STAR_MAX === 100,
// GRAMMAR_STAR_STAGE_THRESHOLDS shape) will be added by U2's test suite.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_CONCEPT_TO_MONSTER,
  GRAMMAR_GRAND_MONSTER_ID,
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_MONSTER_IDS,
  GRAMMAR_RESERVED_MONSTER_IDS,
  GRAMMAR_REWARD_RELEASE_ID,
} from '../src/platform/game/monster-system.js';

import {
  GRAMMAR_MONSTER_STAR_MAX,
  GRAMMAR_STAR_STAGE_THRESHOLDS,
  GRAMMAR_CONCEPT_STAR_WEIGHTS,
} from '../shared/grammar/grammar-stars.js';

// -----------------------------------------------------------------------------
// 1. Denominator-freeze hard gate.
//
// Phase 5 invariant 15 preserves Phase 4 invariant 7:
// GRAMMAR_AGGREGATE_CONCEPTS.length === 18 is pinned. Phase 5 changes the
// display curve (ratio staging → 100-Star evidence curve), NOT the concept
// set. Any expansion to 19+ concepts requires a paired migration and an
// explicit stage-monotonicity shim so that existing Mega holders are not
// silently demoted.
//
// This is a deliberately redundant pin alongside the Phase 4 test at
// tests/grammar-concordium-invariant.test.js — if either test is
// accidentally deleted, the other still catches the breach.
// -----------------------------------------------------------------------------

test('Phase 5 invariant 15: denominator-freeze — GRAMMAR_AGGREGATE_CONCEPTS.length === 18', () => {
  assert.equal(
    GRAMMAR_AGGREGATE_CONCEPTS.length,
    18,
    'Phase 5 pins aggregate denominator at 18 (preserving Phase 4 invariant 7). ' +
    'Expansion requires a paired stage-monotonicity shim and starHighWater migration ' +
    'so existing Mega holders are not silently demoted.',
  );
});

// -----------------------------------------------------------------------------
// 2. Active monster roster — 3 direct + 1 aggregate.
//
// Phase 5 invariant 11 (compact monster strip) and Phase 4 invariant 8
// (Bracehart/Chronalyx/Couronnail are the only direct active monsters)
// require exactly these 4 active monsters. Reserved monsters must not
// appear in the strip.
// -----------------------------------------------------------------------------

test('Phase 5 invariant 11: active monster roster is exactly Bracehart + Chronalyx + Couronnail (direct) + Concordium (aggregate)', () => {
  const directMonsterIds = Object.keys(GRAMMAR_MONSTER_CONCEPTS);
  assert.deepEqual(
    directMonsterIds.sort(),
    ['bracehart', 'chronalyx', 'couronnail'],
    'Direct active monsters are exactly Bracehart, Chronalyx, Couronnail. ' +
    'Reserved monsters (Glossbloom, Loomrill, Mirrane) must not appear.',
  );

  // Full roster: 3 direct + 1 aggregate = 4 active monsters.
  assert.equal(
    GRAMMAR_MONSTER_IDS.length,
    4,
    'GRAMMAR_MONSTER_IDS must contain exactly 4 active monsters (3 direct + 1 aggregate)',
  );
  assert.ok(
    GRAMMAR_MONSTER_IDS.includes(GRAMMAR_GRAND_MONSTER_ID),
    `GRAMMAR_MONSTER_IDS must include the grand aggregate monster "${GRAMMAR_GRAND_MONSTER_ID}"`,
  );

  // Reserved monsters must not overlap with active monsters.
  for (const reservedId of GRAMMAR_RESERVED_MONSTER_IDS) {
    assert.ok(
      !GRAMMAR_MONSTER_IDS.includes(reservedId),
      `Reserved monster "${reservedId}" must not appear in active GRAMMAR_MONSTER_IDS`,
    );
  }
});

// -----------------------------------------------------------------------------
// 3. Concept-to-monster mapping completeness.
//
// Every concept in GRAMMAR_AGGREGATE_CONCEPTS that belongs to a direct
// monster must appear in GRAMMAR_CONCEPT_TO_MONSTER. The 5 punctuation-
// for-grammar concepts (parenthesis_commas, speech_punctuation,
// apostrophes_possession, boundary_punctuation, hyphen_ambiguity)
// contribute to Concordium only — they are NOT mapped to a direct monster.
// This test pins the mapping shape so that Phase 5's per-concept Star
// budget computation has a stable denominator for direct monsters.
// -----------------------------------------------------------------------------

test('Phase 5 invariant 15: concept-to-monster mapping covers all direct-monster concepts', () => {
  const directConcepts = Object.values(GRAMMAR_MONSTER_CONCEPTS).flat();

  // Every direct-monster concept is in the mapping.
  for (const conceptId of directConcepts) {
    assert.ok(
      GRAMMAR_CONCEPT_TO_MONSTER[conceptId],
      `Direct concept "${conceptId}" must appear in GRAMMAR_CONCEPT_TO_MONSTER`,
    );
  }

  // Every direct-monster concept is also in the aggregate.
  for (const conceptId of directConcepts) {
    assert.ok(
      GRAMMAR_AGGREGATE_CONCEPTS.includes(conceptId),
      `Direct concept "${conceptId}" must appear in GRAMMAR_AGGREGATE_CONCEPTS`,
    );
  }

  // Direct monster concept counts: Bracehart 6, Chronalyx 4, Couronnail 3.
  assert.equal(GRAMMAR_MONSTER_CONCEPTS.bracehart.length, 6, 'Bracehart has 6 concepts');
  assert.equal(GRAMMAR_MONSTER_CONCEPTS.chronalyx.length, 4, 'Chronalyx has 4 concepts');
  assert.equal(GRAMMAR_MONSTER_CONCEPTS.couronnail.length, 3, 'Couronnail has 3 concepts');

  // Total direct concepts (13) + punctuation-for-grammar (5) = 18 aggregate.
  const totalDirect = directConcepts.length;
  assert.equal(totalDirect, 13, 'Direct monsters cover 13 concepts total');
  assert.equal(
    GRAMMAR_AGGREGATE_CONCEPTS.length - totalDirect,
    5,
    '5 punctuation-for-grammar concepts contribute to Concordium only',
  );
});

// -----------------------------------------------------------------------------
// 4. Punctuation-for-grammar concepts are aggregate-only (not direct-mapped).
//
// The 5 punctuation concepts that contribute to Concordium must NOT appear
// in GRAMMAR_CONCEPT_TO_MONSTER. If they were mapped to a direct monster,
// Phase 5's Star budget computation would double-count them.
// -----------------------------------------------------------------------------

test('Phase 5 invariant 15: punctuation-for-grammar concepts are aggregate-only', () => {
  const punctuationForGrammar = [
    'parenthesis_commas',
    'speech_punctuation',
    'apostrophes_possession',
    'boundary_punctuation',
    'hyphen_ambiguity',
  ];

  for (const conceptId of punctuationForGrammar) {
    assert.ok(
      GRAMMAR_AGGREGATE_CONCEPTS.includes(conceptId),
      `Punctuation-for-grammar concept "${conceptId}" must be in GRAMMAR_AGGREGATE_CONCEPTS`,
    );
    assert.equal(
      GRAMMAR_CONCEPT_TO_MONSTER[conceptId],
      undefined,
      `Punctuation-for-grammar concept "${conceptId}" must NOT be mapped to a direct monster`,
    );
  }
});

// -----------------------------------------------------------------------------
// 5. GRAMMAR_REWARD_RELEASE_ID is stable (Phase 5 invariant 14).
//
// Phase 5 ships zero contentReleaseId bumps. Pin the current value so any
// accidental bump in a Phase 5 PR fails this test.
// -----------------------------------------------------------------------------

test('Phase 5 invariant 14: GRAMMAR_REWARD_RELEASE_ID is stable — no contentReleaseId bump', () => {
  assert.equal(
    GRAMMAR_REWARD_RELEASE_ID,
    'grammar-legacy-reviewed-2026-04-24',
    'Phase 5 does not bump the release id. Changes to this value require ' +
    'a marking-behaviour change and a dedicated migration PR.',
  );
});

// -----------------------------------------------------------------------------
// 6. Phase 5 Star contract documentation — pinned as descriptive assertions.
//
// These tests document the Phase 5 Star contracts that U2 will enforce
// with hard constant pins once the grammar-stars.js module exists. They
// serve as the contract specification that U2 must satisfy.
// -----------------------------------------------------------------------------

test('Phase 5 invariant 1: GRAMMAR_MONSTER_STAR_MAX === 100', () => {
  assert.equal(
    GRAMMAR_MONSTER_STAR_MAX,
    100,
    'Phase 5 universal Star cap is exactly 100. Changing this value ' +
    'requires updating all downstream stage thresholds and migration logic.',
  );
});

test('Phase 5 invariant 3: GRAMMAR_STAR_STAGE_THRESHOLDS shape', () => {
  assert.deepEqual(
    GRAMMAR_STAR_STAGE_THRESHOLDS,
    { egg: 1, hatch: 15, evolve2: 35, evolve3: 65, mega: 100 },
    'Stage thresholds must match the plan. Any change requires updating ' +
    'grammarStarStageFor, grammarStarDisplayStage, and the migration normaliser.',
  );
  assert.ok(
    Object.isFrozen(GRAMMAR_STAR_STAGE_THRESHOLDS),
    'GRAMMAR_STAR_STAGE_THRESHOLDS must be Object.freeze()d',
  );
});

test('Phase 5 invariant 2: GRAMMAR_CONCEPT_STAR_WEIGHTS sum === 1.0', () => {
  const sum = Object.values(GRAMMAR_CONCEPT_STAR_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(
    sum,
    1.0,
    `Evidence-tier weights must sum to exactly 1.0 so that a fully-evidenced ` +
    `concept earns its full budget. Current sum: ${sum}`,
  );
  assert.ok(
    Object.isFrozen(GRAMMAR_CONCEPT_STAR_WEIGHTS),
    'GRAMMAR_CONCEPT_STAR_WEIGHTS must be Object.freeze()d',
  );
});

// -----------------------------------------------------------------------------
// 7. Aggregate concepts list is frozen (Object.freeze).
//
// The aggregate concepts array must be frozen so that no mutation can
// silently add or remove concepts at runtime.
// -----------------------------------------------------------------------------

test('Phase 5 invariant 15: grammar constants are frozen', () => {
  assert.ok(
    Object.isFrozen(GRAMMAR_AGGREGATE_CONCEPTS),
    'GRAMMAR_AGGREGATE_CONCEPTS must be Object.freeze()d to prevent runtime mutation',
  );
  assert.ok(
    Object.isFrozen(GRAMMAR_MONSTER_CONCEPTS),
    'GRAMMAR_MONSTER_CONCEPTS must be Object.freeze()d to prevent runtime mutation',
  );
  assert.ok(
    Object.isFrozen(GRAMMAR_CONCEPT_TO_MONSTER),
    'GRAMMAR_CONCEPT_TO_MONSTER must be Object.freeze()d to prevent runtime mutation',
  );

  // Inner concept arrays must also be frozen to prevent mutation of individual
  // monster concept lists (e.g. bracehart's 6-concept array).
  Object.values(GRAMMAR_MONSTER_CONCEPTS).forEach((arr) => {
    assert.ok(
      Object.isFrozen(arr),
      `Inner concept array ${JSON.stringify(arr)} must be Object.freeze()d`,
    );
  });
});

// -----------------------------------------------------------------------------
// 8. Concept-ID snapshot — catches swap mutations.
//
// A sorted deepEqual of the full 18 concept IDs pins the exact identity set.
// If any concept is renamed, swapped, added, or removed, this test fails.
// -----------------------------------------------------------------------------

test('Phase 5 invariant 15: concept-ID snapshot — all 18 aggregate concept IDs pinned', () => {
  assert.deepEqual(
    [...GRAMMAR_AGGREGATE_CONCEPTS].sort(),
    [
      'active_passive',
      'adverbials',
      'apostrophes_possession',
      'boundary_punctuation',
      'clauses',
      'formality',
      'hyphen_ambiguity',
      'modal_verbs',
      'noun_phrases',
      'parenthesis_commas',
      'pronouns_cohesion',
      'relative_clauses',
      'sentence_functions',
      'speech_punctuation',
      'standard_english',
      'subject_object',
      'tense_aspect',
      'word_classes',
    ],
    'Sorted concept-ID snapshot must match exactly. Any rename, swap, addition, ' +
    'or removal requires updating this snapshot and a paired migration.',
  );
});
