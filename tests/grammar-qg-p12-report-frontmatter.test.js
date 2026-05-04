/**
 * Grammar QG P12 — Report frontmatter validation tests.
 *
 * Validates that P12 and P11 reports have no unresolved placeholder values
 * in their YAML frontmatter, and that key fields are correct.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// P19 follow-up: P11/P12 final reports are archived under archive/ and stay
// frozen as historical evidence. The frontmatter tests still gate against
// placeholder values so the historical artefacts cannot rot in place.
const REPORTS_DIR = join(__dirname, '..', 'docs', 'plans', 'james', 'grammar', 'questions-generator', 'archive');

const P12_REPORT = join(REPORTS_DIR, 'grammar-qg-p12-final-production-certification-report-2026-04-30.md');
const P11_REPORT = join(REPORTS_DIR, 'grammar-qg-p11-final-completion-report-2026-04-30.md');

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns an object mapping frontmatter keys to their string values.
 */
function parseFrontmatter(filePath) {
  const content = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`No frontmatter found in ${filePath}`);
  const lines = match[1].split('\n');
  const result = {};
  let currentKey = null;
  for (const line of lines) {
    // Handle array items (indented with -)
    if (/^\s+-/.test(line)) {
      if (currentKey && !Array.isArray(result[currentKey])) {
        result[currentKey] = [];
      }
      if (currentKey) {
        result[currentKey].push(line.replace(/^\s+-\s*/, '').replace(/^["']|["']$/g, ''));
      }
      continue;
    }
    const kvMatch = line.match(/^([^:]+):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      if (value === '') {
        // Might be start of array or empty value
        result[currentKey] = '';
      } else {
        result[currentKey] = value.replace(/^["']|["']$/g, '');
      }
    }
  }
  return result;
}

/**
 * Validates that a frontmatter value is not a forbidden placeholder.
 * Forbidden patterns: pending-*, todo-*, tbd-*, unknown-*, empty strings.
 *
 * Exception: `pending-deployment` is allowed when certification_decision
 * is CERTIFIED_PRE_DEPLOY.
 */
function validateNoPlaceholders(value, key, certificationDecision) {
  if (typeof value !== 'string') return true;

  // Allow pending-deployment for smoke evidence in PRE_DEPLOY state
  if (
    key === 'post_deploy_smoke_evidence' &&
    value === 'pending-deployment' &&
    certificationDecision === 'CERTIFIED_PRE_DEPLOY'
  ) {
    return true;
  }

  const forbiddenPatterns = [
    /^pending-/,
    /^todo-/,
    /^tbd-/,
    /^unknown-/,
  ];

  if (value === '') return false;

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(value)) return false;
  }

  return true;
}

describe('P12 report frontmatter validation', () => {
  const frontmatter = parseFrontmatter(P12_REPORT);

  it('has no pending-* values (except post_deploy_smoke_evidence in CERTIFIED_PRE_DEPLOY)', () => {
    const certDecision = frontmatter['certification_decision'];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) continue;
      const valid = validateNoPlaceholders(value, key, certDecision);
      assert.ok(valid, `Frontmatter key "${key}" has forbidden placeholder value: "${value}"`);
    }
  });

  it('certification_decision is valid (CERTIFIED_PRE_DEPLOY or CERTIFIED_POST_DEPLOY)', () => {
    const validDecisions = ['CERTIFIED_PRE_DEPLOY', 'CERTIFIED_POST_DEPLOY'];
    assert.ok(
      validDecisions.includes(frontmatter['certification_decision']),
      `certification_decision "${frontmatter['certification_decision']}" is not valid. Expected one of: ${validDecisions.join(', ')}`
    );
  });

  it('final_content_release_id equals grammar-qg-p11-2026-04-30', () => {
    assert.equal(
      frontmatter['final_content_release_id'],
      'grammar-qg-p11-2026-04-30'
    );
  });
});

describe('P11 report frontmatter validation', () => {
  it('no longer has pending-this-commit in frontmatter', () => {
    const content = readFileSync(P11_REPORT, 'utf8').replace(/\r\n/g, '\n');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(match, 'P11 report should have frontmatter');
    assert.ok(
      !match[1].includes('pending-this-commit'),
      'P11 report frontmatter still contains "pending-this-commit"'
    );
  });
});

describe('frontmatter placeholder validator rejects forbidden values', () => {
  it('rejects pending-* values', () => {
    assert.equal(validateNoPlaceholders('pending-something', 'test_key', 'CERTIFIED_POST_DEPLOY'), false);
    assert.equal(validateNoPlaceholders('pending-this-commit', 'test_key', 'CERTIFIED_POST_DEPLOY'), false);
  });

  it('rejects todo-* values', () => {
    assert.equal(validateNoPlaceholders('todo-fill-in', 'test_key', 'CERTIFIED_POST_DEPLOY'), false);
    assert.equal(validateNoPlaceholders('todo-later', 'test_key', 'CERTIFIED_POST_DEPLOY'), false);
  });

  it('rejects tbd-* values', () => {
    assert.equal(validateNoPlaceholders('tbd-decision', 'test_key', 'CERTIFIED_POST_DEPLOY'), false);
    assert.equal(validateNoPlaceholders('tbd-unknown', 'test_key', 'CERTIFIED_POST_DEPLOY'), false);
  });

  it('rejects unknown-* values', () => {
    assert.equal(validateNoPlaceholders('unknown-sha', 'test_key', 'CERTIFIED_POST_DEPLOY'), false);
    assert.equal(validateNoPlaceholders('unknown-value', 'test_key', 'CERTIFIED_POST_DEPLOY'), false);
  });

  it('rejects empty strings', () => {
    assert.equal(validateNoPlaceholders('', 'test_key', 'CERTIFIED_POST_DEPLOY'), false);
  });

  it('accepts valid values', () => {
    assert.equal(validateNoPlaceholders('grammar-qg-p11-2026-04-30', 'test_key', 'CERTIFIED_POST_DEPLOY'), true);
    assert.equal(validateNoPlaceholders('CERTIFIED_PRE_DEPLOY', 'test_key', 'CERTIFIED_POST_DEPLOY'), true);
    assert.equal(validateNoPlaceholders('f4e5ccd4', 'test_key', 'CERTIFIED_POST_DEPLOY'), true);
    assert.equal(validateNoPlaceholders('none', 'test_key', 'CERTIFIED_POST_DEPLOY'), true);
  });

  it('allows pending-deployment for post_deploy_smoke_evidence when CERTIFIED_PRE_DEPLOY', () => {
    assert.equal(
      validateNoPlaceholders('pending-deployment', 'post_deploy_smoke_evidence', 'CERTIFIED_PRE_DEPLOY'),
      true
    );
  });

  it('rejects pending-deployment for post_deploy_smoke_evidence when CERTIFIED_POST_DEPLOY', () => {
    assert.equal(
      validateNoPlaceholders('pending-deployment', 'post_deploy_smoke_evidence', 'CERTIFIED_POST_DEPLOY'),
      false
    );
  });
});
