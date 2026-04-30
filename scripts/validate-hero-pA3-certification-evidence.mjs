#!/usr/bin/env node
/**
 * Hero Mode pA3 Certification Evidence Validator (U2)
 *
 * Provenance-aware validator that distinguishes `real-production` from
 * `simulation` rows. Validates ring-by-ring evidence required to gate
 * the A4 recommendation.
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
export function checkStatusNotPending(content) {
  const pendingPattern = /(?:\*\*Status:\*\*|Status:)\s*PENDING/i;
  return !pendingPattern.test(content);
}

/**
 * Check that the file contains one of the valid A4 decision keywords on a labelled
 * line (Decision: / Recommendation:) and NOT inside bracket-enclosed placeholder
 * text like [PROCEED TO A4 / HOLD AND HARDEN / ROLL BACK].
 */
export function checkContainsDecision(content) {
  const lines = content.split('\n');
  const labelPattern = /(?:Decision|Recommendation):\s*\*?\*?\s*(PROCEED TO A4|HOLD AND HARDEN|ROLL BACK)/i;
  return lines.some(line => {
    if (/\[.*(?:PROCEED|HOLD|ROLL\s*BACK).*\]/.test(line)) return false;
    return labelPattern.test(line);
  });
}

/**
 * Count observation lines by provenance (Source column).
 *
 * Parses a 9-column markdown table:
 * | Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |
 *
 * Source column is column index 7 (0-indexed). Classifies each row.
 * Legacy rows (fewer than 9 columns) are treated defensively as `simulation`.
 *
 * @param {string} content - File content
 * @returns {{ total: number, realProduction: number, simulation: number, staging: number, local: number, manualNote: number, dateKeys: string[], realDateKeys: string[], realLearners: string[] }}
 */
export function countObservationsByProvenance(content) {
  const result = {
    total: 0,
    realProduction: 0,
    simulation: 0,
    staging: 0,
    local: 0,
    manualNote: 0,
    dateKeys: [],
    realDateKeys: [],
    realLearners: [],
  };

  const dateKeySet = new Set();
  const realDateKeySet = new Set();
  const realLearnerSet = new Set();

  const lines = content.split('\n');

  for (const line of lines) {
    // Must be a table row starting with | and containing a date pattern
    if (!line.startsWith('|')) continue;

    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);

    // Skip header/separator rows
    if (cells.length === 0) continue;
    if (/^-+$/.test(cells[0])) continue;
    if (cells[0] === 'Date') continue;

    // Must have a date pattern in first cell
    const dateMatch = cells[0].match(/^(20\d{2}-\d{2}-\d{2})$/);
    if (!dateMatch) continue;

    const date = dateMatch[1];
    result.total++;
    dateKeySet.add(date);

    // Extract source from column 7 (0-indexed); if fewer columns, treat as simulation
    const source = cells.length >= 8 ? cells[7].toLowerCase().trim() : 'simulation';
    const learner = cells.length >= 2 ? cells[1].trim() : '';

    switch (source) {
      case 'real-production':
        result.realProduction++;
        realDateKeySet.add(date);
        if (learner) realLearnerSet.add(learner);
        break;
      case 'staging':
        result.staging++;
        break;
      case 'local':
        result.local++;
        break;
      case 'manual-note':
        result.manualNote++;
        break;
      case 'simulation':
      default:
        result.simulation++;
        break;
    }
  }

  result.dateKeys = [...dateKeySet];
  result.realDateKeys = [...realDateKeySet];
  result.realLearners = [...realLearnerSet];

  return result;
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
 * @property {'NOT_CERTIFIED' | 'CERTIFIED_WITH_LIMITATIONS' | 'CERTIFIED_PRE_A4'} status
 * @property {Record<string, RingResult>} rings
 * @property {string[]} failures
 * @property {string[]} limitations
 */

/**
 * Parse a condition string like "min_real_observations_5" or "min_real_datekeys_14"
 * into { type, threshold }.
 */
function parseCondition(condition) {
  const obsMatch = condition.match(/^min_real_observations_(\d+)$/);
  if (obsMatch) return { type: 'min_real_observations', threshold: parseInt(obsMatch[1], 10) };

  const dateMatch = condition.match(/^min_real_datekeys_(\d+)$/);
  if (dateMatch) return { type: 'min_real_datekeys', threshold: parseInt(dateMatch[1], 10) };

  const learnerMatch = condition.match(/^min_real_learners_(\d+)$/);
  if (learnerMatch) return { type: 'min_real_learners', threshold: parseInt(learnerMatch[1], 10) };

  return { type: condition, threshold: null };
}

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
        const parsed = parseCondition(evidence.condition);

        if (parsed.type === 'file_exists') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          }
        } else if (parsed.type === 'status_not_pending') {
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
        } else if (parsed.type === 'contains_decision') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          } else {
            const content = fileReader.read(fullPath);
            if (!checkContainsDecision(content)) {
              ringResult.pass = false;
              ringResult.failures.push(`No decision keyword found: ${evidence.path} — expected PROCEED TO A4 / HOLD AND HARDEN / ROLL BACK`);
            }
          }
        } else if (parsed.type === 'min_real_observations') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          } else {
            const content = fileReader.read(fullPath);
            const counts = countObservationsByProvenance(content);
            if (counts.realProduction < parsed.threshold) {
              ringResult.pass = false;
              ringResult.failures.push(`Insufficient real-production observations (${counts.realProduction}/${parsed.threshold}): ${evidence.path}`);
            }
          }
        } else if (parsed.type === 'min_real_datekeys') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          } else {
            const content = fileReader.read(fullPath);
            const counts = countObservationsByProvenance(content);
            if (counts.realDateKeys.length < parsed.threshold) {
              ringResult.pass = false;
              ringResult.failures.push(`Insufficient real-production date keys (${counts.realDateKeys.length}/${parsed.threshold}): ${evidence.path}`);
            }
          }
        } else if (parsed.type === 'min_real_learners') {
          if (!fileReader.exists(fullPath)) {
            ringResult.pass = false;
            ringResult.failures.push(`File missing: ${evidence.path} — ${evidence.description}`);
          } else {
            const content = fileReader.read(fullPath);
            const counts = countObservationsByProvenance(content);
            if (counts.realLearners.length < parsed.threshold) {
              ringResult.pass = false;
              ringResult.failures.push(`Insufficient real-production learners (${counts.realLearners.length}/${parsed.threshold}): ${evidence.path}`);
            }
          }
        } else {
          ringResult.pass = false;
          ringResult.failures.push(`Unknown condition type: ${evidence.condition}`);
        }
      }
    }

    rings[ringId] = ringResult;
    if (!ringResult.pass) {
      allFailures.push(...ringResult.failures);
    }
  }

  // --- Determine certification status ---
  const ring0Pass = rings['A3-0']?.pass ?? false;
  const ring1Pass = rings['A3-1']?.pass ?? false;
  const ring2Pass = rings['A3-2']?.pass ?? true;
  const ring3Pass = rings['A3-3']?.pass ?? true;
  const ring4Pass = rings['A3-4']?.pass ?? true;
  // A3-5 is optional — failure does NOT downgrade status
  // (explicitly skipped from status logic)

  let status;
  if (!ring0Pass || !ring1Pass) {
    status = 'NOT_CERTIFIED';
  } else if (!ring2Pass || !ring3Pass || !ring4Pass) {
    status = 'CERTIFIED_WITH_LIMITATIONS';
    // Collect limitations from failing non-critical rings
    for (const ringId of ['A3-2', 'A3-3', 'A3-4']) {
      if (!rings[ringId]?.pass) {
        limitations.push(`${ringId} (${rings[ringId].name}): ${rings[ringId].failures.join('; ')}`);
      }
    }
  } else {
    status = 'CERTIFIED_PRE_A4';
  }

  return { status, rings, failures: allFailures, limitations };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main() {
  const manifestPath = path.join(ROOT_DIR, 'reports', 'hero', 'hero-pA3-certification-manifest.json');

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
  console.log('║   Hero Mode pA3 — Certification Evidence Validator         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const [ringId, ringResult] of Object.entries(result.rings)) {
    const icon = ringResult.pass ? 'PASS' : 'FAIL';
    const optionalTag = manifest.rings[ringId]?.optional ? ' (optional)' : '';
    console.log(`  [${icon}] ${ringId}${optionalTag}: ${ringResult.name}`);
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
