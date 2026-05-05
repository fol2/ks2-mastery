#!/usr/bin/env node
// R6 benchmark CLI for buildGrammarPracticeQueue.
//
// Runs 100 iterations (10 warm-up discarded), computes p50/p95/max wall-clock
// from remaining 90 samples, reads the pre-optimisation baseline from
// tests/fixtures/grammar-r6-baseline.json, and prints a markdown-table report.
//
// Exits non-zero when improvement vs baseline falls below 30% — the autonomous
// kill-switch per docs/contracts/ci-shard-balance.md R6.AC7.
//
// See R6.AC12 (benchmark checked in) and plan U3.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { buildGrammarPracticeQueue } from '../worker/src/subjects/grammar/selection.js';
import { GRAMMAR_TEMPLATE_METADATA } from '../worker/src/subjects/grammar/content.js';
import { SIM_NOW_MS } from '../tests/helpers/grammar-simulation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'grammar-r6-baseline.json');

const ITERATIONS = 100;
const WARMUP = 10;
const KILL_SWITCH_FLOOR = 0.3;

function buildFortyEntryRecent() {
  const attempts = [];
  const templateCount = GRAMMAR_TEMPLATE_METADATA.length;
  for (let i = 0; i < 40; i += 1) {
    const template = GRAMMAR_TEMPLATE_METADATA[(i * 37) % templateCount];
    const isRecentMiss = i === 38;
    attempts.push({
      contentReleaseId: 'grammar-legacy-reviewed-2026-04-24',
      templateId: template.id,
      itemId: `${template.id}::bench-${i}`,
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

function runIteration(recentAttempts) {
  const t0 = performance.now();
  buildGrammarPracticeQueue({
    mode: 'smart',
    mastery: null,
    recentAttempts,
    seed: 1,
    size: 10,
    now: SIM_NOW_MS,
  });
  return performance.now() - t0;
}

function main() {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const recentAttempts = buildFortyEntryRecent();

  const samples = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const ms = runIteration(recentAttempts);
    if (i >= WARMUP) samples.push(ms);
  }
  samples.sort((a, b) => a - b);

  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const max = samples[samples.length - 1];
  const baselineP95 = baseline.wallClockMs.p95;
  const improvement = 1 - p95 / baselineP95;
  const killSwitchPass = improvement >= KILL_SWITCH_FLOOR;

  const fmt = (n) => `${n.toFixed(1)}ms`;
  const pct = (n) => `${(n * 100).toFixed(1)}%`;

  const lines = [
    '## R6 Benchmark Results',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Node | ${process.version} |`,
    `| Templates | ${GRAMMAR_TEMPLATE_METADATA.length} |`,
    `| Iterations | ${samples.length} (${WARMUP} warm-up discarded) |`,
    `| p50 | ${fmt(p50)} |`,
    `| p95 | ${fmt(p95)} |`,
    `| max | ${fmt(max)} |`,
    `| Baseline p95 | ${fmt(baselineP95)} |`,
    `| Improvement | ${pct(improvement)} |`,
    `| Kill-switch | ${killSwitchPass ? 'PASS' : 'FAIL'} (>=${pct(KILL_SWITCH_FLOOR)}) |`,
    '',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);

  if (!killSwitchPass) {
    process.stderr.write(`FAIL: R6 kill-switch triggered. Improvement ${pct(improvement)} < ${pct(KILL_SWITCH_FLOOR)} floor.\n`);
    process.exit(1);
  }
}

main();
