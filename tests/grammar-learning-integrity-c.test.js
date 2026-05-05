// U6 — Seeded adaptive-selection simulation suite (Part C: Principles 9-11 + seed guard).
//
// Plan: docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md
// (search "U6. **Seeded adaptive-selection simulation suite**", ~line 619).
//
// Split from grammar-learning-integrity.test.js for CI parallelism.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGrammarMiniPack,
  buildGrammarPracticeQueue,
} from '../worker/src/subjects/grammar/selection.js';
import {
  CANONICAL_SEEDS,
  SIM_NOW_MS,
  buildQueueForSeed,
  buildMiniPackForSeed,
  conceptHitsInQueue,
  templateCountsInQueue,
  questionTypeCountsInPack,
  hasConsecutiveConceptRun,
  pushRecentMiss,
  runSingleAttemptMasteryGain,
  run20RoundReplay,
  simulateAcrossSeeds,
  stateWithAllConcepts,
  stateWithConceptStatus,
} from './helpers/grammar-simulation.js';

// -----------------------------------------------------------------------------
// Principle 9 — All concepts secured edge case.
// -----------------------------------------------------------------------------

test('U6 edge case: when all concepts are secured, queue remains valid and spreads across templates', () => {
  const state = stateWithAllConcepts('secured');
  for (const seed of CANONICAL_SEEDS) {
    const queue = buildQueueForSeed({ seed, size: 10, mastery: state.mastery });
    assert.equal(queue.length, 10, `seed ${seed}: queue length != 10`);
    for (const entry of queue) {
      assert.equal(typeof entry.templateId, 'string', `seed ${seed}: templateId must be a string`);
      assert.ok(entry.templateId.length > 0, `seed ${seed}: templateId must be non-empty`);
      assert.ok(Array.isArray(entry.skillIds), `seed ${seed}: skillIds must be an array`);
      assert.equal(typeof entry.questionType, 'string', `seed ${seed}: questionType must be a string`);
    }
    const distinctTemplates = new Set(queue.map((entry) => entry.templateId));
    assert.ok(
      distinctTemplates.size >= 5,
      `seed ${seed}: all-secured queue should spread across >= 5 templates; got ${distinctTemplates.size}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Principle 10 — Error path: buildGrammarMiniPack with size=0.
// -----------------------------------------------------------------------------

test('U6 error path: buildGrammarMiniPack({ size: 0 }) returns an empty array under every seed', () => {
  for (const seed of CANONICAL_SEEDS) {
    let pack;
    assert.doesNotThrow(() => {
      pack = buildGrammarMiniPack({ size: 0, seed });
    }, `seed ${seed}: buildGrammarMiniPack size=0 threw`);
    assert.ok(Array.isArray(pack), `seed ${seed}: result must be an array`);
    assert.equal(pack.length, 0, `seed ${seed}: size=0 must yield an empty array; got length ${pack.length}`);
  }
});

// -----------------------------------------------------------------------------
// Principle 11 — 20-round replay spread.
// -----------------------------------------------------------------------------

test('U6 integration: 20-round replay ends with spread mastery, not concentrated on one concept', () => {
  for (const seed of CANONICAL_SEEDS) {
    const concepts = run20RoundReplay({ seed, rounds: 20 });
    const conceptIds = Object.keys(concepts);
    assert.ok(
      conceptIds.length >= 3,
      `seed ${seed}: 20-round replay touched only ${conceptIds.length} concepts (< 3); state concentrated too narrowly`,
    );
    const maxAttempts = Math.max(0, ...conceptIds.map((id) => Number(concepts[id].attempts) || 0));
    assert.ok(
      maxAttempts <= 10,
      `seed ${seed}: single concept got ${maxAttempts} attempts out of <=20 rounds — `
      + `selection is concentrating too aggressively instead of spreading`,
    );
    for (const conceptId of conceptIds) {
      assert.ok(
        concepts[conceptId].strength > 0.25,
        `seed ${seed}: concept '${conceptId}' has strength ${concepts[conceptId].strength} <= 0.25 baseline`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// Canonical-seed list parity guard.
// -----------------------------------------------------------------------------

test('U6 suite uses the exact 8 canonical seeds named in the U6 plan', () => {
  assert.deepEqual(
    CANONICAL_SEEDS.slice(),
    [1, 7, 13, 42, 100, 2025, 31415, 65535],
    'Canonical seeds must match the set named in the U6 plan',
  );
});
