// U6 — Seeded adaptive-selection simulation suite (Part A1: Principles 1-2).
//
// Plan: docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md
// (search "U6. **Seeded adaptive-selection simulation suite**", ~line 619).
//
// Split from grammar-learning-integrity-a.test.js for CI parallelism.

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
// Principle 1 — Due outranks non-due (aggregate total picks comparison).
// -----------------------------------------------------------------------------

test('U6 principle: a due concept is picked more often than an equivalent non-due concept (aggregate across 18 concepts x 8 seeds)', async () => {
  const { GRAMMAR_CONCEPTS } = await import('../worker/src/subjects/grammar/content.js');
  const { createInitialGrammarState } = await import('../worker/src/subjects/grammar/engine.js');
  function stateForConcept(conceptId, dueOffset) {
    const state = createInitialGrammarState();
    state.mastery.concepts[conceptId] = {
      attempts: 5,
      correct: 4,
      wrong: 1,
      strength: 0.85,
      intervalDays: 7,
      dueAt: SIM_NOW_MS + dueOffset,
      lastSeenAt: null,
      lastWrongAt: null,
      correctStreak: 3,
    };
    return state;
  }
  let dueTotal = 0;
  let notDueTotal = 0;
  const perConcept = [];
  for (const concept of GRAMMAR_CONCEPTS) {
    const stateDue = stateForConcept(concept.id, -60_000); // overdue
    const stateNotDue = stateForConcept(concept.id, +7 * 86_400_000); // due in 7 days
    let dueCount = 0;
    let notDueCount = 0;
    for (const seed of CANONICAL_SEEDS) {
      dueCount += conceptHitsInQueue(
        buildQueueForSeed({ seed, size: 12, mastery: stateDue.mastery }),
        concept.id,
      ).length;
      notDueCount += conceptHitsInQueue(
        buildQueueForSeed({ seed, size: 12, mastery: stateNotDue.mastery }),
        concept.id,
      ).length;
    }
    dueTotal += dueCount;
    notDueTotal += notDueCount;
    perConcept.push({ conceptId: concept.id, due: dueCount, notDue: notDueCount });
    assert.ok(
      notDueCount <= dueCount + 3 && notDueCount <= (dueCount + 1) * 2,
      `concept ${concept.id} due=${dueCount} notDue=${notDueCount} — `
      + `per-concept due-outranks regression beyond sampler-variance tolerance`,
    );
  }
  assert.ok(
    dueTotal > notDueTotal,
    `Due concepts must be picked more often than equivalent not-due concepts across 18 x 8 samples. `
    + `dueTotal=${dueTotal} notDueTotal=${notDueTotal}. perConcept=${JSON.stringify(perConcept)}`,
  );
  const ratio = dueTotal / Math.max(1, notDueTotal);
  assert.ok(
    ratio >= 1.5,
    `Due/not-due pick ratio should be >= 1.5 to show a meaningful weighting effect; got ${ratio.toFixed(2)}. `
    + `dueTotal=${dueTotal} notDueTotal=${notDueTotal}`,
  );
});

// -----------------------------------------------------------------------------
// Principle 2 — Weak outranks secure (first-position in first half).
// -----------------------------------------------------------------------------

test('U6 principle: weak concept first queue position lies in the first half of a 10-item queue across all 8 seeds', () => {
  const conceptId = 'adverbials';
  const firstHalfLimit = 5; // positions 0..4 in a 10-item queue
  const diagnostics = [];
  const { failures } = simulateAcrossSeeds(CANONICAL_SEEDS, (seed) => {
    const state = stateWithConceptStatus({ conceptId, status: 'weak', othersStatus: 'secured' });
    const queue = buildQueueForSeed({ seed, size: 10, mastery: state.mastery });
    const hits = conceptHitsInQueue(queue, conceptId);
    diagnostics.push({ seed, first: hits[0] ?? null, total: hits.length });
    if (hits.length === 0) {
      throw new Error(`seed ${seed}: weak concept never appeared in a 10-item queue`);
    }
    if (hits[0] >= firstHalfLimit) {
      throw new Error(`seed ${seed}: weak concept first appeared at position ${hits[0]} (>= ${firstHalfLimit})`);
    }
    return hits[0];
  });
  assert.equal(
    failures.length,
    0,
    `Weak concept must land in positions 0..${firstHalfLimit - 1} in all 8 seeds. `
    + `failures=${JSON.stringify(failures.map((f) => ({ seed: f.seed, msg: f.error.message })))}. `
    + `diagnostics=${JSON.stringify(diagnostics)}`,
  );
});
