import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateReleaseFrontmatter,
  validateGrammarCompletionReport,
} from '../scripts/validate-grammar-qg-completion-report.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function buildReport(fields = {}) {
  const defaults = {
    implementation_prs: ['#500', '#501'],
    final_content_release_commit: 'abcdef1234567',
    post_merge_fix_commits: [],
    final_report_commit: '1234567abcdef',
  };
  const merged = { ...defaults, ...fields };

  const lines = ['---'];
  for (const [key, value] of Object.entries(merged)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}:`);
        lines.push(`  - none`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  lines.push('');
  lines.push('# Completion Report');
  return lines.join('\n');
}

describe('P8 Governance: compound placeholder rejection', () => {
  const compoundPlaceholders = [
    'pending-report-commit',
    'pending-commit',
    'report-pending',
    'tbd-report',
    'unknown-report',
  ];

  for (const token of compoundPlaceholders) {
    it(`rejects compound placeholder "${token}" in final_content_release_commit`, () => {
      const report = buildReport({ final_content_release_commit: token });
      const result = validateReleaseFrontmatter(report);
      assert.equal(result.valid, false, `Should reject compound placeholder "${token}"`);
      const err = result.errors.find((e) => e.field === 'final_content_release_commit');
      assert.ok(err, `Should have error for final_content_release_commit with token "${token}"`);
      assert.match(err.message, /placeholder/i);
    });
  }

  for (const token of compoundPlaceholders) {
    it(`rejects compound placeholder "${token}" in final_report_commit`, () => {
      const report = buildReport({ final_report_commit: token });
      const result = validateReleaseFrontmatter(report);
      assert.equal(result.valid, false, `Should reject compound placeholder "${token}"`);
      const err = result.errors.find((e) => e.field === 'final_report_commit');
      assert.ok(err, `Should have error for final_report_commit with token "${token}"`);
      assert.match(err.message, /placeholder/i);
    });
  }
});

describe('P8 Governance: valid values still pass', () => {
  it('accepts valid SHA "abcdef1234567"', () => {
    const report = buildReport({
      final_content_release_commit: 'abcdef1234567',
      final_report_commit: '1234567abcdef',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  it('accepts "pending-abcdef1" (7+ hex chars mixed in — existing P7 behaviour)', () => {
    const report = buildReport({
      final_content_release_commit: 'pending-abcdef1',
      final_report_commit: 'pending-1234567',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  it('accepts pure hex "1234567890abc"', () => {
    const report = buildReport({
      final_content_release_commit: '1234567890abc',
      final_report_commit: 'abc1234567890',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });
});

describe('P8 Governance: validator module exports are callable', () => {
  it('validateReleaseFrontmatter is a callable function', () => {
    assert.equal(typeof validateReleaseFrontmatter, 'function');
  });

  it('validateGrammarCompletionReport is a callable function', () => {
    assert.equal(typeof validateGrammarCompletionReport, 'function');
  });
});
