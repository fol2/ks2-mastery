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
import {
  CERTIFICATION_STATUS_MAP,
  GRAMMAR_RUNTIME_CERTIFICATION_RELEASE_ID,
  GRAMMAR_RUNTIME_CERTIFICATION_TEMPLATE_COUNT,
  isTemplateBlocked,
} from '../worker/src/subjects/grammar/certification-status.js';
import {
  buildGeneratedSource,
  buildRuntimeCertificationStatus,
} from './generate-grammar-qg-runtime-certification-status.mjs';
import { extractFrontmatter } from './validate-grammar-qg-completion-report.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an artefact path from a manifest's artefacts map.
 *
 * @param {object} manifest - Parsed certification manifest JSON.
 * @param {string} key - The artefact key to look up in manifest.artefacts.
 * @param {string} [rootDir] - Project root directory.
 * @returns {{ ok: boolean, path: string|null, error: string|null }}
 */
export function requireArtefact(manifest, key, rootDir = ROOT_DIR) {
  const rel = manifest?.artefacts?.[key];
  if (!rel || typeof rel !== 'string') {
    return {
      ok: false,
      path: null,
      error: `Manifest missing required artefact path: artefacts.${key}`,
    };
  }
  const abs = path.resolve(rootDir, rel);
  if (!existsSync(abs)) {
    return {
      ok: false,
      path: abs,
      error: `Artefact file not found for ${key}: ${rel}`,
    };
  }
  return { ok: true, path: abs, error: null };
}

/**
 * Resolve and read a JSON artefact from a manifest's artefacts map.
 *
 * @param {object} manifest - Parsed certification manifest JSON.
 * @param {string} key - The artefact key to look up in manifest.artefacts.
 * @param {string} [rootDir] - Project root directory.
 * @returns {{ ok: boolean, data: object|null, path: string|null, error: string|null }}
 */
export function readJsonArtefact(manifest, key, rootDir = ROOT_DIR) {
  const resolved = requireArtefact(manifest, key, rootDir);
  if (!resolved.ok) return { ok: false, error: resolved.error, data: null, path: null };
  try {
    return {
      ok: true,
      data: JSON.parse(readFileSync(resolved.path, 'utf8')),
      path: resolved.path,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Artefact ${key} is not valid JSON: ${err.message}`,
      data: null,
      path: resolved.path,
    };
  }
}

/**
 * Validate legacy expectedOutputPaths when a manifest still includes them.
 * Canonical release validation uses manifest.artefacts, but any extra manifest
 * path claims must still be true or explicitly removed.
 *
 * @param {object} manifest - Parsed certification manifest JSON.
 * @param {object} [opts] - Options.
 * @param {string} [opts.rootDir] - Project root directory.
 * @returns {{ pass: boolean, mismatches: Array<{ field: string, claimed: any, actual: any, message: string }> }}
 */
export function validateManifestExpectedOutputPaths(manifest, opts = {}) {
  const rootDir = opts.rootDir || ROOT_DIR;
  const mismatches = [];

  if (manifest.expectedOutputPaths == null) {
    return { pass: true, mismatches };
  }

  if (!Array.isArray(manifest.expectedOutputPaths)) {
    return {
      pass: false,
      mismatches: [{
        field: 'manifestExpectedOutputPathsShape',
        claimed: manifest.expectedOutputPaths,
        actual: 'array or omitted',
        message: 'Manifest expectedOutputPaths must be an array when present',
      }],
    };
  }

  for (const [index, entry] of manifest.expectedOutputPaths.entries()) {
    const relPath = typeof entry === 'string' ? entry : entry?.path;
    const isLegacyNonAuthoritative = entry && typeof entry === 'object'
      && (entry.legacy === true || entry.authoritative === false);

    if (!relPath || typeof relPath !== 'string') {
      mismatches.push({
        field: `expectedOutputPaths[${index}]`,
        claimed: entry,
        actual: 'string path',
        message: `Manifest expectedOutputPaths[${index}] must name a path or be removed`,
      });
      continue;
    }

    const absPath = path.resolve(rootDir, relPath);
    if (!existsSync(absPath) && !isLegacyNonAuthoritative) {
      mismatches.push({
        field: `expectedOutputPaths[${index}]`,
        claimed: relPath,
        actual: 'file not found',
        message: `Manifest expected output path does not exist: ${relPath}`,
      });
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

function sameStringArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function addMismatch(mismatches, field, claimed, actual, message) {
  mismatches.push({ field, claimed, actual, message });
}

/**
 * Validate that the runtime Worker status authority exactly matches the
 * manifest's certification status-map artefact.
 *
 * @param {object} manifest - Parsed certification manifest JSON.
 * @param {object} [opts] - Options.
 * @param {string} [opts.rootDir] - Project root directory.
 * @returns {{ pass: boolean, mismatches: Array<{ field: string, claimed: any, actual: any, message: string }> }}
 */
export function validateRuntimeCertificationAuthority(manifest, opts = {}) {
  const rootDir = opts.rootDir || ROOT_DIR;
  const mismatches = [];

  const statusMapResult = readJsonArtefact(manifest, 'certificationStatusMap', rootDir);
  if (!statusMapResult.ok) {
    addMismatch(
      mismatches,
      'runtimeCertificationStatusMapResolve',
      'manifest.artefacts.certificationStatusMap',
      statusMapResult.error,
      statusMapResult.error,
    );
    return { pass: false, mismatches };
  }

  const statusMapReleaseId = statusMapResult.data?.metadata?.contentReleaseId;
  if (statusMapReleaseId !== manifest.contentReleaseId) {
    addMismatch(
      mismatches,
      'runtimeStatusMapReleaseId',
      statusMapReleaseId || null,
      manifest.contentReleaseId,
      `Certification status map metadata.contentReleaseId "${statusMapReleaseId || 'missing'}" does not match manifest contentReleaseId "${manifest.contentReleaseId}"`,
    );
  }

  if (GRAMMAR_RUNTIME_CERTIFICATION_RELEASE_ID !== manifest.contentReleaseId) {
    addMismatch(
      mismatches,
      'runtimeGeneratedReleaseId',
      GRAMMAR_RUNTIME_CERTIFICATION_RELEASE_ID,
      manifest.contentReleaseId,
      `Runtime generated certification release "${GRAMMAR_RUNTIME_CERTIFICATION_RELEASE_ID}" does not match manifest "${manifest.contentReleaseId}"`,
    );
  }

  if (GRAMMAR_RUNTIME_CERTIFICATION_TEMPLATE_COUNT !== manifest.templateDenominator) {
    addMismatch(
      mismatches,
      'runtimeGeneratedTemplateCount',
      GRAMMAR_RUNTIME_CERTIFICATION_TEMPLATE_COUNT,
      manifest.templateDenominator,
      `Runtime generated template count ${GRAMMAR_RUNTIME_CERTIFICATION_TEMPLATE_COUNT} does not match manifest denominator ${manifest.templateDenominator}`,
    );
  }

  let expectedRuntime;
  try {
    expectedRuntime = buildRuntimeCertificationStatus(statusMapResult.data, { statusMapPath: statusMapResult.path });
  } catch (err) {
    addMismatch(
      mismatches,
      'runtimeStatusMapShape',
      'valid generated runtime status input',
      err.message,
      `Certification status map cannot generate runtime authority: ${err.message}`,
    );
    return { pass: false, mismatches };
  }

  const generatedPath = path.resolve(rootDir, 'worker', 'src', 'subjects', 'grammar', 'certification-status.generated.js');
  const expectedGeneratedSource = buildGeneratedSource(expectedRuntime);
  if (!existsSync(generatedPath)) {
    addMismatch(
      mismatches,
      'runtimeGeneratedSourceMissing',
      'worker/src/subjects/grammar/certification-status.generated.js',
      'file not found',
      'Committed runtime generated status source is missing',
    );
  } else {
    const committedSource = readFileSync(generatedPath, 'utf8');
    if (committedSource !== expectedGeneratedSource) {
      addMismatch(
        mismatches,
        'runtimeGeneratedSourceDrift',
        'committed generated source',
        'regenerated source differs',
        'Committed runtime generated status source is stale; regenerate it from the manifest certification status map',
      );
    }
  }

  const runtimeIds = Object.keys(CERTIFICATION_STATUS_MAP);
  const expectedIds = Object.keys(expectedRuntime.entries);
  if (runtimeIds.length !== expectedIds.length) {
    addMismatch(
      mismatches,
      'runtimeStatusEntryCount',
      runtimeIds.length,
      expectedIds.length,
      `Runtime status map has ${runtimeIds.length} entries but expected ${expectedIds.length}`,
    );
  }

  const runtimeIdSet = new Set(runtimeIds);
  const expectedIdSet = new Set(expectedIds);
  const missingRuntimeIds = expectedIds.filter((id) => !runtimeIdSet.has(id));
  const extraRuntimeIds = runtimeIds.filter((id) => !expectedIdSet.has(id));
  if (missingRuntimeIds.length > 0) {
    addMismatch(
      mismatches,
      'runtimeStatusMissingTemplates',
      missingRuntimeIds,
      'no missing templates',
      `Runtime status map missing template(s): ${missingRuntimeIds.join(', ')}`,
    );
  }
  if (extraRuntimeIds.length > 0) {
    addMismatch(
      mismatches,
      'runtimeStatusUnknownTemplates',
      extraRuntimeIds,
      'no unknown runtime templates',
      `Runtime status map has unknown template(s): ${extraRuntimeIds.join(', ')}`,
    );
  }

  for (const templateId of expectedIds) {
    const expectedEntry = expectedRuntime.entries[templateId];
    const runtimeEntry = CERTIFICATION_STATUS_MAP[templateId];
    if (!runtimeEntry) continue;

    if (runtimeEntry.status !== expectedEntry.status) {
      addMismatch(
        mismatches,
        `runtimeStatusMismatch:${templateId}`,
        runtimeEntry.status,
        expectedEntry.status,
        `Runtime status for ${templateId} is "${runtimeEntry.status}" but status-map artefact says "${expectedEntry.status}"`,
      );
    }
    if (runtimeEntry.severity !== expectedEntry.severity) {
      addMismatch(
        mismatches,
        `runtimeSeverityMismatch:${templateId}`,
        runtimeEntry.severity,
        expectedEntry.severity,
        `Runtime severity for ${templateId} is "${runtimeEntry.severity}" but status-map artefact says "${expectedEntry.severity}"`,
      );
    }
    if (!sameStringArray(runtimeEntry.evidence, expectedEntry.evidence)) {
      addMismatch(
        mismatches,
        `runtimeEvidenceMismatch:${templateId}`,
        runtimeEntry.evidence,
        expectedEntry.evidence,
        `Runtime evidence for ${templateId} does not match the status-map artefact`,
      );
    }
  }

  if (isTemplateBlocked('__grammar_qg_p13_unknown_template__') !== true) {
    addMismatch(
      mismatches,
      'runtimeUnknownTemplateFailClosed',
      false,
      true,
      'Runtime isTemplateBlocked must block unknown template IDs',
    );
  }

  return { pass: mismatches.length === 0, mismatches };
}

/**
 * Validate that active runtime authority no longer references P10 artefacts or
 * an all-approved metadata fallback.
 */
export function validateNoLegacyRuntimeAuthorityReferences(opts = {}) {
  const rootDir = opts.rootDir || ROOT_DIR;
  const mismatches = [];
  const runtimePath = path.resolve(rootDir, 'worker', 'src', 'subjects', 'grammar', 'certification-status.js');
  const generatedPath = path.resolve(rootDir, 'worker', 'src', 'subjects', 'grammar', 'certification-status.generated.js');
  const packagePath = path.resolve(rootDir, 'package.json');

  for (const filePath of [runtimePath, generatedPath]) {
    if (!existsSync(filePath)) continue;
    const relPath = path.relative(rootDir, filePath);
    const source = readFileSync(filePath, 'utf8');
    if (source.includes('grammar-qg-p10-certification-status-map.json')) {
      addMismatch(
        mismatches,
        'legacyP10RuntimeReference',
        relPath,
        'no P10 runtime status artefact reference',
        `${relPath} references grammar-qg-p10-certification-status-map.json`,
      );
    }
    if (source.includes('loadFromJsonRegister') || source.includes('new Function(') || source.includes('createRequire(')) {
      addMismatch(
        mismatches,
        'nodeDynamicRuntimeStatusLoader',
        relPath,
        'Worker-safe static generated import',
        `${relPath} contains a dynamic Node loader pattern`,
      );
    }
    if (source.includes('GRAMMAR_TEMPLATE_METADATA.map') && source.includes("status: 'approved'")) {
      addMismatch(
        mismatches,
        'allApprovedRuntimeFallback',
        relPath,
        'no metadata-derived all-approved fallback',
        `${relPath} appears to build an all-approved fallback from GRAMMAR_TEMPLATE_METADATA`,
      );
    }
  }

  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    const activeReleaseScript = pkg?.scripts?.['verify:grammar-qg-production-release'] || '';
    if (activeReleaseScript.includes('grammar-qg-p10-certification-manifest.json')) {
      addMismatch(
        mismatches,
        'legacyP10ActiveReleaseGate',
        activeReleaseScript,
        'P11 production release manifest',
        'Active Grammar QG production-release script references the P10 certification manifest',
      );
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

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
  'ok',
  'releaseId',
  'evidenceOrigin',
  'environment',
  'deployedUrl',
  'timestamp',
  'command',
  'learnerFixtureType',
  'itemCreationResult',
  'answerSubmissionResult',
  'readModelUpdateResult',
  'noAnswerLeakAssertion',
  'semanticCueAssertion',
  'promptCueAssertion',
  'readAloudAssertion',
  'releaseIdAssertion',
  'failureDetails',
];

function smokeAssertionPassed(value) {
  if (value == null || typeof value !== 'object') return false;
  if ('pass' in value) return value.pass === true;
  if ('ok' in value) return value.ok === true;
  return false;
}

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

    const evidenceRelPath = manifest?.artefacts?.productionSmoke
      || path.join('reports', 'grammar', `grammar-production-smoke-${releaseId}.json`);
    const evidencePath = path.resolve(rootDir, evidenceRelPath);

    // Check file existence
    if (!existsSync(evidencePath)) {
      mismatches.push({
        field: 'smokeEvidenceFile',
        claimed: 'CERTIFIED_POST_DEPLOY',
        actual: `evidence file not found at ${evidenceRelPath}`,
        message: `Report claims CERTIFIED_POST_DEPLOY but smoke evidence file does not exist: ${evidenceRelPath}`,
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

    if (evidence.contentReleaseId && evidence.contentReleaseId !== releaseId) {
      mismatches.push({
        field: 'smokeEvidenceContentReleaseIdMismatch',
        claimed: releaseId,
        actual: evidence.contentReleaseId,
        message: `Smoke evidence contentReleaseId "${evidence.contentReleaseId}" does not match manifest contentReleaseId "${releaseId}"`,
      });
    }

    if (evidence.evidenceOrigin !== 'post-deploy') {
      mismatches.push({
        field: 'smokeEvidenceOrigin',
        claimed: 'post-deploy',
        actual: evidence.evidenceOrigin,
        message: `Smoke evidence origin must be "post-deploy", got "${evidence.evidenceOrigin}"`,
      });
    }

    if (evidence.environment !== 'production') {
      mismatches.push({
        field: 'smokeEvidenceEnvironment',
        claimed: 'production',
        actual: evidence.environment,
        message: `Smoke evidence environment must be "production", got "${evidence.environment}"`,
      });
    }

    try {
      const deployedHost = new URL(evidence.deployedUrl).host;
      if (deployedHost !== 'ks2.eugnel.uk') {
        mismatches.push({
          field: 'smokeEvidenceDeployedUrl',
          claimed: 'ks2.eugnel.uk',
          actual: evidence.deployedUrl,
          message: `Smoke evidence deployedUrl must point at production ks2.eugnel.uk, got "${evidence.deployedUrl}"`,
        });
      }
    } catch {
      mismatches.push({
        field: 'smokeEvidenceDeployedUrl',
        claimed: 'valid production URL',
        actual: evidence.deployedUrl,
        message: `Smoke evidence deployedUrl is not a valid URL: ${evidence.deployedUrl}`,
      });
    }

    if (evidence.ok !== true) {
      mismatches.push({
        field: 'smokeEvidenceOk',
        claimed: true,
        actual: evidence.ok,
        message: 'Smoke evidence ok must be true for CERTIFIED_POST_DEPLOY',
      });
    }

    const assertionFields = [
      'itemCreationResult',
      'answerSubmissionResult',
      'readModelUpdateResult',
      'noAnswerLeakAssertion',
      'semanticCueAssertion',
      'promptCueAssertion',
      'readAloudAssertion',
      'releaseIdAssertion',
    ];
    for (const field of assertionFields) {
      if (!smokeAssertionPassed(evidence[field])) {
        mismatches.push({
          field: `smokeAssertion:${field}`,
          claimed: 'passing assertion',
          actual: evidence[field] || null,
          message: `Smoke evidence assertion ${field} must pass for CERTIFIED_POST_DEPLOY`,
        });
      }
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
 * @returns {{ pass: boolean, mismatches: Array<{ field: string, claimed: any, actual: any, message: string }> }}
 */
export function validateReleaseIdConsistency(manifest, reportReleaseId, reportContent, opts = {}) {
  const mismatches = [];
  const expectedRelease = opts.expectedRelease || GRAMMAR_CONTENT_RELEASE_ID;

  if (manifest.contentReleaseId !== expectedRelease) {
    mismatches.push({
      field: 'manifestVsCodeReleaseId',
      claimed: manifest.contentReleaseId,
      actual: expectedRelease,
      message: `Manifest contentReleaseId "${manifest.contentReleaseId}" does not match expected release "${expectedRelease}"`,
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

  if (reportContent != null) {
    const fm = extractFrontmatter(reportContent);
    if (fm.final_content_release_id != null && fm.final_content_release_id !== expectedRelease) {
      mismatches.push({
        field: 'reportFrontmatterVsCodeReleaseId',
        claimed: fm.final_content_release_id,
        actual: expectedRelease,
        message: `Report frontmatter final_content_release_id "${fm.final_content_release_id}" does not match expected release "${expectedRelease}"`,
      });
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

// ---------------------------------------------------------------------------
// Cross-check: report claimed counts vs artefact metadata (P11-U1)
// ---------------------------------------------------------------------------

/**
 * Validate that a completion report's claimed counts match the actual artefact
 * metadata (marking matrix totalEntries, quality register approved/limited counts).
 *
 * @param {object} manifest - Parsed certification manifest JSON.
 * @param {string} reportPath - Path to the completion report markdown file.
 * @param {object} [opts] - Options.
 * @param {string} [opts.rootDir] - Project root directory.
 * @returns {{ pass: boolean, mismatches: Array<{ field: string, claimed: any, actual: any, message: string }> }}
 */
export function validateReportCounts(manifest, reportPath, opts = {}) {
  const rootDir = opts.rootDir || ROOT_DIR;
  const mismatches = [];

  if (!existsSync(reportPath)) {
    mismatches.push({
      field: 'reportFile',
      claimed: reportPath,
      actual: 'not found',
      message: `Report file not found: ${reportPath}`,
    });
    return { pass: false, mismatches };
  }

  const reportContent = readFileSync(reportPath, 'utf8');

  // --- Marking matrix count cross-check ---
  let markingMatrixPath;
  let matrix = null;
  if (manifest.artefacts) {
    const matrixResult = readJsonArtefact(manifest, 'markingMatrix', rootDir);
    if (matrixResult.ok) {
      matrix = matrixResult.data;
      markingMatrixPath = matrixResult.path;
      // Validate contentReleaseId consistency
      if (matrix?.metadata?.contentReleaseId && matrix.metadata.contentReleaseId !== manifest.contentReleaseId) {
        mismatches.push({
          field: 'markingMatrixReleaseIdMismatch',
          claimed: manifest.contentReleaseId,
          actual: matrix.metadata.contentReleaseId,
          message: `Marking matrix metadata.contentReleaseId "${matrix.metadata.contentReleaseId}" does not match manifest contentReleaseId "${manifest.contentReleaseId}"`,
        });
      }
    } else {
      mismatches.push({
        field: 'markingMatrixResolve',
        claimed: 'artefacts.markingMatrix',
        actual: matrixResult.error,
        message: matrixResult.error,
      });
    }
  } else {
    // Legacy P10 fallback — no artefacts map in manifest
    console.warn('WARN: manifest.artefacts not found — falling back to legacy P10 paths for markingMatrix');
    markingMatrixPath = path.join(rootDir, 'reports', 'grammar', 'grammar-qg-p10-marking-matrix.json');
    if (existsSync(markingMatrixPath)) {
      try {
        matrix = JSON.parse(readFileSync(markingMatrixPath, 'utf8'));
      } catch (err) {
        mismatches.push({
          field: 'markingMatrixParse',
          claimed: 'valid JSON',
          actual: `parse error: ${err.message}`,
          message: `Marking matrix file is not valid JSON: ${err.message}`,
        });
      }
    }
  }

  if (matrix?.metadata?.totalEntries != null) {
    // Extract claimed marking matrix count from report
    // Pattern: "N marking matrix entries" or "Marking matrix (N entries"
    const matrixCountRegex = /(\d+)\s+marking\s+matrix\s+entries|[Mm]arking\s+matrix\s*\((\d+)\s+entries/;
    const matrixMatch = reportContent.match(matrixCountRegex);
    if (matrixMatch) {
      const claimedCount = Number(matrixMatch[1] || matrixMatch[2]);
      if (claimedCount !== matrix.metadata.totalEntries) {
        mismatches.push({
          field: 'markingMatrixCount',
          claimed: claimedCount,
          actual: matrix.metadata.totalEntries,
          message: `Report claims ${claimedCount} marking matrix entries but artefact metadata has ${matrix.metadata.totalEntries}`,
        });
      }
    }
  }

  // --- Quality register status count cross-check ---
  let qualityRegisterPath;
  let register = null;
  if (manifest.artefacts) {
    const registerResult = readJsonArtefact(manifest, 'qualityRegister', rootDir);
    if (registerResult.ok) {
      register = registerResult.data;
      qualityRegisterPath = registerResult.path;
      // Validate contentReleaseId consistency
      if (register?.metadata?.contentReleaseId && register.metadata.contentReleaseId !== manifest.contentReleaseId) {
        mismatches.push({
          field: 'qualityRegisterReleaseIdMismatch',
          claimed: manifest.contentReleaseId,
          actual: register.metadata.contentReleaseId,
          message: `Quality register metadata.contentReleaseId "${register.metadata.contentReleaseId}" does not match manifest contentReleaseId "${manifest.contentReleaseId}"`,
        });
      }
    } else {
      mismatches.push({
        field: 'qualityRegisterResolve',
        claimed: 'artefacts.qualityRegister',
        actual: registerResult.error,
        message: registerResult.error,
      });
    }
  } else {
    // Legacy P10 fallback — no artefacts map in manifest
    console.warn('WARN: manifest.artefacts not found — falling back to legacy P10 paths for qualityRegister');
    qualityRegisterPath = path.join(rootDir, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json');
    if (existsSync(qualityRegisterPath)) {
      try {
        register = JSON.parse(readFileSync(qualityRegisterPath, 'utf8'));
      } catch (err) {
        mismatches.push({
          field: 'qualityRegisterParse',
          claimed: 'valid JSON',
          actual: `parse error: ${err.message}`,
          message: `Quality register file is not valid JSON: ${err.message}`,
        });
      }
    }
  }

  if (register?.metadata) {
    const meta = register.metadata;
    // Extract claimed quality register counts from report
    // Pattern: "N approved" or "N/N templates approved" or "N approved + M approved_with_limitation"
    const approvedRegex = /(\d+)\s+approved\s*\+\s*(\d+)\s+approved_with_limitation/;
    const simpleApprovedRegex = /(\d+)\/(\d+)\s+templates?\s+approved|(\d+)\s+templates?\s+approved/;

    const compoundMatch = reportContent.match(approvedRegex);
    if (compoundMatch) {
      const claimedApproved = Number(compoundMatch[1]);
      const claimedLimited = Number(compoundMatch[2]);
      if (claimedApproved !== meta.approved) {
        mismatches.push({
          field: 'qualityRegisterApproved',
          claimed: claimedApproved,
          actual: meta.approved,
          message: `Report claims ${claimedApproved} approved but quality register has ${meta.approved}`,
        });
      }
      if (claimedLimited !== meta.approvedWithLimitation) {
        mismatches.push({
          field: 'qualityRegisterApprovedWithLimitation',
          claimed: claimedLimited,
          actual: meta.approvedWithLimitation,
          message: `Report claims ${claimedLimited} approved_with_limitation but quality register has ${meta.approvedWithLimitation}`,
        });
      }
    } else {
      const simpleMatch = reportContent.match(simpleApprovedRegex);
      if (simpleMatch) {
        // "78/78 templates approved" → check total
        const claimedTotal = Number(simpleMatch[1] || simpleMatch[3]);
        const actualTotal = (meta.approved || 0) + (meta.approvedWithLimitation || 0);
        if (claimedTotal !== actualTotal && claimedTotal !== meta.approved) {
          mismatches.push({
            field: 'qualityRegisterTotal',
            claimed: claimedTotal,
            actual: `${meta.approved} approved + ${meta.approvedWithLimitation} approved_with_limitation = ${actualTotal} total`,
            message: `Report claims ${claimedTotal} templates approved but quality register has ${meta.approved} approved + ${meta.approvedWithLimitation} approved_with_limitation`,
          });
        }
      }
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

// ---------------------------------------------------------------------------
// Cross-check: marking matrix totalEntries (P11-U7)
// ---------------------------------------------------------------------------

/**
 * Validate that the marking matrix JSON metadata.totalEntries matches expectations.
 *
 * @param {object} manifest - Parsed certification manifest JSON (unused but kept for API consistency).
 * @param {string} rootDir - Project root directory.
 * @returns {{ pass: boolean, expected: number, actual: number }}
 */
export function validateMarkingMatrixCounts(manifest, rootDir) {
  const effectiveRoot = rootDir || ROOT_DIR;

  let matrixPath;
  let matrix;

  if (manifest?.artefacts) {
    const result = readJsonArtefact(manifest, 'markingMatrix', effectiveRoot);
    if (!result.ok) {
      return { pass: false, expected: 80, actual: 0, error: result.error };
    }
    matrix = result.data;
    matrixPath = result.path;
    // Validate contentReleaseId consistency
    if (matrix?.metadata?.contentReleaseId && matrix.metadata.contentReleaseId !== manifest.contentReleaseId) {
      return {
        pass: false,
        expected: 80,
        actual: 0,
        error: `Marking matrix metadata.contentReleaseId "${matrix.metadata.contentReleaseId}" does not match manifest contentReleaseId "${manifest.contentReleaseId}"`,
      };
    }
  } else {
    // Legacy P10 fallback
    console.warn('WARN: manifest.artefacts not found — falling back to legacy P10 paths for markingMatrix');
    matrixPath = path.join(effectiveRoot, 'reports', 'grammar', 'grammar-qg-p10-marking-matrix.json');
    if (!existsSync(matrixPath)) {
      return { pass: false, expected: 80, actual: 0, error: `Marking matrix file not found: ${matrixPath}` };
    }
    try {
      matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
    } catch (err) {
      return { pass: false, expected: 80, actual: 0, error: `Failed to parse marking matrix JSON: ${err.message}` };
    }
  }

  const actual = matrix?.metadata?.totalEntries ?? 0;
  const expected = 80; // seeds 1..5, 16 entries per seed
  return { pass: actual === expected, expected, actual };
}

// ---------------------------------------------------------------------------
// Cross-check: distractor review coverage (P11-U6)
// ---------------------------------------------------------------------------

/**
 * Validate that every template flagged as requiresAdultReview in the distractor
 * audit has a corresponding adultReviewDecision in the quality register.
 *
 * @param {object} manifest - Parsed certification manifest JSON. When `manifest.artefacts`
 *   is present, artefact paths are resolved from the manifest; otherwise falls back to
 *   legacy P10 report paths.
 * @param {string} [rootDir] - Project root directory (defaults to repository root).
 * @returns {{ pass: boolean, missing: string[], covered: string[], error?: string }}
 */
export function validateDistractorReviewCoverage(manifest, rootDir) {
  const effectiveRoot = rootDir || ROOT_DIR;

  let audit, register;

  if (manifest?.artefacts) {
    const auditResult = readJsonArtefact(manifest, 'distractorAudit', effectiveRoot);
    if (!auditResult.ok) {
      return { pass: false, missing: [], covered: [], error: auditResult.error };
    }
    audit = auditResult.data;
    // Validate contentReleaseId consistency
    if (audit?.metadata?.contentReleaseId && audit.metadata.contentReleaseId !== manifest.contentReleaseId) {
      return {
        pass: false,
        missing: [],
        covered: [],
        error: `Distractor audit metadata.contentReleaseId "${audit.metadata.contentReleaseId}" does not match manifest contentReleaseId "${manifest.contentReleaseId}"`,
      };
    }

    const registerResult = readJsonArtefact(manifest, 'qualityRegister', effectiveRoot);
    if (!registerResult.ok) {
      return { pass: false, missing: [], covered: [], error: registerResult.error };
    }
    register = registerResult.data;
    // Validate contentReleaseId consistency
    if (register?.metadata?.contentReleaseId && register.metadata.contentReleaseId !== manifest.contentReleaseId) {
      return {
        pass: false,
        missing: [],
        covered: [],
        error: `Quality register metadata.contentReleaseId "${register.metadata.contentReleaseId}" does not match manifest contentReleaseId "${manifest.contentReleaseId}"`,
      };
    }
  } else {
    // Legacy P10 fallback
    console.warn('WARN: manifest.artefacts not found — falling back to legacy P10 paths for distractorAudit/qualityRegister');
    const auditPath = path.join(effectiveRoot, 'reports', 'grammar', 'grammar-qg-p10-distractor-audit.json');
    const registerPath = path.join(effectiveRoot, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json');

    if (!existsSync(auditPath)) {
      return { pass: false, missing: [], covered: [], error: `Distractor audit file not found: ${auditPath}` };
    }
    if (!existsSync(registerPath)) {
      return { pass: false, missing: [], covered: [], error: `Quality register file not found: ${registerPath}` };
    }

    try {
      audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    } catch (err) {
      return { pass: false, missing: [], covered: [], error: `Failed to parse distractor audit: ${err.message}` };
    }
    try {
      register = JSON.parse(readFileSync(registerPath, 'utf8'));
    } catch (err) {
      return { pass: false, missing: [], covered: [], error: `Failed to parse quality register: ${err.message}` };
    }
  }

  // Collect unique templates requiring adult review
  const requiresReview = new Set();
  for (const item of (audit.results || [])) {
    if (item.requiresAdultReview) {
      requiresReview.add(item.templateId);
    }
  }

  // Also include ambiguousTemplates from metadata
  for (const t of (audit.ambiguousTemplates || [])) {
    requiresReview.add(t);
  }

  // Check each against quality register
  const missing = [];
  const covered = [];
  const registerMap = new Map((register.entries || []).map((e) => [e.templateId, e]));

  for (const templateId of requiresReview) {
    const entry = registerMap.get(templateId);
    if (!entry || !entry.adultReviewDecision) {
      missing.push(templateId);
    } else {
      covered.push(templateId);
    }
  }

  return { pass: missing.length === 0, missing, covered };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const jsonOutput = argv.includes('--json');
  const expectedReleaseArg = argv.find((a) => a.startsWith('--expected-release='));
  const expectedRelease = expectedReleaseArg ? expectedReleaseArg.split('=')[1] : undefined;

  if (args.length < 1) {
    console.error('Usage: validate-grammar-qg-certification-evidence.mjs <manifest-path> [report-path] [--json] [--expected-release=ID]');
    console.error('');
    console.error('  manifest-path       Path to the certification manifest JSON');
    console.error('  report-path         Optional path to a completion report to cross-validate');
    console.error('  --expected-release   Override the expected release ID (default: live code constant)');
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

  const expectedPathResult = validateManifestExpectedOutputPaths(manifestResult.manifest);
  if (!expectedPathResult.pass) {
    if (jsonOutput) {
      console.log(JSON.stringify({ pass: false, gate: 'manifest-expected-output-paths', mismatches: expectedPathResult.mismatches }, null, 2));
    } else {
      console.log(`FAIL: Manifest expected output paths — ${expectedPathResult.mismatches.length} mismatch(es)\n`);
      for (const m of expectedPathResult.mismatches) {
        console.log(`  [${m.field}] ${m.message}`);
      }
    }
    process.exit(1);
  }
  console.log('PASS: Manifest expected output paths are valid or absent');

  // Gate 1b: Validate render inventory release IDs if inventory exists
  const releaseId = manifestResult.manifest.contentReleaseId;
  let inventoryPath;
  if (manifestResult.manifest.artefacts) {
    const invResolved = requireArtefact(manifestResult.manifest, 'renderInventory', ROOT_DIR);
    if (invResolved.ok) {
      inventoryPath = invResolved.path;
    }
    // If artefact key missing or file not found, skip gracefully (no inventory = no gate)
  } else {
    // Legacy P10 fallback
    console.warn('WARN: manifest.artefacts not found — falling back to legacy P10 path for renderInventory');
    const legacyPath = path.join(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p10-render-inventory.json');
    if (existsSync(legacyPath)) {
      inventoryPath = legacyPath;
    }
  }
  if (inventoryPath) {
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

  // Gate 1c: Validate release ID consistency (manifest ↔ expected release)
  const releaseIdResult = validateReleaseIdConsistency(manifestResult.manifest, null, null, { expectedRelease });
  if (!releaseIdResult.pass) {
    if (jsonOutput) {
      console.log(JSON.stringify({ pass: false, gate: 'release-id-consistency', mismatches: releaseIdResult.mismatches }, null, 2));
    } else {
      console.log(`FAIL: Release ID consistency — ${releaseIdResult.mismatches.length} mismatch(es)\n`);
      for (const m of releaseIdResult.mismatches) {
        console.log(`  [${m.field}] ${m.message}`);
      }
    }
    process.exit(1);
  }
  console.log(`PASS: Release ID consistent (manifest ↔ code: ${releaseId})`);

  if (manifestResult.manifest.contentReleaseId === GRAMMAR_CONTENT_RELEASE_ID) {
    const runtimeResult = validateRuntimeCertificationAuthority(manifestResult.manifest);
    const legacyRuntimeResult = validateNoLegacyRuntimeAuthorityReferences();
    const runtimeMismatches = [
      ...runtimeResult.mismatches,
      ...legacyRuntimeResult.mismatches,
    ];
    if (runtimeMismatches.length > 0) {
      if (jsonOutput) {
        console.log(JSON.stringify({ pass: false, gate: 'runtime-certification-authority', mismatches: runtimeMismatches }, null, 2));
      } else {
        console.log(`FAIL: Runtime certification authority — ${runtimeMismatches.length} mismatch(es)\n`);
        for (const m of runtimeMismatches) {
          console.log(`  [${m.field}] ${m.message}`);
          console.log(`    claimed: ${JSON.stringify(m.claimed)}`);
          console.log(`    actual:  ${JSON.stringify(m.actual)}\n`);
        }
      }
      process.exit(1);
    }
    console.log('PASS: Runtime certification authority matches manifest status map and fails closed');
  } else {
    console.log(`SKIP: Runtime certification authority gate not applied to historical release ${manifestResult.manifest.contentReleaseId}`);
  }

  // Gate 1d: Every distractor/adult-review flag must have register evidence.
  const reviewCoverageResult = validateDistractorReviewCoverage(manifestResult.manifest, ROOT_DIR);
  if (!reviewCoverageResult.pass) {
    const reviewMismatches = [{
      field: 'distractor-review-coverage',
      message: reviewCoverageResult.error
        || `Missing adultReviewDecision for ${reviewCoverageResult.missing.length} template(s)`,
      claimed: 'all requiresAdultReview templates covered',
      actual: reviewCoverageResult.error || reviewCoverageResult.missing,
    }];

    if (jsonOutput) {
      console.log(JSON.stringify({ pass: false, gate: 'distractor-review-coverage', mismatches: reviewMismatches }, null, 2));
    } else {
      console.log(`FAIL: Distractor review coverage — ${reviewMismatches.length} mismatch(es)\n`);
      for (const m of reviewMismatches) {
        console.log(`  [${m.field}] ${m.message}`);
        console.log(`    claimed: ${JSON.stringify(m.claimed)}`);
        console.log(`    actual:  ${JSON.stringify(m.actual)}\n`);
      }
    }
    process.exit(1);
  }
  console.log(`PASS: Distractor review coverage has adult decisions for ${reviewCoverageResult.covered.length} template(s)`);

  // Gate 2: Cross-validate report if provided
  if (reportPath) {
    if (!existsSync(reportPath)) {
      console.error(`Report file not found: ${reportPath}`);
      process.exit(1);
    }

    const reportContent = readFileSync(reportPath, 'utf8');
    const reportResult = validateReportAgainstManifest(reportContent, manifestResult.manifest);
    const smokeResult = validateSmokeEvidence(manifestResult.manifest, reportContent);

    // Gate 2b: Report count cross-check against artefact metadata
    const countResult = validateReportCounts(manifestResult.manifest, reportPath);

    // Gate 2c: Release ID consistency with report frontmatter
    const reportReleaseIdResult = validateReleaseIdConsistency(
      manifestResult.manifest, null, reportContent, { expectedRelease }
    );

    const allMismatches = [
      ...reportResult.mismatches,
      ...smokeResult.mismatches,
      ...countResult.mismatches,
      ...reportReleaseIdResult.mismatches,
    ];
    const allPass = allMismatches.length === 0;

    if (jsonOutput) {
      console.log(JSON.stringify({ pass: allPass, mismatches: allMismatches }, null, 2));
    } else {
      if (allPass) {
        console.log(`PASS: Report oracle claims align with manifest windows`);
        console.log(`PASS: Report counts match artefact metadata`);
        console.log(`PASS: Report frontmatter release IDs consistent`);
      } else {
        console.log(`FAIL: ${allMismatches.length} validation mismatch(es)\n`);
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
