/**
 * Session manifest loader for the classroom load driver.
 *
 * When --session-manifest is supplied, the driver skips demo-session creation
 * and uses pre-created sessions from a manifest JSON file. This avoids hitting
 * the per-IP rate limit (DEMO_LIMITS.createIp = 30 per 10-min window) which
 * blocks 60-learner tests from a single IP.
 *
 * Manifest format: JSON array of objects:
 *   { "learnerId": "...", "sessionCookie": "...", "createdAt": "...", "sourceIp": "..." }
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FIELDS = ['learnerId', 'sessionCookie', 'createdAt', 'sourceIp'];

/**
 * Validate a single manifest entry has all required fields with non-empty string values.
 * @param {object} entry
 * @param {number} index — position in the array for error reporting
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifestEntry(entry, index = 0) {
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push(`Entry at index ${index} is not a plain object.`);
    return { valid: false, errors };
  }
  for (const field of REQUIRED_FIELDS) {
    const value = entry[field];
    if (value === undefined || value === null) {
      errors.push(`Entry at index ${index} is missing required field "${field}".`);
    } else if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`Entry at index ${index} has empty or non-string "${field}".`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Load and validate a session manifest from a JSON file.
 *
 * @param {string} manifestPath — path to the manifest JSON file
 * @returns {{ entries: object[], count: number }}
 * @throws {Error} on read failure, parse failure, or validation failure
 */
export function loadSessionManifest(manifestPath) {
  const absolutePath = resolve(process.cwd(), manifestPath);
  let raw;
  try {
    raw = readFileSync(absolutePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read session manifest "${manifestPath}": ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Session manifest "${manifestPath}" is not valid JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Session manifest "${manifestPath}" must be a JSON array, got ${typeof parsed}.`);
  }

  if (parsed.length === 0) {
    throw new Error(`Session manifest "${manifestPath}" is empty; at least one entry is required.`);
  }

  // Validate each entry
  const allErrors = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const { errors } = validateManifestEntry(parsed[i], i);
    allErrors.push(...errors);
  }
  if (allErrors.length > 0) {
    throw new Error(
      `Session manifest "${manifestPath}" has invalid entries:\n  ${allErrors.join('\n  ')}`,
    );
  }

  // Check for duplicate learnerIds
  const seen = new Set();
  const duplicates = [];
  for (const entry of parsed) {
    if (seen.has(entry.learnerId)) {
      duplicates.push(entry.learnerId);
    }
    seen.add(entry.learnerId);
  }
  if (duplicates.length > 0) {
    throw new Error(
      `Session manifest "${manifestPath}" contains duplicate learnerIds: ${[...new Set(duplicates)].join(', ')}.`,
    );
  }

  return { entries: parsed, count: parsed.length };
}
