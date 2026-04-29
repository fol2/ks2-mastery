#!/usr/bin/env node
// P5-U3 — Punctuation QG learning-health report.
//
// Produces a structured health report covering signature exposure, scheduler
// reason distribution, misconception/spaced/retention pass rates, star
// evidence dedup, depth/capacity values, and telemetry event coverage.
//
// Modes:
//   --json              JSON output (structured object)
//   --strict            Fail (exit 1) if any emitted event lacks a command-path test
//   --fixture synthetic Generate deterministic synthetic session data (no DB)
//
// Never exposes: raw answers, accepted answers, validator internals, template source.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PUNCTUATION_TELEMETRY_MANIFEST } from '../shared/punctuation/telemetry-manifest.js';
import { REASON_TAGS } from '../shared/punctuation/scheduler-manifest.js';
import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  GENERATED_TEMPLATE_BANK,
} from '../shared/punctuation/generators.js';

// ─── CLI parsing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = new Set(argv);
  const valueAfter = (name, fallback) => {
    const index = argv.indexOf(name);
    if (index < 0 || index + 1 >= argv.length) return fallback;
    return argv[index + 1];
  };
  return {
    json: args.has('--json'),
    strict: args.has('--strict'),
    fixture: valueAfter('--fixture', null),
  };
}

// ─── Synthetic fixture generation ───────────────────────────────────────────

function createSyntheticFixture() {
  const reasonValues = Object.values(REASON_TAGS);
  const totalAttempts = reasonValues.length * 4; // 4 attempts per reason

  // Build deterministic synthetic session data
  const attempts = [];
  let attemptId = 0;
  for (const reason of reasonValues) {
    for (let i = 0; i < 4; i += 1) {
      attemptId += 1;
      attempts.push({
        id: `synth-attempt-${attemptId}`,
        reason,
        correct: i < 3, // 75% pass rate
        signature: `sig-${reason}-${i % 2}`,
        templateId: `tmpl-${reason}-${i % 2}`,
        skillId: `skill-${reason.split('-')[0]}`,
        isMisconceptionRetry: reason === REASON_TAGS.MISCONCEPTION_RETRY,
        isSpacedReturn: reason === REASON_TAGS.SPACED_RETURN,
        isRetentionAfterSecure: reason === REASON_TAGS.RETENTION_AFTER_SECURE,
      });
    }
  }

  return { attempts, totalAttempts };
}

function createEmptyFixture() {
  return { attempts: [], totalAttempts: 0 };
}

// ─── Report computation ─────────────────────────────────────────────────────

function computeSignatureExposure(manifest) {
  const indexes = createPunctuationContentIndexes(manifest);
  const generatedItems = createPunctuationGeneratedItems({
    manifest,
    seed: manifest.releaseId || 'health-report',
    perFamily: 4,
  });
  const signatures = new Set(generatedItems.map((item) => item.variantSignature).filter(Boolean));
  return {
    totalGeneratedItems: generatedItems.length,
    distinctSignatures: signatures.size,
  };
}

function computeSignatureRepeatRate(manifest) {
  const generatedItems = createPunctuationGeneratedItems({
    manifest,
    seed: manifest.releaseId || 'health-report',
    perFamily: 4,
  });
  const signatureCounts = new Map();
  for (const item of generatedItems) {
    const sig = item.variantSignature;
    if (!sig) continue;
    signatureCounts.set(sig, (signatureCounts.get(sig) || 0) + 1);
  }
  const duplicates = [...signatureCounts.entries()].filter(([, count]) => count > 1);
  return {
    totalSignatures: signatureCounts.size,
    duplicateSignatureCount: duplicates.length,
    duplicateSignatures: duplicates.map(([sig, count]) => ({ signature: sig, count })),
  };
}

function computeSchedulerReasonDistribution(fixture) {
  const reasonCounts = {};
  for (const tag of Object.values(REASON_TAGS)) {
    reasonCounts[tag] = 0;
  }
  for (const attempt of fixture.attempts) {
    if (Object.hasOwn(reasonCounts, attempt.reason)) {
      reasonCounts[attempt.reason] += 1;
    }
  }
  return { reasonCounts, totalAttempts: fixture.totalAttempts };
}

function computeMisconceptionRetryRate(fixture) {
  const retries = fixture.attempts.filter((a) => a.isMisconceptionRetry);
  const scheduled = retries.length;
  const passed = retries.filter((a) => a.correct).length;
  return { scheduled, passed, rate: scheduled > 0 ? passed / scheduled : null };
}

function computeSpacedReturnRate(fixture) {
  const returns = fixture.attempts.filter((a) => a.isSpacedReturn);
  const scheduled = returns.length;
  const passed = returns.filter((a) => a.correct).length;
  return { scheduled, passed, rate: scheduled > 0 ? passed / scheduled : null };
}

function computeRetentionAfterSecureRate(fixture) {
  const retentions = fixture.attempts.filter((a) => a.isRetentionAfterSecure);
  const scheduled = retentions.length;
  const passed = retentions.filter((a) => a.correct).length;
  return { scheduled, passed, rate: scheduled > 0 ? passed / scheduled : null };
}

function computeStarEvidenceDedup(fixture) {
  const bySignature = new Map();
  const byTemplate = new Map();
  for (const attempt of fixture.attempts) {
    if (!attempt.correct) continue;
    const sigKey = attempt.signature;
    const tmplKey = attempt.templateId;
    if (sigKey) bySignature.set(sigKey, (bySignature.get(sigKey) || 0) + 1);
    if (tmplKey) byTemplate.set(tmplKey, (byTemplate.get(tmplKey) || 0) + 1);
  }
  const dedupedBySignature = [...bySignature.entries()].filter(([, c]) => c > 1).length;
  const dedupedByTemplate = [...byTemplate.entries()].filter(([, c]) => c > 1).length;
  return { dedupedBySignature, dedupedByTemplate };
}

function computeDepthValues() {
  const productionDepth = 4;
  const capacityDepth = 8;
  return { productionDepth, capacityDepth };
}

function computeDuplicateSignatureCount(manifest) {
  const generatedItems = createPunctuationGeneratedItems({
    manifest,
    seed: manifest.releaseId || 'health-report',
    perFamily: 4,
  });
  const signatureCounts = new Map();
  for (const item of generatedItems) {
    const sig = item.variantSignature;
    if (!sig) continue;
    signatureCounts.set(sig, (signatureCounts.get(sig) || 0) + 1);
  }
  return [...signatureCounts.entries()].filter(([, count]) => count > 1).length;
}

function computeDuplicateStemModelClusters(manifest) {
  const generatedItems = createPunctuationGeneratedItems({
    manifest,
    seed: manifest.releaseId || 'health-report',
    perFamily: 4,
  });
  const stemCounts = new Map();
  const modelCounts = new Map();
  for (const item of generatedItems) {
    const stem = String(item.stem || '').trim().toLowerCase();
    const model = String(item.model || '').trim().toLowerCase();
    if (stem) stemCounts.set(stem, (stemCounts.get(stem) || 0) + 1);
    if (model) modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
  }
  const duplicateStems = [...stemCounts.entries()].filter(([, c]) => c > 1).length;
  const duplicateModels = [...modelCounts.entries()].filter(([, c]) => c > 1).length;
  return { duplicateStems, duplicateModels };
}

function computeUnsupportedReservedEvents() {
  const reserved = [];
  const deprecated = [];
  for (const [key, entry] of Object.entries(PUNCTUATION_TELEMETRY_MANIFEST)) {
    if (entry.status === 'reserved') reserved.push({ key, event: entry.event });
    if (entry.status === 'deprecated') deprecated.push({ key, event: entry.event });
  }
  return { reserved, deprecated };
}

function countEmittedEvents() {
  return Object.values(PUNCTUATION_TELEMETRY_MANIFEST)
    .filter((entry) => entry.status === 'emitted')
    .length;
}

// ─── Strict mode check ──────────────────────────────────────────────────────

function strictCheck() {
  const commandPathTestFile = resolve('tests/punctuation-telemetry-command-path.test.js');
  if (!existsSync(commandPathTestFile)) {
    return { ok: false, reason: `Command-path test file missing: ${commandPathTestFile}` };
  }
  const source = readFileSync(commandPathTestFile, 'utf8');
  const emittedKeys = Object.entries(PUNCTUATION_TELEMETRY_MANIFEST)
    .filter(([, entry]) => entry.status === 'emitted')
    .map(([key]) => key);

  const missing = [];
  for (const key of emittedKeys) {
    if (!source.includes(`PUNCTUATION_TELEMETRY_EVENTS.${key}`)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    return { ok: false, reason: `Emitted events missing command-path tests: ${missing.join(', ')}` };
  }
  return { ok: true, reason: null };
}

// ─── Report assembly ────────────────────────────────────────────────────────

export function buildHealthReport({ fixture = null, manifest = PUNCTUATION_CONTENT_MANIFEST } = {}) {
  const effectiveFixture = fixture || createEmptyFixture();

  const signatureExposure = computeSignatureExposure(manifest);
  const signatureRepeatRate = computeSignatureRepeatRate(manifest);
  const schedulerReasonDistribution = computeSchedulerReasonDistribution(effectiveFixture);
  const misconceptionRetryRate = computeMisconceptionRetryRate(effectiveFixture);
  const spacedReturnRate = computeSpacedReturnRate(effectiveFixture);
  const retentionAfterSecureRate = computeRetentionAfterSecureRate(effectiveFixture);
  const starEvidenceDedup = computeStarEvidenceDedup(effectiveFixture);
  const depthValues = computeDepthValues();
  const duplicateSignatureCount = computeDuplicateSignatureCount(manifest);
  const duplicateStemModelClusters = computeDuplicateStemModelClusters(manifest);
  const unsupportedReservedEvents = computeUnsupportedReservedEvents();
  const emittedEventCount = countEmittedEvents();

  return {
    signatureExposure,
    signatureRepeatRate,
    schedulerReasonDistribution,
    misconceptionRetryRate,
    spacedReturnRate,
    retentionAfterSecureRate,
    starEvidenceDedup,
    depthValues,
    duplicateSignatureCount,
    duplicateStemModelClusters,
    unsupportedReservedEvents,
    emittedEventCount,
  };
}

// ─── Markdown formatting ────────────────────────────────────────────────────

export function formatHealthReportMarkdown(report) {
  const lines = [];

  lines.push('# Punctuation QG Learning-Health Report');
  lines.push('');

  // a. Signature exposure
  lines.push('## Signature Exposure');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total generated items | ${report.signatureExposure.totalGeneratedItems} |`);
  lines.push(`| Distinct signatures | ${report.signatureExposure.distinctSignatures} |`);
  lines.push(`| Emitted event count | ${report.emittedEventCount} |`);
  lines.push('');

  // b. Signature repeat rate
  lines.push('## Signature Repeat Rate');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total distinct signatures | ${report.signatureRepeatRate.totalSignatures} |`);
  lines.push(`| Duplicate signature count | ${report.signatureRepeatRate.duplicateSignatureCount} |`);
  lines.push('');

  // c. Scheduler reason distribution
  lines.push('## Scheduler Reason Distribution');
  lines.push('');
  lines.push('| Reason | Count |');
  lines.push('|--------|-------|');
  for (const [reason, count] of Object.entries(report.schedulerReasonDistribution.reasonCounts)) {
    lines.push(`| ${reason} | ${count} |`);
  }
  lines.push(`| **Total** | **${report.schedulerReasonDistribution.totalAttempts}** |`);
  lines.push('');

  // d. Misconception retry
  lines.push('## Misconception Retry');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Scheduled | ${report.misconceptionRetryRate.scheduled} |`);
  lines.push(`| Passed | ${report.misconceptionRetryRate.passed} |`);
  lines.push(`| Pass rate | ${report.misconceptionRetryRate.rate != null ? (report.misconceptionRetryRate.rate * 100).toFixed(1) + '%' : 'N/A'} |`);
  lines.push('');

  // e. Spaced return
  lines.push('## Spaced Return');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Scheduled | ${report.spacedReturnRate.scheduled} |`);
  lines.push(`| Passed | ${report.spacedReturnRate.passed} |`);
  lines.push(`| Pass rate | ${report.spacedReturnRate.rate != null ? (report.spacedReturnRate.rate * 100).toFixed(1) + '%' : 'N/A'} |`);
  lines.push('');

  // f. Retention after secure
  lines.push('## Retention After Secure');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Scheduled | ${report.retentionAfterSecureRate.scheduled} |`);
  lines.push(`| Passed | ${report.retentionAfterSecureRate.passed} |`);
  lines.push(`| Pass rate | ${report.retentionAfterSecureRate.rate != null ? (report.retentionAfterSecureRate.rate * 100).toFixed(1) + '%' : 'N/A'} |`);
  lines.push('');

  // g. Star evidence dedup
  lines.push('## Star Evidence Dedup');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Deduped by signature | ${report.starEvidenceDedup.dedupedBySignature} |`);
  lines.push(`| Deduped by template | ${report.starEvidenceDedup.dedupedByTemplate} |`);
  lines.push('');

  // h. Depth values
  lines.push('## Depth Values');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Production depth | ${report.depthValues.productionDepth} |`);
  lines.push(`| Capacity depth | ${report.depthValues.capacityDepth} |`);
  lines.push('');

  // i. Duplicate signature count
  lines.push('## Duplicate Signatures');
  lines.push('');
  lines.push(`Count: ${report.duplicateSignatureCount} (target: 0)`);
  lines.push('');

  // j. Duplicate stem/model clusters
  lines.push('## Duplicate Stem/Model Clusters');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Duplicate stems | ${report.duplicateStemModelClusters.duplicateStems} |`);
  lines.push(`| Duplicate models | ${report.duplicateStemModelClusters.duplicateModels} |`);
  lines.push('');

  // k. Unsupported/reserved events
  lines.push('## Unsupported/Reserved Telemetry Events');
  lines.push('');
  if (report.unsupportedReservedEvents.reserved.length === 0 && report.unsupportedReservedEvents.deprecated.length === 0) {
    lines.push('(none)');
  } else {
    if (report.unsupportedReservedEvents.reserved.length > 0) {
      lines.push('Reserved:');
      for (const entry of report.unsupportedReservedEvents.reserved) {
        lines.push(`  - ${entry.key}: ${entry.event}`);
      }
    }
    if (report.unsupportedReservedEvents.deprecated.length > 0) {
      lines.push('Deprecated:');
      for (const entry of report.unsupportedReservedEvents.deprecated) {
        lines.push(`  - ${entry.key}: ${entry.event}`);
      }
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Resolve fixture
  let fixture = null;
  if (args.fixture === 'synthetic') {
    fixture = createSyntheticFixture();
  }

  // Build report
  const report = buildHealthReport({ fixture });

  // Strict mode check
  if (args.strict) {
    const check = strictCheck();
    if (!check.ok) {
      process.stderr.write(`STRICT FAILURE: ${check.reason}\n`);
      process.exitCode = 1;
      return;
    }
  }

  // Output
  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatHealthReportMarkdown(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
