/**
 * Grammar QG P11 U1 — Evidence Truth Reconciliation Tests
 *
 * Validates the validator's count cross-check + release ID consistency
 * mechanics. Historical 80/74+4 figures are seeded into a controlled
 * temporary root so these tests stay decoupled from the live, regenerated
 * P10 artefact files (which now reflect the P19 510-template inventory).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { GRAMMAR_CONTENT_RELEASE_ID } from '../worker/src/subjects/grammar/content.js';
import {
  validateReleaseIdConsistency,
  validateReportCounts,
} from '../scripts/validate-grammar-qg-certification-evidence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.resolve(ROOT_DIR, 'reports', 'grammar');

// ---------------------------------------------------------------------------
// Helper: create a temporary report file
// ---------------------------------------------------------------------------

function writeTempReport(content) {
  const tempPath = path.join(tmpdir(), `grammar-qg-p11-test-report-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  fs.writeFileSync(tempPath, content, 'utf8');
  return tempPath;
}

// ---------------------------------------------------------------------------
// Helper: seed a temporary root with controlled P10 artefacts so the
// validator's legacy-fallback code path reads predictable figures.
// ---------------------------------------------------------------------------

function createSeededRoot({
  totalEntries = 80,
  approved = 74,
  approvedWithLimitation = 4,
  templateCount = 78,
} = {}) {
  const tempRoot = path.join(
    tmpdir(),
    `grammar-qg-p11-evidence-truth-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(path.join(tempRoot, 'reports', 'grammar'), { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, 'reports', 'grammar', 'grammar-qg-p10-marking-matrix.json'),
    JSON.stringify({
      metadata: {
        contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
        totalEntries,
      },
      entries: Array.from({ length: totalEntries }, (_, idx) => ({ id: `seed-${idx}` })),
    }),
  );
  fs.writeFileSync(
    path.join(tempRoot, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json'),
    JSON.stringify({
      metadata: {
        contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
        templateCount,
        approved,
        approvedWithLimitation,
        blocked: 0,
      },
      entries: [],
    }),
  );
  return tempRoot;
}

// ---------------------------------------------------------------------------
// 1. validateReportCounts passes when report matches artefacts
// ---------------------------------------------------------------------------

describe('P11 Evidence Truth: report count validation passes for correct claims', () => {
  it('report claiming 80 marking matrix entries matches artefact totalEntries', () => {
    const tempRoot = createSeededRoot({ totalEntries: 80, approved: 74, approvedWithLimitation: 4 });
    const reportContent = [
      '---',
      'phase: grammar-qg-p10',
      '---',
      '',
      '# Report',
      '',
      '- 80 marking matrix entries (seeds 1..5) validating constructed-response boundaries',
      '- 74 approved + 4 approved_with_limitation templates in the quality register',
    ].join('\n');

    const tempPath = writeTempReport(reportContent);
    try {
      const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
      const result = validateReportCounts(manifest, tempPath, { rootDir: tempRoot });
      assert.equal(result.pass, true, `Expected pass but got mismatches: ${JSON.stringify(result.mismatches)}`);
    } finally {
      fs.unlinkSync(tempPath);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('report with Marking matrix (80 entries) table syntax also passes', () => {
    const tempRoot = createSeededRoot({ totalEntries: 80, approved: 74, approvedWithLimitation: 4 });
    const reportContent = [
      '---',
      'phase: grammar-qg-p10',
      '---',
      '',
      '| Marking matrix (80 entries, seeds 1..5) | Validates constructed-response boundaries |',
    ].join('\n');

    const tempPath = writeTempReport(reportContent);
    try {
      const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
      const result = validateReportCounts(manifest, tempPath, { rootDir: tempRoot });
      const matrixCountRegex = /(\d+)\s+marking\s+matrix\s+entries|[Mm]arking\s+matrix\s*\((\d+)\s+entries/;
      const match = reportContent.match(matrixCountRegex);
      if (match) {
        const claimed = Number(match[1] || match[2]);
        assert.equal(claimed, 80, 'Regex should extract 80');
      }
      assert.equal(result.pass, true, `Expected pass but got: ${JSON.stringify(result.mismatches)}`);
    } finally {
      fs.unlinkSync(tempPath);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 2. validateReportCounts fails when report claims 190 but artefact has 80
// ---------------------------------------------------------------------------

describe('P11 Evidence Truth: report count validation fails for overclaim', () => {
  it('report claiming 190 marking matrix entries fails against artefact with 80', () => {
    const tempRoot = createSeededRoot({ totalEntries: 80, approved: 74, approvedWithLimitation: 4 });
    const reportContent = [
      '---',
      'phase: grammar-qg-p10',
      '---',
      '',
      '# Report',
      '',
      '- 190 marking matrix entries validating constructed-response boundaries',
    ].join('\n');

    const tempPath = writeTempReport(reportContent);
    try {
      const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
      const result = validateReportCounts(manifest, tempPath, { rootDir: tempRoot });
      assert.equal(result.pass, false, 'Should fail for overclaim');
      const mismatch = result.mismatches.find((m) => m.field === 'markingMatrixCount');
      assert.ok(mismatch, 'Expected markingMatrixCount mismatch');
      assert.equal(mismatch.claimed, 190);
      assert.equal(mismatch.actual, 80);
    } finally {
      fs.unlinkSync(tempPath);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('report claiming 78/78 templates approved is acceptable when register has 74+4=78 split', () => {
    const tempRoot = createSeededRoot({ totalEntries: 80, approved: 74, approvedWithLimitation: 4 });
    const reportContent = [
      '---',
      'phase: grammar-qg-p10',
      '---',
      '',
      '# Report',
      '',
      '- 78/78 templates approved in the quality register',
    ].join('\n');

    const tempPath = writeTempReport(reportContent);
    try {
      const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
      const result = validateReportCounts(manifest, tempPath, { rootDir: tempRoot });
      // 78 = 74 + 4, so "78/78 templates approved" is total-compatible.
      // The validator treats this as acceptable (total matches).
      assert.equal(result.pass, true,
        '78/78 is acceptable because 74+4=78 total approved-for-ship');
    } finally {
      fs.unlinkSync(tempPath);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('report claiming wrong approved count (e.g. 70 approved + 4 approved_with_limitation) fails', () => {
    const tempRoot = createSeededRoot({ totalEntries: 80, approved: 74, approvedWithLimitation: 4 });
    const reportContent = [
      '---',
      'phase: grammar-qg-p10',
      '---',
      '',
      '# Report',
      '',
      '- 70 approved + 4 approved_with_limitation templates',
    ].join('\n');

    const tempPath = writeTempReport(reportContent);
    try {
      const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
      const result = validateReportCounts(manifest, tempPath, { rootDir: tempRoot });
      assert.equal(result.pass, false, 'Should fail for wrong approved count');
      const mismatch = result.mismatches.find((m) => m.field === 'qualityRegisterApproved');
      assert.ok(mismatch, 'Expected qualityRegisterApproved mismatch');
      assert.equal(mismatch.claimed, 70);
      assert.equal(mismatch.actual, 74);
    } finally {
      fs.unlinkSync(tempPath);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 3. validateReleaseIdConsistency fails on manifest/code disagreement
// ---------------------------------------------------------------------------

describe('P11 Evidence Truth: release ID consistency hard failure', () => {
  it('manifest with stale release ID fails against code constant', () => {
    const staleManifest = { contentReleaseId: 'grammar-qg-p9-2026-04-29' };
    const result = validateReleaseIdConsistency(staleManifest);
    assert.equal(result.pass, false);
    assert.equal(result.mismatches.length, 1);
    assert.equal(result.mismatches[0].field, 'manifestVsCodeReleaseId');
    assert.match(result.mismatches[0].message, /grammar-qg-p9/);
    assert.match(result.mismatches[0].message, new RegExp(GRAMMAR_CONTENT_RELEASE_ID));
  });

  it('correct manifest release ID passes', () => {
    const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
    const result = validateReleaseIdConsistency(manifest);
    assert.equal(result.pass, true);
    assert.equal(result.mismatches.length, 0);
  });

  it('manifest + mismatched reportReleaseId fails with two mismatches', () => {
    const staleManifest = { contentReleaseId: 'grammar-qg-p8-2026-04-29' };
    const result = validateReleaseIdConsistency(staleManifest, 'grammar-qg-p7-2026-04-29');
    assert.equal(result.pass, false);
    // Should have: manifestVsCode + reportVsManifest
    assert.ok(result.mismatches.length >= 2);
    const fields = result.mismatches.map((m) => m.field);
    assert.ok(fields.includes('manifestVsCodeReleaseId'));
    assert.ok(fields.includes('reportVsManifestReleaseId'));
  });
});

// ---------------------------------------------------------------------------
// 4. Handles missing optional fields (smoke evidence not present)
// ---------------------------------------------------------------------------

describe('P11 Evidence Truth: missing optional fields handled gracefully', () => {
  it('validateReportCounts passes when no marking matrix count is mentioned in report', () => {
    const reportContent = [
      '---',
      'phase: grammar-qg-p10',
      '---',
      '',
      '# Report',
      '',
      'This report does not mention any specific matrix count.',
    ].join('\n');

    const tempPath = writeTempReport(reportContent);
    try {
      const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
      const result = validateReportCounts(manifest, tempPath, { rootDir: ROOT_DIR });
      assert.equal(result.pass, true, 'Should pass when no count claim is made');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });

  it('validateReportCounts handles missing report file gracefully', () => {
    const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
    const result = validateReportCounts(manifest, '/nonexistent/path/report.md', { rootDir: ROOT_DIR });
    assert.equal(result.pass, false);
    assert.equal(result.mismatches[0].field, 'reportFile');
  });

  it('validateReleaseIdConsistency works with null reportReleaseId', () => {
    const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
    const result = validateReleaseIdConsistency(manifest, null);
    assert.equal(result.pass, true, 'null reportReleaseId should not cause failure');
  });

  it('validateReleaseIdConsistency works with undefined reportContent', () => {
    const manifest = { contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID };
    const result = validateReleaseIdConsistency(manifest, null, undefined);
    assert.equal(result.pass, true, 'undefined reportContent should not cause failure');
  });
});

// ---------------------------------------------------------------------------
// 5. Integration: archived P10 report frontmatter + manifest still consistent
//
// The P10 final report is now an archived historical artefact. The live
// `reports/grammar/grammar-qg-p10-*` JSON files are continually regenerated
// against the latest content release (currently P19, 510 templates), so the
// frozen 80/74+4 figures inside the archived report no longer match live
// artefacts. We only assert the immovable historical metadata: the report's
// frontmatter release ID, and the P10 manifest's release ID.
// ---------------------------------------------------------------------------

describe('P11 Evidence Truth: archived P10 report metadata', () => {
  const reportPath = path.join(
    ROOT_DIR, 'docs', 'plans', 'james', 'grammar', 'questions-generator',
    'archive', 'grammar-qg-p10-final-completion-report-2026-04-29.md',
  );
  const manifestPath = path.join(REPORTS_DIR, 'grammar-qg-p10-certification-manifest.json');

  it('archived P10 report frontmatter declares the P10 release ID matching its manifest', () => {
    assert.ok(fs.existsSync(reportPath), `P10 archived report must exist at ${reportPath}`);
    assert.ok(fs.existsSync(manifestPath), 'P10 manifest must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const reportContent = fs.readFileSync(reportPath, 'utf8');
    assert.match(reportContent, /final_content_release_id:\s*grammar-qg-p10-2026-04-29/,
      'P10 report frontmatter must declare the P10 release ID');
    assert.equal(manifest.contentReleaseId, 'grammar-qg-p10-2026-04-29',
      'P10 manifest must carry the P10 release ID');
  });
});
