import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductionPool,
  buildPool,
  buildItemEntry,
  buildVarietyClusters,
  buildClusterMap,
} from '../scripts/review-punctuation-questions.mjs';
import { PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';

// ─── Pool size invariants ────────────────────────────────────────────────────

test('default buildProductionPool() produces exactly 192 items', () => {
  const pool = buildProductionPool();
  assert.equal(pool.length, 192);
});

test('buildPool() default produces exactly 192 items (same as buildProductionPool)', () => {
  const { pool } = buildPool();
  assert.equal(pool.length, 192);
});

test('--include-depth-6 produces exactly 242 items (92 fixed + 150 generated)', () => {
  const { pool } = buildPool({ includeDepth6: true });
  assert.equal(pool.length, 242);
  const fixed = pool.filter((i) => i._source === 'fixed').length;
  const generated = pool.filter((i) => i._source === 'generated').length;
  assert.equal(fixed, 92);
  assert.equal(generated, 150);
});

test('--depth 6 produces exactly 150 items (25 families x 6, generated only)', () => {
  const { pool } = buildPool({ depth: 6 });
  assert.equal(pool.length, 150);
  const fixed = pool.filter((i) => i._source === 'fixed').length;
  const generated = pool.filter((i) => i._source === 'generated').length;
  assert.equal(fixed, 0);
  assert.equal(generated, 150);
});

test('--candidate-depth 6 produces exactly 50 delta items (25 families x (6-4))', () => {
  const { pool } = buildPool({ candidateDepth: 6 });
  assert.equal(pool.length, 50);
  const fixed = pool.filter((i) => i._source === 'fixed').length;
  assert.equal(fixed, 0);
});

// ─── Required fields on every item entry ─────────────────────────────────────

const REQUIRED_ENTRY_FIELDS = [
  'id', 'source', 'skillIds', 'rewardUnitId', 'mode',
  'prompt', 'stem', 'model', 'accepted',
  'markingResult', 'markingResultSummary',
  'alternativeMarkingResults', 'negativeExamples',
  'explanation', 'validatorSummary',
  'misconceptionTags', 'readiness',
  'templateId', 'variantSignature',
  'productionStatus', 'clusterIds',
  'reviewerDecision', 'generatorFamilyId',
];

test('every item in default pool has all required fields', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);

  for (const item of pool) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, reviewerDecisions: {} });
    for (const field of REQUIRED_ENTRY_FIELDS) {
      assert.ok(
        field in entry,
        `Item ${entry.id} missing field "${field}"`,
      );
    }
  }
});

test('every item in inclusive depth-6 pool has all required fields', () => {
  const { pool, productionIds } = buildPool({ includeDepth6: true });
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);

  for (const item of pool) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, reviewerDecisions: {} });
    for (const field of REQUIRED_ENTRY_FIELDS) {
      assert.ok(
        field in entry,
        `Item ${entry.id} missing field "${field}"`,
      );
    }
  }
});

// ─── productionStatus correctness ───────────────────────────────────────────

test('production pool items all have productionStatus "production"', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);

  for (const item of pool) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, reviewerDecisions: {} });
    assert.equal(
      entry.productionStatus, 'production',
      `Item ${entry.id} expected 'production' but got '${entry.productionStatus}'`,
    );
  }
});

test('candidate-depth delta items all have productionStatus "candidate-only"', () => {
  const { pool: delta, productionIds } = buildPool({ candidateDepth: 6 });
  const clusters = buildVarietyClusters(delta);
  const clusterMap = buildClusterMap(clusters);

  for (const item of delta) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, reviewerDecisions: {} });
    assert.equal(
      entry.productionStatus, 'candidate-only',
      `Delta item ${entry.id} expected 'candidate-only' but got '${entry.productionStatus}'`,
    );
  }
});

test('inclusive depth-6 pool has mix of production and candidate-only items', () => {
  const { pool, productionIds } = buildPool({ includeDepth6: true });
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);

  const entries = pool.map((item) => buildItemEntry(item, { productionIds, clusterMap, reviewerDecisions: {} }));
  const prodCount = entries.filter((e) => e.productionStatus === 'production').length;
  const candCount = entries.filter((e) => e.productionStatus === 'candidate-only').length;

  assert.equal(prodCount, 192, `Expected 192 production items, got ${prodCount}`);
  assert.equal(candCount, 50, `Expected 50 candidate-only items, got ${candCount}`);
});

// ─── Marking results ─────────────────────────────────────────────────────────

test('model answer marking is correct for all production items', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);

  let correctCount = 0;
  for (const item of pool) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, reviewerDecisions: {} });
    if (entry.markingResult && entry.markingResult.correct) correctCount++;
  }
  // All production items should mark their model answer as correct
  assert.equal(correctCount, pool.length, `Expected all ${pool.length} to mark correct, got ${correctCount}`);
});

test('negative examples are marked incorrect for generated items', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);

  let checkedCount = 0;
  for (const item of pool.filter((i) => i._source === 'generated')) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, reviewerDecisions: {} });
    for (const neg of entry.negativeExamples) {
      assert.equal(
        neg.result.correct, false,
        `Negative example "${neg.answer}" for item ${entry.id} incorrectly marked as correct`,
      );
      checkedCount++;
    }
  }
  assert.ok(checkedCount > 0, 'Expected at least some negative examples to check');
});

// ─── Generated item specific fields ─────────────────────────────────────────

test('generated items have non-empty templateId and variantSignature', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);

  for (const item of pool.filter((i) => i._source === 'generated')) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, reviewerDecisions: {} });
    assert.ok(entry.templateId, `Generated item ${entry.id} has empty templateId`);
    assert.ok(entry.variantSignature, `Generated item ${entry.id} has empty variantSignature`);
    assert.ok(entry.generatorFamilyId, `Generated item ${entry.id} has empty generatorFamilyId`);
  }
});

// ─── PRODUCTION_DEPTH sanity ─────────────────────────────────────────────────

test('PRODUCTION_DEPTH is 4', () => {
  assert.equal(PRODUCTION_DEPTH, 4);
});

// ─── Backward compatibility: buildProductionPool still works for existing tests ─

test('buildProductionPool returns same IDs as buildPool() default', () => {
  const legacy = buildProductionPool();
  const { pool: modern } = buildPool();
  const legacyIds = new Set(legacy.map((i) => i.id));
  const modernIds = new Set(modern.map((i) => i.id));
  assert.deepEqual(legacyIds, modernIds);
});
