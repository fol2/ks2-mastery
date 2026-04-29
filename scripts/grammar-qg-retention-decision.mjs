#!/usr/bin/env node
/**
 * Grammar QG P7 — Retention-After-Secure Maintenance Decision Gate (U7)
 *
 * CLI: node scripts/grammar-qg-retention-decision.mjs
 *        --retention=<retention-report.json> --output=<decision.json>
 *
 * Or: import { decideRetentionMaintenance } from './grammar-qg-retention-decision.mjs'
 *
 * Decision logic:
 * - Per concept: count secured attempts, compute lapse rate, days-to-first-lapse
 * - If average lapse rate >20% across concepts with ≥30 secured attempts → recommend_maintenance_experiment
 * - If insufficient data (<30 secured attempts average) → defer_insufficient_data
 * - If lapse rate <10% → no_action_needed
 * - Template-family clustering: group lapses by generatorFamilyId, report highest lapse concentration
 *
 * Analysis-only script — does not import or invoke any write/mutation modules.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Constants ────────────────────────────────────────────────────────────────

const SUFFICIENT_SECURED_ATTEMPTS = 30;
const HIGH_LAPSE_THRESHOLD = 0.2;
const LOW_LAPSE_THRESHOLD = 0.1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Derive generatorFamilyId from templateId.
 * Convention: strip trailing `-NN` digits to get family.
 * E.g. "tpl-possessive-apostrophe-01" → "tpl-possessive-apostrophe"
 */
function deriveFamily(templateId) {
  if (!templateId || typeof templateId !== 'string') return 'unknown';
  // Strip concept: prefix for concept-level entries
  if (templateId.startsWith('concept:')) return templateId;
  // Strip trailing number segment
  const parts = templateId.split('-');
  const lastPart = parts[parts.length - 1];
  if (/^\d+$/.test(lastPart) && parts.length > 1) {
    return parts.slice(0, -1).join('-');
  }
  return templateId;
}

// ─── Decision logic ───────────────────────────────────────────────────────────

/**
 * Decide whether retention-after-secure warrants a maintenance experiment.
 *
 * @param {Object} retentionReport - Output from buildRetentionReport
 * @returns {{ decision: string, perConceptEvidence: Object[], familyClustering: Object[], summary: string, futureActionRef: string }}
 */
export function decideRetentionMaintenance(retentionReport) {
  const concepts = retentionReport?.concepts || {};
  const conceptIds = Object.keys(concepts);

  // Build per-concept evidence
  const perConceptEvidence = [];
  const sufficientConcepts = [];
  const familyLapseMap = {};

  for (const [cid, concept] of Object.entries(concepts)) {
    const securedAttempts = concept.securedAttemptCount || 0;
    const lapseRate = concept.lapseRate || 0;
    const daysToFirstLapse = concept.daysFromSecureToFirstLapse ?? null;
    const hasSufficientData = securedAttempts >= SUFFICIENT_SECURED_ATTEMPTS;

    const evidence = {
      conceptId: cid,
      securedAttempts,
      lapseRate,
      daysToFirstLapse,
      hasSufficientData,
      classification: concept.classification || 'unknown',
    };
    perConceptEvidence.push(evidence);

    if (hasSufficientData) {
      sufficientConcepts.push(evidence);
    }

    // Family clustering — derive family from conceptId
    const family = deriveFamily(cid);
    if (!familyLapseMap[family]) {
      familyLapseMap[family] = { totalLapses: 0, totalAttempts: 0, concepts: [] };
    }
    if (securedAttempts > 0) {
      const lapseCount = Math.round(lapseRate * securedAttempts);
      familyLapseMap[family].totalLapses += lapseCount;
      familyLapseMap[family].totalAttempts += securedAttempts;
      familyLapseMap[family].concepts.push(cid);
    }
  }

  // Compute family clustering results
  const familyClustering = Object.entries(familyLapseMap)
    .map(([family, data]) => ({
      generatorFamilyId: family,
      lapseRate: safeRate(data.totalLapses, data.totalAttempts),
      totalLapses: data.totalLapses,
      totalAttempts: data.totalAttempts,
      conceptCount: data.concepts.length,
      concepts: data.concepts,
    }))
    .filter((f) => f.totalAttempts > 0)
    .sort((a, b) => b.lapseRate - a.lapseRate);

  // Decision logic
  let decision;
  let summary;

  if (sufficientConcepts.length === 0) {
    decision = 'defer_insufficient_data';
    summary = `No concepts have ≥${SUFFICIENT_SECURED_ATTEMPTS} secured attempts. Cannot make a maintenance decision — defer until more data accumulates.`;
  } else {
    // Average lapse rate across concepts with sufficient data
    const avgLapseRate =
      sufficientConcepts.reduce((sum, c) => sum + c.lapseRate, 0) / sufficientConcepts.length;

    if (avgLapseRate > HIGH_LAPSE_THRESHOLD) {
      decision = 'recommend_maintenance_experiment';
      summary = `Average lapse rate ${(avgLapseRate * 100).toFixed(1)}% across ${sufficientConcepts.length} concepts with sufficient data exceeds ${HIGH_LAPSE_THRESHOLD * 100}% threshold. Maintenance scheduling experiment recommended.`;
    } else if (avgLapseRate < LOW_LAPSE_THRESHOLD) {
      decision = 'no_action_needed';
      summary = `Average lapse rate ${(avgLapseRate * 100).toFixed(1)}% across ${sufficientConcepts.length} concepts with sufficient data is below ${LOW_LAPSE_THRESHOLD * 100}% threshold. Retention is healthy.`;
    } else {
      // Between 10% and 20% — monitor but no action
      decision = 'no_action_needed';
      summary = `Average lapse rate ${(avgLapseRate * 100).toFixed(1)}% across ${sufficientConcepts.length} concepts is between thresholds. Monitoring continues — no immediate action required.`;
    }
  }

  return {
    decision,
    perConceptEvidence,
    familyClustering,
    summary,
    futureActionRef: 'Requires separate scheduler adjustment plan',
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

  if (!args.retention || !args.output) {
    console.error(
      'Usage: grammar-qg-retention-decision.mjs --retention=<retention-report.json> --output=<decision.json>',
    );
    process.exit(1);
  }

  const retentionReport = JSON.parse(readFileSync(path.resolve(args.retention), 'utf-8'));
  const result = decideRetentionMaintenance(retentionReport);

  const outputPath = path.resolve(args.output);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');

  console.log(`Retention maintenance decision: ${result.decision}`);
  console.log(`  ${result.summary}`);
  console.log(`  Concepts analysed: ${result.perConceptEvidence.length}`);
  if (result.familyClustering.length > 0) {
    console.log(`  Highest-lapse family: ${result.familyClustering[0].generatorFamilyId} (${(result.familyClustering[0].lapseRate * 100).toFixed(1)}%)`);
  }
}
