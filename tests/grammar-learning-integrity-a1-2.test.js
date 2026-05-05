// U6 — Seeded adaptive-selection simulation suite (Part A1-2: Principle 1 second half).
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
// Principle 1 — Due outranks non-due (second half of concepts).
// -----------------------------------------------------------------------------

test('U6 principle: due concept picked more often than non-due (second half of concepts across 8 seeds)', async () => {
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
  const half = Math.ceil(GRAMMAR_CONCEPTS.length / 2);
  const concepts = GRAMMAR_CONCEPTS.slice(half);
  let dueTotal = 0;
  let notDueTotal = 0;
  const perConcept = [];
  for (const concept of concepts) {
    const stateDue = stateForConcept(concept.id, -60_000);
    const stateNotDue = stateForConcept(concept.id, +7 * 86_400_000);
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
    `Due concepts must be picked more often (second half). `
    + `dueTotal=${dueTotal} notDueTotal=${notDueTotal}. perConcept=${JSON.stringify(perConcept)}`,
  );
});
