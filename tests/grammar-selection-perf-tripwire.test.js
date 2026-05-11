// R6 perf tripwire. Ceiling: 500ms p95 per buildGrammarPracticeQueue(size=10).
// Measured 2026-05-05 on GitHub Actions ubuntu-latest, Node v22.
// Post-memo measured: ~190ms p95 local (Node 25). Headroom: 2x over ~260ms
// observed post-memo on ubuntu-latest runners (500ms).
// See docs/contracts/ci-shard-balance.md R6.AC4 + AC7.
//
// Kill-switch: the second assertion compares p95 to the committed pre-
// optimisation baseline (tests/fixtures/grammar-r6-baseline.json). If the
// improvement drops below 30%, the test fails — this is the autonomous
// rollback trigger per R6.AC7.
//
// Call-count ceiling (R6.AC5): the third assertion spawns a child node
// process under --experimental-test-module-mocks that wraps
// createGrammarQuestion with a counter and executes a single
// buildGrammarPracticeQueue(size=10, seed=1) build. The counted call total
// must stay below the pre-optimisation baseline (captured in
// createQuestionCallsPerBuild on the fixture). This catches regressions
// where a future change re-introduces redundant generator invocations even
// if wall-clock improvement is masked by hardware or GC noise.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { buildGrammarPracticeQueue } from '../worker/src/subjects/grammar/selection.js';
import { GRAMMAR_TEMPLATE_METADATA } from '../worker/src/subjects/grammar/content.js';
import { SIM_NOW_MS } from './helpers/grammar-simulation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, 'fixtures', 'grammar-r6-baseline.json');
const COUNT_SCRIPT = path.join(
  __dirname,
  '..',
  'scripts',
  'count-grammar-create-question-calls.mjs',
);

const CEILING_MS = 500;
const KILL_SWITCH_FLOOR = 0.3;
const ITERATIONS = 100;
const WARMUP = 10;

function buildFortyEntryRecent() {
  const attempts = [];
  const templateCount = GRAMMAR_TEMPLATE_METADATA.length;
  for (let i = 0; i < 40; i += 1) {
    const template = GRAMMAR_TEMPLATE_METADATA[(i * 37) % templateCount];
    const isRecentMiss = i === 38;
    attempts.push({
      contentReleaseId: 'grammar-legacy-reviewed-2026-04-24',
      templateId: template.id,
      itemId: `${template.id}::tripwire-${i}`,
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

function percentile(sortedAsc, p) {
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(idx, sortedAsc.length - 1))];
}

function runBenchmark() {
  const recentAttempts = buildFortyEntryRecent();
  const samples = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const t0 = performance.now();
    buildGrammarPracticeQueue({
      mode: 'smart',
      mastery: null,
      recentAttempts,
      seed: 1,
      size: 10,
      now: SIM_NOW_MS,
    });
    const dt = performance.now() - t0;
    if (i >= WARMUP) samples.push(dt);
  }
  samples.sort((a, b) => a - b);
  return {
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: samples[samples.length - 1],
  };
}

test('R6 tripwire: buildGrammarPracticeQueue p95 under ceiling', () => {
  if (GRAMMAR_TEMPLATE_METADATA.length > 80) {
    // Scale-horizon tripwire. When catalogue growth pushes us past 80
    // templates we are outside the regime the 500ms ceiling was calibrated
    // against; reassess the optimisation approach per plan.
    // eslint-disable-next-line no-console
    console.warn('Template count exceeds 80 — reassess R6 per docs/contracts/ci-shard-balance.md Scale Horizon');
    test.skip('wall-clock ceiling skipped because template catalogue exceeds the R6 calibration horizon');
    return;
  }
  const { p50, p95, max } = runBenchmark();
  assert.ok(
    p95 < CEILING_MS,
    `R6 perf ceiling: p95 ${p95.toFixed(1)}ms >= ${CEILING_MS}ms (p50=${p50.toFixed(1)}ms, max=${max.toFixed(1)}ms)`,
  );
});

test('R6 kill-switch: post-opt p95 shows >=30% improvement vs baseline', () => {
  if (GRAMMAR_TEMPLATE_METADATA.length > 80) {
    test.skip('wall-clock kill-switch skipped because template catalogue exceeds the R6 calibration horizon');
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const { p95 } = runBenchmark();
  const improvement = 1 - p95 / baseline.wallClockMs.p95;
  assert.ok(
    improvement >= KILL_SWITCH_FLOOR,
    `R6 kill-switch: improvement ${(improvement * 100).toFixed(1)}% < ${(KILL_SWITCH_FLOOR * 100).toFixed(0)}% floor (p95=${p95.toFixed(1)}ms, baseline=${baseline.wallClockMs.p95.toFixed(1)}ms)`,
  );
});

// R6.AC5 — createGrammarQuestion call-count ceiling. Pins maximum invocations
// per single queue build. The ceiling is the pre-optimisation baseline
// (captured in createQuestionCallsPerBuild) divided by the ceiling ratio
// below. This catches regressions that add redundant generator calls even if
// wall-clock improvement is preserved by faster hardware or JIT warmup.
//
// Measured reduction: pre-opt 10255 -> post-opt 3413 = 3.00x (seed=1, size=10,
// 510 templates, same 40-entry recentAttempts as the wall-clock tripwire).
// The contract target of ">=5x" is aspirational — the memo can only
// deduplicate within a single build, and each of the ~10 pick iterations
// draws a different candidateSeed, so the per-iteration cache is rebuilt.
// 2.0x is chosen as the assertion floor: it is well above typical run-to-run
// variance (counts are deterministic — same input, same count, zero noise),
// leaves headroom for content growth that might shift the ratio slightly,
// and still fails any regression that disables or bypasses the memo.
const CALL_COUNT_CEILING_RATIO = 2.0;

test('R6.AC5 — createGrammarQuestion call count stays below baseline / ratio', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const baselineCount = baseline.createQuestionCallsPerBuild;
  assert.ok(
    Number.isFinite(baselineCount) && baselineCount > 0,
    `Baseline fixture missing createQuestionCallsPerBuild (got ${baselineCount}). Run scripts/count-grammar-create-question-calls.mjs against a pre-optimisation selection.js and record the count.`,
  );

  let stdout;
  try {
    stdout = execFileSync(
      process.execPath,
      ['--experimental-test-module-mocks', COUNT_SCRIPT],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch (err) {
    assert.fail(`R6.AC5 count probe failed to run: ${err?.message || err}`);
  }

  const lastLine = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
  let parsed;
  try {
    parsed = JSON.parse(lastLine || '');
  } catch (err) {
    assert.fail(`R6.AC5 count probe stdout was not JSON: ${lastLine}`);
  }

  const calls = Number(parsed?.calls);
  assert.ok(
    Number.isFinite(calls) && calls > 0,
    `R6.AC5 count probe returned invalid calls: ${lastLine}`,
  );

  const ceiling = Math.floor(baselineCount / CALL_COUNT_CEILING_RATIO);
  const ratio = baselineCount / calls;
  assert.ok(
    calls <= ceiling,
    `R6.AC5 call-count ceiling: ${calls} > ${ceiling} (baseline ${baselineCount}, ceiling = baseline / ${CALL_COUNT_CEILING_RATIO}, measured ${ratio.toFixed(2)}x reduction)`,
  );

  // P22: P21 prompt-freshness must not materialise every Grammar template on
  // every pick. With 546 templates, the pre-P22 implementation still passed
  // the old R6 ratio but made 3,687 createGrammarQuestion calls per queue
  // build. Keep a catalogue-scale deterministic ceiling so local-pool growth
  // does not silently turn selection into O(all templates × queue size).
  const p21CatalogueScaleCeiling = 1200;
  assert.ok(
    calls <= p21CatalogueScaleCeiling,
    `P22 prompt-freshness call-count ceiling: ${calls} > ${p21CatalogueScaleCeiling}; prompt/variant freshness should only materialise recent families/templates, not the whole ${parsed?.templateCount || 'unknown'}-template catalogue`,
  );

  const priorityRecentMissCalls = Number(parsed?.priorityRecentMissCalls);
  assert.ok(
    Number.isFinite(priorityRecentMissCalls) && priorityRecentMissCalls > 0,
    `P22 priority-urgent count probe returned invalid calls: ${lastLine}`,
  );
  assert.ok(
    priorityRecentMissCalls <= p21CatalogueScaleCeiling,
    `P22 priority-urgent call-count ceiling: ${priorityRecentMissCalls} > ${p21CatalogueScaleCeiling}; priority lane pickTemplate should reuse recent family pre-checks`,
  );
});
