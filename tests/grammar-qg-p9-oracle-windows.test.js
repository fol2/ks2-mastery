/**
 * Grammar QG P9-U6 — Oracle Seed-Window Alignment Tests
 *
 * Validates that:
 * 1. The certification manifest accurately records per-family seed windows
 * 2. Reports claiming uniform seed coverage are rejected when families differ
 * 3. Reports with honest per-family breakdowns pass
 * 4. The total oracle test count is reproducible from manifest windows
 * 5. All oracle families are represented in the manifest
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

import {
  parseSeedWindow,
  computeOracleTestEnvelope,
  validateEvidenceManifest,
  validateReportAgainstManifest,
  validateSmokeEvidence,
  extractCertificationDecision,
  extractPostDeploySmokeEvidence,
  extractLimitations,
  SMOKE_EVIDENCE_REQUIRED_FIELDS,
} from '../scripts/validate-grammar-qg-certification-evidence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.resolve(ROOT_DIR, 'reports', 'grammar');
const manifestPath = path.join(REPORTS_DIR, 'grammar-qg-p9-certification-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// ---------------------------------------------------------------------------
// The actual P8 oracle seed ranges (from tests/grammar-qg-p8-oracles.test.js)
// ---------------------------------------------------------------------------
const ACTUAL_P8_SEED_RANGES = {
  'selected-response-oracle': { start: 1, end: 15 },
  'constructed-response-oracle': { start: 1, end: 10 },
  'manual-review-oracle': { start: 1, end: 5 },
  'redaction-oracle': { start: 1, end: 5 },     // P8 file uses SEED_COUNT=5 for redaction
  'content-quality-audit': { start: 1, end: 30 },
};

// ---------------------------------------------------------------------------
// 1. Manifest seedWindowPerEvidenceType matches actual P8 oracle seed ranges
// ---------------------------------------------------------------------------

describe('P9 Oracle Windows: manifest seedWindowPerEvidenceType correctness', () => {
  it('manifest has seedWindowPerEvidenceType field', () => {
    assert.ok(manifest.seedWindowPerEvidenceType, 'Missing seedWindowPerEvidenceType');
  });

  const expectedFamilies = [
    'selected-response-oracle',
    'constructed-response-oracle',
    'manual-review-oracle',
    'redaction-oracle',
    'content-quality-audit',
  ];

  for (const family of expectedFamilies) {
    it(`manifest has entry for ${family}`, () => {
      assert.ok(
        manifest.seedWindowPerEvidenceType[family],
        `Missing entry for oracle family: ${family}`,
      );
    });

    it(`${family} seed window is parseable`, () => {
      const parsed = parseSeedWindow(manifest.seedWindowPerEvidenceType[family]);
      assert.ok(parsed, `Failed to parse seed window for ${family}: "${manifest.seedWindowPerEvidenceType[family]}"`);
      assert.ok(parsed.start >= 1, `${family} start must be >= 1`);
      assert.ok(parsed.end >= parsed.start, `${family} end must be >= start`);
    });
  }

  it('selected-response-oracle window is 1..15', () => {
    assert.equal(manifest.seedWindowPerEvidenceType['selected-response-oracle'], '1..15');
  });

  it('constructed-response-oracle window is 1..10', () => {
    assert.equal(manifest.seedWindowPerEvidenceType['constructed-response-oracle'], '1..10');
  });

  it('manual-review-oracle window is 1..5', () => {
    assert.equal(manifest.seedWindowPerEvidenceType['manual-review-oracle'], '1..5');
  });

  it('content-quality-audit window is 1..30', () => {
    assert.equal(manifest.seedWindowPerEvidenceType['content-quality-audit'], '1..30');
  });

  it('not all oracle families use the same seed count (honesty check)', () => {
    const counts = new Set();
    for (const family of expectedFamilies) {
      const parsed = parseSeedWindow(manifest.seedWindowPerEvidenceType[family]);
      counts.add(parsed.count);
    }
    assert.ok(
      counts.size > 1,
      `All oracle families use the same seed count — manifest should reflect differing windows`,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Dishonest uniform claim rejection
// ---------------------------------------------------------------------------

describe('P9 Oracle Windows: uniform claim rejection', () => {
  it('rejects "all 78 templates x 30 seeds pass" when selected-response only uses 1..15', () => {
    const dishonestReport = [
      '# Grammar QG P8 Completion Report',
      '',
      'All 78 templates × 30 seeds pass automated oracles.',
    ].join('\n');

    const result = validateReportAgainstManifest(dishonestReport, manifest);
    assert.equal(result.pass, false, 'Should reject dishonest uniform claim');
    const seedErr = result.mismatches.find((m) => m.field === 'uniformSeedClaim');
    assert.ok(seedErr, 'Expected uniformSeedClaim mismatch');
    assert.match(seedErr.message, /manual-review|selected-response|constructed-response/);
  });

  it('rejects "all 78 templates x 15 seeds pass" when manual-review uses only 1..5', () => {
    const dishonestReport = [
      '# Grammar QG P8 Completion Report',
      '',
      'All 78 templates × 15 seeds pass automated oracles.',
    ].join('\n');

    const result = validateReportAgainstManifest(dishonestReport, manifest);
    assert.equal(result.pass, false, 'Should reject when manual-review uses fewer seeds');
    const seedErr = result.mismatches.find((m) => m.field === 'uniformSeedClaim');
    assert.ok(seedErr, 'Expected uniformSeedClaim mismatch');
  });

  it('rejects mismatched template count in uniform claim', () => {
    const wrongTemplateReport = [
      '# Grammar QG P8 Completion Report',
      '',
      'All 80 templates × 5 seeds pass automated oracles.',
    ].join('\n');

    const result = validateReportAgainstManifest(wrongTemplateReport, manifest);
    assert.equal(result.pass, false, 'Should reject wrong template count');
    const templateErr = result.mismatches.find((m) => m.field === 'uniformTemplateClaim');
    assert.ok(templateErr, 'Expected uniformTemplateClaim mismatch');
  });
});

// ---------------------------------------------------------------------------
// 3. Honest per-family breakdown passes
// ---------------------------------------------------------------------------

describe('P9 Oracle Windows: honest per-family breakdown passes', () => {
  it('report with accurate per-family breakdown passes', () => {
    const honestReport = [
      '# Grammar QG P8 Completion Report',
      '',
      '## Oracle Coverage',
      '',
      'Per-family seed windows:',
      '- Selected-response oracle: seeds 1..15',
      '- Constructed-response oracle: seeds 1..10',
      '- Manual-review oracle: seeds 1..5',
      '- Redaction oracle: seeds 1..30',
      '- Content-quality audit: seeds 1..30',
    ].join('\n');

    const result = validateReportAgainstManifest(honestReport, manifest);
    assert.equal(result.pass, true, `Expected pass but got: ${JSON.stringify(result.mismatches)}`);
  });

  it('report with no oracle claims passes (nothing to validate)', () => {
    const minimalReport = [
      '# Grammar QG P8 Completion Report',
      '',
      'All templates certified.',
    ].join('\n');

    const result = validateReportAgainstManifest(minimalReport, manifest);
    assert.equal(result.pass, true, `Expected pass but got: ${JSON.stringify(result.mismatches)}`);
  });

  it('report claiming "78 templates x 5 seeds pass" is valid (5 is min across families)', () => {
    const conservativeReport = [
      '# Grammar QG P8 Completion Report',
      '',
      'All 78 templates × 5 seeds pass automated oracles.',
    ].join('\n');

    const result = validateReportAgainstManifest(conservativeReport, manifest);
    assert.equal(result.pass, true, `Expected pass but got: ${JSON.stringify(result.mismatches)}`);
  });
});

// ---------------------------------------------------------------------------
// 4. Total oracle test count reproducibility
// ---------------------------------------------------------------------------

describe('P9 Oracle Windows: total test count envelope', () => {
  it('computeOracleTestEnvelope returns correct per-family counts', () => {
    const envelope = computeOracleTestEnvelope(manifest);

    assert.equal(envelope.templateCount, 78);

    const selectedResponse = envelope.perFamily.get('selected-response-oracle');
    assert.ok(selectedResponse, 'Missing selected-response-oracle in envelope');
    assert.equal(selectedResponse.seeds, 15);
    assert.equal(selectedResponse.maxTests, 78 * 15);

    const constructedResponse = envelope.perFamily.get('constructed-response-oracle');
    assert.ok(constructedResponse, 'Missing constructed-response-oracle in envelope');
    assert.equal(constructedResponse.seeds, 10);
    assert.equal(constructedResponse.maxTests, 78 * 10);

    const manualReview = envelope.perFamily.get('manual-review-oracle');
    assert.ok(manualReview, 'Missing manual-review-oracle in envelope');
    assert.equal(manualReview.seeds, 5);
    assert.equal(manualReview.maxTests, 78 * 5);

    const redaction = envelope.perFamily.get('redaction-oracle');
    assert.ok(redaction, 'Missing redaction-oracle in envelope');
    assert.equal(redaction.seeds, 30);
    assert.equal(redaction.maxTests, 78 * 30);

    const contentQuality = envelope.perFamily.get('content-quality-audit');
    assert.ok(contentQuality, 'Missing content-quality-audit in envelope');
    assert.equal(contentQuality.seeds, 30);
    assert.equal(contentQuality.maxTests, 78 * 30);
  });

  it('total maximum envelope is sum of all per-family maxTests', () => {
    const envelope = computeOracleTestEnvelope(manifest);
    // 78 * (15 + 10 + 5 + 30 + 30) = 78 * 90 = 7020
    const expectedTotal = 78 * (15 + 10 + 5 + 30 + 30);
    assert.equal(envelope.totalMaxTests, expectedTotal);
  });

  it('rejects report claiming more oracle tests than the envelope allows', () => {
    const inflatedReport = [
      '# Grammar QG P8 Completion Report',
      '',
      '9999 automated oracle tests pass.',
    ].join('\n');

    const result = validateReportAgainstManifest(inflatedReport, manifest);
    assert.equal(result.pass, false, 'Should reject inflated test count');
    const countErr = result.mismatches.find((m) => m.field === 'oracleTestCountExceedsEnvelope');
    assert.ok(countErr, 'Expected oracleTestCountExceedsEnvelope mismatch');
  });

  it('accepts report claiming test count within envelope', () => {
    // The P8 report claims 3,148 — well within 7,020 envelope
    const validReport = [
      '# Grammar QG P8 Completion Report',
      '',
      '3,148 automated oracle tests pass.',
    ].join('\n');

    const result = validateReportAgainstManifest(validReport, manifest);
    const countErr = result.mismatches.find((m) => m.field === 'oracleTestCountExceedsEnvelope');
    assert.equal(countErr, undefined, 'Should not reject count within envelope');
  });
});

// ---------------------------------------------------------------------------
// 5. Manifest has entries for all oracle families
// ---------------------------------------------------------------------------

describe('P9 Oracle Windows: all oracle families present', () => {
  const requiredFamilies = [
    'selected-response-oracle',
    'constructed-response-oracle',
    'manual-review-oracle',
    'redaction-oracle',
    'content-quality-audit',
  ];

  it('manifest contains exactly the expected oracle families', () => {
    const actualFamilies = Object.keys(manifest.seedWindowPerEvidenceType).sort();
    const expectedSorted = [...requiredFamilies].sort();
    assert.deepEqual(actualFamilies, expectedSorted);
  });

  for (const family of requiredFamilies) {
    it(`${family} has a valid seed window (N..M where N >= 1, M >= N)`, () => {
      const windowStr = manifest.seedWindowPerEvidenceType[family];
      const parsed = parseSeedWindow(windowStr);
      assert.ok(parsed, `Cannot parse window for ${family}: "${windowStr}"`);
      assert.ok(parsed.start >= 1);
      assert.ok(parsed.end >= parsed.start);
      assert.ok(parsed.count >= 1);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. parseSeedWindow unit tests
// ---------------------------------------------------------------------------

describe('P9 Oracle Windows: parseSeedWindow utility', () => {
  it('parses "1..15" correctly', () => {
    const result = parseSeedWindow('1..15');
    assert.deepEqual(result, { start: 1, end: 15, count: 15 });
  });

  it('parses "1..30" correctly', () => {
    const result = parseSeedWindow('1..30');
    assert.deepEqual(result, { start: 1, end: 30, count: 30 });
  });

  it('parses "1..5" correctly', () => {
    const result = parseSeedWindow('1..5');
    assert.deepEqual(result, { start: 1, end: 5, count: 5 });
  });

  it('returns null for invalid format "1-15"', () => {
    const result = parseSeedWindow('1-15');
    assert.equal(result, null);
  });

  it('returns null for empty string', () => {
    const result = parseSeedWindow('');
    assert.equal(result, null);
  });

  it('returns null for null/undefined', () => {
    assert.equal(parseSeedWindow(null), null);
    assert.equal(parseSeedWindow(undefined), null);
  });
});

// ---------------------------------------------------------------------------
// 7. validateEvidenceManifest schema validation
// ---------------------------------------------------------------------------

describe('P9 Oracle Windows: validateEvidenceManifest', () => {
  it('validates the real manifest file successfully', () => {
    const result = validateEvidenceManifest(manifestPath);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
    assert.ok(result.manifest);
    assert.equal(result.manifest.templateDenominator, 78);
  });

  it('rejects non-existent manifest path', () => {
    const result = validateEvidenceManifest('/non/existent/path.json');
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('not found'));
  });
});

// ---------------------------------------------------------------------------
// 8. validateSmokeEvidence
// ---------------------------------------------------------------------------

describe('P9 Oracle Windows: validateSmokeEvidence', () => {
  it('passes when report does not claim smoke', () => {
    const report = '# Report\n\nNo smoke claims here.';
    const result = validateSmokeEvidence(manifest, report, { rootDir: ROOT_DIR });
    assert.equal(result.pass, true);
  });

  it('fails when report claims smoke passed but evidence file missing', () => {
    const fakeManifest = { ...manifest, contentReleaseId: 'grammar-qg-p99-nonexistent-2026-04-29' };
    const report = '# Report\n\nProduction smoke: passed';
    const result = validateSmokeEvidence(fakeManifest, report, { rootDir: ROOT_DIR });
    assert.equal(result.pass, false);
    const err = result.mismatches.find((m) => m.field === 'smokeEvidenceFile');
    assert.ok(err, 'Expected smokeEvidenceFile mismatch');
  });
});

// ---------------------------------------------------------------------------
// 9. Integration: completion report validator with manifest cross-check
// ---------------------------------------------------------------------------

describe('P9 Oracle Windows: completion report validator integration', () => {
  it('the validate-grammar-qg-completion-report.mjs imports evidence validator', async () => {
    // Verify the import works without errors
    const module = await import('../scripts/validate-grammar-qg-completion-report.mjs');
    assert.ok(typeof module.validateGrammarCompletionReport === 'function');
    assert.ok(typeof module.validateReleaseFrontmatter === 'function');
  });
});

// ---------------------------------------------------------------------------
// 10. Production smoke evidence gate (P9-U9)
// ---------------------------------------------------------------------------

describe('P9 Production Smoke Evidence Gate', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grammar-smoke-test-'));
    fs.mkdirSync(path.join(tmpDir, 'reports', 'grammar'), { recursive: true });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function buildFrontmatterReport(opts = {}) {
    const {
      certDecision = 'CERTIFIED_POST_DEPLOY',
      postDeploySmokeEvidence = null,
      limitations = null,
      releaseId = 'grammar-qg-p8-2026-04-29',
    } = opts;
    const lines = ['---'];
    lines.push(`certification_decision: ${certDecision}`);
    if (postDeploySmokeEvidence) {
      lines.push(`post_deploy_smoke_evidence: ${postDeploySmokeEvidence}`);
    }
    if (limitations) {
      lines.push('limitations:');
      for (const lim of limitations) {
        lines.push(`  - ${lim}`);
      }
    }
    lines.push('---');
    lines.push('');
    lines.push('# Grammar QG Completion Report');
    lines.push('');
    lines.push(`Content release id: ${releaseId}`);
    return lines.join('\n');
  }

  function writeValidSmokeFile(releaseId) {
    const evidence = {
      releaseId,
      deployedUrl: 'https://ks2-mastery.example.com',
      timestamp: '2026-04-29T18:00:00.000Z',
      command: 'node scripts/production-smoke.mjs --release=p8',
      learnerFixtureType: 'fresh-learner',
      itemCreationResult: { status: 'pass', itemCount: 3 },
      answerSubmissionResult: { status: 'pass', correctCount: 3 },
      readModelUpdateResult: { status: 'pass', starsUpdated: true },
      noAnswerLeakAssertion: { status: 'pass', leakedFields: [] },
      failureDetails: null,
    };
    const filePath = path.join(tmpDir, 'reports', 'grammar', `grammar-production-smoke-${releaseId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(evidence, null, 2));
    return filePath;
  }

  // --- Test: CERTIFIED_POST_DEPLOY without smoke file → fails ---
  it('fails when report claims CERTIFIED_POST_DEPLOY but smoke file is absent', () => {
    const releaseId = 'grammar-qg-test-missing-2026-04-29';
    const report = buildFrontmatterReport({ certDecision: 'CERTIFIED_POST_DEPLOY', releaseId });
    const testManifest = { contentReleaseId: releaseId };

    const result = validateSmokeEvidence(testManifest, report, { rootDir: tmpDir });
    assert.equal(result.pass, false, 'Should fail without smoke evidence file');
    const err = result.mismatches.find((m) => m.field === 'smokeEvidenceFile');
    assert.ok(err, 'Expected smokeEvidenceFile mismatch');
    assert.match(err.message, /CERTIFIED_POST_DEPLOY/);
  });

  // --- Test: CERTIFIED_PRE_DEPLOY with smoke="not-run" → passes ---
  it('passes when report claims CERTIFIED_PRE_DEPLOY with smoke not-run', () => {
    const releaseId = 'grammar-qg-test-predeploy-2026-04-29';
    const report = buildFrontmatterReport({
      certDecision: 'CERTIFIED_PRE_DEPLOY',
      postDeploySmokeEvidence: 'not-run',
      releaseId,
    });
    const testManifest = { contentReleaseId: releaseId };

    const result = validateSmokeEvidence(testManifest, report, { rootDir: tmpDir });
    assert.equal(result.pass, true, `Expected pass but got: ${JSON.stringify(result.mismatches)}`);
  });

  // --- Test: CERTIFIED_POST_DEPLOY with valid smoke file → passes ---
  it('passes when report claims CERTIFIED_POST_DEPLOY with valid smoke file', () => {
    const releaseId = 'grammar-qg-test-valid-2026-04-29';
    writeValidSmokeFile(releaseId);
    const report = buildFrontmatterReport({ certDecision: 'CERTIFIED_POST_DEPLOY', releaseId });
    const testManifest = { contentReleaseId: releaseId };

    const result = validateSmokeEvidence(testManifest, report, { rootDir: tmpDir });
    assert.equal(result.pass, true, `Expected pass but got: ${JSON.stringify(result.mismatches)}`);
  });

  // --- Test: smoke evidence file with wrong releaseId → fails ---
  it('fails when smoke evidence file has mismatched releaseId', () => {
    const manifestReleaseId = 'grammar-qg-test-mismatch-2026-04-29';
    const wrongReleaseId = 'grammar-qg-WRONG-release';
    // Write file at the expected path but with wrong internal releaseId
    const evidence = {
      releaseId: wrongReleaseId,
      deployedUrl: 'https://ks2-mastery.example.com',
      timestamp: '2026-04-29T18:00:00.000Z',
      command: 'node scripts/production-smoke.mjs',
      learnerFixtureType: 'fresh-learner',
      itemCreationResult: { status: 'pass' },
      answerSubmissionResult: { status: 'pass' },
      readModelUpdateResult: { status: 'pass' },
      noAnswerLeakAssertion: { status: 'pass' },
      failureDetails: null,
    };
    const filePath = path.join(tmpDir, 'reports', 'grammar', `grammar-production-smoke-${manifestReleaseId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(evidence, null, 2));

    const report = buildFrontmatterReport({ certDecision: 'CERTIFIED_POST_DEPLOY', releaseId: manifestReleaseId });
    const testManifest = { contentReleaseId: manifestReleaseId };

    const result = validateSmokeEvidence(testManifest, report, { rootDir: tmpDir });
    assert.equal(result.pass, false, 'Should fail with mismatched releaseId');
    const err = result.mismatches.find((m) => m.field === 'smokeEvidenceReleaseIdMismatch');
    assert.ok(err, 'Expected smokeEvidenceReleaseIdMismatch');
    assert.match(err.message, /does not match/);
  });

  // --- Test: smoke evidence file missing required fields → fails ---
  it('fails when smoke evidence file is missing required fields', () => {
    const releaseId = 'grammar-qg-test-incomplete-2026-04-29';
    // Write file with only some fields
    const incompleteEvidence = {
      releaseId,
      deployedUrl: 'https://ks2-mastery.example.com',
      // Missing: timestamp, command, learnerFixtureType, itemCreationResult,
      //          answerSubmissionResult, readModelUpdateResult, noAnswerLeakAssertion, failureDetails
    };
    const filePath = path.join(tmpDir, 'reports', 'grammar', `grammar-production-smoke-${releaseId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(incompleteEvidence, null, 2));

    const report = buildFrontmatterReport({ certDecision: 'CERTIFIED_POST_DEPLOY', releaseId });
    const testManifest = { contentReleaseId: releaseId };

    const result = validateSmokeEvidence(testManifest, report, { rootDir: tmpDir });
    assert.equal(result.pass, false, 'Should fail with missing fields');
    const fieldErrs = result.mismatches.filter((m) => m.field === 'smokeEvidenceFieldMissing');
    assert.ok(fieldErrs.length > 0, 'Expected smokeEvidenceFieldMissing errors');
    // Should report exactly the missing fields
    const missingFieldNames = fieldErrs.map((e) => e.claimed.match(/"(.+)"/)[1]);
    assert.ok(missingFieldNames.includes('timestamp'));
    assert.ok(missingFieldNames.includes('command'));
    assert.ok(missingFieldNames.includes('learnerFixtureType'));
  });

  // --- Test: CERTIFIED_WITH_LIMITATIONS with "post-deploy not run" → passes ---
  it('passes when report claims CERTIFIED_WITH_LIMITATIONS with limitation "post-deploy not run"', () => {
    const releaseId = 'grammar-qg-test-limited-2026-04-29';
    const report = buildFrontmatterReport({
      certDecision: 'CERTIFIED_WITH_LIMITATIONS',
      limitations: ['post-deploy not run'],
      releaseId,
    });
    const testManifest = { contentReleaseId: releaseId };

    const result = validateSmokeEvidence(testManifest, report, { rootDir: tmpDir });
    assert.equal(result.pass, true, `Expected pass but got: ${JSON.stringify(result.mismatches)}`);
  });

  // --- Test: extractCertificationDecision ---
  it('extractCertificationDecision extracts from frontmatter', () => {
    const report = '---\ncertification_decision: CERTIFIED_POST_DEPLOY\n---\n# Report';
    assert.equal(extractCertificationDecision(report), 'CERTIFIED_POST_DEPLOY');
  });

  it('extractCertificationDecision returns null when absent', () => {
    const report = '---\ntitle: Report\n---\n# Report';
    assert.equal(extractCertificationDecision(report), null);
  });

  // --- Test: extractPostDeploySmokeEvidence ---
  it('extractPostDeploySmokeEvidence extracts "not-run"', () => {
    const report = '---\npost_deploy_smoke_evidence: not-run\n---\n# Report';
    assert.equal(extractPostDeploySmokeEvidence(report), 'not-run');
  });

  // --- Test: extractLimitations ---
  it('extractLimitations extracts limitation list', () => {
    const report = '---\nlimitations:\n  - post-deploy not run\n  - staging only\n---\n# Report';
    const lims = extractLimitations(report);
    assert.deepEqual(lims, ['post-deploy not run', 'staging only']);
  });

  // --- Test: SMOKE_EVIDENCE_REQUIRED_FIELDS is complete ---
  it('SMOKE_EVIDENCE_REQUIRED_FIELDS contains all expected fields', () => {
    const expected = [
      'releaseId', 'deployedUrl', 'timestamp', 'command', 'learnerFixtureType',
      'itemCreationResult', 'answerSubmissionResult', 'readModelUpdateResult',
      'noAnswerLeakAssertion', 'failureDetails',
    ];
    assert.deepEqual(SMOKE_EVIDENCE_REQUIRED_FIELDS, expected);
  });
});
