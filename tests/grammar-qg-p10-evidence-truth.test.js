import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GRAMMAR_CONTENT_RELEASE_ID } from '../worker/src/subjects/grammar/content.js';
import {
  validateReleaseIdConsistency,
  validateEvidenceManifest,
  validateInventoryReleaseIds,
} from '../scripts/validate-grammar-qg-certification-evidence.mjs';
import {
  validateReleaseFrontmatter,
  extractFrontmatter,
} from '../scripts/validate-grammar-qg-completion-report.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.resolve(ROOT_DIR, 'reports', 'grammar');

// ---------------------------------------------------------------------------
// 1. P10 manifest has correct release ID matching code
// ---------------------------------------------------------------------------

describe('P10 Evidence Truth: manifest-to-code consistency', () => {
  const p10ManifestPath = path.join(REPORTS_DIR, 'grammar-qg-p10-certification-manifest.json');

  it('P10 manifest file exists', () => {
    assert.ok(fs.existsSync(p10ManifestPath), 'P10 manifest must exist');
  });

  it('P10 manifest contentReleaseId matches GRAMMAR_CONTENT_RELEASE_ID', () => {
    const manifest = JSON.parse(fs.readFileSync(p10ManifestPath, 'utf8'));
    assert.equal(manifest.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
    assert.equal(manifest.contentReleaseId, 'grammar-qg-p10-2026-04-29');
  });

  it('validateReleaseIdConsistency passes for P10 manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(p10ManifestPath, 'utf8'));
    const result = validateReleaseIdConsistency(manifest);
    assert.equal(result.pass, true, `Expected pass but got: ${JSON.stringify(result.mismatches)}`);
  });

  it('P10 manifest passes schema validation', () => {
    const result = validateEvidenceManifest(p10ManifestPath);
    assert.equal(result.valid, true, `Schema errors: ${JSON.stringify(result.errors)}`);
  });
});

// ---------------------------------------------------------------------------
// 2. Stale P8 release ID in a manifest fails validation
// ---------------------------------------------------------------------------

describe('P10 Evidence Truth: stale release ID detection', () => {
  it('manifest with P8 release ID fails cross-check against code', () => {
    const staleManifest = {
      contentReleaseId: 'grammar-qg-p8-2026-04-29',
      templateDenominator: 78,
      seedWindow: { certification: '1..30' },
      seedWindowPerEvidenceType: {
        'selected-response-oracle': '1..15',
        'constructed-response-oracle': '1..10',
        'manual-review-oracle': '1..5',
        'redaction-oracle': '1..30',
        'content-quality-audit': '1..30',
      },
      expectedItemCount: 2340,
    };
    const result = validateReleaseIdConsistency(staleManifest);
    assert.equal(result.pass, false);
    assert.equal(result.mismatches.length, 1);
    assert.match(result.mismatches[0].message, /grammar-qg-p8/);
  });

  it('manifest with P9 release ID also fails (stale after P10 bump)', () => {
    const staleManifest = { contentReleaseId: 'grammar-qg-p9-2026-04-29' };
    const result = validateReleaseIdConsistency(staleManifest);
    assert.equal(result.pass, false);
    assert.match(result.mismatches[0].message, /grammar-qg-p9/);
  });
});

// ---------------------------------------------------------------------------
// 3. pending-this-commit in frontmatter fails validation
// ---------------------------------------------------------------------------

describe('P10 Evidence Truth: placeholder rejection', () => {
  function buildReport(fields = {}) {
    const defaults = {
      implementation_prs: ['#650'],
      final_content_release_commit: 'a1b2c3d4e5f6g7h8',
      post_merge_fix_commits: [],
      final_report_commit: 'b2c3d4e5f6a7b8c9',
    };
    const merged = { ...defaults, ...fields };
    const lines = ['---'];
    for (const [key, value] of Object.entries(merged)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${key}: []`);
        } else {
          lines.push(`${key}:`);
          for (const item of value) lines.push(`  - ${item}`);
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

  it('rejects "pending-this-commit" in final_report_commit', () => {
    const report = buildReport({ final_report_commit: 'pending-this-commit' });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.field === 'final_report_commit');
    assert.ok(err, 'Expected error for final_report_commit');
    assert.match(err.message, /placeholder/i);
  });

  it('rejects "pending-report-commit" as compound placeholder', () => {
    const report = buildReport({ final_report_commit: 'pending-report-commit' });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.field === 'final_report_commit');
    assert.ok(err);
  });

  it('rejects "todo-sha" as compound placeholder', () => {
    const report = buildReport({ final_content_release_commit: 'todo-sha-value' });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 4. Inline [] YAML parses correctly as empty array
// ---------------------------------------------------------------------------

describe('P10 Evidence Truth: inline YAML empty array', () => {
  it('post_merge_fix_commits: [] parses as empty array and passes validation', () => {
    const report = [
      '---',
      'implementation_prs:',
      '  - "#650"',
      'final_content_release_commit: a1b2c3d4e5f6g7h8',
      'post_merge_fix_commits: []',
      'final_report_commit: b2c3d4e5f6a7b8c9',
      '---',
      '',
      '# Report',
    ].join('\n');
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got: ${JSON.stringify(result.errors)}`);
  });

  it('post_merge_fix_commits: [] does not produce "Must be a list" error', () => {
    const report = [
      '---',
      'implementation_prs:',
      '  - "#650"',
      'final_content_release_commit: a1b2c3d4e5f6g7h8',
      'post_merge_fix_commits: []',
      'final_report_commit: b2c3d4e5f6a7b8c9',
      '---',
      '',
      '# Report',
    ].join('\n');
    const result = validateReleaseFrontmatter(report);
    const listErr = result.errors.find((e) => e.field === 'post_merge_fix_commits');
    assert.equal(listErr, undefined, 'Should not error on inline []');
  });
});

// ---------------------------------------------------------------------------
// 5. Compound placeholders rejected
// ---------------------------------------------------------------------------

describe('P10 Evidence Truth: compound placeholder variants', () => {
  function buildReport(overrides) {
    const defaults = {
      implementation_prs: ['#650'],
      final_content_release_commit: 'a1b2c3d4e5f6g7h8',
      post_merge_fix_commits: [],
      final_report_commit: 'b2c3d4e5f6a7b8c9',
    };
    const merged = { ...defaults, ...overrides };
    const lines = ['---'];
    for (const [key, value] of Object.entries(merged)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${key}: []`);
        } else {
          lines.push(`${key}:`);
          for (const item of value) lines.push(`  - ${item}`);
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push('---');
    lines.push('');
    lines.push('# Report');
    return lines.join('\n');
  }

  const compoundPlaceholders = [
    'pending-report-commit',
    'tbd-release-sha',
    'unknown-final-commit',
    'tbc-after-merge',
    'commit-pending',
    'sha-unknown',
  ];

  for (const token of compoundPlaceholders) {
    it(`rejects compound placeholder "${token}" in final_report_commit`, () => {
      const report = buildReport({ final_report_commit: token });
      const result = validateReleaseFrontmatter(report);
      assert.equal(result.valid, false, `Should reject "${token}"`);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Valid hex SHAs containing "pending" substring pass
// ---------------------------------------------------------------------------

describe('P10 Evidence Truth: hex SHAs with placeholder substrings pass', () => {
  function buildReport(overrides) {
    const defaults = {
      implementation_prs: ['#650'],
      final_content_release_commit: 'a1b2c3d4e5f6g7h8',
      post_merge_fix_commits: [],
      final_report_commit: 'b2c3d4e5f6a7b8c9',
    };
    const merged = { ...defaults, ...overrides };
    const lines = ['---'];
    for (const [key, value] of Object.entries(merged)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${key}: []`);
        } else {
          lines.push(`${key}:`);
          for (const item of value) lines.push(`  - ${item}`);
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push('---');
    lines.push('');
    lines.push('# Report');
    return lines.join('\n');
  }

  it('"7pendinga3f" passes — digits mixed in means it is not a pure-alpha compound', () => {
    const report = buildReport({ final_report_commit: '7pendinga3f' });
    const result = validateReleaseFrontmatter(report);
    const err = result.errors.find((e) => e.field === 'final_report_commit' && /placeholder/i.test(e.message));
    assert.equal(err, undefined, '"7pendinga3f" must not be flagged as a placeholder');
  });

  it('"a0pending1b2c3d4" passes — hex-like value containing "pending" substring', () => {
    const report = buildReport({ final_content_release_commit: 'a0pending1b2c3d4' });
    const result = validateReleaseFrontmatter(report);
    const err = result.errors.find((e) => e.field === 'final_content_release_commit' && /placeholder/i.test(e.message));
    assert.equal(err, undefined, 'Hex-like value must not be flagged as a placeholder');
  });

  it('"deadbeef01234567" passes — pure hex SHA', () => {
    const report = buildReport({ final_report_commit: 'deadbeef01234567' });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got: ${JSON.stringify(result.errors)}`);
  });
});

// ---------------------------------------------------------------------------
// 7. Report release ID vs manifest cross-check
// ---------------------------------------------------------------------------

describe('P10 Evidence Truth: report-vs-manifest release ID', () => {
  it('mismatched report release ID fails', () => {
    const manifest = { contentReleaseId: 'grammar-qg-p10-2026-04-29' };
    const result = validateReleaseIdConsistency(manifest, 'grammar-qg-p9-2026-04-29');
    assert.equal(result.pass, false);
    assert.equal(result.mismatches.length, 1);
    assert.match(result.mismatches[0].field, /reportVsManifest/);
  });

  it('matching report release ID passes', () => {
    const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
    const result = validateReleaseIdConsistency(manifest, GRAMMAR_CONTENT_RELEASE_ID);
    assert.equal(result.pass, true);
  });
});

// ---------------------------------------------------------------------------
// 8. Inventory release ID cross-check (P10-R-U9)
// ---------------------------------------------------------------------------

describe('P10 Evidence Truth: inventory release ID cross-check', () => {
  const inventoryPath = path.join(REPORTS_DIR, 'grammar-qg-p10-render-inventory.json');

  it('inventory metadata release ID matches code constant', () => {
    assert.ok(fs.existsSync(inventoryPath), 'Render inventory must exist');
    const result = validateInventoryReleaseIds(inventoryPath, GRAMMAR_CONTENT_RELEASE_ID);
    const metadataMismatch = result.mismatches.find((m) => m.field === 'inventoryMetadataReleaseId');
    assert.equal(metadataMismatch, undefined,
      `Inventory metadata.contentReleaseId must match ${GRAMMAR_CONTENT_RELEASE_ID}`);
  });

  it('inventory items release IDs match code constant', () => {
    assert.ok(fs.existsSync(inventoryPath), 'Render inventory must exist');
    const result = validateInventoryReleaseIds(inventoryPath, GRAMMAR_CONTENT_RELEASE_ID);
    const itemMismatches = result.mismatches.filter((m) => m.field.startsWith('inventoryItem['));
    assert.equal(itemMismatches.length, 0,
      `All inventory items must have contentReleaseId === ${GRAMMAR_CONTENT_RELEASE_ID}`);
  });
});

// ---------------------------------------------------------------------------
// 9. Report frontmatter final_content_release_id cross-check (P10-U0)
// ---------------------------------------------------------------------------

describe('P10 Evidence Truth: frontmatter final_content_release_id cross-check', () => {
  it('mismatched final_content_release_id in frontmatter fails', () => {
    const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
    const staleReportFm = { final_content_release_id: 'grammar-qg-p9-2026-04-29' };
    const result = validateReleaseIdConsistency(manifest, null, staleReportFm);
    assert.equal(result.pass, false);
    const mismatch = result.mismatches.find((m) => m.field === 'reportFrontmatterVsCodeReleaseId');
    assert.ok(mismatch, 'Expected reportFrontmatterVsCodeReleaseId mismatch');
    assert.match(mismatch.message, /grammar-qg-p9/);
  });

  it('matching final_content_release_id passes', () => {
    const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
    const correctReportFm = { final_content_release_id: GRAMMAR_CONTENT_RELEASE_ID };
    const result = validateReleaseIdConsistency(manifest, null, correctReportFm);
    assert.equal(result.pass, true);
  });

  it('null frontmatter does not cause failure (backwards compatible)', () => {
    const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
    const result = validateReleaseIdConsistency(manifest, null, null);
    assert.equal(result.pass, true);
  });

  it('real P10 completion report frontmatter matches GRAMMAR_CONTENT_RELEASE_ID', () => {
    const reportPath = path.join(ROOT_DIR, 'docs', 'plans', 'james', 'grammar',
      'questions-generator', 'grammar-qg-p10-final-completion-report-2026-04-29.md');
    assert.ok(fs.existsSync(reportPath), 'P10 completion report must exist');
    const content = fs.readFileSync(reportPath, 'utf8');
    const fm = extractFrontmatter(content);
    assert.equal(fm.final_content_release_id, GRAMMAR_CONTENT_RELEASE_ID,
      `Report final_content_release_id must equal ${GRAMMAR_CONTENT_RELEASE_ID}`);
    const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
    const result = validateReleaseIdConsistency(manifest, null, fm);
    assert.equal(result.pass, true, `Cross-check must pass: ${JSON.stringify(result.mismatches)}`);
  });
});
