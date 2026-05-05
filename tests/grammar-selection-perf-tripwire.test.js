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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { buildGrammarPracticeQueue } from '../worker/src/subjects/grammar/selection.js';
import { GRAMMAR_TEMPLATE_METADATA } from '../worker/src/subjects/grammar/content.js';
import { SIM_NOW_MS } from './helpers/grammar-simulation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, 'fixtures', 'grammar-r6-baseline.json');

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
  }
  const { p50, p95, max } = runBenchmark();
  assert.ok(
    p95 < CEILING_MS,
    `R6 perf ceiling: p95 ${p95.toFixed(1)}ms >= ${CEILING_MS}ms (p50=${p50.toFixed(1)}ms, max=${max.toFixed(1)}ms)`,
  );
});

test('R6 kill-switch: post-opt p95 shows >=30% improvement vs baseline', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const { p95 } = runBenchmark();
  const improvement = 1 - p95 / baseline.wallClockMs.p95;
  assert.ok(
    improvement >= KILL_SWITCH_FLOOR,
    `R6 kill-switch: improvement ${(improvement * 100).toFixed(1)}% < ${(KILL_SWITCH_FLOOR * 100).toFixed(0)}% floor (p95=${p95.toFixed(1)}ms, baseline=${baseline.wallClockMs.p95.toFixed(1)}ms)`,
  );
});
