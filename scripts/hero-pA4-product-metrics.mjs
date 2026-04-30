#!/usr/bin/env node
// Hero Mode pA4 — Product Signals Report (U6)
// Takes cohort event data and produces the §13.2 product signals report.
//
// Usage: node scripts/hero-pA4-product-metrics.mjs --input cohort-data.json
//
// Key constraint: NEVER imports from worker/src/ — only from shared/hero/.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  calculateStartRate,
  calculateCompletionRate,
  calculateReturnRate,
  analyseSubjectMix,
  analyseTaskIntentMix,
  detectAbandonmentPoints,
  detectRewardFarming,
  analyseCampUsage,
  buildProductSignalsSummary,
} from '../shared/hero/product-signals.js';

// ── Main report generation ───────────────────────────────────────────

/**
 * Generate a structured product metrics report from cohort event data.
 * @param {object} cohortData - Cohort event data (see schema below)
 * @returns {object} Structured report with all 11 product signal sections
 */
export function generateProductSignalsReport(cohortData) {
  const summary = buildProductSignalsSummary(cohortData);

  const report = {
    title: 'Hero Mode pA4 — Product Signals Report (§13.2)',
    generatedAt: new Date().toISOString(),
    cohortId: cohortData?.cohortId || 'unknown',

    // 1. Funnel rates
    funnelRates: {
      startRate: summary.startRate,
      completionRate: summary.completionRate,
      returnRate: summary.returnRate,
    },

    // 2. Subject distribution
    subjectMix: summary.subjectMix,

    // 3. Task intent distribution
    taskIntentMix: summary.taskIntentMix,

    // 4. Abandonment analysis
    abandonmentPoints: summary.abandonmentPoints,

    // 5. Reward farming detection
    rewardFarming: summary.rewardFarming,

    // 6. Camp engagement
    campUsage: summary.campUsage,

    // 7. Summary verdict
    verdict: deriveVerdict(summary),
  };

  return report;
}

/**
 * Derive an overall product-health verdict from the summary.
 * @param {object} summary
 * @returns {{ healthy: boolean, flags: string[] }}
 */
function deriveVerdict(summary) {
  const flags = [];

  if (summary.startRate < 0.3) flags.push('low-start-rate');
  if (summary.completionRate < 0.3) flags.push('low-completion-rate');
  if (summary.returnRate < 0.2) flags.push('low-return-rate');
  if (summary.subjectMix.imbalanced) flags.push('subject-imbalanced');
  if (summary.rewardFarming.detected) flags.push('reward-farming-detected');

  return { healthy: flags.length === 0, flags };
}

// ── CLI execution ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');

  if (inputIdx === -1 || !args[inputIdx + 1]) {
    console.error('Usage: node scripts/hero-pA4-product-metrics.mjs --input <cohort-data.json>');
    process.exit(1);
  }

  const inputPath = resolve(args[inputIdx + 1]);

  let cohortData;
  try {
    const raw = await readFile(inputPath, 'utf8');
    cohortData = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to read input file: ${err.message}`);
    process.exit(1);
  }

  const report = generateProductSignalsReport(cohortData);

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main();
}
