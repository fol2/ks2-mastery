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
//  3. Concept-to-monster mapping completeness (all 18 aggregate concepts have direct ownership).
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
  deriveGrammarConceptStarEvidence,
} from '../shared/grammar/grammar-stars.js';

import { GRAMMAR_EVENT_TYPES } from '../src/subjects/grammar/event-hooks.js';
import { updateGrammarStarHighWater } from '../src/platform/game/mastery/grammar.js';

import {
  GRAMMAR_BANK_STATUS_CHIPS,
  buildGrammarDashboardModel,
} from '../src/subjects/grammar/components/grammar-view-model.js';

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
// Every concept in GRAMMAR_AGGREGATE_CONCEPTS now has direct-monster
// ownership. The 5 punctuation-for-grammar bridge concepts still contribute
// to Concordium, but also route to Bracehart / Couronnail so a Grand egg
// cannot be the learner's first visible Grammar reward.
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

  // Direct monster concept counts: Bracehart 9, Chronalyx 4, Couronnail 5.
  assert.equal(GRAMMAR_MONSTER_CONCEPTS.bracehart.length, 9, 'Bracehart has 9 concepts');
  assert.equal(GRAMMAR_MONSTER_CONCEPTS.chronalyx.length, 4, 'Chronalyx has 4 concepts');
  assert.equal(GRAMMAR_MONSTER_CONCEPTS.couronnail.length, 5, 'Couronnail has 5 concepts');

  // Direct ownership now covers the full 18-concept aggregate.
  const totalDirect = directConcepts.length;
  assert.equal(totalDirect, 18, 'Direct monsters cover all 18 concepts total');
  assert.equal(GRAMMAR_AGGREGATE_CONCEPTS.length - totalDirect, 0);
});

// -----------------------------------------------------------------------------
// 4. Punctuation-for-grammar concepts bridge into direct monsters.
//
// The 5 punctuation concepts still contribute to Concordium, but now also
// have direct ownership for child-facing progress.
// -----------------------------------------------------------------------------

test('Phase 5 invariant 15: punctuation-for-grammar bridge concepts have direct owners', () => {
  const punctuationForGrammar = {
    parenthesis_commas: 'bracehart',
    speech_punctuation: 'bracehart',
    boundary_punctuation: 'bracehart',
    apostrophes_possession: 'couronnail',
    hyphen_ambiguity: 'couronnail',
  };

  for (const [conceptId, monsterId] of Object.entries(punctuationForGrammar)) {
    assert.ok(
      GRAMMAR_AGGREGATE_CONCEPTS.includes(conceptId),
      `Punctuation-for-grammar concept "${conceptId}" must be in GRAMMAR_AGGREGATE_CONCEPTS`,
    );
    assert.equal(
      GRAMMAR_CONCEPT_TO_MONSTER[conceptId],
      monsterId,
      `Punctuation-for-grammar concept "${conceptId}" must be mapped to ${monsterId}`,
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

// =============================================================================
// Phase 6 invariant pins (P6-1 through P6-5).
//
// Invariants: docs/plans/james/grammar/grammar-phase6-invariants.md.
// These pins verify the six trust fixes from Phase 6 are testable from the
// existing module surface. They are additive — all Phase 5 pins above remain
// unchanged.
// =============================================================================

// -----------------------------------------------------------------------------
// P6-1 pin: deriveGrammarConceptStarEvidence accepts conceptIds (array) —
// production attempt shape.
//
// The production Worker engine emits attempts with { conceptIds: [...],
// result: { correct } }. This pin exercises the production shape to confirm
// the normaliser at shared/grammar/grammar-stars.js handles it.
// -----------------------------------------------------------------------------

test('P6 invariant 1: deriveGrammarConceptStarEvidence accepts production shape (conceptIds array + result.correct nested)', () => {
  // Production shape: conceptIds is an array, correct is nested in result.
  const evidence = deriveGrammarConceptStarEvidence({
    conceptId: 'noun_phrases',
    conceptNode: null,
    recentAttempts: [
      {
        conceptIds: ['noun_phrases'],
        result: { correct: true },
        templateId: 'tpl-np-1',
        firstAttemptIndependent: true,
        supportLevelAtScoring: 0,
      },
      {
        conceptIds: ['noun_phrases'],
        result: { correct: true },
        templateId: 'tpl-np-2',
        firstAttemptIndependent: true,
        supportLevelAtScoring: 0,
      },
    ],
  });
  assert.equal(evidence.firstIndependentWin, true,
    'P6-1: production shape (conceptIds array) must unlock firstIndependentWin');
  assert.equal(evidence.repeatIndependentWin, true,
    'P6-1: production shape must unlock repeatIndependentWin with 2 independent corrects');
  assert.equal(evidence.variedPractice, true,
    'P6-1: production shape with 2 distinct templateIds must unlock variedPractice');
});

// -----------------------------------------------------------------------------
// P6-2 pin: variedPractice false for wrong-only distinct templates.
//
// Wrong answers on varied templates prove exposure but not transfer.
// -----------------------------------------------------------------------------

test('P6 invariant 2: variedPractice false when all distinct templates are wrong-answer-only', () => {
  const evidence = deriveGrammarConceptStarEvidence({
    conceptId: 'clauses',
    conceptNode: null,
    recentAttempts: [
      {
        conceptId: 'clauses',
        correct: false,
        templateId: 'tpl-clauses-a',
        firstAttemptIndependent: false,
        supportLevelAtScoring: 0,
      },
      {
        conceptId: 'clauses',
        correct: false,
        templateId: 'tpl-clauses-b',
        firstAttemptIndependent: false,
        supportLevelAtScoring: 0,
      },
      {
        conceptId: 'clauses',
        correct: false,
        templateId: 'tpl-clauses-c',
        firstAttemptIndependent: false,
        supportLevelAtScoring: 0,
      },
    ],
  });
  assert.equal(evidence.variedPractice, false,
    'P6-2: wrong-answer-only distinct templates must NOT unlock variedPractice');
  assert.equal(evidence.firstIndependentWin, false,
    'P6-2: wrong answers must not unlock firstIndependentWin');
});

// -----------------------------------------------------------------------------
// P6-3 pin: deriveGrammarConceptStarEvidence accepts nowTs parameter for
// deterministic temporal proof testing.
// -----------------------------------------------------------------------------

test('P6 invariant 3: deriveGrammarConceptStarEvidence accepts nowTs parameter for temporal proof', () => {
  // A concept that is secure (strength >= 0.82, intervalDays >= 7, correctStreak >= 3).
  const secureNode = {
    attempts: 10,
    correct: 8,
    wrong: 2,
    strength: 0.85,
    intervalDays: 14,
    correctStreak: 5,
  };

  // nowTs is 30 days after an imagined secure point.
  // securedAtTs = nowTs - (intervalDays * 86400000) = nowTs - 14 days.
  // A correct attempt with createdAt AFTER securedAtTs satisfies the temporal proof.
  const nowTs = 1_777_000_000_000;
  const securedAtTs = nowTs - (14 * 86_400_000);
  const postSecureCreatedAt = securedAtTs + 86_400_000; // 1 day after secure

  const withTemporal = deriveGrammarConceptStarEvidence({
    conceptId: 'modal_verbs',
    conceptNode: secureNode,
    recentAttempts: [
      {
        conceptId: 'modal_verbs',
        correct: true,
        templateId: 'tpl-mv-1',
        firstAttemptIndependent: true,
        supportLevelAtScoring: 0,
        createdAt: postSecureCreatedAt,
      },
    ],
    nowTs,
  });
  assert.equal(withTemporal.secureConfidence, true,
    'P6-3: secure concept must unlock secureConfidence');
  assert.equal(withTemporal.retainedAfterSecure, true,
    'P6-3: post-secure temporal proof with nowTs must unlock retainedAfterSecure');

  // Same concept, but createdAt is BEFORE the securedAtTs — temporal proof fails.
  const preSecureCreatedAt = securedAtTs - 86_400_000; // 1 day before secure
  const withoutTemporal = deriveGrammarConceptStarEvidence({
    conceptId: 'modal_verbs',
    conceptNode: secureNode,
    recentAttempts: [
      {
        conceptId: 'modal_verbs',
        correct: true,
        templateId: 'tpl-mv-1',
        firstAttemptIndependent: true,
        supportLevelAtScoring: 0,
        createdAt: preSecureCreatedAt,
      },
    ],
    nowTs,
  });
  assert.equal(withoutTemporal.secureConfidence, true,
    'P6-3: secure concept still shows secureConfidence');
  assert.equal(withoutTemporal.retainedAfterSecure, false,
    'P6-3: pre-secure createdAt must NOT unlock retainedAfterSecure (temporal proof fails)');
});

// -----------------------------------------------------------------------------
// P6-4 pin: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED exists.
//
// The star-evidence-updated event is the trigger for sub-secure persistence.
// Its existence is a load-bearing contract for the Phase 6 persistence model.
// -----------------------------------------------------------------------------

test('P6 invariant 4: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED exists', () => {
  assert.equal(
    GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
    'grammar.star-evidence-updated',
    'P6-4: STAR_EVIDENCE_UPDATED event type must be the sub-secure persistence trigger',
  );
});

// -----------------------------------------------------------------------------
// P6-4 pin (continued): updateGrammarStarHighWater exists and is exported.
//
// The function is the write-side of the sub-secure persistence model.
// -----------------------------------------------------------------------------

test('P6 invariant 4: updateGrammarStarHighWater exists and is exported', () => {
  assert.equal(typeof updateGrammarStarHighWater, 'function',
    'P6-4: updateGrammarStarHighWater must be a function exported from grammar.js');
});

// ---------------------------------------------------------------------------
// Phase 7 invariant pins
// ---------------------------------------------------------------------------

test('P7-5: shared/grammar/grammar-stars.js has zero imports from src/', async () => {
  const { readFile } = await import('node:fs/promises');
  const content = await readFile(new URL('../shared/grammar/grammar-stars.js', import.meta.url), 'utf8');
  const srcImports = content.match(/from\s+['"][^'"]*src\//g);
  assert.equal(srcImports, null, 'grammar-stars.js must not import from src/');
});

test('P7-5: shared/grammar/grammar-concept-roster.js has zero imports from src/', async () => {
  const { readFile } = await import('node:fs/promises');
  const content = await readFile(new URL('../shared/grammar/grammar-concept-roster.js', import.meta.url), 'utf8');
  const srcImports = content.match(/from\s+['"][^'"]*src\//g);
  assert.equal(srcImports, null, 'grammar-concept-roster.js must not import from src/');
});

test('P7-3: GRAMMAR_BANK_STATUS_CHIPS due entry has label Practise next', () => {
  const dueChip = GRAMMAR_BANK_STATUS_CHIPS.find((c) => c.id === 'due');
  assert.ok(dueChip, 'due chip must exist');
  assert.equal(dueChip.label, 'Practise next');
});

test('P7-2: writingTryAvailable does not depend on AI — model returns true when AI disabled', () => {
  const model = buildGrammarDashboardModel(
    { capabilities: { aiEnrichment: { enabled: false } } },
    null,
    {},
  );
  assert.equal(model.writingTryAvailable, true);
});

test('P7: no contentReleaseId bump in Phase 7 files', async () => {
  const { readFile } = await import('node:fs/promises');
  const { readdir } = await import('node:fs/promises');
  // Verify the release ID constant hasn't changed
  assert.equal(GRAMMAR_REWARD_RELEASE_ID, 'grammar-legacy-reviewed-2026-04-24');
});
