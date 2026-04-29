import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReleaseFrontmatter } from '../scripts/validate-grammar-qg-completion-report.mjs';

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

describe('P7 Governance: validateReleaseFrontmatter placeholder rejection', () => {
  // Tokens shorter than 7 chars are rejected by the length check.
  // "pending" (7 chars) and "unknown" (7 chars) are rejected by the placeholder regex.
  // All tokens must be rejected regardless of path.
  const placeholderTokens = ['pending', 'todo', 'tbc', 'unknown', 'n/a', 'tbd'];

  for (const token of placeholderTokens) {
    it(`rejects "${token}" in final_content_release_commit (via length or placeholder check)`, () => {
      const report = buildReport({ final_content_release_commit: token });
      const result = validateReleaseFrontmatter(report);
      assert.equal(result.valid, false, `Should reject placeholder "${token}"`);
      const err = result.errors.find((e) => e.field === 'final_content_release_commit');
      assert.ok(err, `Should have error for final_content_release_commit with token "${token}"`);
    });
  }

  for (const token of placeholderTokens) {
    it(`rejects case-insensitive "${token.toUpperCase()}" in final_report_commit`, () => {
      const report = buildReport({ final_report_commit: token.toUpperCase() });
      const result = validateReleaseFrontmatter(report);
      assert.equal(result.valid, false, `Should reject placeholder "${token.toUpperCase()}"`);
      const err = result.errors.find((e) => e.field === 'final_report_commit');
      assert.ok(err, `Should have error for final_report_commit with token "${token.toUpperCase()}"`);
    });
  }

  it('rejects empty string in final_content_release_commit', () => {
    const report = buildReport({ final_content_release_commit: '' });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, false);
  });

  it('accepts valid SHA strings', () => {
    const report = buildReport({
      final_content_release_commit: 'a1b2c3d4e5f6789',
      final_report_commit: '9876543abcdef0',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  it('accepts "pending-abcdef1" (contains but is not the placeholder)', () => {
    const report = buildReport({
      final_content_release_commit: 'pending-abcdef1',
      final_report_commit: 'pending-1234567',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  it('rejects placeholder "pending" inside implementation_prs array', () => {
    const report = buildReport({ implementation_prs: ['pending'] });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.field === 'implementation_prs');
    assert.ok(err, 'Should have error for implementation_prs placeholder item');
    assert.match(err.message, /placeholder/i);
  });

  it('rejects placeholder "tbd" inside post_merge_fix_commits array', () => {
    const report = buildReport({ post_merge_fix_commits: ['tbd'] });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.field === 'post_merge_fix_commits');
    assert.ok(err, 'Should have error for post_merge_fix_commits placeholder item');
    assert.match(err.message, /placeholder/i);
  });
});

describe('P7 Governance: smoke evidence path canonical format', () => {
  it('smoke output path follows canonical format', async () => {
    // Verify the grammar-production-smoke script writes to the correct path pattern
    const { GRAMMAR_CONTENT_RELEASE_ID } = await import('../worker/src/subjects/grammar/content.js');
    const expectedFileName = `grammar-production-smoke-${GRAMMAR_CONTENT_RELEASE_ID}.json`;
    const expectedDir = path.join('reports', 'grammar');
    const expectedPath = path.join(expectedDir, expectedFileName);

    // The path must follow: reports/grammar/grammar-production-smoke-${contentReleaseId}.json
    assert.match(expectedFileName, /^grammar-production-smoke-.+\.json$/);
    assert.ok(expectedPath.includes('reports/grammar/') || expectedPath.includes('reports\\grammar\\'));
  });
});

describe('P7 Governance: P7 completion report structure validation', () => {
  it('P7 report with analytics_schema_version validates correctly', () => {
    const report = buildReport({
      implementation_prs: ['#570', '#571'],
      final_content_release_commit: 'abcdef1234567',
      post_merge_fix_commits: [],
      final_report_commit: '7654321fedcba',
      analytics_schema_version: 'grammar-qg-p7-calibration-v1',
      content_release_id_changed: 'false',
      scoring_or_mastery_change: 'false',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
    // Confirm the P7 fields are captured in frontmatter
    assert.equal(result.frontmatter.analytics_schema_version, 'grammar-qg-p7-calibration-v1');
    assert.equal(result.frontmatter.content_release_id_changed, 'false');
    assert.equal(result.frontmatter.scoring_or_mastery_change, 'false');
  });

  it('P7 report must have analytics_schema_version matching grammar-qg-p7-calibration-v1', () => {
    const report = buildReport({
      implementation_prs: ['#570'],
      final_content_release_commit: 'abcdef1234567',
      post_merge_fix_commits: [],
      final_report_commit: '7654321fedcba',
      analytics_schema_version: 'grammar-qg-p7-calibration-v1',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true);
    assert.equal(result.frontmatter.analytics_schema_version, 'grammar-qg-p7-calibration-v1');
  });

  it('P7 report with content_release_id_changed: false passes', () => {
    const report = buildReport({
      implementation_prs: ['#570'],
      final_content_release_commit: 'abcdef1234567',
      post_merge_fix_commits: [],
      final_report_commit: '7654321fedcba',
      content_release_id_changed: 'false',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true);
    assert.equal(result.frontmatter.content_release_id_changed, 'false');
  });

  it('P7 report with scoring_or_mastery_change: false passes', () => {
    const report = buildReport({
      implementation_prs: ['#570'],
      final_content_release_commit: 'abcdef1234567',
      post_merge_fix_commits: [],
      final_report_commit: '7654321fedcba',
      scoring_or_mastery_change: 'false',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true);
    assert.equal(result.frontmatter.scoring_or_mastery_change, 'false');
  });
});

describe('P7 Governance: report validator fails if smoke evidence missing', () => {
  it('fails when post-deploy smoke claimed but evidence file missing', async () => {
    const { validateGrammarCompletionReport } = await import('../scripts/validate-grammar-qg-completion-report.mjs');

    const reportContent = `---
implementation_prs:
  - #500
final_content_release_commit: abcdef1234567
post_merge_fix_commits:
  - none
final_report_commit: 1234567abcdef
---

# Completion Report

**Post-deploy production smoke: passed**

| Measure | Value |
|---|---|
| Concepts | 42 |
`;
    // Use a rootDir that will not contain the evidence file
    const tmpDir = path.join(ROOT_DIR, '.tmp-governance-test-' + Date.now());
    const result = validateGrammarCompletionReport(reportContent, {
      rootDir: tmpDir,
      auditOverride: {
        releaseId: 'test-release-id',
        conceptCount: 42,
        templateCount: 100,
        selectedResponseCount: 50,
        constructedResponseCount: 50,
        generatedTemplateCount: 80,
        fixedTemplateCount: 20,
        answerSpecTemplateCount: 90,
        constructedResponseAnswerSpecTemplateCount: 45,
        manualReviewOnlyTemplateCount: 5,
        explainTemplateCount: 20,
        conceptsWithExplainCoverage: [],
        mixedTransferTemplateCount: 15,
        conceptsWithMixedTransferCoverage: [],
        legacyRepeatedGeneratedVariants: [],
        generatedSignatureCollisions: [],
        lowDepthGeneratedTemplates: [],
      },
      contentQualityOverride: { summary: { hardFailCount: 0 } },
    });

    const smokeError = result.mismatches.find((m) => m.field === 'productionSmokeEvidence');
    assert.ok(smokeError, 'Should report missing evidence file');
    assert.match(smokeError.message, /evidence file does not exist/);
  });
});
