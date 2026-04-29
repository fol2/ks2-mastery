import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReleaseFrontmatter } from '../scripts/validate-grammar-qg-completion-report.mjs';
import { buildGrammarContentQualityAudit } from '../scripts/audit-grammar-content-quality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// --- Strict-tag regex predicate tests ---

/**
 * The future-proof predicate used in the audit script.
 * Duplicated here for direct unit testing without needing to import the
 * internal closure variable.
 */
const isStrictTag = (tag) => /^qg-p\d+$/.test(tag);

describe('Grammar QG P6 governance — strict-tag predicate', () => {
  it('qg-p5 is treated as strict', () => {
    assert.equal(isStrictTag('qg-p5'), true);
  });

  it('qg-p99 (future phase) is treated as strict', () => {
    assert.equal(isStrictTag('qg-p99'), true);
  });

  it('qg-p (no digit) is NOT strict', () => {
    assert.equal(isStrictTag('qg-p'), false);
  });

  it('my-qg-p5-thing (substring match) is NOT strict', () => {
    assert.equal(isStrictTag('my-qg-p5-thing'), false);
  });

  it('qg-p1 (existing phase) remains strict', () => {
    assert.equal(isStrictTag('qg-p1'), true);
  });

  it('qg-p3 (existing phase) remains strict', () => {
    assert.equal(isStrictTag('qg-p3'), true);
  });

  it('qg-p4 (existing phase) remains strict', () => {
    assert.equal(isStrictTag('qg-p4'), true);
  });
});

// --- Report validation CLI reachability test ---

describe('Grammar QG P6 governance — report validation script', () => {
  it('validate script shows usage when called without a report path', () => {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'validate-grammar-qg-completion-report.mjs');
    try {
      execFileSync('node', [scriptPath], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.fail('Expected script to exit non-zero when no path provided');
    } catch (err) {
      // The script exits with code 1 and prints usage to stderr
      assert.equal(err.status, 1);
      assert.ok(
        err.stderr.includes('Usage:'),
        `Expected usage message in stderr, got: ${err.stderr}`,
      );
    }
  });

  it('validate script exits non-zero for a non-existent report file', () => {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'validate-grammar-qg-completion-report.mjs');
    try {
      execFileSync('node', [scriptPath, '/nonexistent/path/report.md'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.fail('Expected script to exit non-zero for missing file');
    } catch (err) {
      assert.equal(err.status, 1);
      assert.ok(
        err.stderr.includes('not found'),
        `Expected 'not found' message in stderr, got: ${err.stderr}`,
      );
    }
  });
});

// --- Release frontmatter validation ---

describe('Grammar QG P6 governance — release frontmatter validation', () => {
  it('valid frontmatter passes', () => {
    const report = `---
implementation_prs:
  - "#548"
  - "#549"
final_content_release_commit: abc1234def5678
post_merge_fix_commits:
  - "def7890abc1234"
final_report_commit: 1234567890abcdef
---
# Report body
`;
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('missing implementation_prs fails', () => {
    const report = `---
final_content_release_commit: abc1234def5678
post_merge_fix_commits:
  - "fix1"
final_report_commit: 1234567890abcdef
---
`;
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === 'implementation_prs'));
  });

  it('short final_content_release_commit fails', () => {
    const report = `---
implementation_prs:
  - "#100"
final_content_release_commit: abc
post_merge_fix_commits:
  - "fix1"
final_report_commit: 1234567890abcdef
---
`;
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === 'final_content_release_commit'));
  });

  it('missing final_report_commit fails', () => {
    const report = `---
implementation_prs:
  - "#100"
final_content_release_commit: abc1234def5678
post_merge_fix_commits:
  - "fix1"
---
`;
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === 'final_report_commit'));
  });

  it('empty post_merge_fix_commits list is valid', () => {
    const report = `---
implementation_prs:
  - "#200"
final_content_release_commit: abc1234def5678
post_merge_fix_commits:
final_report_commit: 1234567890abcdef
---
`;
    const result = validateReleaseFrontmatter(report);
    // post_merge_fix_commits with no items is parsed as null/empty — tolerated
    assert.equal(result.valid, true);
  });
});

// --- Content-quality hard-fail detection ---

describe('Grammar QG P6 governance — content-quality hard-fail detection', () => {
  it('real content-quality audit runs without crash', () => {
    // Run with a single seed to keep test fast
    const result = buildGrammarContentQualityAudit([1]);
    assert.ok(typeof result.summary.hardFailCount === 'number');
    assert.ok(typeof result.summary.advisoryCount === 'number');
    assert.ok(Array.isArray(result.hardFailures));
  });

  it('zero hard failures in current baseline (seeds 1-3)', () => {
    // This validates that P1-P5 baselines remain clean
    const result = buildGrammarContentQualityAudit([1, 2, 3]);
    assert.equal(
      result.summary.hardFailCount,
      0,
      `Expected 0 hard failures but found ${result.summary.hardFailCount}: ${JSON.stringify(result.hardFailures.slice(0, 3))}`,
    );
  });
});
