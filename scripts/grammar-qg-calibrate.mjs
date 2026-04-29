#!/usr/bin/env node
/**
 * Grammar QG P7 — Calibration Report Runner
 *
 * CLI: node scripts/grammar-qg-calibrate.mjs --input=<expanded-events.json> [--output-dir=reports/grammar]
 *
 * Runs all three P6 sub-reports (health, mixed-transfer, retention) and generates
 * cross-report classifications:
 * - transfer_gap: local success >70% AND mixed-transfer <50% AND >=10 attempts each
 * - retention_gap: secure concepts lapse >25% with medium+ confidence (>=30 secured attempts)
 * - weakCorrectAttemptRate: correct attempts where conceptStatusBefore === 'weak' / total weak attempts
 * - weakToSecureRecoveryRate: weak→secure/secured transitions / total weak attempts
 *
 * Outputs 4 JSON files + provenance metadata.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplateHealthReport } from './grammar-qg-health-report.mjs';
import { buildMixedTransferCalibration } from './grammar-qg-mixed-transfer-calibration.mjs';
import { buildRetentionReport } from './grammar-qg-retention-monitor.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SCHEMA_VERSION = 'grammar-qg-p7-calibration-v1';

// ─── Helpers ───────────────────────────────────────────────────────────────

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Normalise rows for sub-reports: convert numeric createdAt (epoch ms)
 * to ISO string for the `timestamp` field.
 *
 * @param {Object[]} rows - Expanded event rows
 * @returns {Object[]} Normalised rows with valid timestamp strings
 */
function normaliseRows(rows) {
  return rows.map((row) => {
    const result = { ...row };

    // If timestamp is already a valid ISO string, keep it
    if (typeof result.timestamp === 'string' && result.timestamp.length > 0) {
      return result;
    }

    // Convert numeric createdAt (epoch ms) to ISO string
    if (typeof result.createdAt === 'number' && result.createdAt > 0) {
      result.timestamp = new Date(result.createdAt).toISOString();
      return result;
    }

    // Convert string createdAt that is numeric
    if (typeof result.createdAt === 'string' && /^\d+$/.test(result.createdAt)) {
      result.timestamp = new Date(Number(result.createdAt)).toISOString();
      return result;
    }

    // If createdAt is already an ISO string, use it as timestamp
    if (typeof result.createdAt === 'string' && result.createdAt.length > 0) {
      result.timestamp = result.createdAt;
      return result;
    }

    return result;
  });
}

// ─── Cross-report classifications ──────────────────────────────────────────

/**
 * Compute cross-report calibration classifications from normalised events.
 *
 * @param {Object[]} events - Normalised expanded events
 * @returns {Object} Classification results per concept
 */
function computeClassifications(events) {
  const conceptStats = {};

  for (const event of events) {
    const cid = event.conceptId;
    if (!cid) continue;

    if (!conceptStats[cid]) {
      conceptStats[cid] = {
        localCorrect: 0,
        localAttempts: 0,
        mixedCorrect: 0,
        mixedAttempts: 0,
        securedAttempts: 0,
        securedLapses: 0,
        weakCorrect: 0,
        weakAttempts: 0,
        weakToSecureRecoveries: 0,
      };
    }

    const cs = conceptStats[cid];
    const correct = !!event.correct;
    const tags = Array.isArray(event.tags) ? event.tags : [];
    const isMixed = tags.includes('mixed-transfer') || !!event.isMixedTransfer;
    const conceptStatusBefore = event.conceptStatusBefore || 'new';
    const conceptStatusAfter = event.conceptStatusAfter || '';

    // Local vs mixed attempt tracking
    if (isMixed) {
      cs.mixedAttempts++;
      if (correct) cs.mixedCorrect++;
    } else {
      cs.localAttempts++;
      if (correct) cs.localCorrect++;
    }

    // Secured concept tracking
    if (conceptStatusBefore === 'secured') {
      cs.securedAttempts++;
      if (!correct) cs.securedLapses++;
    }

    // Weak concept tracking
    if (conceptStatusBefore === 'weak') {
      cs.weakAttempts++;
      if (correct) cs.weakCorrect++;
      if (conceptStatusAfter === 'secure' || conceptStatusAfter === 'secured') {
        cs.weakToSecureRecoveries++;
      }
    }
  }

  // Build classifications
  const transferGaps = {};
  const retentionGaps = {};
  const weakMetrics = {};

  for (const [cid, cs] of Object.entries(conceptStats)) {
    const localRate = safeRate(cs.localCorrect, cs.localAttempts);
    const mixedRate = safeRate(cs.mixedCorrect, cs.mixedAttempts);
    const lapseRate = safeRate(cs.securedLapses, cs.securedAttempts);
    const weakCorrectRate = safeRate(cs.weakCorrect, cs.weakAttempts);
    const weakRecoveryRate = safeRate(cs.weakToSecureRecoveries, cs.weakAttempts);

    // transfer_gap: local >70% AND mixed <50% AND >=10 attempts in EACH modality
    if (cs.localAttempts >= 10 && cs.mixedAttempts >= 10 && localRate > 0.7 && mixedRate < 0.5) {
      transferGaps[cid] = {
        localSuccessRate: localRate,
        mixedSuccessRate: mixedRate,
        localAttempts: cs.localAttempts,
        mixedAttempts: cs.mixedAttempts,
        gap: localRate - mixedRate,
      };
    }

    // retention_gap: lapse >25% with medium+ confidence (>=30 secured attempts)
    if (cs.securedAttempts >= 30 && lapseRate > 0.25) {
      retentionGaps[cid] = {
        lapseRate,
        securedAttempts: cs.securedAttempts,
        securedLapses: cs.securedLapses,
        confidence: cs.securedAttempts > 100 ? 'high' : 'medium',
      };
    }

    // Weak metrics (only if there are weak attempts)
    if (cs.weakAttempts > 0) {
      weakMetrics[cid] = {
        weakCorrectAttemptRate: weakCorrectRate,
        weakToSecureRecoveryRate: weakRecoveryRate,
        weakAttempts: cs.weakAttempts,
        weakCorrect: cs.weakCorrect,
        weakToSecureRecoveries: cs.weakToSecureRecoveries,
      };
    }
  }

  return { transferGaps, retentionGaps, weakMetrics };
}

// ─── Main calibration runner ───────────────────────────────────────────────

/**
 * Run the full calibration pipeline: sub-reports + cross-report classifications.
 *
 * @param {Object[]} expandedEvents - Expanded event rows (from expandEvents)
 * @param {Object} [options]
 * @param {string} [options.outputDir] - Output directory
 * @returns {{ healthReport: Object, mixedTransferReport: Object, retentionReport: Object, classifications: Object, provenance: Object }}
 */
export function runCalibration(expandedEvents, options = {}) {
  // Normalise rows — convert numeric createdAt to ISO timestamp
  const normalised = normaliseRows(expandedEvents);

  // Run sub-reports
  const healthReport = buildTemplateHealthReport(normalised);
  const mixedTransferReport = buildMixedTransferCalibration(normalised);
  const retentionReport = buildRetentionReport(normalised);

  // Cross-report classifications
  const classifications = computeClassifications(normalised);

  // Provenance metadata
  const provenance = {
    calibrationSchemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    inputRowCount: expandedEvents.length,
    normalisedRowCount: normalised.length,
    transferGapCount: Object.keys(classifications.transferGaps).length,
    retentionGapCount: Object.keys(classifications.retentionGaps).length,
    weakMetricsCount: Object.keys(classifications.weakMetrics).length,
  };

  return {
    healthReport: { ...healthReport, provenance: { calibrationSchemaVersion: SCHEMA_VERSION } },
    mixedTransferReport: { ...mixedTransferReport, provenance: { calibrationSchemaVersion: SCHEMA_VERSION } },
    retentionReport: { ...retentionReport, provenance: { calibrationSchemaVersion: SCHEMA_VERSION } },
    classifications: { ...classifications, provenance },
  };
}

// ─── CLI ───────────────────────────────────────────────────────────────────

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

  if (!args.input) {
    console.error('Usage: grammar-qg-calibrate.mjs --input=<expanded-events.json> [--output-dir=reports/grammar]');
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  const outputDir = args['output-dir'] || path.join(ROOT_DIR, 'reports', 'grammar');

  const raw = readFileSync(inputPath, 'utf-8');
  const events = JSON.parse(raw);

  if (!Array.isArray(events)) {
    console.error('Input must be a JSON array of expanded events');
    process.exit(1);
  }

  const result = runCalibration(events);

  mkdirSync(outputDir, { recursive: true });

  writeFileSync(
    path.join(outputDir, 'grammar-qg-p7-health-report.json'),
    JSON.stringify(result.healthReport, null, 2) + '\n',
  );
  writeFileSync(
    path.join(outputDir, 'grammar-qg-p7-mixed-transfer.json'),
    JSON.stringify(result.mixedTransferReport, null, 2) + '\n',
  );
  writeFileSync(
    path.join(outputDir, 'grammar-qg-p7-retention.json'),
    JSON.stringify(result.retentionReport, null, 2) + '\n',
  );
  writeFileSync(
    path.join(outputDir, 'grammar-qg-p7-classifications.json'),
    JSON.stringify(result.classifications, null, 2) + '\n',
  );

  console.log(`Calibration reports written to ${outputDir}`);
  console.log(`  Transfer gaps: ${result.classifications.provenance.transferGapCount}`);
  console.log(`  Retention gaps: ${result.classifications.provenance.retentionGapCount}`);
  console.log(`  Weak metrics: ${result.classifications.provenance.weakMetricsCount}`);
  console.log(`  Schema version: ${SCHEMA_VERSION}`);
}
