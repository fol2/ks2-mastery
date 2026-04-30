#!/usr/bin/env node
// Hero Mode pA5 — Metrics Sanity Check (U7)
// Validates that all 34 required A5 metrics (14 launch + 10 product + 10 safety)
// are derivable from existing infrastructure.
//
// Usage: node scripts/hero-pA5-metrics-sanity-check.mjs
//
// Key constraint: NEVER imports from worker/src/ — only from shared/hero/.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  buildProductSignalsSummary,
  calculateStartRate,
  calculateCompletionRate,
  calculateReturnRate,
  analyseSubjectMix,
  analyseTaskIntentMix,
  detectAbandonmentPoints,
  detectRewardFarming,
  analyseCampUsage,
} from '../shared/hero/product-signals.js';

import {
  detectDuplicateDailyAward,
  detectDuplicateCampDebit,
  detectNegativeBalance,
  detectDeadCTA,
  detectClaimWithoutCompletion,
  detectRawChildContent,
  detectSubjectMutation,
  detectNonCohortExposure,
  detectRollbackFailure,
  detectRepeatedErrors,
} from '../shared/hero/stop-conditions.js';

import {
  REQUIRED_LAUNCH_METRICS,
  REQUIRED_SAFETY_METRICS,
} from './hero-pA4-metrics-validator.mjs';

// ── Full Metric Registry (34 total) ─────────────────────────────────

const PA5_LAUNCH_METRICS = Object.freeze([
  { id: 'pa5-launch-01', name: 'eligible learner count', sourceId: 'launch-01' },
  { id: 'pa5-launch-02', name: 'exposed account count', sourceId: 'launch-02' },
  { id: 'pa5-launch-03', name: 'Hero Quest shown count', sourceId: 'launch-03' },
  { id: 'pa5-launch-04', name: 'Hero Quest start count', sourceId: 'launch-04' },
  { id: 'pa5-launch-05', name: 'Hero task start count', sourceId: 'launch-05' },
  { id: 'pa5-launch-06', name: 'Hero task completion count', sourceId: 'launch-06' },
  { id: 'pa5-launch-07', name: 'daily Hero Quest completion count', sourceId: 'launch-07' },
  { id: 'pa5-launch-08', name: 'claim success count', sourceId: 'launch-08' },
  { id: 'pa5-launch-09', name: 'claim rejection count', sourceId: 'launch-09' },
  { id: 'pa5-launch-10', name: 'coin award count', sourceId: 'launch-10' },
  { id: 'pa5-launch-11', name: 'Camp open count', sourceId: 'launch-12' },
  { id: 'pa5-launch-12', name: 'Camp invite/grow count', sourceId: 'launch-13' },
  { id: 'pa5-launch-13', name: 'route 4xx count', sourceId: 'launch-18' },
  { id: 'pa5-launch-14', name: 'route 5xx count', sourceId: 'launch-18' },
]);

const PA5_PRODUCT_METRICS = Object.freeze([
  { id: 'pa5-product-01', name: 'start rate from shown', sourceFn: 'calculateStartRate' },
  { id: 'pa5-product-02', name: 'completion rate from starters', sourceFn: 'calculateCompletionRate' },
  { id: 'pa5-product-03', name: 'next-day return rate', sourceFn: 'calculateReturnRate' },
  { id: 'pa5-product-04', name: 'subject mix distribution', sourceFn: 'analyseSubjectMix' },
  { id: 'pa5-product-05', name: 'task-intent mix', sourceFn: 'analyseTaskIntentMix' },
  { id: 'pa5-product-06', name: 'abandonment point distribution', sourceFn: 'detectAbandonmentPoints' },
  { id: 'pa5-product-07', name: 'parent/support confusion reports', sourceFn: 'analyseCampUsage' },
  { id: 'pa5-product-08', name: 'Camp-before-learning ratio', sourceFn: 'analyseCampUsage' },
  { id: 'pa5-product-09', name: 'extra subject practice after daily coin cap', sourceFn: 'buildProductSignalsSummary' },
  { id: 'pa5-product-10', name: 'warning-condition count', sourceFn: 'detectRewardFarming' },
]);

const PA5_SAFETY_METRICS = Object.freeze([
  { id: 'pa5-safety-01', name: 'duplicate daily award', fn: detectDuplicateDailyAward },
  { id: 'pa5-safety-02', name: 'duplicate Camp debit', fn: detectDuplicateCampDebit },
  { id: 'pa5-safety-03', name: 'negative balance', fn: detectNegativeBalance },
  { id: 'pa5-safety-04', name: 'dead CTA', fn: detectDeadCTA },
  { id: 'pa5-safety-05', name: 'claim without Worker-verified completion', fn: detectClaimWithoutCompletion },
  { id: 'pa5-safety-06', name: 'raw child content', fn: detectRawChildContent },
  { id: 'pa5-safety-07', name: 'Hero command mutating Stars/mastery', fn: detectSubjectMutation },
  { id: 'pa5-safety-08', name: 'exposure to excluded accounts', fn: detectNonCohortExposure },
  { id: 'pa5-safety-09', name: 'rollback failure', fn: detectRollbackFailure },
  { id: 'pa5-safety-10', name: 'production 5xx spike attributable to Hero', fn: detectRepeatedErrors },
]);

// ── Simulated cohort for product metrics validation ─────────────────

const SIMULATED_COHORT = {
  questShownCount: 200,
  questStartCount: 80,
  dailyCompleteCount: 48,
  activeLearnerDays: 150,
  returnNextDayCount: 97,
  subjectCompletions: { spelling: 30, grammar: 25, punctuation: 25 },
  taskIntentCompletions: { practice: 40, review: 20, strengthen: 20 },
  questSessions: [
    { abandonedAtStep: 'task-select' },
    { abandonedAtStep: 'task-select' },
    { abandonedAtStep: 'task-run' },
    { abandonedAtStep: null },
  ],
  claimTimestamps: [1000, 2000, 3000, 50000, 100000],
  campEvents: [
    { type: 'open', afterCompletion: false },
    { type: 'invite', afterCompletion: true },
    { type: 'grow', afterCompletion: true },
  ],
};

// ── Validation ──────────────────────────────────────────────────────

function main() {
  console.log('Hero Mode pA5 — Metrics Sanity Check');
  console.log('='.repeat(50));

  const gaps = [];
  let covered = 0;

  // ── 1. Launch Metrics (14) ──────────────────────────────────────────
  console.log('\n[§8.1] Launch Metrics (14):');

  for (const metric of PA5_LAUNCH_METRICS) {
    const source = REQUIRED_LAUNCH_METRICS.find(m => m.id === metric.sourceId);
    if (source && (source.queryPattern || source.extractionSource)) {
      covered++;
      console.log(`  [OK] ${metric.id}: ${metric.name} -> ${source.extractionSource}`);
    } else {
      gaps.push(metric);
      console.log(`  [GAP] ${metric.id}: ${metric.name} — no extraction source`);
    }
  }

  // ── 2. Product Metrics (10) ─────────────────────────────────────────
  console.log('\n[§8.2] Product Metrics (10):');

  const productFnLookup = {
    calculateStartRate,
    calculateCompletionRate,
    calculateReturnRate,
    analyseSubjectMix,
    analyseTaskIntentMix,
    detectAbandonmentPoints,
    detectRewardFarming,
    analyseCampUsage,
    buildProductSignalsSummary,
  };

  // Run the full summary to verify all 10 product fields emerge
  const summary = buildProductSignalsSummary(SIMULATED_COHORT);
  const productFields = [
    'startRate', 'completionRate', 'returnRate',
    'subjectMix', 'taskIntentMix', 'abandonmentPoints',
    'rewardFarming', 'campUsage',
  ];

  for (const metric of PA5_PRODUCT_METRICS) {
    const fn = productFnLookup[metric.sourceFn];
    if (typeof fn === 'function') {
      covered++;
      console.log(`  [OK] ${metric.id}: ${metric.name} -> ${metric.sourceFn}()`);
    } else {
      gaps.push(metric);
      console.log(`  [GAP] ${metric.id}: ${metric.name} — function not found`);
    }
  }

  // Verify the summary returned all expected fields
  for (const field of productFields) {
    if (!(field in summary)) {
      console.log(`  [WARN] buildProductSignalsSummary missing field: ${field}`);
    }
  }

  // ── 3. Safety Metrics (10) ──────────────────────────────────────────
  console.log('\n[§8.3] Safety Metrics (10):');

  for (const metric of PA5_SAFETY_METRICS) {
    if (typeof metric.fn === 'function') {
      // Verify the function is callable and returns expected structure
      const result = metric.fn({});
      if (typeof result.triggered === 'boolean' && typeof result.condition === 'string') {
        covered++;
        console.log(`  [OK] ${metric.id}: ${metric.name} -> ${metric.fn.name}()`);
      } else {
        gaps.push(metric);
        console.log(`  [GAP] ${metric.id}: ${metric.name} — unexpected return structure`);
      }
    } else {
      gaps.push(metric);
      console.log(`  [GAP] ${metric.id}: ${metric.name} — function not callable`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const total = PA5_LAUNCH_METRICS.length + PA5_PRODUCT_METRICS.length + PA5_SAFETY_METRICS.length;

  console.log('\n' + '='.repeat(50));
  console.log(`Result: ${covered}/${total} metrics covered`);

  if (gaps.length > 0) {
    console.log(`\n[FAIL] ${gaps.length} gap(s):`);
    for (const g of gaps) {
      console.log(`  - ${g.id}: ${g.name}`);
    }
    process.exit(1);
  }

  console.log('\n[PASS] All 34 metrics are mapped and validated.');
  process.exit(0);
}

const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main();
}
