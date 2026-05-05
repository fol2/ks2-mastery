// U6 — Seeded adaptive-selection simulation suite (Part A2: Principles 3-4).
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
// Principle 3 — Recent-miss recycle (>= 6/8 seeds).
// -----------------------------------------------------------------------------

test('U6 principle: concept with a recent miss recycles within 5 items in >= 6 of 8 seeds', () => {
  const conceptId = 'adverbials';
  const recycleWithin = 5;
  const minPassingSeeds = 6;
  let recycled = 0;
  const diagnostics = [];
  for (const seed of CANONICAL_SEEDS) {
    const state = stateWithConceptStatus({ conceptId, status: 'weak', othersStatus: 'learning' });
    pushRecentMiss(state, conceptId);
    const queue = buildQueueForSeed({
      seed,
      size: 10,
      mastery: state.mastery,
      recentAttempts: state.recentAttempts,
    });
    const hits = conceptHitsInQueue(queue, conceptId);
    const firstDistance = hits.length ? hits[0] + 1 : Infinity;
    const isRecycled = firstDistance <= recycleWithin;
    if (isRecycled) recycled += 1;
    diagnostics.push({ seed, firstPosition: hits[0] ?? null, firstDistance, isRecycled });
  }
  assert.ok(
    recycled >= minPassingSeeds,
    `Recent-miss recycle should hold in >= ${minPassingSeeds}/8 seeds; got ${recycled}/8. `
    + `diagnostics=${JSON.stringify(diagnostics)}`,
  );
});

// -----------------------------------------------------------------------------
// Principle 4 — Template freshness (hard invariant across all 8 seeds).
// -----------------------------------------------------------------------------

test('U6 principle: no template id appears 3+ times in a 10-item queue across all 8 seeds', () => {
  const offenders = [];
  for (const seed of CANONICAL_SEEDS) {
    const queue = buildQueueForSeed({ seed, size: 10 });
    const counts = templateCountsInQueue(queue);
    for (const [templateId, count] of counts) {
      if (count >= 3) offenders.push({ seed, templateId, count });
    }
  }
  assert.equal(
    offenders.length,
    0,
    `Template freshness principle violated. offenders=${JSON.stringify(offenders)}`,
  );
});
