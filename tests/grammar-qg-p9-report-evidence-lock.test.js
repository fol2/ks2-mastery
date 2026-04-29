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
    implementation_prs: ['#604'],
    final_content_release_commit: '697e1fde1961a0c2',
    post_merge_fix_commits: [],
    final_report_commit: 'c70969f8e6dbbafc',
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

describe('P9 Report Evidence Lock: placeholder rejection', () => {
  const placeholderTokens = [
    'pending-branch-pr',
    'pending-after-merge',
    'todo-report-sha',
    'unknown-commit',
    'tbd-release',
    'tbc-final',
  ];

  for (const token of placeholderTokens) {
    it(`rejects placeholder "${token}" in implementation_prs`, () => {
      const report = buildReport({ implementation_prs: [token] });
      const result = validateReleaseFrontmatter(report);
      assert.equal(result.valid, false, `Should reject "${token}" in implementation_prs`);
      const err = result.errors.find((e) => e.field === 'implementation_prs');
      assert.ok(err, `Expected error for implementation_prs with "${token}"`);
      assert.match(err.message, /placeholder/i);
    });
  }

  for (const token of placeholderTokens) {
    it(`rejects placeholder "${token}" in final_content_release_commit`, () => {
      const report = buildReport({ final_content_release_commit: token });
      const result = validateReleaseFrontmatter(report);
      assert.equal(result.valid, false, `Should reject "${token}" in final_content_release_commit`);
      const err = result.errors.find((e) => e.field === 'final_content_release_commit');
      assert.ok(err, `Expected error for final_content_release_commit with "${token}"`);
    });
  }

  for (const token of placeholderTokens) {
    it(`rejects placeholder "${token}" in final_report_commit`, () => {
      const report = buildReport({ final_report_commit: token });
      const result = validateReleaseFrontmatter(report);
      assert.equal(result.valid, false, `Should reject "${token}" in final_report_commit`);
      const err = result.errors.find((e) => e.field === 'final_report_commit');
      assert.ok(err, `Expected error for final_report_commit with "${token}"`);
    });
  }
});

describe('P9 Report Evidence Lock: valid references pass', () => {
  it('accepts PR ref "#604"', () => {
    const report = buildReport({ implementation_prs: ['#604'] });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  it('accepts PR ref "#999"', () => {
    const report = buildReport({ implementation_prs: ['#999'] });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  it('accepts valid 7+ character SHA "697e1fd"', () => {
    const report = buildReport({
      final_content_release_commit: '697e1fde',
      final_report_commit: 'c70969f8',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  it('accepts full 40-character SHA', () => {
    const report = buildReport({
      final_content_release_commit: '697e1fde1961a0c2477ad043c5c7561cc31203b5',
      final_report_commit: 'c70969f8e6dbbafc2937d54d1d84f727b6459e1b',
    });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  it('accepts multiple valid PR refs', () => {
    const report = buildReport({ implementation_prs: ['#600', '#601', '#604'] });
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });
});

describe('P9 Report Evidence Lock: CERTIFIED_POST_DEPLOY without smoke evidence fails', () => {
  function buildReportWithPostDeploySmoke(releaseId) {
    const fm = [
      '---',
      'implementation_prs:',
      '  - "#604"',
      `final_content_release_commit: 697e1fde`,
      'post_merge_fix_commits:',
      '  - none',
      `final_report_commit: c70969f8`,
      'content_release_id_changed: "true"',
      'scoring_or_mastery_change: "false"',
      'certification_decision: CERTIFIED_POST_DEPLOY',
      '---',
      '',
      '# Grammar QG P8 Completion Report',
      '',
      `**Content release ID:** ${releaseId}`,
      '',
      '## Smoke Evidence Status',
      '',
      'Production smoke: repository smoke passed',
      'Post-deploy production smoke: passed',
      '',
    ].join('\n');
    return fm;
  }

  it('fails when post-deploy smoke claims "Passed" but evidence file does not exist', () => {
    const fakeReleaseId = 'grammar-qg-p99-fake-2026-04-29';
    const report = buildReportWithPostDeploySmoke(fakeReleaseId);

    // Use a stubbed audit to avoid running real question generator
    const auditOverride = {
      releaseId: fakeReleaseId,
      conceptCount: 18,
      templateCount: 78,
      selectedResponseCount: 58,
      constructedResponseCount: 20,
      generatedTemplateCount: 52,
      fixedTemplateCount: 26,
      answerSpecTemplateCount: 47,
      constructedResponseAnswerSpecTemplateCount: 20,
      manualReviewOnlyTemplateCount: 4,
      explainTemplateCount: 17,
      conceptsWithExplainCoverage: Array(17).fill('x'),
      mixedTransferTemplateCount: 8,
      conceptsWithMixedTransferCoverage: Array(8).fill('x'),
      legacyRepeatedGeneratedVariants: [],
      generatedSignatureCollisions: [],
      lowDepthGeneratedTemplates: [],
    };
    const contentQualityOverride = {
      summary: { hardFailCount: 0, advisoryCount: 0 },
    };

    const result = validateGrammarCompletionReport(report, {
      rootDir: ROOT_DIR,
      auditOverride,
      contentQualityOverride,
    });

    assert.equal(result.pass, false, 'Should fail when smoke evidence file is missing');
    const smokeErr = result.mismatches.find((m) => m.field === 'smokeEvidenceFile' || m.field === 'productionSmokeEvidence');
    assert.ok(smokeErr, 'Expected smokeEvidenceFile or productionSmokeEvidence mismatch');
    assert.match(smokeErr.message, /evidence file|smoke evidence/i);
  });

  it('passes frontmatter validation even when smoke evidence is missing (frontmatter-only check)', () => {
    const report = buildReportWithPostDeploySmoke('grammar-qg-p99-fake-2026-04-29');
    // validateReleaseFrontmatter only checks frontmatter tokens, not evidence files
    const result = validateReleaseFrontmatter(report);
    assert.equal(result.valid, true, `Expected valid frontmatter but got errors: ${JSON.stringify(result.errors)}`);
  });
});
