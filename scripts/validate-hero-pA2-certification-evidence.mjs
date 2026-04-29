#!/usr/bin/env node
/**
 * Hero Mode pA2 Certification Evidence Validator (U8)
 *
 * Validates ring-by-ring evidence required to gate the A3 recommendation.
 * Each ring has different conditions (file existence, observation counts,
 * status checks, decision keywords). Uses dependency injection for testability.
 *
 * Exit code: always 0 (reports status, does not crash).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Condition evaluators
// ---------------------------------------------------------------------------

/**
 * Check that a file does NOT contain "Status: PENDING" or "**Status:** PENDING".
 */
function checkStatusNotPending(content) {
  const pendingPattern = /(?:\*\*Status:\*\*|Status:)\s*PENDING/i;
  return !pendingPattern.test(content);
}

/**
 * Count observation lines matching a dated pattern (e.g. "| 2026-").
 * Returns { count, dateKeys } where dateKeys is the set of unique YYYY-MM-DD values.
 */
function countObservations(content) {
  const datePattern = /\|\s*(20\d{2}-\d{2}-\d{2})/g;
  const dateKeys = new Set();
  let match;
  let count = 0;
  while ((match = datePattern.exec(content)) !== null) {
    dateKeys.add(match[1]);
    count++;
  }
  return { count, dateKeys: [...dateKeys] };
}

/**
 * Check that the file contains one of the valid decision keywords.
 */
function checkContainsDecision(content) {
  return /PROCEED TO A3|HOLD AND HARDEN|ROLLBACK/i.test(content);
}

// ---------------------------------------------------------------------------
// Core validation logic (pure — accepts fileReader for testability)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FileReader
 * @property {(filePath: string) => boolean} exists
 * @property {(filePath: string) => string} read
 */

/**
 * @typedef {Object} RingResult
 * @property {string} name
 * @property {boolean} pass
 * @property {string[]} failures
 */

/**
 * @typedef {Object} CertificationResult
 * @property {'NOT_CERTIFIED' | 'CERTIFIED_WITH_LIMITATIONS' | 'CERTIFIED_PRE_A3'} status
 * @property {Record<string, RingResult>} rings
 * @property {string[]} failures
 * @property {string[]} limitations
 */

/**
 * Validate all rings declared in the manifest.
 *
 * @param {object} manifest - Parsed certification manifest JSON.
 * @param {FileReader} fileReader - Dependency-injected file operations.
 * @param {string} rootDir - Project root for resolving relative paths.
 * @returns {CertificationResult}
 */
export function validateCertification(manifest, fileReader, rootDir) {
  const rings = {};
  const allFailures = [];
  const limitations = [];

  for (const [ringId, ringDef] of Object.entries(manifest.rings)) {
    const ringResult = { name: ringDef.name, pass: true, failures: [] };

    // --- requiredTests: check test file existence ---
    if (ringDef.requiredTests) {
      for (const testPath of ringDef.requiredTests) {
        const fullPath = path.join(rootDir, testPath);
        if (!fileReader.exists(fullPath)) {
          ringResult.pass = false;
          ringResult.failures.push(`Test file missing: ${testPath}`);
        }
      }
    }

    // --- requiredEvidence: check each condition ---
    if (ringDef.requiredEvidence) {
      for (const evidence of ringDef.requiredEvidence) {
        const fullPath = path.join(rootDir, evidence.path);

        if (evidence.condition === 'file_exists') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          }
        } else if (evidence.condition === 'status_not_pending') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          } else {
            const content = fileReader.read(fullPath);
            if (!checkStatusNotPending(content)) {
              ringResult.pass = false;
              ringResult.failures.push(`Status still PENDING: ${evidence.path}`);
            }
          }
        } else if (evidence.condition === 'min_observations_1') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          } else {
            const content = fileReader.read(fullPath);
            const { count } = countObservations(content);
            if (count < 1) {
              ringResult.pass = false;
              ringResult.failures.push(`Insufficient observations (${count}/1): ${evidence.path}`);
            }
          }
        } else if (evidence.condition === 'min_observations_5_min_datekeys_2') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          } else {
            const content = fileReader.read(fullPath);
            const { count, dateKeys } = countObservations(content);
            if (count < 5) {
              ringResult.pass = false;
              ringResult.failures.push(`Insufficient observations (${count}/5): ${evidence.path}`);
            }
            if (dateKeys.length < 2) {
              ringResult.pass = false;
              ringResult.failures.push(`Insufficient unique date keys (${dateKeys.length}/2): ${evidence.path}`);
            }
          }
        } else if (evidence.condition === 'contains_decision') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          } else {
            const content = fileReader.read(fullPath);
            if (!checkContainsDecision(content)) {
              ringResult.pass = false;
              ringResult.failures.push(`No decision keyword found: ${evidence.path} — expected PROCEED TO A3 / HOLD AND HARDEN / ROLLBACK`);
            }
          }
        }
      }
    }

    rings[ringId] = ringResult;
    if (!ringResult.pass) {
      allFailures.push(...ringResult.failures);
    }
  }

  // --- Determine certification status ---
  const ring0Pass = rings['A2-0']?.pass ?? false;
  const ring1Pass = rings['A2-1']?.pass ?? false;
  const ring2Pass = rings['A2-2']?.pass ?? true;
  const ring3Pass = rings['A2-3']?.pass ?? true;
  const ring4Pass = rings['A2-4']?.pass ?? true;

  let status;
  if (!ring0Pass || !ring1Pass) {
    status = 'NOT_CERTIFIED';
  } else if (!ring2Pass || !ring3Pass || !ring4Pass) {
    status = 'CERTIFIED_WITH_LIMITATIONS';
    // Collect limitations from failing non-critical rings
    for (const ringId of ['A2-2', 'A2-3', 'A2-4']) {
      if (!rings[ringId]?.pass) {
        limitations.push(`${ringId} (${rings[ringId].name}): ${rings[ringId].failures.join('; ')}`);
      }
    }
  } else {
    status = 'CERTIFIED_PRE_A3';
  }

  return { status, rings, failures: allFailures, limitations };
}

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

export { checkStatusNotPending, countObservations, checkContainsDecision };

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main() {
  const manifestPath = path.join(ROOT_DIR, 'reports', 'hero', 'hero-pA2-certification-manifest.json');

  if (!existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(0);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse manifest: ${err.message}`);
    process.exit(0);
  }

  // Real filesystem reader
  const fileReader = {
    exists: (p) => existsSync(p),
    read: (p) => readFileSync(p, 'utf8'),
  };

  const result = validateCertification(manifest, fileReader, ROOT_DIR);

  // --- Human-readable output ---
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Hero Mode pA2 — Certification Evidence Validator         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const [ringId, ringResult] of Object.entries(result.rings)) {
    const icon = ringResult.pass ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${ringId}: ${ringResult.name}`);
    if (!ringResult.pass) {
      for (const f of ringResult.failures) {
        console.log(`         - ${f}`);
      }
    }
  }

  console.log('');
  console.log(`  Status: ${result.status}`);

  if (result.limitations.length > 0) {
    console.log('');
    console.log('  Limitations:');
    for (const l of result.limitations) {
      console.log(`    - ${l}`);
    }
  }

  console.log('');

  // JSON output for machine consumption
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main();
}
