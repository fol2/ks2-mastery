#!/usr/bin/env node
/**
 * Grammar QG P7 — Mixed-Transfer Evidence Decision Gate (U6)
 *
 * CLI: node scripts/grammar-qg-mixed-transfer-decision.mjs
 *        --calibration=<mixed-transfer-calibration.json> --output=<decision.json>
 *
 * Or: import { decideMixedTransferMaturity } from './grammar-qg-mixed-transfer-decision.mjs'
 *
 * Decision logic:
 * - Count how many of the mixed-transfer templates have ≥30 attempts (medium) and ≥100 (high)
 * - If ≥6 templates at medium AND ≥3 at high → prepare_scoring_experiment
 * - If evidence shows clear harm → do_not_promote
 * - Otherwise → keep_shadow_only
 *
 * Analysis-only script — does not import or invoke any write/mutation modules.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Constants ────────────────────────────────────────────────────────────────

const MEDIUM_THRESHOLD = 30;
const HIGH_THRESHOLD = 100;
const MIN_MEDIUM_FOR_EXPERIMENT = 6;
const MIN_HIGH_FOR_EXPERIMENT = 3;
const HARM_THRESHOLD = 0.15; // mixed-transfer success must be ≥15% lower than local to flag harm

// ─── Decision logic ───────────────────────────────────────────────────────────

/**
 * Decide whether mixed-transfer scoring is mature enough to promote.
 *
 * @param {Object} mixedTransferReport - Output from buildMixedTransferCalibration
 * @returns {{ decision: string, perTemplateEvidence: Object[], summary: string, futureActionRef: string }}
 */
export function decideMixedTransferMaturity(mixedTransferReport) {
  const templates = mixedTransferReport?.templates || {};
  const templateIds = Object.keys(templates);

  // Build per-template evidence
  const perTemplateEvidence = [];
  let mediumCount = 0;
  let highCount = 0;
  let harmfulCount = 0;
  let highConfidenceHarmCount = 0;
  let highConfidenceTemplates = 0;

  for (const [tid, metrics] of Object.entries(templates)) {
    const attemptCount = metrics.attemptCount || 0;
    const successRate = metrics.successRate || 0;
    const conceptLocalSuccessRate = metrics.conceptLocalSuccessRate || 0;

    const isMedium = attemptCount >= MEDIUM_THRESHOLD;
    const isHigh = attemptCount >= HIGH_THRESHOLD;
    if (isMedium) mediumCount++;
    if (isHigh) highCount++;

    // Harm detection: mixed-transfer success significantly lower than local
    const gap = conceptLocalSuccessRate - successRate;
    const harmful = gap > HARM_THRESHOLD && isMedium;
    if (harmful) harmfulCount++;
    if (harmful && isHigh) {
      highConfidenceHarmCount++;
      highConfidenceTemplates++;
    } else if (isHigh) {
      highConfidenceTemplates++;
    }

    perTemplateEvidence.push({
      templateId: tid,
      attemptCount,
      successRate,
      conceptLocalSuccessRate,
      gap: Math.round(gap * 1000) / 1000,
      confidenceLevel: isHigh ? 'high' : isMedium ? 'medium' : 'low',
      harmful,
    });
  }

  // Decision logic
  let decision;
  let summary;

  // Clear harm: majority of high-confidence templates show harm
  if (highConfidenceTemplates > 0 && highConfidenceHarmCount / highConfidenceTemplates > 0.5) {
    decision = 'do_not_promote';
    summary = `Mixed-transfer shows clear harm: ${highConfidenceHarmCount}/${highConfidenceTemplates} high-confidence templates have success significantly lower than local practice. Do not promote to scored mode.`;
  }
  // Sufficient maturity for experiment
  else if (mediumCount >= MIN_MEDIUM_FOR_EXPERIMENT && highCount >= MIN_HIGH_FOR_EXPERIMENT) {
    decision = 'prepare_scoring_experiment';
    summary = `Mixed-transfer evidence sufficient: ${mediumCount} templates at medium confidence, ${highCount} at high confidence. Ready for controlled scoring experiment.`;
  }
  // Insufficient evidence
  else {
    decision = 'keep_shadow_only';
    summary = `Insufficient maturity: only ${mediumCount} templates at medium (need ${MIN_MEDIUM_FOR_EXPERIMENT}) and ${highCount} at high (need ${MIN_HIGH_FOR_EXPERIMENT}). Keep in shadow-only mode.`;
  }

  return {
    decision,
    perTemplateEvidence,
    summary,
    futureActionRef: 'Requires separate reviewed scoring plan',
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        args[arg.slice(2)] = true;
      }
    }
  }
  return args;
}

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.calibration || !args.output) {
    console.error(
      'Usage: grammar-qg-mixed-transfer-decision.mjs --calibration=<mixed-transfer-calibration.json> --output=<decision.json>',
    );
    process.exit(1);
  }

  const mixedTransferReport = JSON.parse(readFileSync(path.resolve(args.calibration), 'utf-8'));
  const result = decideMixedTransferMaturity(mixedTransferReport);

  const outputPath = path.resolve(args.output);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');

  console.log(`Mixed-transfer decision: ${result.decision}`);
  console.log(`  ${result.summary}`);
  console.log(`  Templates analysed: ${result.perTemplateEvidence.length}`);
}
