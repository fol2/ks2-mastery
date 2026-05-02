/**
 * Grammar QG P12 — U3 validator manifest-driven path resolution tests
 *
 * Tests the requireArtefact / readJsonArtefact helpers and their integration
 * into validateReportCounts, validateMarkingMatrixCounts, validateDistractorReviewCoverage,
 * and the CLI main path.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import {
  requireArtefact,
  readJsonArtefact,
  validateReportCounts,
  validateMarkingMatrixCounts,
  validateDistractorReviewCoverage,
  validateInventoryReleaseIds,
  validateSmokeEvidence,
} from '../scripts/validate-grammar-qg-certification-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const RELEASE_ID = 'grammar-qg-p11-2026-04-30';

function makeManifest(overrides = {}) {
  return {
    contentReleaseId: RELEASE_ID,
    certificationPhase: 'grammar-qg-p12',
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
    expectedMarkingMatrixEntryCount: 80,
    artefacts: {
      renderInventory: 'reports/grammar/render-inventory.json',
      qualityRegister: 'reports/grammar/quality-register.json',
      distractorAudit: 'reports/grammar/distractor-audit.json',
      markingMatrix: 'reports/grammar/marking-matrix.json',
    },
    ...overrides,
  };
}

function makeArtefactJson(extraMeta = {}) {
  return {
    metadata: {
      contentReleaseId: RELEASE_ID,
      generatedAt: '2026-04-30T12:00:00.000Z',
      ...extraMeta,
    },
  };
}

function setupTmpDir() {
  const base = path.join(tmpdir(), `grammar-qg-p12-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path.join(base, 'reports', 'grammar'), { recursive: true });
  return base;
}

// ---------------------------------------------------------------------------
// requireArtefact tests
// ---------------------------------------------------------------------------

describe('requireArtefact', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = setupTmpDir();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('resolves existing artefact file', () => {
    const manifest = makeManifest();
    writeFileSync(path.join(tmpRoot, 'reports', 'grammar', 'render-inventory.json'), '{}');
    const result = requireArtefact(manifest, 'renderInventory', tmpRoot);
    assert.equal(result.ok, true);
    assert.equal(result.error, null);
    assert.ok(result.path.includes('render-inventory.json'));
  });

  it('fails if artefact key missing from manifest', () => {
    const manifest = makeManifest({ artefacts: {} });
    const result = requireArtefact(manifest, 'renderInventory', tmpRoot);
    assert.equal(result.ok, false);
    assert.match(result.error, /Manifest missing required artefact path/);
  });

  it('fails if artefact file does not exist on disk', () => {
    const manifest = makeManifest();
    // Do not create the file
    const result = requireArtefact(manifest, 'renderInventory', tmpRoot);
    assert.equal(result.ok, false);
    assert.match(result.error, /Artefact file not found/);
  });

  it('fails if manifest.artefacts is undefined', () => {
    const manifest = makeManifest({ artefacts: undefined });
    const result = requireArtefact(manifest, 'renderInventory', tmpRoot);
    assert.equal(result.ok, false);
    assert.match(result.error, /Manifest missing required artefact path/);
  });
});

// ---------------------------------------------------------------------------
// readJsonArtefact tests
// ---------------------------------------------------------------------------

describe('readJsonArtefact', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = setupTmpDir();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('reads and parses a valid JSON artefact', () => {
    const manifest = makeManifest();
    const data = makeArtefactJson({ totalEntries: 80 });
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'marking-matrix.json'),
      JSON.stringify(data),
    );
    const result = readJsonArtefact(manifest, 'markingMatrix', tmpRoot);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, data);
    assert.equal(result.error, null);
  });

  it('fails if file is not valid JSON', () => {
    const manifest = makeManifest();
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'marking-matrix.json'),
      'NOT JSON {{{{',
    );
    const result = readJsonArtefact(manifest, 'markingMatrix', tmpRoot);
    assert.equal(result.ok, false);
    assert.match(result.error, /not valid JSON/);
  });

  it('fails if artefact path not in manifest', () => {
    const manifest = makeManifest({ artefacts: {} });
    const result = readJsonArtefact(manifest, 'markingMatrix', tmpRoot);
    assert.equal(result.ok, false);
    assert.match(result.error, /Manifest missing required artefact path/);
  });
});

// ---------------------------------------------------------------------------
// validateReportCounts — manifest-driven with release ID check
// ---------------------------------------------------------------------------

describe('validateReportCounts with P11 manifest', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = setupTmpDir();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('passes when report claims match artefact metadata', () => {
    const manifest = makeManifest();
    // Create artefact files
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'marking-matrix.json'),
      JSON.stringify(makeArtefactJson({ totalEntries: 80 })),
    );
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'quality-register.json'),
      JSON.stringify({ metadata: { contentReleaseId: RELEASE_ID, approved: 74, approvedWithLimitation: 4 }, entries: [] }),
    );

    // Create report that claims matching counts
    const reportPath = path.join(tmpRoot, 'report.md');
    writeFileSync(reportPath, '---\ncertification_decision: CERTIFIED_PRE_DEPLOY\n---\n\n80 marking matrix entries verified.\n74 approved + 4 approved_with_limitation templates.\n');

    const result = validateReportCounts(manifest, reportPath, { rootDir: tmpRoot });
    assert.equal(result.pass, true);
    assert.equal(result.mismatches.length, 0);
  });

  it('fails if artefact metadata.contentReleaseId differs from manifest', () => {
    const manifest = makeManifest();
    // Create artefact with WRONG releaseId
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'marking-matrix.json'),
      JSON.stringify({ metadata: { contentReleaseId: 'wrong-release-id', totalEntries: 80 } }),
    );
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'quality-register.json'),
      JSON.stringify({ metadata: { contentReleaseId: RELEASE_ID, approved: 74, approvedWithLimitation: 4 }, entries: [] }),
    );

    const reportPath = path.join(tmpRoot, 'report.md');
    writeFileSync(reportPath, '---\ncertification_decision: CERTIFIED_PRE_DEPLOY\n---\n\n80 marking matrix entries.\n');

    const result = validateReportCounts(manifest, reportPath, { rootDir: tmpRoot });
    assert.equal(result.pass, false);
    const releaseIdMismatch = result.mismatches.find(m => m.field === 'markingMatrixReleaseIdMismatch');
    assert.ok(releaseIdMismatch, 'Expected markingMatrixReleaseIdMismatch');
    assert.match(releaseIdMismatch.message, /does not match manifest contentReleaseId/);
  });

  it('fails if artefact file does not exist (manifest points to missing file)', () => {
    const manifest = makeManifest();
    // Don't create any artefact files
    const reportPath = path.join(tmpRoot, 'report.md');
    writeFileSync(reportPath, '---\ncertification_decision: CERTIFIED_PRE_DEPLOY\n---\n\nSome content.\n');

    const result = validateReportCounts(manifest, reportPath, { rootDir: tmpRoot });
    assert.equal(result.pass, false);
    const resolveError = result.mismatches.find(m => m.field === 'markingMatrixResolve');
    assert.ok(resolveError, 'Expected markingMatrixResolve mismatch');
  });
});

// ---------------------------------------------------------------------------
// validateMarkingMatrixCounts — manifest-driven
// ---------------------------------------------------------------------------

describe('validateMarkingMatrixCounts with P11 manifest', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = setupTmpDir();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('passes with correct totalEntries via manifest path', () => {
    const manifest = makeManifest();
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'marking-matrix.json'),
      JSON.stringify(makeArtefactJson({ totalEntries: 80 })),
    );
    const result = validateMarkingMatrixCounts(manifest, tmpRoot);
    assert.equal(result.pass, true);
    assert.equal(result.actual, 80);
  });

  it('fails if marking matrix has wrong totalEntries', () => {
    const manifest = makeManifest();
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'marking-matrix.json'),
      JSON.stringify(makeArtefactJson({ totalEntries: 50 })),
    );
    const result = validateMarkingMatrixCounts(manifest, tmpRoot);
    assert.equal(result.pass, false);
    assert.equal(result.actual, 50);
    assert.equal(result.expected, 80);
  });

  it('fails if marking matrix metadata count does not match payload entries', () => {
    const manifest = makeManifest({ expectedMarkingMatrixEntryCount: 2 });
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'marking-matrix.json'),
      JSON.stringify({
        metadata: { contentReleaseId: RELEASE_ID, totalEntries: 2 },
        entries: [{ templateId: 'a' }],
      }),
    );
    const result = validateMarkingMatrixCounts(manifest, tmpRoot);
    assert.equal(result.pass, false);
    assert.equal(result.expected, 2);
    assert.equal(result.actual, 1);
    assert.match(result.error, /entries\.length/);
  });

  it('fails if marking matrix contentReleaseId does not match manifest', () => {
    const manifest = makeManifest();
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'marking-matrix.json'),
      JSON.stringify({ metadata: { contentReleaseId: 'wrong-id', totalEntries: 80 } }),
    );
    const result = validateMarkingMatrixCounts(manifest, tmpRoot);
    assert.equal(result.pass, false);
    assert.match(result.error, /does not match manifest contentReleaseId/);
  });
});

// ---------------------------------------------------------------------------
// validateDistractorReviewCoverage — manifest-driven
// ---------------------------------------------------------------------------

describe('validateDistractorReviewCoverage with P11 manifest', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = setupTmpDir();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('passes when all flagged templates have review decisions', () => {
    const manifest = makeManifest();
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'distractor-audit.json'),
      JSON.stringify({
        metadata: { contentReleaseId: RELEASE_ID },
        results: [{ templateId: 't1', requiresAdultReview: true }],
        ambiguousTemplates: [],
      }),
    );
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'quality-register.json'),
      JSON.stringify({
        metadata: { contentReleaseId: RELEASE_ID },
        entries: [{ templateId: 't1', adultReviewDecision: 'approved' }],
      }),
    );
    const result = validateDistractorReviewCoverage(manifest, tmpRoot);
    assert.equal(result.pass, true);
    assert.deepEqual(result.missing, []);
  });

  it('fails if distractor audit file not found via manifest', () => {
    const manifest = makeManifest();
    // quality register exists but audit does not
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'quality-register.json'),
      JSON.stringify({ metadata: { contentReleaseId: RELEASE_ID }, entries: [] }),
    );
    const result = validateDistractorReviewCoverage(manifest, tmpRoot);
    assert.equal(result.pass, false);
    assert.match(result.error, /Artefact file not found/);
  });

  it('fails if distractor audit contentReleaseId mismatches manifest', () => {
    const manifest = makeManifest();
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'distractor-audit.json'),
      JSON.stringify({
        metadata: { contentReleaseId: 'wrong-release' },
        results: [],
        ambiguousTemplates: [],
      }),
    );
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'quality-register.json'),
      JSON.stringify({
        metadata: { contentReleaseId: RELEASE_ID },
        entries: [],
      }),
    );
    const result = validateDistractorReviewCoverage(manifest, tmpRoot);
    assert.equal(result.pass, false);
    assert.match(result.error, /does not match manifest contentReleaseId/);
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility — P10 manifest without artefacts key
// ---------------------------------------------------------------------------

describe('backward compatibility with P10 manifest (no artefacts key)', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = setupTmpDir();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('validateMarkingMatrixCounts falls back to legacy P10 path with warning', () => {
    const p10Manifest = {
      contentReleaseId: 'grammar-qg-p10-2026-04-29',
      templateDenominator: 78,
      seedWindow: { certification: '1..30' },
      seedWindowPerEvidenceType: { 'selected-response-oracle': '1..15' },
      expectedItemCount: 2340,
      // No artefacts key!
    };
    // Create the legacy P10 path file
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'grammar-qg-p10-marking-matrix.json'),
      JSON.stringify({ metadata: { contentReleaseId: 'grammar-qg-p10-2026-04-29', totalEntries: 80 } }),
    );
    const result = validateMarkingMatrixCounts(p10Manifest, tmpRoot);
    assert.equal(result.pass, true);
    assert.equal(result.actual, 80);
  });

  it('validateDistractorReviewCoverage falls back to legacy P10 paths', () => {
    const p10Manifest = {
      contentReleaseId: 'grammar-qg-p10-2026-04-29',
      templateDenominator: 78,
      seedWindow: { certification: '1..30' },
      seedWindowPerEvidenceType: {},
      expectedItemCount: 2340,
      // No artefacts key!
    };
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'grammar-qg-p10-distractor-audit.json'),
      JSON.stringify({
        metadata: { contentReleaseId: 'grammar-qg-p10-2026-04-29' },
        results: [{ templateId: 'tX', requiresAdultReview: true }],
        ambiguousTemplates: [],
      }),
    );
    writeFileSync(
      path.join(tmpRoot, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json'),
      JSON.stringify({
        metadata: { contentReleaseId: 'grammar-qg-p10-2026-04-29' },
        entries: [{ templateId: 'tX', adultReviewDecision: 'approved' }],
      }),
    );
    const result = validateDistractorReviewCoverage(p10Manifest, tmpRoot);
    assert.equal(result.pass, true);
    assert.deepEqual(result.missing, []);
  });
});

// ---------------------------------------------------------------------------
// CERTIFIED_PRE_DEPLOY — no smoke required
// ---------------------------------------------------------------------------

describe('CERTIFIED_PRE_DEPLOY passes without smoke file', () => {
  it('validateSmokeEvidence passes for CERTIFIED_PRE_DEPLOY', () => {
    const manifest = makeManifest();
    const reportContent = '---\ncertification_decision: CERTIFIED_PRE_DEPLOY\n---\n\nReport body.\n';
    const result = validateSmokeEvidence(manifest, reportContent);
    assert.equal(result.pass, true);
  });
});

// ---------------------------------------------------------------------------
// CERTIFIED_POST_DEPLOY — smoke file required
// ---------------------------------------------------------------------------

describe('CERTIFIED_POST_DEPLOY requires smoke file', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = setupTmpDir();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('fails if smoke file absent', () => {
    const manifest = makeManifest();
    const reportContent = '---\ncertification_decision: CERTIFIED_POST_DEPLOY\n---\n\nReport body.\n';
    const result = validateSmokeEvidence(manifest, reportContent, { rootDir: tmpRoot });
    assert.equal(result.pass, false);
    const mismatch = result.mismatches.find(m => m.field === 'smokeEvidenceFile');
    assert.ok(mismatch);
    assert.match(mismatch.message, /smoke evidence file does not exist/);
  });
});
