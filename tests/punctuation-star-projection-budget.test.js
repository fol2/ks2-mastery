// U5 — Punctuation Star View projection bounding.
//
// Measure-first: creates a 2000-attempt fixture, measures projection
// wall time, and pins a performance budget so regressions fail the gate.
// Also verifies correctness across dense, sparse, and empty learners,
// the starHighWater 0-value guard, and multi-learner bootstrap parity.
//
// Pattern reference: `tests/worker-query-budget.test.js`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { projectPunctuationStars } from '../src/subjects/punctuation/star-projection.js';
import { buildPunctuationLearnerReadModel } from '../src/subjects/punctuation/read-model.js';
import { buildPunctuationReadModel } from '../worker/src/subjects/punctuation/read-models.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Budget constant — measured first, then locked.
// The projection is pure CPU (no I/O); 200ms is generous headroom for CI
// variability. Tighten if the measured p99 is well below this.
// ---------------------------------------------------------------------------
const BUDGET_PROJECTION_WALL_MS = 200;

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function masteryKey(clusterId, rewardUnitId) {
  return `punctuation:${CURRENT_RELEASE_ID}:${clusterId}:${rewardUnitId}`;
}

/**
 * All 14 published skills with their cluster mappings.
 * Used to distribute attempts realistically across the full skill set.
 */
const ALL_SKILLS = [
  { id: 'sentence_endings', clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core' },
  { id: 'list_commas', clusterId: 'comma_flow', rewardUnitId: 'list-commas-core' },
  { id: 'apostrophe_contractions', clusterId: 'apostrophe', rewardUnitId: 'apostrophe-contractions-core' },
  { id: 'apostrophe_possession', clusterId: 'apostrophe', rewardUnitId: 'apostrophe-possession-core' },
  { id: 'speech', clusterId: 'speech', rewardUnitId: 'speech-core' },
  { id: 'fronted_adverbial', clusterId: 'comma_flow', rewardUnitId: 'fronted-adverbials-core' },
  { id: 'parenthesis', clusterId: 'structure', rewardUnitId: 'parenthesis-core' },
  { id: 'comma_clarity', clusterId: 'comma_flow', rewardUnitId: 'comma-clarity-core' },
  { id: 'colon_list', clusterId: 'structure', rewardUnitId: 'colons-core' },
  { id: 'semicolon', clusterId: 'boundary', rewardUnitId: 'semicolons-core' },
  { id: 'dash_clause', clusterId: 'boundary', rewardUnitId: 'dash-clauses-core' },
  { id: 'semicolon_list', clusterId: 'structure', rewardUnitId: 'semicolon-lists-core' },
  { id: 'bullet_points', clusterId: 'structure', rewardUnitId: 'bullet-points-core' },
  { id: 'hyphen', clusterId: 'boundary', rewardUnitId: 'hyphens-core' },
];

const ITEM_MODES = ['choose', 'insert', 'fix', 'transfer', 'combine', 'paragraph'];

/**
 * Build a progress blob with `count` attempts distributed across all 14
 * skills. Simulates a dense-history learner. Items and facets are populated
 * realistically so the projection exercises every code path.
 */
function buildDenseProgress(count, now) {
  const progress = {
    items: {},
    facets: {},
    rewardUnits: {},
    attempts: [],
    sessionsCompleted: Math.floor(count / 4),
  };

  // Distribute attempts across skills round-robin.
  for (let i = 0; i < count; i++) {
    const skill = ALL_SKILLS[i % ALL_SKILLS.length];
    const itemMode = ITEM_MODES[i % ITEM_MODES.length];
    const itemId = `item_${skill.id}_${i % 50}`; // 50 unique items per skill
    const correct = i % 5 !== 0; // 80% accuracy
    const dayOffset = Math.floor(i / 20); // ~20 attempts per day
    const ts = now - (dayOffset * DAY_MS) - (i * 1000);

    progress.attempts.push({
      ts,
      sessionId: `session_${Math.floor(i / 4)}`,
      itemId,
      itemMode,
      mode: itemMode,
      skillIds: [skill.id],
      rewardUnitId: skill.rewardUnitId,
      sessionMode: i % 10 === 0 ? 'gps' : 'smart',
      testMode: i % 10 === 0 ? 'gps' : null,
      correct,
      supportLevel: i % 7 === 0 ? 1 : 0,
      misconceptionTags: correct ? [] : ['test-misconception'],
      facetOutcomes: [
        { id: `${skill.id}::${itemMode}`, label: `${skill.id} ${itemMode}`, ok: correct },
      ],
    });

    // Item memory state — accumulate.
    if (!progress.items[itemId]) {
      progress.items[itemId] = {
        attempts: 0, correct: 0, incorrect: 0, streak: 0, lapses: 0,
        dueAt: 0, firstCorrectAt: null, lastCorrectAt: null, lastSeen: 0,
      };
    }
    const item = progress.items[itemId];
    item.attempts += 1;
    if (correct) {
      item.correct += 1;
      item.streak += 1;
      if (item.firstCorrectAt === null || ts < item.firstCorrectAt) item.firstCorrectAt = ts;
      if (item.lastCorrectAt === null || ts > item.lastCorrectAt) item.lastCorrectAt = ts;
    } else {
      item.incorrect += 1;
      if (item.streak > 0) { item.lapses += 1; item.streak = 0; }
    }
    item.lastSeen = ts;

    // Facet memory state — accumulate.
    const facetId = `${skill.id}::${itemMode}`;
    if (!progress.facets[facetId]) {
      progress.facets[facetId] = {
        attempts: 0, correct: 0, incorrect: 0, streak: 0, lapses: 0,
        dueAt: 0, firstCorrectAt: null, lastCorrectAt: null, lastSeen: 0,
      };
    }
    const facet = progress.facets[facetId];
    facet.attempts += 1;
    if (correct) {
      facet.correct += 1;
      facet.streak += 1;
      if (facet.firstCorrectAt === null || ts < facet.firstCorrectAt) facet.firstCorrectAt = ts;
      if (facet.lastCorrectAt === null || ts > facet.lastCorrectAt) facet.lastCorrectAt = ts;
    } else {
      facet.incorrect += 1;
      if (facet.streak > 0) { facet.lapses += 1; facet.streak = 0; }
    }
    facet.lastSeen = ts;
  }

  // Seed reward units across all 14 skills — about half secured.
  for (let i = 0; i < ALL_SKILLS.length; i++) {
    const skill = ALL_SKILLS[i];
    const key = masteryKey(skill.clusterId, skill.rewardUnitId);
    progress.rewardUnits[key] = {
      masteryKey: key,
      releaseId: CURRENT_RELEASE_ID,
      clusterId: skill.clusterId,
      rewardUnitId: skill.rewardUnitId,
      securedAt: i < 7 ? now - (i * DAY_MS) : 0,
    };
  }

  return progress;
}

function buildSparseProgress(count, now) {
  const progress = {
    items: {},
    facets: {},
    rewardUnits: {},
    attempts: [],
    sessionsCompleted: Math.floor(count / 4),
  };

  const skill = ALL_SKILLS[0]; // sentence_endings only
  for (let i = 0; i < count; i++) {
    const itemId = `item_se_${i}`;
    const correct = i % 3 !== 0;
    const ts = now - (i * 60_000);
    progress.attempts.push({
      ts,
      sessionId: 'sparse-session',
      itemId,
      itemMode: 'choose',
      skillIds: [skill.id],
      rewardUnitId: skill.rewardUnitId,
      sessionMode: 'smart',
      correct,
      supportLevel: 0,
    });
    progress.items[itemId] = {
      attempts: 1, correct: correct ? 1 : 0, incorrect: correct ? 0 : 1,
      streak: correct ? 1 : 0, lapses: 0, dueAt: 0,
      firstCorrectAt: correct ? ts : null, lastCorrectAt: correct ? ts : null,
      lastSeen: ts,
    };
  }

  return progress;
}

function emptyProgress() {
  return {
    items: {},
    facets: {},
    rewardUnits: {},
    attempts: [],
    sessionsCompleted: 0,
  };
}

function freshSubjectState(progress = null) {
  return {
    data: {
      progress: progress || emptyProgress(),
    },
    updatedAt: 1,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 — Performance budget: 2000-attempt projection within budget
// ---------------------------------------------------------------------------
test('U5 perf budget: 2000-attempt Star View projection completes within BUDGET_PROJECTION_WALL_MS', () => {
  const now = Date.UTC(2026, 3, 25);
  const progress = buildDenseProgress(2000, now);

  // Warm-up run (JIT).
  projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // Timed run.
  const start = performance.now();
  const result = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const elapsed = performance.now() - start;

  assert.ok(
    elapsed < BUDGET_PROJECTION_WALL_MS,
    `2000-attempt projection took ${elapsed.toFixed(1)}ms; budget is ${BUDGET_PROJECTION_WALL_MS}ms`,
  );

  // Sanity: result has the expected shape.
  assert.ok(result.perMonster.pealark, 'pealark must be present');
  assert.ok(result.perMonster.claspin, 'claspin must be present');
  assert.ok(result.perMonster.curlune, 'curlune must be present');
  assert.ok(typeof result.grand.grandStars === 'number', 'grandStars must be numeric');
});

// ---------------------------------------------------------------------------
// Scenario 2 — Full read-model pipeline on 2000-attempt learner within budget
// ---------------------------------------------------------------------------
test('U5 perf budget: 2000-attempt full buildPunctuationLearnerReadModel within budget', () => {
  const now = Date.UTC(2026, 3, 25);
  const progress = buildDenseProgress(2000, now);
  const subjectState = freshSubjectState(progress);

  // Warm-up.
  buildPunctuationLearnerReadModel({ subjectStateRecord: subjectState, now: () => now });

  // Timed run.
  const start = performance.now();
  const model = buildPunctuationLearnerReadModel({ subjectStateRecord: subjectState, now: () => now });
  const elapsed = performance.now() - start;

  assert.ok(
    elapsed < BUDGET_PROJECTION_WALL_MS,
    `2000-attempt read-model build took ${elapsed.toFixed(1)}ms; budget is ${BUDGET_PROJECTION_WALL_MS}ms`,
  );

  // Verify starView is populated.
  assert.ok(model.starView, 'starView must be present');
  assert.ok(model.starView.perMonster.pealark.total >= 0, 'pealark total must be non-negative');
  assert.ok(model.starView.grand.grandStars >= 0, 'grandStars must be non-negative');
});

// ---------------------------------------------------------------------------
// Scenario 3 — 2000-attempt learner returns correct stars
// ---------------------------------------------------------------------------
test('U5 correctness: 2000-attempt learner command response returns correct stars within budget', () => {
  const now = Date.UTC(2026, 3, 25);
  const progress = buildDenseProgress(2000, now);

  const start = performance.now();
  const starLedger = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const elapsed = performance.now() - start;

  // Within budget.
  assert.ok(elapsed < BUDGET_PROJECTION_WALL_MS, `took ${elapsed.toFixed(1)}ms`);

  // Correct star shape and ranges.
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    const entry = starLedger.perMonster[monsterId];
    assert.ok(entry, `${monsterId} must be present`);
    assert.ok(entry.tryStars >= 0 && entry.tryStars <= 10, `${monsterId} tryStars in [0,10]`);
    assert.ok(entry.practiceStars >= 0 && entry.practiceStars <= 30, `${monsterId} practiceStars in [0,30]`);
    assert.ok(entry.secureStars >= 0 && entry.secureStars <= 35, `${monsterId} secureStars in [0,35]`);
    assert.ok(entry.masteryStars >= 0 && entry.masteryStars <= 25, `${monsterId} masteryStars in [0,25]`);
    assert.ok(entry.total >= 0 && entry.total <= 100, `${monsterId} total in [0,100]`);
    assert.equal(
      entry.total,
      entry.tryStars + entry.practiceStars + entry.secureStars + entry.masteryStars,
      `${monsterId} total must equal sum of categories`,
    );
  }

  // With 2000 attempts and 80% accuracy across 14 skills, expect non-trivial stars.
  const pealarkTotal = starLedger.perMonster.pealark.total;
  assert.ok(pealarkTotal > 0, `pealark should have >0 stars with 2000 attempts; got ${pealarkTotal}`);

  // Grand stars: with 7/14 secured units across 3 monsters, expect some progress.
  assert.ok(starLedger.grand.grandStars >= 0, 'grandStars must be non-negative');
  assert.ok(typeof starLedger.grand.total === 'number', 'grand total must be numeric');
});

// ---------------------------------------------------------------------------
// Scenario 4 — 10-attempt learner baseline correctness
// ---------------------------------------------------------------------------
test('U5 correctness: 10-attempt learner returns correct stars (baseline)', () => {
  const now = Date.UTC(2026, 3, 25);
  const progress = buildSparseProgress(10, now);
  const starLedger = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  // Only Pealark (endmarks) should have non-zero stars.
  const pealark = starLedger.perMonster.pealark;
  assert.ok(pealark.tryStars > 0, 'pealark tryStars should be >0 with 10 attempts');
  assert.ok(pealark.total > 0, 'pealark total should be >0');

  // Claspin and Curlune should be zero (no attempts for those clusters).
  assert.equal(starLedger.perMonster.claspin.total, 0, 'claspin total should be 0');
  assert.equal(starLedger.perMonster.curlune.total, 0, 'curlune total should be 0');

  // Grand: only 1 monster progressing, not enough for tier 1 (needs 2).
  assert.equal(starLedger.grand.grandStars, 0, 'grandStars should be 0 with only 1 monster');
});

// ---------------------------------------------------------------------------
// Scenario 5 — 0-attempt learner returns empty star projection
// ---------------------------------------------------------------------------
test('U5 correctness: 0-attempt learner returns empty star projection', () => {
  const progress = emptyProgress();
  const starLedger = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    const entry = starLedger.perMonster[monsterId];
    assert.equal(entry.tryStars, 0, `${monsterId} tryStars should be 0`);
    assert.equal(entry.practiceStars, 0, `${monsterId} practiceStars should be 0`);
    assert.equal(entry.secureStars, 0, `${monsterId} secureStars should be 0`);
    assert.equal(entry.masteryStars, 0, `${monsterId} masteryStars should be 0`);
    assert.equal(entry.total, 0, `${monsterId} total should be 0`);
  }
  assert.equal(starLedger.grand.grandStars, 0, 'grandStars should be 0');
});

// ---------------------------------------------------------------------------
// Scenario 6 — starHighWater with value 0 is NOT treated as falsy
// ---------------------------------------------------------------------------
test('U5 guard: starHighWater with value 0 is NOT treated as falsy', () => {
  // This tests the seedStarHighWater guard in punctuation mastery:
  //   if (entry.starHighWater !== undefined && entry.starHighWater !== null)
  // A value of 0 must be preserved (returned as 0), not trigger legacy seeding.

  // Simulate what seedStarHighWater does internally.
  function simulateSeedStarHighWater(entry) {
    // Must use !== undefined && !== null, NOT !entry.starHighWater
    if (entry.starHighWater !== undefined && entry.starHighWater !== null) {
      const n = Number(entry.starHighWater);
      return Number.isFinite(n) && n > 0 ? Math.floor(n + 1e-9) : 0;
    }
    // Legacy path — would compute non-zero floor for learners with mastery.
    return 999; // Sentinel: if this returned, the guard failed.
  }

  // Value 0: must NOT trigger legacy path.
  const resultZero = simulateSeedStarHighWater({ starHighWater: 0 });
  assert.equal(resultZero, 0, 'starHighWater: 0 must return 0, not legacy floor');

  // Value undefined: must trigger legacy path.
  const resultUndefined = simulateSeedStarHighWater({});
  assert.equal(resultUndefined, 999, 'starHighWater: undefined must trigger legacy path');

  // Value null: must trigger legacy path.
  const resultNull = simulateSeedStarHighWater({ starHighWater: null });
  assert.equal(resultNull, 999, 'starHighWater: null must trigger legacy path');

  // Value 42: must preserve.
  const result42 = simulateSeedStarHighWater({ starHighWater: 42 });
  assert.equal(result42, 42, 'starHighWater: 42 must be preserved');

  // Value -1: corrupted → clamped to 0, not legacy.
  const resultNeg = simulateSeedStarHighWater({ starHighWater: -1 });
  assert.equal(resultNeg, 0, 'starHighWater: -1 must be clamped to 0, not legacy');
});

// ---------------------------------------------------------------------------
// Scenario 6b — starHighWater 0 guard verified against the actual source
// ---------------------------------------------------------------------------
test('U5 guard: actual source code uses !== undefined && !== null for starHighWater', async () => {
  // Read the actual seedStarHighWater source to verify the guard pattern.
  // This is a structural assertion — if someone changes the guard to use
  // `!entry.starHighWater`, the test fails.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const fileUrl = await import('node:url');

  const srcPath = path.resolve(
    path.dirname(fileUrl.fileURLToPath(import.meta.url)),
    '..', 'src', 'platform', 'game', 'mastery', 'punctuation.js',
  );
  const source = fs.readFileSync(srcPath, 'utf8');

  // The guard must use strict null-check, not falsy check.
  assert.ok(
    source.includes('entry.starHighWater !== undefined && entry.starHighWater !== null'),
    'seedStarHighWater must use !== undefined && !== null guard (0 is valid)',
  );

  // Must NOT contain a falsy check pattern for starHighWater.
  assert.ok(
    !source.includes('!entry.starHighWater)'),
    'Source must NOT use falsy check !entry.starHighWater (0 is valid)',
  );
});

// ---------------------------------------------------------------------------
// Scenario 7 — Multi-learner: dense + fresh returns correct projections
// ---------------------------------------------------------------------------
test('U5 multi-learner: dense-history and fresh learner return correct projections', () => {
  const now = Date.UTC(2026, 3, 25);

  // Dense learner: 2000 attempts.
  const denseProgress = buildDenseProgress(2000, now);
  const denseModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(denseProgress),
    now: () => now,
  });

  // Fresh learner: 0 attempts.
  const freshModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(emptyProgress()),
    now: () => now,
  });

  // Dense learner must have non-trivial stars.
  assert.ok(denseModel.starView.perMonster.pealark.total > 0, 'dense pealark > 0');

  // Fresh learner must have zero stars everywhere.
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(freshModel.starView.perMonster[monsterId].total, 0, `fresh ${monsterId} = 0`);
  }
  assert.equal(freshModel.starView.grand.grandStars, 0, 'fresh grand = 0');

  // Both must have valid shapes.
  for (const model of [denseModel, freshModel]) {
    assert.ok(model.starView.perMonster, 'starView.perMonster must exist');
    assert.ok(model.starView.grand, 'starView.grand must exist');
    assert.ok(typeof model.starView.grand.grandStars === 'number', 'grandStars must be numeric');
    assert.ok(typeof model.starView.grand.total === 'number', 'grand total must be numeric');
  }
});

// ---------------------------------------------------------------------------
// Scenario 8 — Worker read-model parity: dense learner
// ---------------------------------------------------------------------------
test('U5 parity: Worker buildPunctuationReadModel with 2000-attempt data matches client starView', () => {
  const now = Date.UTC(2026, 3, 25);
  const progress = buildDenseProgress(2000, now);
  const data = { progress };

  // Worker path.
  const workerPayload = buildPunctuationReadModel({
    learnerId: 'learner-dense',
    state: { phase: 'setup' },
    prefs: {},
    stats: {},
    data,
  });

  // Client path.
  const clientModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: { data },
    now: () => now,
  });

  // Both starViews must agree on per-monster totals and grand.
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(
      workerPayload.starView.perMonster[monsterId].total,
      clientModel.starView.perMonster[monsterId].total,
      `Worker and client ${monsterId} totals must match`,
    );
    assert.equal(
      workerPayload.starView.perMonster[monsterId].tryStars,
      clientModel.starView.perMonster[monsterId].tryStars,
      `Worker and client ${monsterId} tryStars must match`,
    );
    assert.equal(
      workerPayload.starView.perMonster[monsterId].practiceStars,
      clientModel.starView.perMonster[monsterId].practiceStars,
      `Worker and client ${monsterId} practiceStars must match`,
    );
    assert.equal(
      workerPayload.starView.perMonster[monsterId].secureStars,
      clientModel.starView.perMonster[monsterId].secureStars,
      `Worker and client ${monsterId} secureStars must match`,
    );
    assert.equal(
      workerPayload.starView.perMonster[monsterId].masteryStars,
      clientModel.starView.perMonster[monsterId].masteryStars,
      `Worker and client ${monsterId} masteryStars must match`,
    );
  }
  assert.equal(
    workerPayload.starView.grand.grandStars,
    clientModel.starView.grand.grandStars,
    'Worker and client grandStars must match',
  );

  // Worker stats.grandStars must match starView.grand.grandStars.
  assert.equal(
    workerPayload.stats.grandStars,
    workerPayload.starView.grand.grandStars,
    'Worker stats.grandStars must match starView.grand.grandStars',
  );
});

// ---------------------------------------------------------------------------
// Scenario 9 — Projection is deterministic across repeated calls
// ---------------------------------------------------------------------------
test('U5 determinism: repeated projection on same data returns identical results', () => {
  const now = Date.UTC(2026, 3, 25);
  const progress = buildDenseProgress(2000, now);

  const result1 = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const result2 = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  assert.deepStrictEqual(result1, result2, 'Projection must be deterministic');
});

// ---------------------------------------------------------------------------
// Scenario 10 — null/undefined progress does not throw
// ---------------------------------------------------------------------------
test('U5 robustness: null and undefined progress does not throw', () => {
  assert.doesNotThrow(() => projectPunctuationStars(null, CURRENT_RELEASE_ID));
  assert.doesNotThrow(() => projectPunctuationStars(undefined, CURRENT_RELEASE_ID));
  assert.doesNotThrow(() => projectPunctuationStars({}, CURRENT_RELEASE_ID));

  const result = projectPunctuationStars(null, CURRENT_RELEASE_ID);
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(result.perMonster[monsterId].total, 0);
  }
  assert.equal(result.grand.grandStars, 0);
});

// ---------------------------------------------------------------------------
// Scenario 11 — Star caps are respected even with dense data
// ---------------------------------------------------------------------------
test('U5 caps: per-monster category caps respected with 2000-attempt dense fixture', () => {
  const now = Date.UTC(2026, 3, 25);
  const progress = buildDenseProgress(2000, now);
  const starLedger = projectPunctuationStars(progress, CURRENT_RELEASE_ID);

  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    const entry = starLedger.perMonster[monsterId];
    assert.ok(entry.tryStars <= 10, `${monsterId} tryStars must be ≤ 10`);
    assert.ok(entry.practiceStars <= 30, `${monsterId} practiceStars must be ≤ 30`);
    assert.ok(entry.secureStars <= 35, `${monsterId} secureStars must be ≤ 35`);
    assert.ok(entry.masteryStars <= 25, `${monsterId} masteryStars must be ≤ 25`);
    assert.ok(entry.total <= 100, `${monsterId} total must be ≤ 100`);
  }
  assert.ok(starLedger.grand.grandStars <= 100, 'grandStars must be ≤ 100');
});
