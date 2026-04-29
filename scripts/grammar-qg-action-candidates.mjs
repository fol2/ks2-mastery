#!/usr/bin/env node
/**
 * Grammar QG P7 — Evidence-led Action Candidate Generation (U5)
 *
 * CLI: node scripts/grammar-qg-action-candidates.mjs
 *        --health=<health.json> --mixed-transfer=<mt.json>
 *        --retention=<retention.json> --output=<output.json>
 *        [--output-md=<output.md>]
 *
 * Or: import { generateActionCandidates } from './grammar-qg-action-candidates.mjs'
 *
 * Classifies each template/concept into one of 9 action categories based on
 * evidence from health, mixed-transfer, and retention reports.
 *
 * Analysis-only script — does not import or invoke any write/mutation modules.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 30; // non-keep candidates require ≥30 attempts

const CATEGORIES = {
  KEEP: 'keep',
  WARM_UP_ONLY: 'warm_up_only',
  REVIEW_WORDING: 'review_wording',
  ADD_BRIDGE_PRACTICE: 'add_bridge_practice',
  EXPAND_CASE_BANK: 'expand_case_bank',
  REWRITE_DISTRACTORS: 'rewrite_distractors',
  REDUCE_SCHEDULER_WEIGHT: 'reduce_scheduler_weight',
  RETIRE_CANDIDATE: 'retire_candidate',
  INCREASE_MAINTENANCE: 'increase_maintenance',
  INSUFFICIENT_DATA: 'insufficient_data',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function confidenceLevel(count) {
  if (count > 100) return 'high';
  if (count >= 30) return 'medium';
  if (count >= 10) return 'low';
  return 'insufficient';
}

// ─── Classification logic ─────────────────────────────────────────────────────

/**
 * Classify a single template into an action category.
 *
 * @param {string} templateId
 * @param {Object} healthMetrics - From health report templates[templateId]
 * @param {Object|null} mixedTransferMetrics - From mixed-transfer report templates[templateId]
 * @param {Object} conceptRetentionFlags - Map of conceptId→retentionGapFlagged
 * @returns {Object} Action candidate
 */
function classifyTemplate(templateId, healthMetrics, mixedTransferMetrics, conceptRetentionFlags) {
  const attemptCount = healthMetrics.attemptCount || 0;
  const confidence = confidenceLevel(attemptCount);
  const conceptId = healthMetrics.conceptId || templateId.split('-').slice(1, -1).join('-') || templateId;

  // Base candidate structure
  const base = {
    templateId,
    conceptId,
    confidence,
    evidenceCount: attemptCount,
    sourceMetrics: {
      classification: healthMetrics.classification,
      attemptCount,
      independentFirstAttemptSuccessRate: healthMetrics.independentFirstAttemptSuccessRate,
      wrongAfterSupportRate: healthMetrics.wrongAfterSupportRate,
      retrySuccessRate: healthMetrics.retrySuccessRate,
      retryAttemptCount: healthMetrics.retryAttemptCount,
      medianElapsedBucket: healthMetrics.medianElapsedBucket,
    },
  };

  // Below confidence threshold → always insufficient_data (never non-keep)
  if (attemptCount < CONFIDENCE_THRESHOLD) {
    return {
      ...base,
      category: CATEGORIES.INSUFFICIENT_DATA,
      rationale: `Only ${attemptCount} attempts recorded — below the ${CONFIDENCE_THRESHOLD}-attempt confidence threshold for action classification.`,
    };
  }

  // 1. too_easy with high confidence (>95% success, >100 attempts) → warm_up_only
  if (
    healthMetrics.classification === 'too_easy' &&
    attemptCount > 100 &&
    healthMetrics.independentFirstAttemptSuccessRate > 0.95
  ) {
    return {
      ...base,
      category: CATEGORIES.WARM_UP_ONLY,
      rationale: `Template classified as too_easy with ${(healthMetrics.independentFirstAttemptSuccessRate * 100).toFixed(1)}% independent success across ${attemptCount} attempts. Consider as warm-up only.`,
    };
  }

  // 2. ambiguous classification OR high wrongAfterSupportRate (>40%) → review_wording
  if (
    healthMetrics.classification === 'ambiguous' ||
    healthMetrics.wrongAfterSupportRate > 0.4
  ) {
    return {
      ...base,
      category: CATEGORIES.REVIEW_WORDING,
      rationale: `Template flagged as ${healthMetrics.classification} with wrongAfterSupportRate=${(healthMetrics.wrongAfterSupportRate * 100).toFixed(1)}%. Wording review recommended.`,
    };
  }

  // 3. transfer_gap flagged (local healthy, mixed weak) → add_bridge_practice
  if (mixedTransferMetrics && mixedTransferMetrics.transferGapFlagged) {
    return {
      ...base,
      category: CATEGORIES.ADD_BRIDGE_PRACTICE,
      rationale: `Transfer gap detected: local success healthy but mixed-transfer success significantly lower (${(mixedTransferMetrics.successRate * 100).toFixed(1)}%). Bridge practice needed.`,
    };
  }

  // 4. support_dependent + >100 attempts → retire_candidate
  if (healthMetrics.classification === 'support_dependent' && attemptCount > 100) {
    return {
      ...base,
      category: CATEGORIES.RETIRE_CANDIDATE,
      rationale: `Persistently support_dependent after ${attemptCount} attempts. Template cannot be answered independently — retirement candidate.`,
    };
  }

  // 5. retry_ineffective + >100 attempts → retire_candidate
  if (healthMetrics.classification === 'retry_ineffective' && attemptCount > 100) {
    return {
      ...base,
      category: CATEGORIES.RETIRE_CANDIDATE,
      rationale: `Retry ineffective after ${attemptCount} attempts (retry success rate ${(healthMetrics.retrySuccessRate * 100).toFixed(1)}%). Retirement candidate.`,
    };
  }

  // 6. rewrite_distractors — emit if tagged as support_dependent (proxy for distractor clustering)
  if (healthMetrics.classification === 'support_dependent' && attemptCount <= 100) {
    return {
      ...base,
      category: CATEGORIES.REWRITE_DISTRACTORS,
      rationale: `Support-dependent classification suggests distractor issues — learners cannot succeed independently. Distractor rewrite recommended.`,
    };
  }

  // 7. too_hard with high confidence → reduce_scheduler_weight
  if (healthMetrics.classification === 'too_hard') {
    return {
      ...base,
      category: CATEGORIES.REDUCE_SCHEDULER_WEIGHT,
      rationale: `Template classified as too_hard (independent success ${(healthMetrics.independentFirstAttemptSuccessRate * 100).toFixed(1)}%) with ${confidence} confidence. Scheduler weight reduction recommended.`,
    };
  }

  // 8. high use + retry rate >30% OR timing collapse (median >20s with >50 attempts) → expand_case_bank
  const retryRate = safeRate(healthMetrics.retryAttemptCount, attemptCount);
  if (
    (attemptCount > 50 && retryRate > 0.3) ||
    (healthMetrics.medianElapsedBucket === '>20s' && attemptCount > 50)
  ) {
    return {
      ...base,
      category: CATEGORIES.EXPAND_CASE_BANK,
      rationale: `High retry rate (${(retryRate * 100).toFixed(1)}%) or timing collapse (${healthMetrics.medianElapsedBucket}) across ${attemptCount} attempts. Case bank expansion needed.`,
    };
  }

  // 9. retention_gap for associated concept → increase_maintenance
  if (conceptRetentionFlags[conceptId]) {
    return {
      ...base,
      category: CATEGORIES.INCREASE_MAINTENANCE,
      rationale: `Concept "${conceptId}" flagged with retention gap (lapse rate >${conceptRetentionFlags[conceptId].lapseRate ? (conceptRetentionFlags[conceptId].lapseRate * 100).toFixed(0) : '25'}%). Increased maintenance scheduling recommended.`,
    };
  }

  // Default: healthy and stable → keep
  return {
    ...base,
    category: CATEGORIES.KEEP,
    rationale: `Template healthy and stable with ${confidence} confidence. No action required.`,
  };
}

// ─── Main generation function ─────────────────────────────────────────────────

/**
 * Generate action candidates from calibration sub-reports.
 *
 * @param {Object} healthReport - Output from buildTemplateHealthReport
 * @param {Object} mixedTransferReport - Output from buildMixedTransferCalibration
 * @param {Object} retentionReport - Output from buildRetentionReport
 * @returns {{ candidates: Object[], summary: Object }}
 */
export function generateActionCandidates(healthReport, mixedTransferReport, retentionReport) {
  const candidates = [];

  // Build retention gap flags from retention report
  const conceptRetentionFlags = {};
  if (retentionReport && retentionReport.concepts) {
    for (const [cid, concept] of Object.entries(retentionReport.concepts)) {
      if (concept.classification === 'retention_risk' || concept.lapseRate > 0.25) {
        conceptRetentionFlags[cid] = {
          lapseRate: concept.lapseRate,
          securedAttempts: concept.securedAttemptCount,
        };
      }
    }
  }

  // Build mixed-transfer flags
  const mixedTransferFlags = {};
  if (mixedTransferReport && mixedTransferReport.templates) {
    for (const [tid, tmpl] of Object.entries(mixedTransferReport.templates)) {
      // Transfer gap: local success healthy but mixed success significantly lower
      if (
        tmpl.conceptLocalSuccessRate > 0.7 &&
        tmpl.successRate < 0.5 &&
        tmpl.attemptCount >= 10
      ) {
        mixedTransferFlags[tid] = { ...tmpl, transferGapFlagged: true };
      } else {
        mixedTransferFlags[tid] = tmpl;
      }
    }
  }

  // Process each template from health report
  if (healthReport && healthReport.templates) {
    for (const [tid, metrics] of Object.entries(healthReport.templates)) {
      const mtMetrics = mixedTransferFlags[tid] || null;
      const candidate = classifyTemplate(tid, metrics, mtMetrics, conceptRetentionFlags);
      candidates.push(candidate);
    }
  }

  // Process concept-level retention gaps not covered by templates
  for (const [cid, retFlag] of Object.entries(conceptRetentionFlags)) {
    const alreadyCovered = candidates.some(
      (c) => c.conceptId === cid && c.category === CATEGORIES.INCREASE_MAINTENANCE,
    );
    if (!alreadyCovered) {
      candidates.push({
        templateId: `concept:${cid}`,
        conceptId: cid,
        category: CATEGORIES.INCREASE_MAINTENANCE,
        confidence: retFlag.securedAttempts > 100 ? 'high' : retFlag.securedAttempts >= 30 ? 'medium' : 'low',
        evidenceCount: retFlag.securedAttempts,
        rationale: `Concept "${cid}" has retention gap with lapse rate ${(retFlag.lapseRate * 100).toFixed(1)}% across ${retFlag.securedAttempts} secured attempts.`,
        sourceMetrics: { lapseRate: retFlag.lapseRate, securedAttempts: retFlag.securedAttempts },
      });
    }
  }

  // Summary statistics
  const categoryCounts = {};
  for (const c of candidates) {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  }

  return {
    candidates,
    summary: {
      totalCandidates: candidates.length,
      categoryCounts,
      actionableCount: candidates.filter(
        (c) => c.category !== CATEGORIES.KEEP && c.category !== CATEGORIES.INSUFFICIENT_DATA,
      ).length,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ─── Markdown formatting ──────────────────────────────────────────────────────

function formatMarkdown(result) {
  const lines = [
    '# Grammar QG P7 — Action Candidates Report',
    '',
    `Generated: ${result.summary.generatedAt}`,
    `Total candidates: ${result.summary.totalCandidates}`,
    `Actionable (non-keep, non-insufficient): ${result.summary.actionableCount}`,
    '',
    '## Category Breakdown',
    '',
  ];

  for (const [cat, count] of Object.entries(result.summary.categoryCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${cat}**: ${count}`);
  }

  lines.push('', '## Actionable Candidates', '', '| Template | Category | Confidence | Evidence | Rationale |');
  lines.push('|---|---|---|---|---|');

  for (const c of result.candidates) {
    if (c.category === CATEGORIES.KEEP || c.category === CATEGORIES.INSUFFICIENT_DATA) continue;
    lines.push(`| ${c.templateId} | ${c.category} | ${c.confidence} | ${c.evidenceCount} | ${c.rationale} |`);
  }

  return lines.join('\n');
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

  if (!args.health || !args['mixed-transfer'] || !args.retention || !args.output) {
    console.error(
      'Usage: grammar-qg-action-candidates.mjs --health=<health.json> --mixed-transfer=<mt.json> --retention=<retention.json> --output=<output.json> [--output-md=<output.md>]',
    );
    process.exit(1);
  }

  const healthReport = JSON.parse(readFileSync(path.resolve(args.health), 'utf-8'));
  const mixedTransferReport = JSON.parse(readFileSync(path.resolve(args['mixed-transfer']), 'utf-8'));
  const retentionReport = JSON.parse(readFileSync(path.resolve(args.retention), 'utf-8'));

  const result = generateActionCandidates(healthReport, mixedTransferReport, retentionReport);

  const outputPath = path.resolve(args.output);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');

  if (args['output-md']) {
    writeFileSync(path.resolve(args['output-md']), formatMarkdown(result) + '\n');
  }

  console.log(`Action candidates written to ${outputPath}`);
  console.log(`  Total: ${result.summary.totalCandidates}`);
  console.log(`  Actionable: ${result.summary.actionableCount}`);
  for (const [cat, count] of Object.entries(result.summary.categoryCounts)) {
    console.log(`    ${cat}: ${count}`);
  }
}
