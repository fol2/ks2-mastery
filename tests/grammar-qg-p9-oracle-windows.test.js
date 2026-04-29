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
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import {
  parseSeedWindow,
  computeOracleTestEnvelope,
  validateEvidenceManifest,
  validateReportAgainstManifest,
  validateSmokeEvidence,
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
