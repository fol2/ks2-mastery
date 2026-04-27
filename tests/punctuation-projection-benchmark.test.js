// Projection performance benchmark — P7 U5
//
// Baseline measurements (Node 22/25, Windows 11, median of 10 runs):
//   500  attempts → ~2ms    (bound: 5ms)
//   1500 attempts → ~2.5ms  (bound: 8ms)
//   3000 attempts → ~4.5ms  (bound: 15ms)
//   5000 attempts → ~8.5ms  (bound: 25ms)
//
// Conclusion: projection is comfortably sub-10ms for realistic long-history
// learners (3000 attempts). Caching is NOT required at this time.
// The contract (R3, R13) requires "measured and bounded", not "cached".

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { projectPunctuationStars } from '../src/subjects/punctuation/star-projection.js';
import {
  PUNCTUATION_CLIENT_SKILLS,
  PUNCTUATION_CLIENT_REWARD_UNITS,
} from '../src/subjects/punctuation/punctuation-manifest.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const DAY_MS = 24 * 60 * 60 * 1000;
const ITEM_MODES = ['choose', 'insert', 'fix', 'transfer', 'combine', 'paragraph'];

// ---------------------------------------------------------------------------
// Progress data generators
// ---------------------------------------------------------------------------

/**
 * Generate realistic progress data for a learner with `attemptCount` attempts
 * spread across all 14 skills with varied evidence depth.
 *
 * The distribution is intentionally non-uniform: some skills get many more
 * attempts than others, mimicking real learner behaviour where children
 * practise some topics heavily and barely touch others.
 */
function generateRealisticProgress(attemptCount) {
  const skills = PUNCTUATION_CLIENT_SKILLS;
  const rewardUnits = PUNCTUATION_CLIENT_REWARD_UNITS;

  // Skewed distribution: first 5 skills get ~60% of attempts, rest share ~40%.
  const weights = skills.map((_, i) => (i < 5 ? 3 : 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const progress = {
    items: {},
    facets: {},
    rewardUnits: {},
    attempts: [],
  };

  // Distribute attempts across skills using the weighted distribution.
  const skillAttemptCounts = skills.map((_, i) =>
    Math.round((weights[i] / totalWeight) * attemptCount),
  );

  const now = Date.UTC(2026, 3, 25, 12, 0, 0);
  let globalItemIndex = 0;

  for (let si = 0; si < skills.length; si++) {
    const skill = skills[si];
    const count = skillAttemptCounts[si];
    if (count === 0) continue;

    // Find the matching reward unit.
    const ru = rewardUnits.find((r) => r.clusterId === skill.clusterId) || rewardUnits[0];

    // Spread attempts across ~count/3 distinct items (some items repeated).
    const distinctItems = Math.max(3, Math.ceil(count / 3));

    for (let a = 0; a < count; a++) {
      const itemIndex = a % distinctItems;
      const itemId = `bench_${skill.id}_item_${itemIndex}`;
      const dayOffset = Math.floor(a / 10); // ~10 attempts per day
      const mode = ITEM_MODES[a % ITEM_MODES.length];
      const correct = a % 5 !== 0; // 80% correct rate

      progress.attempts.push({
        ts: now - (dayOffset * DAY_MS) + (a * 1000),
        itemId,
        skillIds: [skill.id],
        rewardUnitId: ru.rewardUnitId,
        correct,
        supportLevel: a % 7 === 0 ? 1 : 0, // ~14% supported
        supportKind: a % 7 === 0 ? 'guided' : null,
        itemMode: mode,
        sessionMode: 'smart',
        testMode: null,
      });

      // Populate item memory state for a fraction of items.
      if (itemIndex < distinctItems / 2 && !progress.items[itemId]) {
        const spread = Math.min(dayOffset, 14);
        progress.items[itemId] = {
          attempts: Math.min(10, count),
          correct: Math.min(8, count),
          streak: Math.min(4, a),
          lapses: a % 20 === 0 ? 1 : 0,
          firstCorrectAt: now - (spread * DAY_MS),
          lastCorrectAt: now - (Math.floor(a / 20) * DAY_MS),
          lastSeen: now,
        };
      }

      globalItemIndex++;
    }

    // Add facets for varied evidence depth.
    const facetModes = count > 20 ? ['choose', 'insert'] : ['choose'];
    for (const mode of facetModes) {
      const daySpread = Math.min(Math.floor(count / 5), 14);
      progress.facets[`${skill.id}::${mode}`] = {
        attempts: Math.min(count, 20),
        correct: Math.min(Math.floor(count * 0.8), 16),
        streak: count > 15 ? 4 : Math.min(count, 2),
        lapses: si % 5 === 0 ? 1 : 0,
        firstCorrectAt: now - (daySpread * DAY_MS),
        lastCorrectAt: now,
        lastSeen: now,
      };
    }

    // Secure some reward units (roughly proportional to attempt volume).
    if (count > 15) {
      const key = `punctuation:${CURRENT_RELEASE_ID}:${ru.clusterId}:${ru.rewardUnitId}`;
      progress.rewardUnits[key] = {
        masteryKey: key,
        releaseId: CURRENT_RELEASE_ID,
        clusterId: ru.clusterId,
        rewardUnitId: ru.rewardUnitId,
        securedAt: now - (7 * DAY_MS),
      };
    }
  }

  return progress;
}

/**
 * Run `projectPunctuationStars` N times on the given progress data
 * and return the median wall-clock time in milliseconds.
 */
function measureMedianMs(progress, runs = 10) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    projectPunctuationStars(progress, CURRENT_RELEASE_ID);
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

// ---------------------------------------------------------------------------
// Benchmark tests
// ---------------------------------------------------------------------------

test('benchmark: 500 attempts — projection completes under 5ms (median of 10 runs)', () => {
  const progress = generateRealisticProgress(500);
  assert.equal(progress.attempts.length > 400, true,
    `Expected ~500 attempts, got ${progress.attempts.length}`);

  // Warm up JIT.
  projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  const medianMs = measureMedianMs(progress, 10);
  assert.ok(medianMs < 5,
    `500-attempt projection median ${medianMs.toFixed(2)}ms exceeds 5ms bound`);
});

test('benchmark: 1500 attempts — projection completes under 8ms (median of 10 runs)', () => {
  const progress = generateRealisticProgress(1500);
  assert.equal(progress.attempts.length > 1200, true,
    `Expected ~1500 attempts, got ${progress.attempts.length}`);

  // Warm up JIT.
  projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  const medianMs = measureMedianMs(progress, 10);
  assert.ok(medianMs < 8,
    `1500-attempt projection median ${medianMs.toFixed(2)}ms exceeds 8ms bound`);
});

test('benchmark: 3000 attempts — projection completes under 15ms (median of 10 runs)', () => {
  const progress = generateRealisticProgress(3000);
  assert.equal(progress.attempts.length > 2400, true,
    `Expected ~3000 attempts, got ${progress.attempts.length}`);

  // Warm up JIT.
  projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  const medianMs = measureMedianMs(progress, 10);
  assert.ok(medianMs < 15,
    `3000-attempt projection median ${medianMs.toFixed(2)}ms exceeds 15ms bound`);
});

test('benchmark: 5000 attempts — projection completes under 25ms (median of 10 runs)', () => {
  const progress = generateRealisticProgress(5000);
  assert.equal(progress.attempts.length > 4000, true,
    `Expected ~5000 attempts, got ${progress.attempts.length}`);

  // Warm up JIT.
  projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  const medianMs = measureMedianMs(progress, 10);
  assert.ok(medianMs < 25,
    `5000-attempt projection median ${medianMs.toFixed(2)}ms exceeds 25ms bound`);
});

// ---------------------------------------------------------------------------
// Correctness guard: benchmark data produces valid starView
// ---------------------------------------------------------------------------

test('benchmark data produces valid starView with perMonster and grand fields', () => {
  const progress = generateRealisticProgress(3000);
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // Structure checks.
  assert.ok(result.perMonster, 'perMonster must exist');
  assert.ok(result.grand, 'grand must exist');

  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    const m = result.perMonster[monsterId];
    assert.ok(m, `perMonster.${monsterId} must exist`);
    assert.ok(m.tryStars >= 0 && m.tryStars <= 10, `${monsterId} tryStars in range`);
    assert.ok(m.practiceStars >= 0 && m.practiceStars <= 30, `${monsterId} practiceStars in range`);
    assert.ok(m.secureStars >= 0 && m.secureStars <= 35, `${monsterId} secureStars in range`);
    assert.ok(m.masteryStars >= 0 && m.masteryStars <= 25, `${monsterId} masteryStars in range`);
    assert.ok(m.total >= 0 && m.total <= 100, `${monsterId} total in range`);
  }

  assert.ok(result.grand.grandStars >= 0, 'grandStars >= 0');
  assert.ok(result.grand.grandStars <= 100, 'grandStars <= 100');
  assert.equal(result.grand.total, 100, 'grand total cap');

  // With 3000 attempts across 14 skills, at least one monster should have
  // non-zero stars.
  const anyStars = ['pealark', 'claspin', 'curlune'].some(
    (id) => result.perMonster[id].total > 0,
  );
  assert.ok(anyStars, 'At least one monster should have non-zero stars with 3000 attempts');
});

// ---------------------------------------------------------------------------
// Debug source flag
// ---------------------------------------------------------------------------

test('debug option: _debugMeta.source is "fresh" when debug flag is passed', () => {
  const progress = generateRealisticProgress(100);
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID, { debug: true });

  assert.ok(result._debugMeta, '_debugMeta must be present when debug: true');
  assert.equal(result._debugMeta.source, 'fresh',
    '_debugMeta.source must be "fresh" for uncached projection');
});

test('debug option: _debugMeta absent when debug flag is not passed', () => {
  const progress = generateRealisticProgress(100);
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.equal(result._debugMeta, undefined,
    '_debugMeta must not be present without debug flag');
});

test('debug option: _debugMeta absent when debug flag is explicitly false', () => {
  const progress = generateRealisticProgress(100);
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID, { debug: false });

  assert.equal(result._debugMeta, undefined,
    '_debugMeta must not be present when debug: false');
});

test('debug option: projection output is identical with and without debug flag', () => {
  const progress = generateRealisticProgress(500);
  const withDebug = projectPunctuationStars(progress, CURRENT_RELEASE_ID, { debug: true });
  const without = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // Compare the functional output (perMonster + grand), ignoring _debugMeta.
  assert.deepStrictEqual(withDebug.perMonster, without.perMonster,
    'perMonster must be identical with and without debug flag');
  assert.deepStrictEqual(withDebug.grand, without.grand,
    'grand must be identical with and without debug flag');
});
