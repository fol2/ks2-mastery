#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildGrammarQuestionGeneratorAudit } from './audit-grammar-question-generator.mjs';
import { buildGrammarContentQualityAudit } from './audit-grammar-content-quality.mjs';
import { validateReportAgainstManifest, validateEvidenceManifest } from './validate-grammar-qg-certification-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Extract the denominator table from a completion report markdown string.
 * Returns a Map of measure name (lowercased) → raw value string.
 */
function extractDenominatorTable(reportContent) {
  const table = new Map();
  // Match markdown table rows with | Measure | Value | or multi-column variants
  const lines = reportContent.split(/\r?\n/);
  let inTable = false;
  let headerSeen = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect table start — look for a line with pipes containing 'Measure' or denominator-style headers
    if (!inTable && /\|\s*Measure\s*\|/i.test(trimmed)) {
      inTable = true;
      headerSeen = false;
      continue;
    }
    if (inTable && !headerSeen && /^\|[-\s|:]+\|$/.test(trimmed)) {
      headerSeen = true;
      continue;
    }
    if (inTable && headerSeen) {
      if (!trimmed.startsWith('|')) {
        inTable = false;
        continue;
      }
      const cells = trimmed.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        // Use the first column as key, second as value (ignore extra columns like movement)
        const key = cells[0].toLowerCase();
        const value = cells[1];
        table.set(key, value);
      }
    }
  }

  return table;
}

/**
 * Extract the content release block values (code-fenced block with key: value lines).
 */
function extractContentReleaseBlock(reportContent) {
  const values = new Map();
  const codeBlockMatch = reportContent.match(/```text\r?\n([\s\S]*?)```/);
  if (!codeBlockMatch) return values;

  const lines = codeBlockMatch[1].split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(.+?):\s+(.+)$/);
    if (match) {
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      values.set(key, value);
    }
  }
  return values;
}

/**
 * Extract claim text from the report for production smoke status.
 */
function extractProductionSmokeStatus(reportContent) {
  // Strip markdown bold/italic markers for matching
  const plain = reportContent.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
  // Look for lines like "Production smoke: repository smoke passed" or "Post-deploy smoke: passed"
  const repoSmokeMatch = plain.match(/(?:repository smoke|production smoke)[:\s]*(\w[\w\s]*)/i);
  const postDeployMatch = plain.match(/post-deploy(?:\s+production)?\s+smoke[:\s]*(\w[\w\s]*)/i);

  return {
    repositorySmoke: repoSmokeMatch ? repoSmokeMatch[1].trim().toLowerCase() : null,
    postDeploySmoke: postDeployMatch ? postDeployMatch[1].trim().toLowerCase() : null,
  };
}

/**
 * Extract YAML frontmatter as a flat key→value map.
 * Only handles top-level scalar and list fields (no nested objects).
 */
function extractFrontmatter(reportContent) {
  const fm = {};
  const fmBlock = reportContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmBlock) return fm;

  const lines = fmBlock[1].split(/\r?\n/);
  let currentKey = null;
  let currentList = null;

  for (const line of lines) {
    const scalarMatch = line.match(/^(\w[\w_]*):\s+(.+)$/);
    if (scalarMatch) {
      if (currentKey && currentList) fm[currentKey] = currentList;
      currentKey = scalarMatch[1];
      currentList = null;
      fm[currentKey] = scalarMatch[2].trim();
      continue;
    }
    const listStartMatch = line.match(/^(\w[\w_]*):\s*$/);
    if (listStartMatch) {
      if (currentKey && currentList) fm[currentKey] = currentList;
      currentKey = listStartMatch[1];
      currentList = [];
      continue;
    }
    const listItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (listItemMatch && currentList) {
      currentList.push(listItemMatch[1].trim());
      continue;
    }
  }
  if (currentKey && currentList) fm[currentKey] = currentList;
  return fm;
}

/**
 * Regex matching placeholder tokens that must never appear in release frontmatter values.
 * Matches exact tokens only — "pending-abcdef1" will NOT match because it contains more than the placeholder.
 */
const PLACEHOLDER_TOKEN_RE = /^(pending|todo|tbc|unknown|n\/a|tbd)$/i;

/**
 * Regex matching compound placeholder tokens — placeholder words combined with other
 * purely-alphabetic words via hyphens/underscores. Examples: "pending-report-commit",
 * "tbd-report", "report-pending", "todo-sha", "unknown-commit".
 * Values containing hex digits (e.g. "pending-abcdef1") are NOT matched because the
 * segments are not purely alphabetic.
 *
 * Also matches standalone dash-prefixed patterns like "todo-anything", "tbd-anything",
 * "unknown-anything" even with multiple segments.
 */
const COMPOUND_PLACEHOLDER_RE = /^(pending|todo|tbc|unknown|n\/a|tbd)([-_][a-z]+)+$|^([a-z]+[-_])+(pending|todo|tbc|unknown|n\/a|tbd)$/i;

/**
 * Returns true if the value is a placeholder token, compound placeholder, or empty string.
 */
function isPlaceholderValue(value) {
  if (typeof value !== 'string') return false;
  if (value.trim() === '') return true;
  const trimmed = value.trim();
  if (PLACEHOLDER_TOKEN_RE.test(trimmed)) return true;
  return COMPOUND_PLACEHOLDER_RE.test(trimmed);
}

/**
 * Validate release-gate frontmatter fields.
 * Required fields: implementation_prs (array), final_content_release_commit (string),
 * post_merge_fix_commits (array — may be empty), final_report_commit (string).
 *
 * P7 hardening: rejects placeholder tokens (pending, todo, tbc, unknown, n/a, tbd, empty string).
 */
export function validateReleaseFrontmatter(reportContent) {
  const fm = extractFrontmatter(reportContent);
  const errors = [];

  // implementation_prs — must be a non-empty array of strings
  if (!Array.isArray(fm.implementation_prs) || fm.implementation_prs.length === 0) {
    errors.push({ field: 'implementation_prs', message: 'Must be a non-empty list of PR references' });
  } else {
    // Check each PR reference for placeholder values
    for (const pr of fm.implementation_prs) {
      if (isPlaceholderValue(pr)) {
        errors.push({ field: 'implementation_prs', message: `Contains placeholder value: "${pr}"` });
        break;
      }
    }
  }

  // final_content_release_commit — must be a non-empty string (commit SHA or ref)
  if (typeof fm.final_content_release_commit !== 'string' || fm.final_content_release_commit.length < 7) {
    errors.push({ field: 'final_content_release_commit', message: 'Must be a commit SHA (at least 7 characters)' });
  } else if (isPlaceholderValue(fm.final_content_release_commit)) {
    errors.push({ field: 'final_content_release_commit', message: `Contains placeholder value: "${fm.final_content_release_commit}"` });
  }

  // post_merge_fix_commits — must be an array (may be empty)
  if (!Array.isArray(fm.post_merge_fix_commits)) {
    // Tolerate "none" or missing by treating non-array as empty
    if (fm.post_merge_fix_commits && fm.post_merge_fix_commits !== 'none') {
      errors.push({ field: 'post_merge_fix_commits', message: 'Must be a list (use empty list [] if none)' });
    }
  } else {
    for (const commit of fm.post_merge_fix_commits) {
      if (isPlaceholderValue(commit)) {
        errors.push({ field: 'post_merge_fix_commits', message: `Contains placeholder value: "${commit}"` });
        break;
      }
    }
  }

  // final_report_commit — must be a non-empty string
  if (typeof fm.final_report_commit !== 'string' || fm.final_report_commit.length < 7) {
    errors.push({ field: 'final_report_commit', message: 'Must be a commit SHA (at least 7 characters)' });
  } else if (isPlaceholderValue(fm.final_report_commit)) {
    errors.push({ field: 'final_report_commit', message: `Contains placeholder value: "${fm.final_report_commit}"` });
  }

  return { valid: errors.length === 0, errors, frontmatter: fm };
}

/**
 * Extract the contentReleaseId from frontmatter or content block.
 */
function extractContentReleaseId(reportContent) {
  // Try frontmatter first
  const fmMatch = reportContent.match(/^---[\s\S]*?contentReleaseId:\s*(.+?)[\r\n]/m);
  if (fmMatch) return fmMatch[1].trim();

  // Try content block
  const blockMatch = reportContent.match(/Content release id:\s+(.+)/i);
  if (blockMatch) return blockMatch[1].trim();

  return null;
}

/**
 * Parse an "N / N" or "N/N" format into { numerator, denominator }.
 */
function parseFraction(value) {
  const match = (value || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (match) return { numerator: Number(match[1]), denominator: Number(match[2]) };
  return null;
}

/**
 * Parse a numeric value from a possibly formatted string.
 */
function parseNumeric(value) {
  if (value == null) return NaN;
  const cleaned = String(value).replace(/,/g, '').trim();
  return Number(cleaned);
}

/**
 * Validate a grammar QG completion report against live audit data.
 *
 * @param {string} reportContent - The markdown content of the completion report.
 * @param {object} [opts] - Options.
 * @param {string} [opts.rootDir] - Project root directory (defaults to repo root).
 * @param {number[]} [opts.seeds] - Seeds for the question generator audit.
 * @param {number[]} [opts.deepSeeds] - Deep seeds for case-depth audit.
 * @param {object} [opts.auditOverride] - Override audit result (for testing).
 * @param {object} [opts.contentQualityOverride] - Override content quality result (for testing).
 * @returns {{ pass: boolean, mismatches: Array<{ field: string, claimed: any, actual: any, message: string }> }}
 */
export function validateGrammarCompletionReport(reportContent, opts = {}) {
  const rootDir = opts.rootDir || ROOT_DIR;
  const seeds = opts.seeds || [1, 2, 3];
  const deepSeeds = opts.deepSeeds || Array.from({ length: 30 }, (_, i) => i + 1);

  // Run audits (or use overrides for testing)
  const audit = opts.auditOverride || buildGrammarQuestionGeneratorAudit({ seeds, deepSeeds });
  const contentQuality = opts.contentQualityOverride || buildGrammarContentQualityAudit(seeds);

  const mismatches = [];

  // Extract structured data from report
  const denominatorTable = extractDenominatorTable(reportContent);
  const contentBlock = extractContentReleaseBlock(reportContent);
  const smokeStatus = extractProductionSmokeStatus(reportContent);
  const reportedReleaseId = extractContentReleaseId(reportContent);

  // --- Field: contentReleaseId ---
  if (reportedReleaseId && reportedReleaseId !== audit.releaseId) {
    mismatches.push({
      field: 'contentReleaseId',
      claimed: reportedReleaseId,
      actual: audit.releaseId,
      message: `Report claims contentReleaseId "${reportedReleaseId}" but audit reports "${audit.releaseId}"`,
    });
  }

  // Helper to check a numeric field from either the denominator table or the content block
  function checkNumeric(fieldName, tableKey, blockKey, actualValue) {
    const tableValue = denominatorTable.get(tableKey);
    const blockValue = contentBlock.get(blockKey);
    const claimed = tableValue || blockValue;
    if (claimed == null) return; // Field not mentioned in report — skip

    const claimedNum = parseNumeric(claimed);
    if (Number.isNaN(claimedNum)) return; // Non-numeric — skip

    if (claimedNum !== actualValue) {
      mismatches.push({
        field: fieldName,
        claimed: claimedNum,
        actual: actualValue,
        message: `Report claims ${fieldName} = ${claimedNum} but audit reports ${actualValue}`,
      });
    }
  }

  // --- concept count ---
  checkNumeric('conceptCount', 'concepts', 'concepts', audit.conceptCount);

  // --- template count ---
  checkNumeric('templateCount', 'templates', 'templates', audit.templateCount);

  // --- selected-response count ---
  checkNumeric(
    'selectedResponseCount',
    'selected-response templates',
    'selected-response templates',
    audit.selectedResponseCount,
  );

  // --- constructed-response count ---
  checkNumeric(
    'constructedResponseCount',
    'constructed-response templates',
    'constructed-response templates',
    audit.constructedResponseCount,
  );

  // --- generated count ---
  checkNumeric(
    'generatedTemplateCount',
    'generated templates',
    'generated templates',
    audit.generatedTemplateCount,
  );

  // --- fixed count ---
  checkNumeric(
    'fixedTemplateCount',
    'fixed templates',
    'fixed templates',
    audit.fixedTemplateCount,
  );

  // --- answer-spec count ---
  checkNumeric(
    'answerSpecTemplateCount',
    'answer-spec templates',
    'answer-spec templates',
    audit.answerSpecTemplateCount,
  );

  // --- constructed-response answer-spec count (fraction format) ---
  const crAnswerSpecTableValue = denominatorTable.get('constructed-response answer-spec templates');
  const crAnswerSpecBlockValue = contentBlock.get('constructed-response answer-spec count');
  const crAnswerSpecClaimed = crAnswerSpecTableValue || crAnswerSpecBlockValue;
  if (crAnswerSpecClaimed) {
    const fraction = parseFraction(crAnswerSpecClaimed);
    if (fraction) {
      if (fraction.numerator !== audit.constructedResponseAnswerSpecTemplateCount) {
        mismatches.push({
          field: 'constructedResponseAnswerSpecCount',
          claimed: fraction.numerator,
          actual: audit.constructedResponseAnswerSpecTemplateCount,
          message: `Report claims constructed-response answer-spec numerator = ${fraction.numerator} but audit reports ${audit.constructedResponseAnswerSpecTemplateCount}`,
        });
      }
      if (fraction.denominator !== audit.constructedResponseCount) {
        mismatches.push({
          field: 'constructedResponseAnswerSpecDenominator',
          claimed: fraction.denominator,
          actual: audit.constructedResponseCount,
          message: `Report claims constructed-response answer-spec denominator = ${fraction.denominator} but audit reports ${audit.constructedResponseCount}`,
        });
      }
    }
  }

  // --- manual-review-only count ---
  checkNumeric(
    'manualReviewOnlyTemplateCount',
    'manual-review-only templates',
    'manual-review-only templates',
    audit.manualReviewOnlyTemplateCount,
  );

  // --- explanation template count ---
  checkNumeric(
    'explainTemplateCount',
    'explanation templates',
    'explanation templates',
    audit.explainTemplateCount,
  );

  // --- explanation concept coverage (N/N format) ---
  const explainCoverageTableValue = denominatorTable.get('concepts with explanation coverage');
  const explainCoverageBlockValue = contentBlock.get('concepts with explanation coverage');
  const explainCoverageClaimed = explainCoverageTableValue || explainCoverageBlockValue;
  if (explainCoverageClaimed) {
    const fraction = parseFraction(explainCoverageClaimed);
    if (fraction) {
      if (fraction.numerator !== audit.conceptsWithExplainCoverage.length) {
        mismatches.push({
          field: 'explainConceptCoverageNumerator',
          claimed: fraction.numerator,
          actual: audit.conceptsWithExplainCoverage.length,
          message: `Report claims explanation concept coverage numerator = ${fraction.numerator} but audit reports ${audit.conceptsWithExplainCoverage.length}`,
        });
      }
      if (fraction.denominator !== audit.conceptCount) {
        mismatches.push({
          field: 'explainConceptCoverageDenominator',
          claimed: fraction.denominator,
          actual: audit.conceptCount,
          message: `Report claims explanation concept coverage denominator = ${fraction.denominator} but audit reports ${audit.conceptCount}`,
        });
      }
    }
  }

  // --- mixed-transfer template count ---
  checkNumeric(
    'mixedTransferTemplateCount',
    'mixed-transfer templates',
    'mixed-transfer templates',
    audit.mixedTransferTemplateCount,
  );

  // --- mixed-transfer concept coverage (N/N format) ---
  const mixedCoverageTableValue = denominatorTable.get('concepts with mixed-transfer coverage');
  const mixedCoverageBlockValue = contentBlock.get('concepts with mixed-transfer coverage');
  const mixedCoverageClaimed = mixedCoverageTableValue || mixedCoverageBlockValue;
  if (mixedCoverageClaimed) {
    const fraction = parseFraction(mixedCoverageClaimed);
    if (fraction) {
      if (fraction.numerator !== audit.conceptsWithMixedTransferCoverage.length) {
        mismatches.push({
          field: 'mixedTransferConceptCoverageNumerator',
          claimed: fraction.numerator,
          actual: audit.conceptsWithMixedTransferCoverage.length,
          message: `Report claims mixed-transfer concept coverage numerator = ${fraction.numerator} but audit reports ${audit.conceptsWithMixedTransferCoverage.length}`,
        });
      }
      if (fraction.denominator !== audit.conceptCount) {
        mismatches.push({
          field: 'mixedTransferConceptCoverageDenominator',
          claimed: fraction.denominator,
          actual: audit.conceptCount,
          message: `Report claims mixed-transfer concept coverage denominator = ${fraction.denominator} but audit reports ${audit.conceptCount}`,
        });
      }
    }
  }

  // --- default repeated variants (must be 0) ---
  const legacyRepeatTableValue = denominatorTable.get('legacy repeated variants (default window)');
  const legacyRepeatBlockValue = contentBlock.get('legacy repeated variants (default)');
  const legacyRepeatClaimed = legacyRepeatTableValue || legacyRepeatBlockValue;
  if (legacyRepeatClaimed != null) {
    const claimedNum = parseNumeric(legacyRepeatClaimed);
    const actualNum = audit.legacyRepeatedGeneratedVariants.length;
    if (!Number.isNaN(claimedNum) && claimedNum !== actualNum) {
      mismatches.push({
        field: 'defaultRepeatedVariants',
        claimed: claimedNum,
        actual: actualNum,
        message: `Report claims legacy repeated variants = ${claimedNum} but audit reports ${actualNum}`,
      });
    }
  }

  // --- cross-template signature collisions (must be 0) ---
  const collisionsTableValue = denominatorTable.get('cross-template signature collisions');
  const collisionsBlockValue = contentBlock.get('cross-template signature collisions');
  const collisionsClaimed = collisionsTableValue || collisionsBlockValue;
  if (collisionsClaimed != null) {
    const claimedNum = parseNumeric(collisionsClaimed);
    const actualNum = audit.generatedSignatureCollisions.length;
    if (!Number.isNaN(claimedNum) && claimedNum !== actualNum) {
      mismatches.push({
        field: 'crossTemplateSignatureCollisions',
        claimed: claimedNum,
        actual: actualNum,
        message: `Report claims cross-template signature collisions = ${claimedNum} but audit reports ${actualNum}`,
      });
    }
  }

  // --- deep low-depth family count ---
  if (audit.lowDepthGeneratedTemplates) {
    const lowDepthRegex = /low-depth famil(?:ies|y)[:\s]*(\d+)/i;
    const lowDepthMatch = reportContent.match(lowDepthRegex);
    if (lowDepthMatch) {
      const claimedLowDepth = Number(lowDepthMatch[1]);
      const actualLowDepth = audit.lowDepthGeneratedTemplates.length;
      if (claimedLowDepth !== actualLowDepth) {
        mismatches.push({
          field: 'lowDepthFamilyCount',
          claimed: claimedLowDepth,
          actual: actualLowDepth,
          message: `Report claims ${claimedLowDepth} low-depth families but deep audit finds ${actualLowDepth}`,
        });
      }
    }
  }

  // --- production-smoke evidence file validation ---
  const claimsPostDeployPassed = smokeStatus.postDeploySmoke &&
    (smokeStatus.postDeploySmoke.includes('passed') || smokeStatus.postDeploySmoke.includes('pass'));
  if (claimsPostDeployPassed) {
    const releaseId = reportedReleaseId || audit.releaseId;
    const evidencePath = path.join(rootDir, 'reports', 'grammar', `grammar-production-smoke-${releaseId}.json`);
    if (!existsSync(evidencePath)) {
      mismatches.push({
        field: 'productionSmokeEvidence',
        claimed: 'post-deploy smoke passed',
        actual: `evidence file not found at ${path.relative(rootDir, evidencePath)}`,
        message: `Report claims post-deploy smoke passed but evidence file does not exist: ${path.relative(rootDir, evidencePath)}`,
      });
    }
  }

  // --- P9-U6: cross-validate oracle claims against certification manifest ---
  const manifestPath = opts.manifestPath ||
    path.join(rootDir, 'reports', 'grammar', 'grammar-qg-p9-certification-manifest.json');
  if (existsSync(manifestPath) && !opts.skipManifestValidation) {
    const manifestResult = validateEvidenceManifest(manifestPath);
    if (manifestResult.valid) {
      const oracleResult = validateReportAgainstManifest(reportContent, manifestResult.manifest);
      mismatches.push(...oracleResult.mismatches);
    }
  }

  // --- zero low-depth families claim ---
  const zeroLowDepthRegex = /(?:zero|0)\s+low-depth/i;
  const claimsZeroLowDepth = zeroLowDepthRegex.test(reportContent);
  if (claimsZeroLowDepth && audit.lowDepthGeneratedTemplates) {
    if (audit.lowDepthGeneratedTemplates.length > 0) {
      mismatches.push({
        field: 'zeroLowDepthClaim',
        claimed: 0,
        actual: audit.lowDepthGeneratedTemplates.length,
        message: `Report claims zero low-depth families but deep audit finds ${audit.lowDepthGeneratedTemplates.length}`,
      });
    }
  }

  // --- no content-quality hard failures claim ---
  const noHardFailRegex = /(?:content-quality hard failures|hard failures)[:\s]*0|no content-quality hard failures|zero hard failures/i;
  const claimsNoHardFails = noHardFailRegex.test(reportContent);
  if (claimsNoHardFails && contentQuality.summary.hardFailCount > 0) {
    mismatches.push({
      field: 'contentQualityHardFailures',
      claimed: 0,
      actual: contentQuality.summary.hardFailCount,
      message: `Report claims no content-quality hard failures but audit finds ${contentQuality.summary.hardFailCount}`,
    });
  }

  // --- production smoke status wording ---
  const repoSmokePassed = smokeStatus.repositorySmoke &&
    (smokeStatus.repositorySmoke.includes('passed') || smokeStatus.repositorySmoke.includes('pass'));
  if (repoSmokePassed) {
    // Repository smoke is validated by the fact that the test suite passes — no additional file needed.
    // But we record the claim for completeness.
  }

  return {
    pass: mismatches.length === 0,
    mismatches,
    audit: {
      releaseId: audit.releaseId,
      conceptCount: audit.conceptCount,
      templateCount: audit.templateCount,
    },
  };
}

// --- CLI entry point ---
async function main(argv) {
  const reportPath = argv.find((arg) => !arg.startsWith('--'));
  const jsonOutput = argv.includes('--json');

  if (!reportPath) {
    console.error('Usage: validate-grammar-qg-completion-report.mjs <report.md> [--json]');
    process.exit(1);
  }

  const resolved = path.resolve(reportPath);
  if (!existsSync(resolved)) {
    console.error(`Report file not found: ${resolved}`);
    process.exit(1);
  }

  const reportContent = readFileSync(resolved, 'utf-8');

  // Gate 1: frontmatter must be free of placeholder tokens
  const frontmatterResult = validateReleaseFrontmatter(reportContent);
  if (!frontmatterResult.valid) {
    if (jsonOutput) {
      console.log(JSON.stringify({ pass: false, gate: 'frontmatter', errors: frontmatterResult.errors }, null, 2));
    } else {
      console.log(`FAIL: Frontmatter validation failed — ${frontmatterResult.errors.length} error(s)\n`);
      for (const e of frontmatterResult.errors) {
        console.log(`  [${e.field}] ${e.message}`);
      }
    }
    process.exit(1);
  }

  // Gate 2: metric validation against live audit
  const deepSeeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const result = validateGrammarCompletionReport(reportContent, { deepSeeds });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.pass) {
      console.log(`PASS: All report claims match live audit (release: ${result.audit.releaseId})`);
    } else {
      console.log(`FAIL: ${result.mismatches.length} mismatch(es) found\n`);
      for (const m of result.mismatches) {
        console.log(`  [${m.field}] ${m.message}`);
        console.log(`    claimed: ${JSON.stringify(m.claimed)}`);
        console.log(`    actual:  ${JSON.stringify(m.actual)}\n`);
      }
    }
  }

  process.exit(result.pass ? 0 : 1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
