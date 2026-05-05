// U6 — Seeded adaptive-selection simulation suite (Part A1-3: Principle 2).
//
// Split from grammar-learning-integrity-a1.test.js for CI parallelism.

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
