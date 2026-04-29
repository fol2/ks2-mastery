#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function isValidEvent(event) {
  return (
    event &&
    typeof event === 'object' &&
    typeof event.templateId === 'string' &&
    typeof event.conceptId === 'string' &&
    typeof event.timestamp === 'string' &&
    Array.isArray(event.tags) &&
    event.tags.includes('mixed-transfer')
  );
}

function suggestEvidenceWeight(metrics) {
  if (metrics.localPrerequisitesMetRate <= 0.5) return 'none';
  if (metrics.successRate < 0.5) return 'light';
  if (metrics.successRate > 0.8 && metrics.independentRate > 0.7) return 'strong';
  return 'normal';
}

function deriveRecommendation(weight) {
  if (weight === 'none') return 'reduce';
  if (weight === 'strong') return 'strengthen';
  return 'keep';
}

// ─── Main build function ────────────────────────────────────────────────────

/**
 * Build mixed-transfer calibration report from grammar answer events.
 *
 * Filters to events tagged with 'mixed-transfer' and computes per-template
 * evidence weight suggestions and calibration recommendations.
 *
 * @param {Array<Object>} events - Array of grammar.answer-submitted event objects
 * @param {Object} [options]
 * @param {number} [options.minSamples=5] - Minimum attempts for weight suggestion
 * @returns {{ templates: Object, meta: Object }}
 */
export function buildMixedTransferCalibration(events, options = {}) {
  const minSamples = options.minSamples ?? 5;

  let skippedCount = 0;
  const templateAccumulators = {};
  const conceptLocalSuccess = {};

  // First pass: gather concept-local success rates from all events
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    if (!event.conceptId || !event.templateId) continue;
    const tags = Array.isArray(event.tags) ? event.tags : [];
    if (tags.includes('mixed-transfer')) continue;

    const cid = event.conceptId;
    if (!conceptLocalSuccess[cid]) conceptLocalSuccess[cid] = { correct: 0, total: 0 };
    conceptLocalSuccess[cid].total++;
    if (event.correct) conceptLocalSuccess[cid].correct++;
  }

  // Second pass: accumulate mixed-transfer template metrics
  for (const event of events) {
    if (!isValidEvent(event)) {
      if (event && Array.isArray(event.tags) && event.tags.includes('mixed-transfer')) {
        skippedCount++;
      }
      continue;
    }

    const tid = event.templateId;
    if (!templateAccumulators[tid]) {
      templateAccumulators[tid] = {
        attempts: 0,
        correct: 0,
        independentCorrect: 0,
        independentAttempts: 0,
        supportedAttempts: 0,
        wrongAttempts: 0,
        conceptIds: new Set(),
        prerequisitesMetCount: 0,
      };
    }

    const ta = templateAccumulators[tid];
    ta.attempts++;
    if (event.correct) ta.correct++;

    const firstAttemptIndependent = !!event.firstAttemptIndependent;
    if (firstAttemptIndependent) {
      ta.independentAttempts++;
      if (event.correct) ta.independentCorrect++;
    } else if (event.supportUsed) {
      ta.supportedAttempts++;
    } else if (!event.correct) {
      ta.wrongAttempts++;
    }

    // Track unique concepts involved
    ta.conceptIds.add(event.conceptId);
    if (Array.isArray(event.conceptIds)) {
      for (const cid of event.conceptIds) ta.conceptIds.add(cid);
    }

    // Check prerequisites met — conceptStatusBefore may be Object or string
    const csb = event.conceptStatusBefore;
    const allConceptStatuses = event.allConceptStatusesBefore || {};
    let prereqsMet = true;
    if (typeof allConceptStatuses === 'object' && Object.keys(allConceptStatuses).length > 0) {
      prereqsMet = Object.values(allConceptStatuses).every((s) => s === 'secured');
    } else if (typeof csb === 'object' && csb !== null) {
      prereqsMet = Object.values(csb).length > 0 && Object.values(csb).every((s) => s === 'secured');
    } else {
      prereqsMet = csb === 'secured';
    }
    if (prereqsMet) ta.prerequisitesMetCount++;
  }

  // ── Derive template metrics ─────────────────────────────────────────────
  const templates = {};
  for (const [tid, acc] of Object.entries(templateAccumulators)) {
    const successRate = safeRate(acc.correct, acc.attempts);
    const independentRate = safeRate(acc.independentCorrect, acc.independentAttempts || acc.attempts);
    const localPrerequisitesMetRate = safeRate(acc.prerequisitesMetCount, acc.attempts);

    // Compute concept-local average success rate for comparison
    let localAvg = 0;
    let localCount = 0;
    for (const cid of acc.conceptIds) {
      if (conceptLocalSuccess[cid]) {
        localAvg += safeRate(conceptLocalSuccess[cid].correct, conceptLocalSuccess[cid].total);
        localCount++;
      }
    }
    const conceptLocalAvgRate = localCount > 0 ? localAvg / localCount : 0;

    const supportDistribution = {
      independent: safeRate(acc.independentAttempts, acc.attempts),
      supported: safeRate(acc.supportedAttempts, acc.attempts),
      wrong: safeRate(acc.wrongAttempts, acc.attempts),
    };

    const weight = acc.attempts < minSamples ? 'insufficient_data' : suggestEvidenceWeight({ successRate, independentRate, localPrerequisitesMetRate });
    const metrics = {
      attemptCount: acc.attempts,
      successRate,
      conceptLocalSuccessRate: conceptLocalAvgRate,
      independentRate,
      supportDistribution,
      conceptPropagationCount: acc.conceptIds.size,
      localPrerequisitesMetRate,
      suggestedEvidenceWeight: weight,
      recommendation: weight === 'insufficient_data' ? 'insufficient_data' : deriveRecommendation(weight),
    };

    templates[tid] = metrics;
  }

  return {
    templates,
    meta: {
      totalMixedTransferEvents: Object.values(templateAccumulators).reduce((s, a) => s + a.attempts, 0),
      skippedMalformed: skippedCount,
      minSamples,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ─── Markdown formatting ────────────────────────────────────────────────────

function formatMarkdown(report) {
  const lines = [
    '# Grammar QG P6 — Mixed-Transfer Calibration Report',
    '',
    `Generated: ${report.meta.generatedAt}`,
    `Mixed-transfer events: ${report.meta.totalMixedTransferEvents} | Skipped: ${report.meta.skippedMalformed}`,
    '',
    '## Template Evidence Weights',
    '',
    '| TemplateId | Attempts | Success | Independent | LocalPrereqs | Weight | Recommendation |',
    '|---|---|---|---|---|---|---|',
  ];

  for (const [tid, m] of Object.entries(report.templates)) {
    lines.push(
      `| ${tid} | ${m.attemptCount} | ${(m.successRate * 100).toFixed(1)}% | ${(m.independentRate * 100).toFixed(1)}% | ${(m.localPrerequisitesMetRate * 100).toFixed(1)}% | ${m.suggestedEvidenceWeight} | ${m.recommendation} |`,
    );
  }

  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value;
    }
  }
  return args;
}

const isMainModule =
  typeof process !== 'undefined' && process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input;
  if (!inputPath) {
    console.error('Usage: grammar-qg-mixed-transfer-calibration.mjs --input=<path> [--min-samples=N] [--output-dir=<dir>]');
    process.exit(1);
  }

  const minSamples = Number(args['min-samples'] || 5);
  const outputDir = args['output-dir'] || path.join(ROOT_DIR, 'reports', 'grammar');

  const raw = readFileSync(path.resolve(inputPath), 'utf-8');
  const events = JSON.parse(raw);

  const report = buildMixedTransferCalibration(events, { minSamples });

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'grammar-qg-p6-mixed-transfer-calibration.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(outputDir, 'grammar-qg-p6-mixed-transfer-calibration.md'), formatMarkdown(report));

  console.log(`Mixed-transfer calibration report written to ${outputDir}`);
  console.log(`  Templates: ${Object.keys(report.templates).length}`);
  console.log(`  Events: ${report.meta.totalMixedTransferEvents}`);
}
