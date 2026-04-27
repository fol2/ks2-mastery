// Grammar Phase 5 U3 — Star-curve simulation spike.
//
// Validates that the 5/10/10/15/60 evidence-tier weights produce sensible
// progression timelines across three learner profiles (ideal, typical,
// struggling) at two daily round sizes (5 and 10 questions/day).
//
// Deterministic: uses makeSeededRandom across 8 canonical seeds.
// Results inform whether weights need adjustment before U4 locks them in.
//
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U3).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  simulateStarCurveProfile,
  simulateStarCurveAcrossSeeds,
  CANONICAL_SEEDS,
} from './helpers/grammar-simulation.js';

import {
  GRAMMAR_CONCEPT_STAR_WEIGHTS,
} from '../shared/grammar/grammar-stars.js';

// ---------------------------------------------------------------------------
// Calibrated target timelines
// ---------------------------------------------------------------------------
// The plan targets (origin: grammar-p5.md) are aspirational "feel" targets:
//   First direct Egg:      1-2 weeks
//   First Hatch:           2-3 weeks
//   First direct Mega:     5-8 weeks
//   Grand Concordium:      10-14+ weeks
//
// Simulation reveals:
//   - Egg on day 1 is structurally correct: R4 says "1 Star catches the Egg"
//     and 1 independent correct on any concept = 1 Star via floor guarantee.
//   - Hatch (15 Stars) arrives in 1-9 days because the first three tiers
//     (firstIndependentWin 5% + repeatIndependentWin 10% + variedPractice 10%)
//     = 25% of budget unlock quickly. For Couronnail (3 concepts): 3 * 33.3 * 0.25
//     = 25 Stars > 15 threshold.
//   - Mega (100 Stars) requires retainedAfterSecure on ALL concepts, gating on
//     the SM-2 interval reaching 7+ days AND a subsequent independent correct.
//     This naturally takes 3-8+ weeks depending on profile and round size.
//   - Grand Concordium is the longest milestone — 18 concepts including 5
//     punctuation concepts that advance via a separate subject at lower frequency.
//
// Test bounds below are calibrated to the ACTUAL simulation output rather
// than the aspirational plan targets. The plan targets assumed a model where
// concepts take longer to unlock early tiers. If the plan's "2-week Egg"
// target is desired, the firstIndependentWin weight or floor guarantee would
// need adjustment — noted in the results report.

const SEEDS = CANONICAL_SEEDS;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function medianOf(arr) {
  const sorted = arr.filter((v) => v !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

function runProfile(profile, questionsPerDay) {
  return simulateStarCurveAcrossSeeds(profile, {
    questionsPerDay,
    seeds: SEEDS,
    maxDays: 150,
  });
}

// ---------------------------------------------------------------------------
// 1. Egg — arrives on day 1 for all profiles (structural: 1 independent
//    correct on any concept = at least 1 Star via floor guarantee)
// ---------------------------------------------------------------------------

test('all profiles: first direct Egg within 7 days at 10q/day', () => {
  for (const profile of ['ideal', 'typical', 'struggling']) {
    const { results } = runProfile(profile, 10);
    for (const r of results) {
      assert.ok(
        r.daysToFirstDirectEgg !== null && r.daysToFirstDirectEgg <= 7,
        `${profile} seed ${r.seed}: Egg took ${r.daysToFirstDirectEgg} days (target: <= 7)`,
      );
    }
  }
});

test('all profiles: first direct Egg within 7 days at 5q/day', () => {
  for (const profile of ['ideal', 'typical', 'struggling']) {
    const { results } = runProfile(profile, 5);
    for (const r of results) {
      assert.ok(
        r.daysToFirstDirectEgg !== null && r.daysToFirstDirectEgg <= 7,
        `${profile} seed ${r.seed}: Egg took ${r.daysToFirstDirectEgg} days (target: <= 7)`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Hatch — arrives quickly because 25% of per-concept budget unlocks from
//    early evidence tiers (firstIndependentWin + repeatIndependentWin +
//    variedPractice). For small monsters (Couronnail = 3 concepts), 25% of
//    budget = 25 Stars > 15 threshold.
// ---------------------------------------------------------------------------

test('ideal learner at 10q/day: first Hatch within 14 days', () => {
  const { results } = runProfile('ideal', 10);
  for (const r of results) {
    assert.ok(
      r.daysToFirstHatch !== null && r.daysToFirstHatch <= 14,
      `Seed ${r.seed}: Hatch took ${r.daysToFirstHatch} days (target: <= 14)`,
    );
  }
});

test('typical learner at 10q/day: first Hatch within 21 days', () => {
  const { results } = runProfile('typical', 10);
  for (const r of results) {
    assert.ok(
      r.daysToFirstHatch !== null && r.daysToFirstHatch <= 21,
      `Seed ${r.seed}: Hatch took ${r.daysToFirstHatch} days (target: <= 21)`,
    );
  }
});

test('struggling learner at 10q/day: first Hatch within 28 days', () => {
  const { results } = runProfile('struggling', 10);
  for (const r of results) {
    assert.ok(
      r.daysToFirstHatch !== null && r.daysToFirstHatch <= 28,
      `Seed ${r.seed}: Hatch took ${r.daysToFirstHatch} days (target: <= 28)`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. First direct Mega — requires retainedAfterSecure on ALL concepts of
//    at least one monster. The bottleneck is the SM-2 interval reaching 7d
//    (5+ correct reviews on different days) + subsequent independent correct.
// ---------------------------------------------------------------------------

test('ideal learner at 10q/day: median Mega within 35 days', () => {
  const { results } = runProfile('ideal', 10);
  const megas = results.map((r) => r.daysToFirstDirectMega).filter((v) => v !== null);
  // Most seeds should reach Mega. Allow up to 1 seed to miss.
  assert.ok(megas.length >= 7, `Only ${megas.length}/8 seeds reached Mega`);
  const median = medianOf(megas);
  assert.ok(median <= 35, `Ideal 10q Mega median ${median} days > 35`);
});

test('ideal learner at 10q/day: Mega not trivially fast (>= 10 days)', () => {
  const { results } = runProfile('ideal', 10);
  for (const r of results) {
    if (r.daysToFirstDirectMega !== null) {
      assert.ok(
        r.daysToFirstDirectMega >= 10,
        `Seed ${r.seed}: Mega in ${r.daysToFirstDirectMega} days is too fast (floor: 10)`,
      );
    }
  }
});

test('typical learner at 10q/day: median Mega within 70 days', () => {
  const { results } = runProfile('typical', 10);
  const megas = results.map((r) => r.daysToFirstDirectMega).filter((v) => v !== null);
  // Typical should mostly reach Mega but allow up to 2 seeds to miss.
  assert.ok(megas.length >= 6, `Only ${megas.length}/8 seeds reached Mega`);
  const median = medianOf(megas);
  assert.ok(median <= 70, `Typical 10q Mega median ${median} days > 70`);
});

test('struggling learner at 10q/day: at least some seeds reach Mega within 150 days', () => {
  const { results } = runProfile('struggling', 10);
  const megas = results.map((r) => r.daysToFirstDirectMega).filter((v) => v !== null);
  // Struggling at 10q should reach Mega for at least 1 seed.
  assert.ok(megas.length >= 1, 'No struggling seeds reached Mega at 10q/day within 150 days');
});

// ---------------------------------------------------------------------------
// 4. 5q/day profiles — slower progression due to fewer daily questions
// ---------------------------------------------------------------------------

test('ideal learner at 5q/day: at least some seeds reach Mega', () => {
  const { results } = runProfile('ideal', 5);
  const megas = results.map((r) => r.daysToFirstDirectMega).filter((v) => v !== null);
  // At 5q/day, the learner covers fewer concepts per day. Some seeds may
  // not reach Mega within 150 days due to scheduling variance.
  assert.ok(megas.length >= 1, 'No ideal seeds reached Mega at 5q/day within 150 days');
});

test('typical learner at 5q/day: Egg within 7 days', () => {
  const { results } = runProfile('typical', 5);
  for (const r of results) {
    assert.ok(
      r.daysToFirstDirectEgg !== null && r.daysToFirstDirectEgg <= 7,
      `Seed ${r.seed}: Egg took ${r.daysToFirstDirectEgg} days`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5. Concordium — structurally slower than direct monsters
// ---------------------------------------------------------------------------

test('Concordium Egg arrives on or after first direct Egg', () => {
  const { results } = runProfile('ideal', 10);
  for (const r of results) {
    if (r.daysToFirstConcordiumEgg !== null && r.daysToFirstDirectEgg !== null) {
      assert.ok(
        r.daysToFirstConcordiumEgg >= r.daysToFirstDirectEgg,
        `Seed ${r.seed}: Concordium Egg (day ${r.daysToFirstConcordiumEgg}) before direct Egg (day ${r.daysToFirstDirectEgg})`,
      );
    }
  }
});

test('Concordium Stars at day 150 show genuine progress but lag behind direct monsters', () => {
  // Grand Concordium (100 Stars on Concordium = 18 concepts fully evidenced)
  // is never reached within 150 days across any seed. Rather than guard with
  // an `if` that never fires, assert on the median Concordium Stars at day 150:
  // they should show genuine progress (>= 60) but remain below Mega (< 100).
  const { results } = runProfile('ideal', 10);

  // Extract Concordium Stars at day 150 from the last dayLog entry per seed.
  const concordiumStarsAtEnd = results.map((r) => {
    const lastDay = r.dayLog[r.dayLog.length - 1];
    return lastDay?.stars?.concordium ?? 0;
  });

  // Extract the fastest direct monster Stars at day 150 per seed.
  const fastestDirectStarsAtEnd = results.map((r) => {
    const lastDay = r.dayLog[r.dayLog.length - 1];
    if (!lastDay?.stars) return 0;
    return Math.max(
      lastDay.stars.bracehart || 0,
      lastDay.stars.chronalyx || 0,
      lastDay.stars.couronnail || 0,
    );
  });

  const medianConcordium = medianOf(concordiumStarsAtEnd);
  const medianFastestDirect = medianOf(fastestDirectStarsAtEnd);

  // Concordium should show genuine progress (60-99) but stay below Mega.
  assert.ok(
    medianConcordium >= 60 && medianConcordium < 100,
    `Median Concordium Stars at day 150 = ${medianConcordium}, expected 60-99`,
  );

  // Concordium should lag behind the fastest direct monster.
  assert.ok(
    medianConcordium < medianFastestDirect,
    `Concordium (${medianConcordium}) should lag behind fastest direct (${medianFastestDirect})`,
  );
});

// ---------------------------------------------------------------------------
// 6. Support-only never reaches Mega — structural invariant
// ---------------------------------------------------------------------------

test('learner who always uses support never reaches Mega (structural)', () => {
  // With 0 independent corrects:
  //   firstIndependentWin = false (requires independence)
  //   repeatIndependentWin = false (requires independence)
  //   retainedAfterSecure = false (requires independentCorrects >= 2)
  //   variedPractice = true (template diversity, no independence requirement)
  //   secureConfidence = true (strength can reach 0.82 from supported corrects)
  //
  // Max weight without independent tiers = variedPractice + secureConfidence.
  // Max Stars: floor(100 * that sum) = 25, well below Mega (100).

  const weights = GRAMMAR_CONCEPT_STAR_WEIGHTS;
  const supportCeiling = (weights.variedPractice + weights.secureConfidence) * 100;
  const maxStarsWithoutIndependent = Math.floor(supportCeiling);
  assert.ok(
    maxStarsWithoutIndependent < 100,
    `Support-only max Stars = ${maxStarsWithoutIndependent}, which would reach Mega!`,
  );
  assert.equal(maxStarsWithoutIndependent, 25, 'Support-only ceiling is 25 Stars');
});

// ---------------------------------------------------------------------------
// 7. Determinism
// ---------------------------------------------------------------------------

test('simulation is deterministic: same seed + profile = same result', () => {
  const a = simulateStarCurveProfile('typical', { questionsPerDay: 10, seed: 42 });
  const b = simulateStarCurveProfile('typical', { questionsPerDay: 10, seed: 42 });
  assert.equal(a.daysToFirstDirectEgg, b.daysToFirstDirectEgg);
  assert.equal(a.daysToFirstHatch, b.daysToFirstHatch);
  assert.equal(a.daysToFirstDirectMega, b.daysToFirstDirectMega);
  assert.equal(a.daysToFirstConcordiumEgg, b.daysToFirstConcordiumEgg);
  assert.equal(a.daysToGrandConcordium, b.daysToGrandConcordium);
});

// ---------------------------------------------------------------------------
// 8. Progression monotonicity — Stars only increase over time
// ---------------------------------------------------------------------------

test('Stars are monotonically non-decreasing across simulation days', () => {
  const r = simulateStarCurveProfile('typical', { questionsPerDay: 10, seed: 42, maxDays: 60 });
  for (let i = 1; i < r.dayLog.length; i++) {
    const prev = r.dayLog[i - 1].stars;
    const curr = r.dayLog[i].stars;
    for (const mid of ['bracehart', 'chronalyx', 'couronnail', 'concordium']) {
      assert.ok(
        (curr[mid] || 0) >= (prev[mid] || 0),
        `Day ${r.dayLog[i].day}: ${mid} Stars decreased from ${prev[mid]} to ${curr[mid]}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 9. Aggregate summary — print results for the report
// ---------------------------------------------------------------------------

test('star-curve simulation aggregate summary', () => {
  const profiles = ['ideal', 'typical', 'struggling'];
  const roundSizes = [5, 10];
  const summary = [];

  for (const profile of profiles) {
    for (const qpd of roundSizes) {
      const { medians, results } = runProfile(profile, qpd);
      const unreachedMega = results.filter((r) => r.daysToFirstDirectMega === null).length;
      const unreachedGC = results.filter((r) => r.daysToGrandConcordium === null).length;
      summary.push({
        profile,
        questionsPerDay: qpd,
        medianEgg: medians.daysToFirstDirectEgg,
        medianHatch: medians.daysToFirstHatch,
        medianMega: medians.daysToFirstDirectMega,
        medianConcEgg: medians.daysToFirstConcordiumEgg,
        medianGrandConc: medians.daysToGrandConcordium,
        unreachedMega,
        unreachedGrandConc: unreachedGC,
      });
    }
  }

  // Print summary table for report generation.
  console.log('\n=== Star-Curve Simulation Summary ===');
  console.log('Profile          | Q/Day | Egg | Hatch | Mega  | C.Egg | Grand C. | Mega N/A | GC N/A');
  console.log('-----------------|-------|-----|-------|-------|-------|----------|----------|-------');
  for (const s of summary) {
    const row = [
      s.profile.padEnd(16),
      String(s.questionsPerDay).padStart(5),
      String(s.medianEgg ?? 'N/A').padStart(3),
      String(s.medianHatch ?? 'N/A').padStart(5),
      String(s.medianMega ?? 'N/A').padStart(5),
      String(s.medianConcEgg ?? 'N/A').padStart(5),
      String(s.medianGrandConc ?? 'N/A').padStart(8),
      String(s.unreachedMega).padStart(8),
      String(s.unreachedGrandConc).padStart(6),
    ].join(' | ');
    console.log(row);
  }
  console.log('');

  // Structural assertions on the aggregate.
  const idealAt10 = summary.find((s) => s.profile === 'ideal' && s.questionsPerDay === 10);
  assert.ok(idealAt10.medianEgg <= 7, `Ideal 10q Egg median ${idealAt10.medianEgg} > 7`);
  assert.ok(idealAt10.medianMega !== null, 'Ideal 10q should reach Mega');
  assert.ok(idealAt10.medianMega <= 35, `Ideal 10q Mega median ${idealAt10.medianMega} > 35`);

  const strugglingAt5 = summary.find((s) => s.profile === 'struggling' && s.questionsPerDay === 5);
  assert.ok(strugglingAt5.medianEgg <= 14, `Struggling 5q Egg median ${strugglingAt5.medianEgg} > 14`);
});
