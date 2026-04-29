#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function elapsedBucket(ms) {
  if (ms < 2000) return '<2s';
  if (ms < 5000) return '2-5s';
  if (ms < 10000) return '5-10s';
  return '>10s';
}

function confidenceLevel(count) {
  if (count > 100) return 'high';
  if (count >= 30) return 'medium';
  if (count >= 10) return 'low';
  return 'insufficient';
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function isValidEvent(event) {
  return (
    event &&
    typeof event === 'object' &&
    typeof event.templateId === 'string' &&
    typeof event.conceptId === 'string' &&
    typeof event.timestamp === 'string'
  );
}

function withinWindow(event, windowDays, now) {
  if (windowDays === 'all') return true;
  const ts = new Date(event.timestamp).getTime();
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
}

// ─── Template triage classification ─────────────────────────────────────────

function classifyTemplate(metrics, minSamples) {
  if (metrics.attemptCount < minSamples) return 'insufficient_data';
  if (metrics.independentFirstAttemptSuccessRate > 0.95 && metrics.medianElapsedBucket === '<2s') return 'too_easy';
  if (metrics.independentFirstAttemptSuccessRate < 0.4) return 'too_hard';
  if (metrics.wrongAfterSupportRate > 0.4) return 'ambiguous';
  if (metrics.supportedSuccessRate > 0.8 && metrics.independentFirstAttemptSuccessRate < 0.5) return 'support_dependent';
  if (metrics.retryAttemptCount > 0 && metrics.retrySuccessRate > 0.7) return 'retry_effective';
  if (metrics.retryAttemptCount > 0 && metrics.retrySuccessRate < 0.3 && metrics.attemptCount > minSamples) return 'retry_ineffective';
  if (metrics.independentFirstAttemptSuccessRate > 0.6 && metrics.independentFirstAttemptSuccessRate < 0.95) return 'healthy';
  return 'healthy';
}

// ─── Main build function ────────────────────────────────────────────────────

/**
 * Build a template + concept health report from grammar answer events.
 *
 * @param {Array<Object>} events - Array of grammar.answer-submitted event objects
 * @param {Object} [options]
 * @param {number|string} [options.window='all'] - Time window: 7, 28, 90, or 'all'
 * @param {number} [options.minSamples=10] - Minimum attempts for classification
 * @returns {{ templates: Object, concepts: Object, meta: Object }}
 */
export function buildTemplateHealthReport(events, options = {}) {
  const window = options.window ?? 'all';
  const minSamples = options.minSamples ?? 10;
  const now = Date.now();
  const windowDays = window === 'all' ? 'all' : Number(window);

  let skippedCount = 0;
  const templateAccumulators = {};
  const conceptAccumulators = {};

  for (const event of events) {
    if (!isValidEvent(event)) {
      skippedCount++;
      continue;
    }
    if (!withinWindow(event, windowDays, now)) continue;

    // ── Template accumulation ───────────────────────────────────────────
    const tid = event.templateId;
    if (!templateAccumulators[tid]) {
      templateAccumulators[tid] = {
        attempts: 0,
        independentCorrect: 0,
        independentAttempts: 0,
        supportedCorrect: 0,
        supportedAttempts: 0,
        wrongAfterSupport: 0,
        supportUsedTotal: 0,
        retryCorrect: 0,
        retryAttempts: 0,
        partialCredit: 0,
        multiFieldAttempts: 0,
        skipEmpty: 0,
        scoredAttempts: 0,
        elapsedValues: [],
      };
    }
    const ta = templateAccumulators[tid];
    ta.attempts++;

    const correct = !!event.correct;
    const firstAttemptIndependent = !!event.firstAttemptIndependent;
    const supportUsed = !!event.supportUsed;
    const wasRetry = !!event.wasRetry;
    const score = event.score ?? 0;
    const maxScore = event.maxScore ?? 0;
    const elapsed = event.elapsedMs ?? 0;

    if (firstAttemptIndependent) {
      ta.independentAttempts++;
      if (correct) ta.independentCorrect++;
    }

    if (supportUsed) {
      ta.supportUsedTotal++;
      if (correct && !firstAttemptIndependent) {
        ta.supportedAttempts++;
        ta.supportedCorrect++;
      } else if (!correct) {
        ta.wrongAfterSupport++;
      }
    }

    if (wasRetry) {
      ta.retryAttempts++;
      if (correct) ta.retryCorrect++;
    }

    if (maxScore > 0) {
      ta.scoredAttempts++;
      if (score > 0 && score < maxScore) ta.partialCredit++;
      if (score === 0) ta.skipEmpty++;
      ta.multiFieldAttempts++;
    }

    if (elapsed > 0) ta.elapsedValues.push(elapsed);

    // ── Concept accumulation ────────────────────────────────────────────
    const cid = event.conceptId;
    if (!conceptAccumulators[cid]) {
      conceptAccumulators[cid] = {
        localCorrect: 0,
        localAttempts: 0,
        mixedCorrect: 0,
        mixedAttempts: 0,
        explainCorrect: 0,
        explainAttempts: 0,
        surgeryCorrect: 0,
        surgeryAttempts: 0,
        retainedPasses: 0,
        securedAttempts: 0,
        lapseCount: 0,
        weakRecoveries: 0,
        weakAttempts: 0,
        templateIds: new Set(),
      };
    }
    const ca = conceptAccumulators[cid];
    ca.templateIds.add(tid);

    const tags = Array.isArray(event.tags) ? event.tags : [];
    const mode = event.mode || '';
    const questionType = event.questionType || '';
    const conceptStatusBefore = event.conceptStatusBefore || '';

    const isMixed = tags.includes('mixed-transfer');
    const isExplain = questionType === 'explain';
    const isSurgery = mode.includes('surgery') || mode.includes('fix');

    if (!isMixed && !isExplain && !isSurgery) {
      ca.localAttempts++;
      if (correct) ca.localCorrect++;
    }
    if (isMixed) {
      ca.mixedAttempts++;
      if (correct) ca.mixedCorrect++;
    }
    if (isExplain) {
      ca.explainAttempts++;
      if (correct) ca.explainCorrect++;
    }
    if (isSurgery) {
      ca.surgeryAttempts++;
      if (correct) ca.surgeryCorrect++;
    }

    if (conceptStatusBefore === 'secured') {
      ca.securedAttempts++;
      if (correct) ca.retainedPasses++;
      else ca.lapseCount++;
    }

    if (conceptStatusBefore === 'weak') {
      ca.weakAttempts++;
      if (correct) ca.weakRecoveries++;
    }
  }

  // ── Derive template metrics ─────────────────────────────────────────────
  const templates = {};
  for (const [tid, acc] of Object.entries(templateAccumulators)) {
    const medianMs = median(acc.elapsedValues);
    const metrics = {
      attemptCount: acc.attempts,
      independentFirstAttemptSuccessRate: safeRate(acc.independentCorrect, acc.independentAttempts),
      supportedSuccessRate: safeRate(acc.supportedCorrect, acc.supportUsedTotal),
      wrongAfterSupportRate: safeRate(acc.wrongAfterSupport, acc.supportUsedTotal),
      medianElapsedBucket: elapsedBucket(medianMs),
      retrySuccessRate: safeRate(acc.retryCorrect, acc.retryAttempts),
      retryAttemptCount: acc.retryAttempts,
      partialCreditRate: safeRate(acc.partialCredit, acc.multiFieldAttempts),
      skipEmptyRate: safeRate(acc.skipEmpty, acc.scoredAttempts),
      confidence: confidenceLevel(acc.attempts),
    };
    metrics.classification = classifyTemplate(metrics, minSamples);
    templates[tid] = metrics;
  }

  // ── Derive concept metrics ──────────────────────────────────────────────
  const concepts = {};
  for (const [cid, acc] of Object.entries(conceptAccumulators)) {
    concepts[cid] = {
      localPracticeSuccessRate: safeRate(acc.localCorrect, acc.localAttempts),
      mixedTransferSuccessRate: safeRate(acc.mixedCorrect, acc.mixedAttempts),
      explanationSuccessRate: safeRate(acc.explainCorrect, acc.explainAttempts),
      surgerySuccessRate: safeRate(acc.surgeryCorrect, acc.surgeryAttempts),
      retainedAfterSecureRate: safeRate(acc.retainedPasses, acc.securedAttempts),
      lapseAfterSecureRate: safeRate(acc.lapseCount, acc.securedAttempts),
      weakToSecureRecoveryRate: safeRate(acc.weakRecoveries, acc.weakAttempts),
      avgTemplatesContributingToSecure: acc.templateIds.size,
    };
  }

  return {
    templates,
    concepts,
    meta: {
      totalEvents: events.length,
      validEvents: events.length - skippedCount,
      skippedMalformed: skippedCount,
      window,
      minSamples,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ─── Markdown formatting ────────────────────────────────────────────────────

function formatMarkdown(report) {
  const lines = [
    '# Grammar QG P6 — Template & Concept Health Report',
    '',
    `Generated: ${report.meta.generatedAt}`,
    `Window: ${report.meta.window} | Min samples: ${report.meta.minSamples}`,
    `Events: ${report.meta.totalEvents} total, ${report.meta.validEvents} valid, ${report.meta.skippedMalformed} skipped`,
    '',
    '## Template Classifications',
    '',
    '| TemplateId | Attempts | IndependentSuccess | Classification |',
    '|---|---|---|---|',
  ];

  for (const [tid, m] of Object.entries(report.templates)) {
    lines.push(
      `| ${tid} | ${m.attemptCount} | ${(m.independentFirstAttemptSuccessRate * 100).toFixed(1)}% | ${m.classification} |`,
    );
  }

  lines.push('', '## Concept Summary', '', '| ConceptId | LocalSuccess | MixedTransfer | RetainedAfterSecure |');
  lines.push('|---|---|---|---|');

  for (const [cid, c] of Object.entries(report.concepts)) {
    lines.push(
      `| ${cid} | ${(c.localPracticeSuccessRate * 100).toFixed(1)}% | ${(c.mixedTransferSuccessRate * 100).toFixed(1)}% | ${(c.retainedAfterSecureRate * 100).toFixed(1)}% |`,
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
    console.error('Usage: grammar-qg-health-report.mjs --input=<path> [--window=7|28|90|all] [--min-samples=N] [--output-dir=<dir>]');
    process.exit(1);
  }

  const window = args.window || 'all';
  const minSamples = Number(args['min-samples'] || 10);
  const outputDir = args['output-dir'] || path.join(ROOT_DIR, 'reports', 'grammar');

  const raw = readFileSync(path.resolve(inputPath), 'utf-8');
  const events = JSON.parse(raw);

  const report = buildTemplateHealthReport(events, { window, minSamples });

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'grammar-qg-p6-health-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(outputDir, 'grammar-qg-p6-health-report.md'), formatMarkdown(report));

  console.log(`Health report written to ${outputDir}`);
  console.log(`  Templates: ${Object.keys(report.templates).length}`);
  console.log(`  Concepts: ${Object.keys(report.concepts).length}`);
  console.log(`  Skipped: ${report.meta.skippedMalformed}`);
}
