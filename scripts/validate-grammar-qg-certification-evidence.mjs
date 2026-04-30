#!/usr/bin/env node
/**
 * Grammar QG Certification Evidence Validator (P9-U6)
 *
 * Validates that completion reports do not overclaim oracle coverage.
 * The P8 oracles use DIFFERENT seed windows per evidence family:
 *   - selected-response: seeds 1..15
 *   - constructed-response: seeds 1..10
 *   - manual-review: seeds 1..5
 *   - redaction: seeds 1..30
 *   - content-quality-audit: seeds 1..30
 *
 * This validator catches:
 *   - Reports claiming "all N templates x M seeds" when M exceeds a family's actual window
 *   - Reports where the total oracle test count does not match the sum derivable from manifest windows
 *   - Missing smoke evidence files when claimed
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAMMAR_CONTENT_RELEASE_ID } from '../worker/src/subjects/grammar/content.js';
import { extractFrontmatter } from './validate-grammar-qg-completion-report.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a seed window string like "1..15" into { start, end, count }.
 */
export function parseSeedWindow(windowStr) {
  const match = (windowStr || '').match(/^(\d+)\.\.(\d+)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return { start, end, count: end - start + 1 };
}

/**
 * Compute the expected oracle test count from a manifest's seedWindowPerEvidenceType
 * and a template count.
 *
 * The actual counting depends on family:
 *   - selected-response-oracle: templateCount * seedCount (not all templates are selected-response,
 *     but the oracle iterates all templates and skips non-applicable ones — so the "test count"
 *     equals applicable templates * seeds. We use templateDenominator * seedCount as the maximum envelope.)
 *   - constructed-response-oracle: templateCount * seedCount
 *   - manual-review-oracle: templateCount * seedCount
 *   - redaction-oracle: templateCount * seedCount
 *   - content-quality-audit: templateCount * seedCount
 *
 * Returns { perFamily: Map<string, { seeds, maxTests }>, totalMaxTests }.
 */
export function computeOracleTestEnvelope(manifest) {
  const perFamily = new Map();
  const templateCount = manifest.templateDenominator;
  let totalMaxTests = 0;

  for (const [family, windowStr] of Object.entries(manifest.seedWindowPerEvidenceType || {})) {
    const window = parseSeedWindow(windowStr);
    if (!window) continue;
    const maxTests = templateCount * window.count;
    perFamily.set(family, { seeds: window.count, maxTests, window: windowStr });
    totalMaxTests += maxTests;
  }

  return { perFamily, totalMaxTests, templateCount };
}

// ---------------------------------------------------------------------------
// Validation exports
// ---------------------------------------------------------------------------

/**
 * Validate the manifest JSON schema — checks all required fields are present
 * and seed windows are parseable.
 *
 * @param {string} manifestPath - Path to the certification manifest JSON file.
 * @returns {{ valid: boolean, errors: string[], manifest: object|null }}
 */
export function validateEvidenceManifest(manifestPath) {
  const errors = [];

  if (!existsSync(manifestPath)) {
    return { valid: false, errors: [`Manifest file not found: ${manifestPath}`], manifest: null };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { valid: false, errors: [`Failed to parse manifest JSON: ${err.message}`], manifest: null };
  }

  // Required fields
  const requiredFields = [
    'contentReleaseId',
    'templateDenominator',
    'seedWindow',
    'seedWindowPerEvidenceType',
    'expectedItemCount',
  ];
  for (const field of requiredFields) {
    if (manifest[field] === undefined || manifest[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // templateDenominator must be a positive integer
  if (typeof manifest.templateDenominator !== 'number' || manifest.templateDenominator < 1) {
    errors.push(`templateDenominator must be a positive integer, got: ${manifest.templateDenominator}`);
  }

  // seedWindowPerEvidenceType must have parseable windows
  const expectedFamilies = [
    'selected-response-oracle',
    'constructed-response-oracle',
    'manual-review-oracle',
    'redaction-oracle',
    'content-quality-audit',
  ];

  if (manifest.seedWindowPerEvidenceType) {
    for (const family of expectedFamilies) {
      const windowStr = manifest.seedWindowPerEvidenceType[family];
      if (!windowStr) {
        errors.push(`Missing seedWindowPerEvidenceType entry for: ${family}`);
        continue;
      }
      const parsed = parseSeedWindow(windowStr);
      if (!parsed) {
        errors.push(`Invalid seed window format for ${family}: "${windowStr}" (expected "N..M")`);
      }
    }
  }

  // seedWindow.certification must exist
  if (!manifest.seedWindow || !manifest.seedWindow.certification) {
    errors.push('Missing seedWindow.certification');
  } else {
    const certWindow = parseSeedWindow(manifest.seedWindow.certification);
    if (!certWindow) {
      errors.push(`Invalid seedWindow.certification format: "${manifest.seedWindow.certification}"`);
    }
  }

  return { valid: errors.length === 0, errors, manifest };
}

/**
 * Validate a completion report's oracle claims against a certification manifest.
 *
 * Checks:
 * 1. If report claims "all N templates x M seeds pass automated oracles" — rejects when
 *    any oracle family uses fewer than M seeds (dishonest uniform claim).
 * 2. If report claims a specific total oracle test count, validates it against the
 *    sum derivable from per-family windows in the manifest.
 * 3. If report provides per-family breakdown with different windows — passes (honest).
 *
 * @param {string} reportContent - Markdown content of the completion report.
 * @param {object} manifest - Parsed certification manifest JSON.
 * @returns {{ pass: boolean, mismatches: Array<{ field: string, claimed: any, actual: any, message: string }> }}
 */
export function validateReportAgainstManifest(reportContent, manifest) {
  const mismatches = [];
  const envelope = computeOracleTestEnvelope(manifest);

  // --- Check 1: uniform "all templates x N seeds" claim ---
  // Pattern: "all 78 templates × 30 seeds" or "78 templates x 30 seeds pass"
  const uniformClaimRegex = /(?:all\s+)?(\d+)\s+templates?\s*[×x]\s*(\d+)\s+seeds?\s+pass/i;
  const uniformMatch = reportContent.match(uniformClaimRegex);

  if (uniformMatch) {
    const claimedTemplates = Number(uniformMatch[1]);
    const claimedSeeds = Number(uniformMatch[2]);

    // Find the minimum seed count across all oracle families
    let minSeeds = Infinity;
    let minFamily = '';
    for (const [family, info] of envelope.perFamily) {
      if (info.seeds < minSeeds) {
        minSeeds = info.seeds;
        minFamily = family;
      }
    }

    // If the claim says all families use N seeds but some use fewer, reject
    if (claimedSeeds > minSeeds) {
      mismatches.push({
        field: 'uniformSeedClaim',
        claimed: `${claimedTemplates} templates × ${claimedSeeds} seeds`,
        actual: `minimum per-family seed count is ${minSeeds} (${minFamily})`,
        message: `Report claims all ${claimedTemplates} templates × ${claimedSeeds} seeds pass, but ${minFamily} only uses seeds 1..${minSeeds}. Use per-family breakdown instead.`,
      });
    }

    // Also check template count
    if (claimedTemplates !== manifest.templateDenominator) {
      mismatches.push({
        field: 'uniformTemplateClaim',
        claimed: claimedTemplates,
        actual: manifest.templateDenominator,
        message: `Report claims ${claimedTemplates} templates but manifest declares ${manifest.templateDenominator}`,
      });
    }
  }

  // --- Check 2: total oracle test count claim ---
  // Pattern: "N oracle tests" or "N automated oracle tests"
  const totalCountRegex = /(\d[\d,]*)\s+(?:automated\s+)?oracle\s+tests?\s+pass/i;
  const totalCountMatch = reportContent.match(totalCountRegex);

  if (totalCountMatch) {
    const claimedTotal = Number(totalCountMatch[1].replace(/,/g, ''));

    // The actual total is bounded by the envelope (all templates for each family)
    // But not all templates participate in each family — the actual total from P8 is 3,148
    // We validate that the claimed count is reproducible from per-family windows
    // by checking it does not exceed the maximum envelope.
    if (claimedTotal > envelope.totalMaxTests) {
      mismatches.push({
        field: 'oracleTestCountExceedsEnvelope',
        claimed: claimedTotal,
        actual: envelope.totalMaxTests,
        message: `Report claims ${claimedTotal} oracle tests pass, but the maximum envelope from manifest windows is ${envelope.totalMaxTests}`,
      });
    }
  }

  // --- Check 3: per-family breakdown honesty ---
  // If the report contains per-family seed ranges, validate they match the manifest
  const perFamilyRegex = /(\w[\w-]+(?:\s+\w+)?)\s*(?:oracle|audit)?\s*:\s*seeds?\s*(\d+)(?:\.\.|-|–)(\d+)/gi;
  let perFamilyMatch;
  while ((perFamilyMatch = perFamilyRegex.exec(reportContent)) !== null) {
    const reportedFamily = perFamilyMatch[1].toLowerCase().replace(/\s+/g, '-');
    const reportedStart = Number(perFamilyMatch[2]);
    const reportedEnd = Number(perFamilyMatch[3]);

    // Try to match against manifest families
    for (const [family, info] of envelope.perFamily) {
      const familyNorm = family.replace(/-oracle$/, '').replace(/-audit$/, '');
      if (reportedFamily.includes(familyNorm) || familyNorm.includes(reportedFamily)) {
        const manifestWindow = parseSeedWindow(info.window);
        if (manifestWindow && (reportedStart !== manifestWindow.start || reportedEnd !== manifestWindow.end)) {
          mismatches.push({
            field: `perFamilySeedWindow:${family}`,
            claimed: `${reportedStart}..${reportedEnd}`,
            actual: info.window,
            message: `Report claims ${family} uses seeds ${reportedStart}..${reportedEnd} but manifest declares ${info.window}`,
          });
        }
      }
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

/**
 * Required fields in a production smoke evidence JSON file.
 */
export const SMOKE_EVIDENCE_REQUIRED_FIELDS = [
  'releaseId',
  'deployedUrl',
  'timestamp',
  'command',
  'learnerFixtureType',
  'itemCreationResult',
  'answerSubmissionResult',
  'readModelUpdateResult',
  'noAnswerLeakAssertion',
  'failureDetails',
];

/**
 * Extract the certification_decision from report frontmatter.
 * Returns the raw string value or null if not present.
 */
export function extractCertificationDecision(reportContent) {
  const fmBlock = reportContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmBlock) return null;
  const match = fmBlock[1].match(/^certification_decision:\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Extract the post_deploy_smoke_evidence value from report frontmatter.
 * Returns the raw string value or null if not present.
 */
export function extractPostDeploySmokeEvidence(reportContent) {
  const fmBlock = reportContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmBlock) return null;
  const match = fmBlock[1].match(/^post_deploy_smoke_evidence:\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Extract the limitations list from report frontmatter.
 * Returns an array of limitation strings, or empty array if not present.
 */
export function extractLimitations(reportContent) {
  const fmBlock = reportContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmBlock) return [];

  const lines = fmBlock[1].split(/\r?\n/);
  const limitations = [];
  let inLimitations = false;

  for (const line of lines) {
    if (/^limitations:\s*$/.test(line)) {
      inLimitations = true;
      continue;
    }
    if (inLimitations) {
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch) {
        limitations.push(itemMatch[1].trim());
      } else if (/^\w/.test(line)) {
        // New top-level key — stop collecting limitations
        break;
      }
    }
  }
  return limitations;
}

/**
 * Validate smoke evidence — checks that smoke evidence files exist when required.
 *
 * Rules:
 * - If certification_decision is CERTIFIED_POST_DEPLOY:
 *   - A valid smoke evidence file MUST exist at reports/grammar/grammar-production-smoke-<releaseId>.json
 *   - The file must contain all required fields
 *   - The file's releaseId must match the report's content release ID
 * - If certification_decision is CERTIFIED_PRE_DEPLOY or CERTIFIED_WITH_LIMITATIONS:
 *   - No smoke evidence file required (pass without it)
 * - Legacy behaviour: if no certification_decision in frontmatter, fall back to
 *   checking text claims of "smoke passed"
 *
 * @param {object} manifest - Parsed certification manifest JSON.
 * @param {string} reportContent - Markdown content of the completion report.
 * @param {object} [opts] - Options.
 * @param {string} [opts.rootDir] - Project root directory.
 * @returns {{ pass: boolean, mismatches: Array<{ field: string, claimed: any, actual: any, message: string }> }}
 */
export function validateSmokeEvidence(manifest, reportContent, opts = {}) {
  const rootDir = opts.rootDir || ROOT_DIR;
  const mismatches = [];

  const certDecision = extractCertificationDecision(reportContent);
  const postDeploySmokeField = extractPostDeploySmokeEvidence(reportContent);

  // --- CERTIFIED_PRE_DEPLOY: no smoke file required ---
  if (certDecision && /certified[_-]?pre[_-]?deploy/i.test(certDecision)) {
    return { pass: true, mismatches: [] };
  }

  // --- CERTIFIED_WITH_LIMITATIONS: no smoke file required ---
  if (certDecision && /certified[_-]?with[_-]?limitations/i.test(certDecision)) {
    return { pass: true, mismatches: [] };
  }

  // --- CERTIFIED_POST_DEPLOY: smoke file MUST exist and be valid ---
  if (certDecision && /certified[_-]?post[_-]?deploy/i.test(certDecision)) {
    const releaseId = manifest.contentReleaseId;
    if (!releaseId) {
      mismatches.push({
        field: 'smokeEvidenceFile',
        claimed: 'CERTIFIED_POST_DEPLOY',
        actual: 'no contentReleaseId in manifest',
        message: 'Cannot validate smoke evidence: manifest has no contentReleaseId',
      });
      return { pass: false, mismatches };
    }

    const evidencePath = path.join(rootDir, 'reports', 'grammar', `grammar-production-smoke-${releaseId}.json`);

    // Check file existence
    if (!existsSync(evidencePath)) {
      mismatches.push({
        field: 'smokeEvidenceFile',
        claimed: 'CERTIFIED_POST_DEPLOY',
        actual: `evidence file not found at reports/grammar/grammar-production-smoke-${releaseId}.json`,
        message: `Report claims CERTIFIED_POST_DEPLOY but smoke evidence file does not exist: reports/grammar/grammar-production-smoke-${releaseId}.json`,
      });
      return { pass: false, mismatches };
    }

    // Parse and validate the evidence file
    let evidence;
    try {
      evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    } catch (err) {
      mismatches.push({
        field: 'smokeEvidenceFileSchema',
        claimed: 'valid JSON',
        actual: `parse error: ${err.message}`,
        message: `Smoke evidence file is not valid JSON: ${err.message}`,
      });
      return { pass: false, mismatches };
    }

    // Check required fields — a field is present if it exists in the object (null is valid for failureDetails)
    for (const field of SMOKE_EVIDENCE_REQUIRED_FIELDS) {
      if (!(field in evidence)) {
        mismatches.push({
          field: 'smokeEvidenceFieldMissing',
          claimed: `field "${field}" present`,
          actual: 'missing',
          message: `Smoke evidence file is missing required field: ${field}`,
        });
      }
    }

    // Validate releaseId matches
    if (evidence.releaseId && evidence.releaseId !== releaseId) {
      mismatches.push({
        field: 'smokeEvidenceReleaseIdMismatch',
        claimed: releaseId,
        actual: evidence.releaseId,
        message: `Smoke evidence releaseId "${evidence.releaseId}" does not match manifest contentReleaseId "${releaseId}"`,
      });
    }

    return { pass: mismatches.length === 0, mismatches };
  }

  // --- Legacy fallback: no certification_decision in frontmatter ---
  // Check if report claims smoke passed via text
  const smokePassedRegex = /(?:production\s+smoke|repository\s+smoke|post-deploy\s+smoke)\s*[:=]?\s*(passed|pass)/i;
  const claimsSmokePassed = smokePassedRegex.test(reportContent);

  if (claimsSmokePassed && manifest.contentReleaseId) {
    const evidencePath = path.join(rootDir, 'reports', 'grammar', `grammar-production-smoke-${manifest.contentReleaseId}.json`);
    if (!existsSync(evidencePath)) {
      mismatches.push({
        field: 'smokeEvidenceFile',
        claimed: 'smoke passed',
        actual: `evidence file not found at reports/grammar/grammar-production-smoke-${manifest.contentReleaseId}.json`,
        message: `Report claims smoke passed but evidence file does not exist: ${path.relative(rootDir, evidencePath)}`,
      });
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

// ---------------------------------------------------------------------------
// Cross-check: render inventory release ID consistency (P10-R-U9)
// ---------------------------------------------------------------------------

/**
 * Validate that a render inventory JSON file has a consistent contentReleaseId
 * in both its metadata and sampled items.
 *
 * @param {string} inventoryPath - Path to the render inventory JSON file.
 * @param {string} expectedReleaseId - The expected content release ID.
 * @returns {{ pass: boolean, mismatches: Array<{ field: string, claimed: any, actual: any, message: string }> }}
 */
export function validateInventoryReleaseIds(inventoryPath, expectedReleaseId) {
  const mismatches = [];

  if (!existsSync(inventoryPath)) {
    mismatches.push({
      field: 'inventoryFile',
      claimed: inventoryPath,
      actual: 'not found',
      message: `Inventory file not found: ${inventoryPath}`,
    });
    return { pass: false, mismatches };
  }

  let inventory;
  try {
    inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  } catch (err) {
    mismatches.push({
      field: 'inventoryParse',
      claimed: 'valid JSON',
      actual: `parse error: ${err.message}`,
      message: `Inventory file is not valid JSON: ${err.message}`,
    });
    return { pass: false, mismatches };
  }

  // Check metadata.contentReleaseId
  const metadataReleaseId = inventory?.metadata?.contentReleaseId;
  if (metadataReleaseId !== expectedReleaseId) {
    mismatches.push({
      field: 'inventoryMetadataReleaseId',
      claimed: metadataReleaseId,
      actual: expectedReleaseId,
      message: `Inventory metadata.contentReleaseId "${metadataReleaseId}" does not match expected "${expectedReleaseId}"`,
    });
  }

  // Check ALL items for contentReleaseId consistency (no sampling — full sweep)
  const items = Array.isArray(inventory?.items) ? inventory.items : [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.contentReleaseId !== expectedReleaseId) {
      mismatches.push({
        field: `inventoryItem[${i}].contentReleaseId`,
        claimed: item?.contentReleaseId,
        actual: expectedReleaseId,
        message: `Inventory item[${i}] contentReleaseId "${item?.contentReleaseId}" does not match expected "${expectedReleaseId}"`,
      });
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

// ---------------------------------------------------------------------------
// Cross-check: manifest ↔ code ↔ report release ID consistency (P10-U0)
// ---------------------------------------------------------------------------

/**
 * Validate that the manifest contentReleaseId matches the code-exported
 * GRAMMAR_CONTENT_RELEASE_ID, and optionally that a report's release ID
 * also matches.
 *
 * @param {object} manifest - Parsed certification manifest JSON.
 * @param {string} [reportReleaseId] - Release ID extracted from a completion report (optional).
 * @param {object} [reportFrontmatter] - Parsed frontmatter from the completion report (optional).
 * @returns {{ pass: boolean, mismatches: Array<{ field: string, claimed: any, actual: any, message: string }> }}
 */
export function validateReleaseIdConsistency(manifest, reportReleaseId, reportFrontmatter) {
  const mismatches = [];

  if (manifest.contentReleaseId !== GRAMMAR_CONTENT_RELEASE_ID) {
    mismatches.push({
      field: 'manifestVsCodeReleaseId',
      claimed: manifest.contentReleaseId,
      actual: GRAMMAR_CONTENT_RELEASE_ID,
      message: `Manifest contentReleaseId "${manifest.contentReleaseId}" does not match code GRAMMAR_CONTENT_RELEASE_ID "${GRAMMAR_CONTENT_RELEASE_ID}"`,
    });
  }

  if (reportReleaseId != null && reportReleaseId !== manifest.contentReleaseId) {
    mismatches.push({
      field: 'reportVsManifestReleaseId',
      claimed: reportReleaseId,
      actual: manifest.contentReleaseId,
      message: `Report release ID "${reportReleaseId}" does not match manifest contentReleaseId "${manifest.contentReleaseId}"`,
    });
  }

  // Cross-check final_content_release_id from report frontmatter (snake_case key)
  if (reportFrontmatter && reportFrontmatter.final_content_release_id != null) {
    if (reportFrontmatter.final_content_release_id !== GRAMMAR_CONTENT_RELEASE_ID) {
      mismatches.push({
        field: 'reportFrontmatterVsCodeReleaseId',
        claimed: reportFrontmatter.final_content_release_id,
        actual: GRAMMAR_CONTENT_RELEASE_ID,
        message: `Report frontmatter final_content_release_id "${reportFrontmatter.final_content_release_id}" does not match code GRAMMAR_CONTENT_RELEASE_ID "${GRAMMAR_CONTENT_RELEASE_ID}"`,
      });
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const jsonOutput = argv.includes('--json');

  if (args.length < 1) {
    console.error('Usage: validate-grammar-qg-certification-evidence.mjs <manifest-path> [report-path] [--json]');
    console.error('');
    console.error('  manifest-path  Path to the certification manifest JSON');
    console.error('  report-path    Optional path to a completion report to cross-validate');
    process.exit(1);
  }

  const manifestPath = path.resolve(args[0]);
  const reportPath = args[1] ? path.resolve(args[1]) : null;

  // Gate 1: Validate manifest schema
  const manifestResult = validateEvidenceManifest(manifestPath);
  if (!manifestResult.valid) {
    if (jsonOutput) {
      console.log(JSON.stringify({ pass: false, gate: 'manifest-schema', errors: manifestResult.errors }, null, 2));
    } else {
      console.log(`FAIL: Manifest schema validation failed — ${manifestResult.errors.length} error(s)\n`);
      for (const e of manifestResult.errors) {
        console.log(`  ${e}`);
      }
    }
    process.exit(1);
  }

  console.log(`PASS: Manifest schema valid (${Object.keys(manifestResult.manifest.seedWindowPerEvidenceType).length} oracle families)`);

  // Gate 1b: Validate render inventory release IDs if inventory exists
  const releaseId = manifestResult.manifest.contentReleaseId;
  const inventoryPath = path.join(ROOT_DIR, 'reports', 'grammar', `grammar-qg-p10-render-inventory.json`);
  if (existsSync(inventoryPath)) {
    const invResult = validateInventoryReleaseIds(inventoryPath, releaseId);
    if (!invResult.pass) {
      if (jsonOutput) {
        console.log(JSON.stringify({ pass: false, gate: 'inventory-release-ids', mismatches: invResult.mismatches }, null, 2));
      } else {
        console.log(`FAIL: Inventory release ID cross-check — ${invResult.mismatches.length} mismatch(es)\n`);
        for (const m of invResult.mismatches) {
          console.log(`  [${m.field}] ${m.message}`);
        }
      }
      process.exit(1);
    }
    console.log(`PASS: Inventory release IDs consistent with manifest (${releaseId})`);
  }

  // Gate 2: Cross-validate report if provided
  if (reportPath) {
    if (!existsSync(reportPath)) {
      console.error(`Report file not found: ${reportPath}`);
      process.exit(1);
    }

    const reportContent = readFileSync(reportPath, 'utf8');
    const reportFrontmatter = extractFrontmatter(reportContent);
    const reportResult = validateReportAgainstManifest(reportContent, manifestResult.manifest);
    const smokeResult = validateSmokeEvidence(manifestResult.manifest, reportContent);
    const releaseIdResult = validateReleaseIdConsistency(manifestResult.manifest, null, reportFrontmatter);

    const allMismatches = [...reportResult.mismatches, ...smokeResult.mismatches, ...releaseIdResult.mismatches];
    const allPass = allMismatches.length === 0;

    if (jsonOutput) {
      console.log(JSON.stringify({ pass: allPass, mismatches: allMismatches }, null, 2));
    } else {
      if (allPass) {
        console.log(`PASS: Report oracle claims align with manifest windows`);
      } else {
        console.log(`FAIL: ${allMismatches.length} oracle-window mismatch(es)\n`);
        for (const m of allMismatches) {
          console.log(`  [${m.field}] ${m.message}`);
          console.log(`    claimed: ${JSON.stringify(m.claimed)}`);
          console.log(`    actual:  ${JSON.stringify(m.actual)}\n`);
        }
      }
    }

    process.exit(allPass ? 0 : 1);
  }

  // If no report provided, just display the envelope
  const envelope = computeOracleTestEnvelope(manifestResult.manifest);
  console.log(`\nOracle test envelope (${envelope.templateCount} templates):`);
  for (const [family, info] of envelope.perFamily) {
    console.log(`  ${family}: seeds ${info.window} → ${info.seeds} seeds × ${envelope.templateCount} templates = ${info.maxTests} max tests`);
  }
  console.log(`  Total maximum envelope: ${envelope.totalMaxTests}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
