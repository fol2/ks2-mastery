// U6 — Seeded adaptive-selection simulation suite (Part B: Principles 5-8).
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
// Principle 5 — Concept freshness (consecutive run guard).
// -----------------------------------------------------------------------------

test('U6 principle: no concept appears 3+ times consecutively in a 10-item queue in at least 7 of 8 seeds', () => {
  const minPassingSeeds = 7;
  const offenders = [];
  const perSeed = [];
  for (const seed of CANONICAL_SEEDS) {
    const queue = buildQueueForSeed({ seed, size: 10 });
    const violates = hasConsecutiveConceptRun(queue, 3);
    perSeed.push({ seed, violates });
    if (violates) {
      offenders.push({
        seed,
        queue: queue.map((entry, index) => `${index}:${entry.templateId}[${(entry.skillIds || []).join(',')}]`),
      });
    }
  }
  const passingSeeds = CANONICAL_SEEDS.length - offenders.length;
  assert.ok(
    passingSeeds >= minPassingSeeds,
    `Concept-freshness principle should hold in >= ${minPassingSeeds}/8 seeds; got ${passingSeeds}/8. `
    + `offenders=${JSON.stringify(offenders)}`,
  );
});

// -----------------------------------------------------------------------------
// Principle 6 — Mini-pack balance.
// -----------------------------------------------------------------------------

test('U6 principle: mini-pack question-type distribution is within +/- ceil(size/3) of even for size=8 across 8 seeds', () => {
  const size = 8;
  const tolerance = Math.ceil(size / 3);
  const maxPerBucket = Math.floor(size / 8) + tolerance; // 1 + 3 = 4 for size 8 even across 8 QT types
  const offenders = [];
  for (const seed of CANONICAL_SEEDS) {
    const pack = buildMiniPackForSeed({ seed, size });
    assert.equal(pack.length, size, `seed ${seed}: mini-pack length ${pack.length} != ${size}`);
    const counts = questionTypeCountsInPack(pack);
    for (const [questionType, count] of counts) {
      if (count > maxPerBucket) {
        offenders.push({ seed, questionType, count, maxPerBucket });
      }
    }
  }
  assert.equal(
    offenders.length,
    0,
    `Mini-pack balance exceeded max-per-bucket (${maxPerBucket}). offenders=${JSON.stringify(offenders)}`,
  );
});

// -----------------------------------------------------------------------------
// Principle 7 — Supported-correct < independent-correct (aggregate mastery gain).
// -----------------------------------------------------------------------------

test('U6 principle: supported-correct mastery gain is strictly less than independent-correct across 8 seeds x 3 runs', () => {
  let independentTotal = 0;
  let supportedTotal = 0;
  const perRun = [];
  for (const seed of CANONICAL_SEEDS) {
    for (let run = 0; run < 3; run += 1) {
      const runSeed = (seed + run * 31) >>> 0;
      const independent = runSingleAttemptMasteryGain({ seed: runSeed, flavour: 'independent' });
      const supported = runSingleAttemptMasteryGain({ seed: runSeed, flavour: 'worked' });
      independentTotal += independent.strengthAfter;
      supportedTotal += supported.strengthAfter;
      perRun.push({
        seed,
        run,
        independentStrength: Number(independent.strengthAfter.toFixed(4)),
        supportedStrength: Number(supported.strengthAfter.toFixed(4)),
      });
      assert.ok(
        independent.strengthAfter > supported.strengthAfter,
        `seed ${seed} run ${run}: independent strength ${independent.strengthAfter} `
        + `must exceed supported strength ${supported.strengthAfter}`,
      );
    }
  }
  assert.ok(
    independentTotal > supportedTotal,
    `Aggregate independent mastery gain must exceed aggregate supported gain. `
    + `independentTotal=${independentTotal.toFixed(4)} supportedTotal=${supportedTotal.toFixed(4)} `
    + `perRun=${JSON.stringify(perRun)}`,
  );
});

// -----------------------------------------------------------------------------
// Principle 8 — Pathological input: empty mastery + focusConceptId on a
// 2-template concept.
// -----------------------------------------------------------------------------

test('U6 edge case: empty mastery + focusConceptId on a 2-template concept returns a valid queue with no NPE under every seed', () => {
  const focusConceptId = 'hyphen_ambiguity'; // Exactly 2 templates.
  let totalFocusHits = 0;
  const perSeed = [];
  for (const seed of CANONICAL_SEEDS) {
    let queue;
    assert.doesNotThrow(() => {
      queue = buildGrammarPracticeQueue({
        mode: 'smart',
        focusConceptId,
        mastery: null,
        recentAttempts: [],
        seed,
        size: 10,
        now: SIM_NOW_MS,
      });
    }, `seed ${seed}: buildGrammarPracticeQueue threw for pathological focus input`);
    assert.equal(queue.length, 10, `seed ${seed}: returned queue length ${queue.length} != 10`);
    for (const entry of queue) {
      assert.ok(typeof entry.templateId === 'string' && entry.templateId.length > 0,
        `seed ${seed}: entry.templateId must be a non-empty string`);
      assert.ok(Array.isArray(entry.skillIds),
        `seed ${seed}: entry.skillIds must be an array`);
      assert.ok(typeof entry.questionType === 'string' && entry.questionType.length > 0,
        `seed ${seed}: entry.questionType must be a non-empty string`);
    }
    const focusHits = conceptHitsInQueue(queue, focusConceptId);
    totalFocusHits += focusHits.length;
    perSeed.push({ seed, focusHits: focusHits.length });
  }
  assert.ok(
    totalFocusHits >= 4,
    `Focus bias should yield >= 4 focus-concept picks across 8 seeds x 10 slots; got ${totalFocusHits}. perSeed=${JSON.stringify(perSeed)}`,
  );
});
