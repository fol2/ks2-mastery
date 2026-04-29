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
    typeof event.conceptId === 'string' &&
    typeof event.timestamp === 'string' &&
    typeof event.conceptStatusBefore === 'string'
  );
}

function daysBetween(ts1, ts2) {
  const ms = Math.abs(new Date(ts2).getTime() - new Date(ts1).getTime());
  return ms / (24 * 60 * 60 * 1000);
}

// ─── Main build function ────────────────────────────────────────────────────

/**
 * Build a retention-after-secure monitoring report from grammar answer events.
 *
 * Filters to events where the concept had 'secured' status before the attempt
 * and computes retention vs lapse rates per concept.
 *
 * @param {Array<Object>} events - Array of grammar.answer-submitted event objects
 * @param {Object} [options]
 * @param {number} [options.minSamples=3] - Minimum secured attempts for analysis
 * @returns {{ concepts: Object, meta: Object }}
 */
export function buildRetentionReport(events, options = {}) {
  const minSamples = options.minSamples ?? 3;

  let skippedCount = 0;
  const conceptAccumulators = {};

  // First pass: find earliest secured timestamp per concept (for daysToLapse)
  const conceptSecuredTimestamps = {};
  for (const event of events) {
    if (!isValidEvent(event)) continue;
    if (event.conceptStatusBefore !== 'secured') continue;
    const cid = event.conceptId;
    if (!conceptSecuredTimestamps[cid]) {
      conceptSecuredTimestamps[cid] = event.timestamp;
    } else if (new Date(event.timestamp) < new Date(conceptSecuredTimestamps[cid])) {
      conceptSecuredTimestamps[cid] = event.timestamp;
    }
  }

  // Second pass: accumulate retention metrics
  for (const event of events) {
    if (!isValidEvent(event)) {
      skippedCount++;
      continue;
    }
    if (event.conceptStatusBefore !== 'secured') continue;

    const cid = event.conceptId;
    if (!conceptAccumulators[cid]) {
      conceptAccumulators[cid] = {
        securedAttemptCount: 0,
        retainedPasses: 0,
        lapseCount: 0,
        firstLapseTimestamp: null,
        postMegaAttempts: 0,
        mixedReviewCorrect: 0,
        mixedReviewAttempts: 0,
        localCorrect: 0,
        localAttempts: 0,
      };
    }

    const ca = conceptAccumulators[cid];
    ca.securedAttemptCount++;

    const correct = !!event.correct;
    if (correct) {
      ca.retainedPasses++;
    } else {
      ca.lapseCount++;
      if (!ca.firstLapseTimestamp) {
        ca.firstLapseTimestamp = event.timestamp;
      }
    }

    // Post-mega detection (context-dependent)
    const tags = Array.isArray(event.tags) ? event.tags : [];
    const mode = event.mode || '';
    if (tags.includes('post-mega') || mode.includes('post-mega') || mode.includes('review')) {
      ca.postMegaAttempts++;
    }

    // Mixed review vs local retention
    const isMixed = mode.includes('mixed') || tags.includes('mixed-transfer') || tags.includes('mixed-review');
    if (isMixed) {
      ca.mixedReviewAttempts++;
      if (correct) ca.mixedReviewCorrect++;
    } else {
      ca.localAttempts++;
      if (correct) ca.localCorrect++;
    }
  }

  // ── Derive concept metrics ──────────────────────────────────────────────
  const concepts = {};
  for (const [cid, acc] of Object.entries(conceptAccumulators)) {
    if (acc.securedAttemptCount < minSamples) {
      concepts[cid] = {
        securedAttemptCount: acc.securedAttemptCount,
        classification: 'insufficient_data',
      };
      continue;
    }

    const retainedPassRate = safeRate(acc.retainedPasses, acc.securedAttemptCount);
    const lapseRate = safeRate(acc.lapseCount, acc.securedAttemptCount);

    // Days from first secured event to first lapse
    let daysFromSecureToFirstLapse = null;
    if (acc.firstLapseTimestamp && conceptSecuredTimestamps[cid]) {
      daysFromSecureToFirstLapse = Math.round(
        daysBetween(conceptSecuredTimestamps[cid], acc.firstLapseTimestamp) * 10,
      ) / 10;
    }

    const mixedReviewProtection = {
      mixedRetentionRate: safeRate(acc.mixedReviewCorrect, acc.mixedReviewAttempts),
      localRetentionRate: safeRate(acc.localCorrect, acc.localAttempts),
    };

    concepts[cid] = {
      securedAttemptCount: acc.securedAttemptCount,
      retainedPassRate,
      lapseRate,
      lapsed: lapseRate > 0,
      daysFromSecureToFirstLapse,
      postMegaAttempts: acc.postMegaAttempts,
      mixedReviewProtection,
      classification: lapseRate > 0.5 ? 'retention_risk' : lapseRate > 0 ? 'minor_lapse' : 'retained',
    };
  }

  return {
    concepts,
    meta: {
      totalConceptsAnalysed: Object.keys(concepts).length,
      retentionRisk: Object.values(concepts).filter((c) => c.classification === 'retention_risk').length,
      minorLapse: Object.values(concepts).filter((c) => c.classification === 'minor_lapse').length,
      retained: Object.values(concepts).filter((c) => c.classification === 'retained').length,
      insufficientData: Object.values(concepts).filter((c) => c.classification === 'insufficient_data').length,
      skippedMalformed: skippedCount,
      minSamples,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ─── Markdown formatting ────────────────────────────────────────────────────

function formatMarkdown(report) {
  const lines = [
    '# Grammar QG P6 — Retention After Secure Report',
    '',
    `Generated: ${report.meta.generatedAt}`,
    `Concepts analysed: ${report.meta.totalConceptsAnalysed}`,
    `Retained: ${report.meta.retained} | Minor lapse: ${report.meta.minorLapse} | Retention risk: ${report.meta.retentionRisk} | Insufficient data: ${report.meta.insufficientData}`,
    '',
    '## Concept Retention',
    '',
    '| ConceptId | Attempts | Retained | Lapse | DaysToLapse | Classification |',
    '|---|---|---|---|---|---|',
  ];

  for (const [cid, c] of Object.entries(report.concepts)) {
    if (c.classification === 'insufficient_data') {
      lines.push(`| ${cid} | ${c.securedAttemptCount} | — | — | — | insufficient_data |`);
      continue;
    }
    lines.push(
      `| ${cid} | ${c.securedAttemptCount} | ${(c.retainedPassRate * 100).toFixed(1)}% | ${(c.lapseRate * 100).toFixed(1)}% | ${c.daysFromSecureToFirstLapse ?? '—'} | ${c.classification} |`,
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
    console.error('Usage: grammar-qg-retention-monitor.mjs --input=<path> [--min-samples=N] [--output-dir=<dir>]');
    process.exit(1);
  }

  const minSamples = Number(args['min-samples'] || 3);
  const outputDir = args['output-dir'] || path.join(ROOT_DIR, 'reports', 'grammar');

  const raw = readFileSync(path.resolve(inputPath), 'utf-8');
  const events = JSON.parse(raw);

  const report = buildRetentionReport(events, { minSamples });

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'grammar-qg-p6-retention.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(outputDir, 'grammar-qg-p6-retention.md'), formatMarkdown(report));

  console.log(`Retention report written to ${outputDir}`);
  console.log(`  Concepts: ${report.meta.totalConceptsAnalysed}`);
  console.log(`  Retention risk: ${report.meta.retentionRisk}`);
  console.log(`  Minor lapse: ${report.meta.minorLapse}`);
  console.log(`  Retained: ${report.meta.retained}`);
}
