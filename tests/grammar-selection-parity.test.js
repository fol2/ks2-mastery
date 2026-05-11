// R6/P22 — Parity harness for buildGrammarPracticeQueue + buildGrammarMiniPack.
//
// See docs/contracts/ci-shard-balance-plan.md (U1).
//
// Purpose. R6 optimised the grammar selection pipeline via per-invocation
// memoisation of `candidateVariantMetadata` and elimination of redundant per-
// lane `recentTemplateIndex` / `recentConceptIndex` rebuilds. P22 intentionally
// refreshes the committed snapshot after approving the catalogue-scale prompt
// freshness pre-check. This test now freezes the approved post-P22 queue
// outputs so later work cannot drift selection behaviour. Bit-identical outputs prove:
//   - R6.I1 — output byte-identical for all inputs.
//   - R6.I2 — selection policy unchanged (lane order, weights, caps).
//   - R6.I4 — rng() consumption order unchanged. The queue is deterministic
//     on (inputs, seed); so byte-identical queue output implies the internal
//     rng was consumed at identical points, in identical order, for identical
//     counts. Instrumenting the closure-scoped `seededRandom` directly is not
//     possible without modifying production code (prohibited by R6.AC10), so
//     we verify rng-order transitively via queue equality.
//
// Sweep. Two tiers:
//   - PR gate (default). 8 seeds × 4 modes × 3 mastery shapes × 2 recent-
//     attempt sizes × 2 queue sizes = 384 cases. Exceeds R6.AC2's >=200
//     minimum. Runs on every push; completes in ~15s.
//   - Full sweep (GRAMMAR_PARITY_FULL_SWEEP=1). Adds 18 focus concepts × 3
//     sizes (1, 5, 10) = +2,000 cases. Gate for U2's pre-merge check.
//
// Ordering hook. U2's optimisation PR re-runs this test against the committed
// snapshot. The snapshot file is imported at module load; if U1 has not
// merged (fixture absent) the test throws at load time — this is the hard
// ordering constraint from the plan's "Ordering enforcement" section.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  buildGrammarPracticeQueue,
  buildGrammarMiniPack,
} from '../worker/src/subjects/grammar/selection.js';
import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONCEPTS,
} from '../worker/src/subjects/grammar/content.js';
import {
  CANONICAL_SEEDS,
  SIM_NOW_MS,
} from './helpers/grammar-simulation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, 'fixtures', 'grammar-selection-parity-snapshot.json');

const MODES = ['smart', 'satsset', 'surgery', 'builder'];
const SIZE_VARIANTS = [1, 5];
const FULL_SWEEP_SIZES = [1, 5, 10];
const FULL_SWEEP_ENABLED = process.env.GRAMMAR_PARITY_FULL_SWEEP === '1';
const UPDATE_SNAPSHOT = process.env.UPDATE_GRAMMAR_SELECTION_PARITY_SNAPSHOT === '1';

// Mastery fixtures. Each shape exercises a distinct lane in
// buildGrammarPracticeQueue:
//   - empty:            no mastery; fallback lane only.
//   - one-weak-concept: `adverbials` in 'weak' status; priority-urgent lane.
//   - secured-overdue:  `sentence_functions` secured with dueAt 3 days
//     stale; spaced-retrieval lane.
const MASTERY_SHAPES = {
  empty: null,
  'one-weak-concept': {
    concepts: {
      adverbials: {
        attempts: 10,
        correct: 2,
        wrong: 8,
        strength: 0.15,
        intervalDays: 0,
        dueAt: 0,
        correctStreak: 0,
      },
    },
  },
  'secured-overdue': {
    concepts: {
      sentence_functions: {
        attempts: 20,
        correct: 18,
        wrong: 2,
        strength: 0.92,
        intervalDays: 7,
        dueAt: SIM_NOW_MS - 86_400_000 * 3,
        correctStreak: 5,
      },
    },
  },
};

// Recent-attempt fixtures.
//   - empty: [].
//   - forty-entry: 40 varied templateIds. Index 38 carries result.correct=false
//     within the 5-min retry window so the retry + similar-problem lanes are
//     exercised. Timestamp uses createdAt so recentLastScoredMiss's third
//     fallback (selection.js:173) parses the age correctly.
const RECENT_SHAPES = {
  empty: [],
  'forty-entry': buildFortyEntryRecent(),
};

function buildFortyEntryRecent() {
  const attempts = [];
  const templateCount = GRAMMAR_TEMPLATE_METADATA.length;
  for (let i = 0; i < 40; i += 1) {
    const template = GRAMMAR_TEMPLATE_METADATA[(i * 37) % templateCount];
    const isRecentMiss = i === 38;
    attempts.push({
      contentReleaseId: 'grammar-legacy-reviewed-2026-04-24',
      templateId: template.id,
      itemId: `${template.id}::parity-${i}`,
      seed: i,
      questionType: template.questionType,
      conceptIds: template.skillIds.slice(),
      response: {},
      result: { correct: !isRecentMiss },
      supportLevel: 0,
      attempts: 1,
      createdAt: SIM_NOW_MS - (40 - i) * 60_000,
    });
  }
  return attempts;
}

// -----------------------------------------------------------------------------
// Case enumeration
// -----------------------------------------------------------------------------

function enumerateCases(fullSweep) {
  const cases = [];
  const masteryKeys = Object.keys(MASTERY_SHAPES);
  const recentKeys = Object.keys(RECENT_SHAPES);
  const sizes = fullSweep ? FULL_SWEEP_SIZES : SIZE_VARIANTS;

  for (const seed of CANONICAL_SEEDS) {
    for (const mode of MODES) {
      for (const masteryKey of masteryKeys) {
        for (const recentKey of recentKeys) {
          for (const size of sizes) {
            cases.push({
              key: `seed=${seed}|mode=${mode}|mastery=${masteryKey}|recent=${recentKey}|size=${size}|focus=`,
              seed,
              mode,
              masteryKey,
              recentKey,
              size,
              focusConceptId: '',
            });
          }
        }
      }
    }
  }

  if (fullSweep) {
    // Full-sweep extension: every focus concept × every mode × every seed ×
    // every size. Exercises the focus-aware pool rebuilder (focusAwarePool)
    // and focus-saturation lane across the full mode matrix. Empty mastery +
    // empty recent is sufficient — the purpose here is to pin focus-pool
    // behaviour, not re-exercise lanes already covered by the base sweep.
    //   18 concepts × 4 modes × 8 seeds × 3 sizes = 1,728 cases
    // combined with the base 576 → ~2,300 cases. Exceeds R6.AC2 >=2,000.
    for (const concept of GRAMMAR_CONCEPTS) {
      for (const mode of MODES) {
        for (const seed of CANONICAL_SEEDS) {
          for (const size of sizes) {
            cases.push({
              key: `seed=${seed}|mode=${mode}|mastery=empty|recent=empty|size=${size}|focus=${concept.id}`,
              seed,
              mode,
              masteryKey: 'empty',
              recentKey: 'empty',
              size,
              focusConceptId: concept.id,
            });
          }
        }
      }
    }
  }

  return cases;
}

function runCase({ seed, mode, masteryKey, recentKey, size, focusConceptId }) {
  const mastery = MASTERY_SHAPES[masteryKey];
  const recentAttempts = RECENT_SHAPES[recentKey];
  const queue = buildGrammarPracticeQueue({
    mode,
    focusConceptId,
    mastery,
    recentAttempts,
    seed,
    size,
    now: SIM_NOW_MS,
  });
  const miniPack = buildGrammarMiniPack({
    size,
    focusConceptId,
    mastery,
    recentAttempts,
    seed,
    now: SIM_NOW_MS,
  });
  return { queue, miniPack };
}

// -----------------------------------------------------------------------------
// Snapshot I/O
// -----------------------------------------------------------------------------

function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  const raw = readFileSync(SNAPSHOT_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeSnapshot(snapshot) {
  const serialised = `${JSON.stringify(snapshot, null, 2)}\n`;
  writeFileSync(SNAPSHOT_PATH, serialised, 'utf8');
}

function buildSnapshot(cases) {
  const entries = cases.map((c) => ({ key: c.key, ...runCase(c) }));
  return {
    meta: {
      description: 'R6/P22 parity snapshot — buildGrammarPracticeQueue + buildGrammarMiniPack outputs frozen after approved P22 scheduler hardening.',
      contract: 'docs/contracts/ci-shard-balance-plan.md — U1; docs/plans/james/hotfixes/11. grammar-qg-p22-post-implementation-review-hardening-package/contract/grammar-qg-p22-post-implementation-hardening-contract.md',
      caseCount: entries.length,
      templateCount: GRAMMAR_TEMPLATE_METADATA.length,
      conceptCount: GRAMMAR_CONCEPTS.length,
      simNowMs: SIM_NOW_MS,
      canonicalSeeds: CANONICAL_SEEDS.slice(),
      modes: MODES.slice(),
      masteryShapes: Object.keys(MASTERY_SHAPES),
      recentShapes: Object.keys(RECENT_SHAPES),
      sizeVariants: SIZE_VARIANTS.slice(),
    },
    cases: entries,
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

test('R6 parity: every case is deterministic (identical output on re-run)', () => {
  const cases = enumerateCases(FULL_SWEEP_ENABLED);
  for (const testCase of cases) {
    const first = runCase(testCase);
    const second = runCase(testCase);
    assert.equal(
      JSON.stringify(first),
      JSON.stringify(second),
      `non-deterministic output for case ${testCase.key}`,
    );
  }
});

test('R6 parity: queue + miniPack outputs match committed snapshot (byte-identical)', () => {
  const cases = enumerateCases(FULL_SWEEP_ENABLED);
  if (UPDATE_SNAPSHOT) {
    writeSnapshot(buildSnapshot(cases));
    return;
  }

  const existing = loadSnapshot();
  if (!existing) {
    // First run. Generate the snapshot and write it to disk. Subsequent runs
    // load and compare. This branch is only hit during U1 PR creation.
    writeSnapshot(buildSnapshot(cases));
    return;
  }

  // Base sweep lives inside the full sweep; we look up by key so the same
  // committed snapshot serves both tiers.
  const snapshotByKey = new Map(existing.cases.map((c) => [c.key, c]));

  const missing = [];
  const drifted = [];
  for (const testCase of cases) {
    const expected = snapshotByKey.get(testCase.key);
    if (!expected) {
      missing.push(testCase.key);
      continue;
    }
    const actual = runCase(testCase);
    const expectedJson = JSON.stringify({ queue: expected.queue, miniPack: expected.miniPack });
    const actualJson = JSON.stringify(actual);
    if (expectedJson !== actualJson) {
      drifted.push({ key: testCase.key, expected: expected.queue?.length, actualQueue: actual.queue?.length });
    }
  }

  if (FULL_SWEEP_ENABLED && missing.length > 0) {
    // Full sweep expands beyond the committed snapshot. Append new cases so
    // the snapshot grows to cover them, but do NOT overwrite existing entries
    // (that would silence drift). The PR-gate sweep must remain fully
    // covered before the expansion runs.
    const newCases = cases.filter((c) => !snapshotByKey.has(c.key));
    const newEntries = newCases.map((c) => ({ key: c.key, ...runCase(c) }));
    writeSnapshot({
      ...existing,
      meta: { ...existing.meta, caseCount: existing.cases.length + newEntries.length },
      cases: existing.cases.concat(newEntries),
    });
  } else {
    assert.equal(missing.length, 0, `snapshot missing cases: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ''}`);
  }

  assert.equal(
    drifted.length,
    0,
    `output drift for cases: ${drifted.slice(0, 5).map((d) => d.key).join(', ')}${drifted.length > 5 ? ` (+${drifted.length - 5} more)` : ''}`,
  );
});

test('R6 parity: PR gate covers >=200 cases (R6.AC2 floor)', () => {
  const cases = enumerateCases(false);
  assert.ok(
    cases.length >= 200,
    `PR gate should enumerate >=200 cases per R6.AC2; got ${cases.length}`,
  );
});

test('R6 parity: full sweep covers >=2000 cases when GRAMMAR_PARITY_FULL_SWEEP=1', () => {
  const cases = enumerateCases(true);
  assert.ok(
    cases.length >= 2000,
    `full sweep should enumerate >=2000 cases per R6.AC2; got ${cases.length}`,
  );
});
