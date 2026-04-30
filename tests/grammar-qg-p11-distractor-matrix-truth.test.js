/**
 * Grammar QG P11 U6+U7 — Distractor Review Closure & Marking Matrix Truth
 *
 * Validates:
 * 1. Marking matrix metadata.totalEntries is exactly 80
 * 2. Validator catches mismatch if metadata says a different number
 * 3. All ambiguous templates in distractor audit have review evidence in quality register
 * 4. Missing review decision for an ambiguous template fails validation
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import {
  validateMarkingMatrixCounts,
  validateDistractorReviewCoverage,
} from '../scripts/validate-grammar-qg-certification-evidence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helper: create a temporary directory with controlled report fixtures
// ---------------------------------------------------------------------------

function createTempRoot() {
  const tempRoot = path.join(
    tmpdir(),
    `grammar-qg-p11-u6u7-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(path.join(tempRoot, 'reports', 'grammar'), { recursive: true });
  return tempRoot;
}

// ---------------------------------------------------------------------------
// U7: Marking matrix count truth
// ---------------------------------------------------------------------------

describe('P11 U7: marking matrix totalEntries is exactly 80', () => {
  it('real marking matrix reports 80 entries', () => {
    const result = validateMarkingMatrixCounts({}, ROOT_DIR);
    assert.equal(result.pass, true, `Expected pass but got: expected=${result.expected}, actual=${result.actual}`);
    assert.equal(result.actual, 80);
    assert.equal(result.expected, 80);
  });

  it('validator fails when metadata.totalEntries is not 80', () => {
    const tempRoot = createTempRoot();
    try {
      const fakeMatrix = {
        metadata: { totalEntries: 190 },
        entries: [],
      };
      fs.writeFileSync(
        path.join(tempRoot, 'reports', 'grammar', 'grammar-qg-p10-marking-matrix.json'),
        JSON.stringify(fakeMatrix)
      );
      const result = validateMarkingMatrixCounts({}, tempRoot);
      assert.equal(result.pass, false);
      assert.equal(result.actual, 190);
      assert.equal(result.expected, 80);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('validator fails when marking matrix file is missing', () => {
    const tempRoot = createTempRoot();
    try {
      const result = validateMarkingMatrixCounts({}, tempRoot);
      assert.equal(result.pass, false);
      assert.ok(result.error);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// U6: Distractor review coverage
// ---------------------------------------------------------------------------

describe('P11 U6: all ambiguous templates have adult review decisions', () => {
  it('real quality register covers all requiresAdultReview templates', () => {
    const result = validateDistractorReviewCoverage(ROOT_DIR);
    assert.equal(
      result.pass,
      true,
      `Missing review decisions for: ${result.missing.join(', ')}`
    );
    assert.equal(result.missing.length, 0);
    assert.ok(result.covered.length >= 18, `Expected at least 18 covered, got ${result.covered.length}`);
  });

  it('validator fails when a review decision is missing', () => {
    const tempRoot = createTempRoot();
    try {
      // Create distractor audit with one ambiguous template
      const fakeAudit = {
        metadata: { ambiguousTemplates: [] },
        ambiguousTemplates: ['test_template_missing_review'],
        results: [
          {
            templateId: 'test_template_missing_review',
            requiresAdultReview: true,
            seed: 1,
          },
        ],
      };
      fs.writeFileSync(
        path.join(tempRoot, 'reports', 'grammar', 'grammar-qg-p10-distractor-audit.json'),
        JSON.stringify(fakeAudit)
      );

      // Create quality register WITHOUT an adultReviewDecision for that template
      const fakeRegister = {
        metadata: { templateCount: 1 },
        entries: [
          {
            templateId: 'test_template_missing_review',
            decision: 'approved',
            // No adultReviewDecision field
          },
        ],
      };
      fs.writeFileSync(
        path.join(tempRoot, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json'),
        JSON.stringify(fakeRegister)
      );

      const result = validateDistractorReviewCoverage(tempRoot);
      assert.equal(result.pass, false);
      assert.deepEqual(result.missing, ['test_template_missing_review']);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('validator passes when all flagged templates have review decisions', () => {
    const tempRoot = createTempRoot();
    try {
      const fakeAudit = {
        metadata: {},
        ambiguousTemplates: ['covered_template'],
        results: [
          {
            templateId: 'covered_template',
            requiresAdultReview: true,
            seed: 1,
          },
        ],
      };
      fs.writeFileSync(
        path.join(tempRoot, 'reports', 'grammar', 'grammar-qg-p10-distractor-audit.json'),
        JSON.stringify(fakeAudit)
      );

      const fakeRegister = {
        metadata: { templateCount: 1 },
        entries: [
          {
            templateId: 'covered_template',
            decision: 'approved',
            adultReviewDecision: {
              ambiguousRisk: 'Test risk',
              disambiguationRationale: 'Test rationale',
              acceptedExample: 'Test accepted',
              rejectedAlternative: 'Test rejected',
              reviewerId: 'grammar-engineering-review',
              reviewDate: '2026-04-30',
              finalStatus: 'approved_with_review',
            },
          },
        ],
      };
      fs.writeFileSync(
        path.join(tempRoot, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json'),
        JSON.stringify(fakeRegister)
      );

      const result = validateDistractorReviewCoverage(tempRoot);
      assert.equal(result.pass, true);
      assert.deepEqual(result.covered, ['covered_template']);
      assert.equal(result.missing.length, 0);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('each adultReviewDecision in the real register has all required fields', () => {
    const registerPath = path.join(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json');
    const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
    const requiredFields = [
      'ambiguousRisk',
      'disambiguationRationale',
      'acceptedExample',
      'rejectedAlternative',
      'reviewerId',
      'reviewDate',
      'finalStatus',
    ];
    const validStatuses = ['approved_with_review', 'approved_with_limitation', 'blocked', 'retire_candidate'];

    const entriesWithReview = register.entries.filter((e) => e.adultReviewDecision);
    assert.ok(entriesWithReview.length >= 18, `Expected at least 18 entries with review, got ${entriesWithReview.length}`);

    for (const entry of entriesWithReview) {
      const decision = entry.adultReviewDecision;
      for (const field of requiredFields) {
        assert.ok(
          decision[field] != null && decision[field] !== '',
          `Entry ${entry.templateId} missing adultReviewDecision.${field}`
        );
      }
      assert.ok(
        validStatuses.includes(decision.finalStatus),
        `Entry ${entry.templateId} has invalid finalStatus: ${decision.finalStatus}`
      );
      assert.equal(decision.reviewerId, 'grammar-engineering-review');
      assert.equal(decision.reviewDate, '2026-04-30');
    }
  });
});
