import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductionPool,
  buildPool,
  buildItemEntry,
  buildVarietyClusters,
  buildClusterMap,
  buildNegativeVectorMap,
  buildSummaryOutput,
} from '../scripts/review-punctuation-questions.mjs';
import { PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';
import { generateStableClusterId, BLOCKING_DECISIONS } from '../shared/punctuation/reviewer-decisions.js';

// ─── Pool size invariants (match P7 baseline) ───────────────────────────────

test('default production pack covers 192 items', () => {
  const { pool } = buildPool();
  assert.equal(pool.length, 192);
});

test('--include-depth-6 covers 242 items', () => {
  const { pool } = buildPool({ includeDepth6: true });
  assert.equal(pool.length, 242);
});

test('--candidate-depth 6 covers 50 candidate-only items', () => {
  const { pool } = buildPool({ candidateDepth: 6 });
  assert.equal(pool.length, 50);
});

// ─── Summary output ─────────────────────────────────────────────────────────

test('--summary outputs decision state counts', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  buildClusterMap(clusters); // assigns stableId to each cluster
  const itemDecisionMap = new Map();
  const clusterDecisionMap = new Map();

  const summary = buildSummaryOutput(pool, { productionIds, itemDecisionMap, clusterDecisionMap, clusters });

  assert.equal(summary.totalItems, 192);
  assert.equal(summary.productionCount, 192);
  assert.equal(summary.candidateCount, 0);
  assert.equal(typeof summary.itemStates, 'object');
  assert.equal(typeof summary.clusterStates, 'object');
  // With no decisions, all items are unreviewed
  assert.equal(summary.itemStates.unreviewed, 192);
  assert.equal(summary.itemStates.approved, 0);
  assert.equal(summary.itemStates.blocked, 0);
});

test('--summary with populated decisions counts correctly', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  buildClusterMap(clusters);

  const itemDecisionMap = new Map();
  // Add some decisions
  const ids = pool.map((i) => i.id);
  itemDecisionMap.set(ids[0], { itemId: ids[0], decision: 'approved', reviewer: 'tester', reviewedAt: '2026-04-29' });
  itemDecisionMap.set(ids[1], { itemId: ids[1], decision: 'needs-rewrite', reviewer: 'tester', reviewedAt: '2026-04-29' });
  itemDecisionMap.set(ids[2], { itemId: ids[2], decision: 'pending', reviewer: 'tester', reviewedAt: '2026-04-29' });

  const clusterDecisionMap = new Map();
  const summary = buildSummaryOutput(pool, { productionIds, itemDecisionMap, clusterDecisionMap, clusters });

  assert.equal(summary.itemStates.approved, 1);
  assert.equal(summary.itemStates.blocked, 2); // needs-rewrite + pending are blocking
  assert.equal(summary.itemStates.unreviewed, 192 - 3);
});

// ─── --only-unreviewed with empty decisions shows all items ──────────────────

test('--only-unreviewed with empty decisions shows all items', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  const entries = pool.map((item) => buildItemEntry(item, {
    productionIds,
    clusterMap,
    itemDecisionMap,
    negativeVectorMap: new Map(),
  }));

  // All items should be unreviewed (no decisions)
  const unreviewed = entries.filter((e) => !e.reviewerDecision);
  assert.equal(unreviewed.length, 192);
});

// ─── Stable cluster IDs are deterministic across runs ────────────────────────

test('stable cluster IDs are deterministic across runs', () => {
  const { pool: pool1 } = buildPool();
  const clusters1 = buildVarietyClusters(pool1);
  buildClusterMap(clusters1);

  const { pool: pool2 } = buildPool();
  const clusters2 = buildVarietyClusters(pool2);
  buildClusterMap(clusters2);

  // Same pool should produce same cluster IDs
  assert.equal(clusters1.length, clusters2.length);
  for (let i = 0; i < clusters1.length; i++) {
    assert.equal(clusters1[i].stableId, clusters2[i].stableId,
      `Cluster ${i} ID mismatch: ${clusters1[i].stableId} vs ${clusters2[i].stableId}`);
  }
});

test('generateStableClusterId is deterministic for same input', () => {
  const ids = ['item-c', 'item-a', 'item-b'];
  const id1 = generateStableClusterId(ids, 'stem');
  const id2 = generateStableClusterId(ids, 'stem');
  assert.equal(id1, id2);
});

test('generateStableClusterId sorts input (order-independent)', () => {
  const id1 = generateStableClusterId(['a', 'c', 'b'], 'test');
  const id2 = generateStableClusterId(['c', 'a', 'b'], 'test');
  assert.equal(id1, id2);
});

test('generateStableClusterId produces different IDs for different inputs', () => {
  const id1 = generateStableClusterId(['item-a', 'item-b'], 'stem');
  const id2 = generateStableClusterId(['item-a', 'item-c'], 'stem');
  assert.notEqual(id1, id2);
});

test('stable cluster IDs include type prefix', () => {
  const id = generateStableClusterId(['item-a', 'item-b'], 'stem');
  assert.ok(id.startsWith('stem_'), `Expected prefix "stem_", got "${id}"`);
});

// ─── Choice items render options ─────────────────────────────────────────────

test('choice items render options with correct index', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  const chooseItems = pool.filter((i) => i.mode === 'choose');
  assert.ok(chooseItems.length > 0, 'Expected at least one choose item');

  for (const item of chooseItems) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, itemDecisionMap, negativeVectorMap: new Map() });
    assert.ok(entry.choiceOptions, `Choice item ${entry.id} missing choiceOptions`);
    assert.ok(Array.isArray(entry.choiceOptions.options), `Choice item ${entry.id} options not an array`);
    assert.ok(entry.choiceOptions.options.length >= 2, `Choice item ${entry.id} has fewer than 2 options`);
    assert.equal(typeof entry.choiceOptions.correctIndex, 'number', `Choice item ${entry.id} correctIndex not a number`);
    assert.ok(
      entry.choiceOptions.correctIndex >= 0 && entry.choiceOptions.correctIndex < entry.choiceOptions.options.length,
      `Choice item ${entry.id} correctIndex out of bounds`,
    );
  }
});

test('non-choice items have null choiceOptions', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  const nonChooseItems = pool.filter((i) => i.mode !== 'choose');
  assert.ok(nonChooseItems.length > 0, 'Expected at least one non-choose item');

  for (const item of nonChooseItems) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, itemDecisionMap, negativeVectorMap: new Map() });
    assert.equal(entry.choiceOptions, null, `Non-choice item ${entry.id} should have null choiceOptions`);
  }
});

// ─── Preservation contract ──────────────────────────────────────────────────

test('closed-mode items with stems have preservation tokens', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  const closedModes = ['insert', 'fix', 'combine', 'transfer'];
  const closedItems = pool.filter((i) => closedModes.includes(i.mode) && i.stem);
  assert.ok(closedItems.length > 0, 'Expected at least one closed-mode item with a stem');

  for (const item of closedItems) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, itemDecisionMap, negativeVectorMap: new Map() });
    assert.ok(Array.isArray(entry.preservationTokens), `Closed item ${entry.id} missing preservationTokens`);
    assert.ok(entry.preservationTokens.length > 0, `Closed item ${entry.id} has empty preservationTokens`);
  }
});

test('closed-mode items without stems have null preservationTokens', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  const closedModes = ['insert', 'fix', 'combine', 'transfer'];
  const noStemItems = pool.filter((i) => closedModes.includes(i.mode) && !i.stem);

  // These are open-ended transfer items — preservation doesn't apply
  for (const item of noStemItems) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, itemDecisionMap, negativeVectorMap: new Map() });
    assert.equal(entry.preservationTokens, null, `Open-transfer item ${entry.id} should have null preservationTokens`);
  }
});

test('choose items have null preservationTokens', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  const chooseItems = pool.filter((i) => i.mode === 'choose');
  for (const item of chooseItems) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, itemDecisionMap, negativeVectorMap: new Map() });
    assert.equal(entry.preservationTokens, null, `Choose item ${entry.id} should have null preservationTokens`);
  }
});

// ─── Explanation lint ───────────────────────────────────────────────────────

test('explanation lint result is present on every item', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  for (const item of pool) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, itemDecisionMap, negativeVectorMap: new Map() });
    assert.ok(entry.explanationLint, `Item ${entry.id} missing explanationLint`);
    assert.equal(typeof entry.explanationLint.pass, 'boolean', `Item ${entry.id} explanationLint.pass not boolean`);
    assert.ok(Array.isArray(entry.explanationLint.violations), `Item ${entry.id} explanationLint.violations not array`);
  }
});

// ─── Negative vector map ────────────────────────────────────────────────────

test('buildNegativeVectorMap indexes by itemId', () => {
  const vectors = [
    { itemId: 'item-a', input: 'wrong answer', expectedCorrect: false },
    { itemId: 'item-a', input: 'another wrong', expectedCorrect: false },
    { itemId: 'item-b', input: 'bad', expectedCorrect: false },
  ];
  const map = buildNegativeVectorMap(vectors);
  assert.equal(map.size, 2);
  assert.equal(map.get('item-a').length, 2);
  assert.equal(map.get('item-b').length, 1);
});

// ─── Review decision display ────────────────────────────────────────────────

test('items with decisions show review status fields', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);

  const item = pool[0];
  const itemDecisionMap = new Map();
  itemDecisionMap.set(item.id, {
    itemId: item.id,
    decision: 'approved',
    reviewer: 'james',
    reviewedAt: '2026-04-29',
    rationale: 'Looks good',
  });

  const entry = buildItemEntry(item, { productionIds, clusterMap, itemDecisionMap, negativeVectorMap: new Map() });
  assert.ok(entry.reviewerDecision);
  assert.equal(entry.reviewerDecision.decision, 'approved');
  assert.equal(entry.reviewerDecision.reviewer, 'james');
  assert.equal(entry.reviewerDecision.reviewedAt, '2026-04-29');
  assert.equal(entry.reviewerDecision.rationale, 'Looks good');
});

test('items without decisions have null reviewerDecision', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  const entry = buildItemEntry(pool[0], { productionIds, clusterMap, itemDecisionMap, negativeVectorMap: new Map() });
  assert.equal(entry.reviewerDecision, null);
});

// ─── Fixed negative vectors integration ──────────────────────────────────────

test('fixed negative vectors are loaded and marked against items', () => {
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  // Find an insert/fix item to test with
  const targetItem = pool.find((i) => i.mode === 'insert' || i.mode === 'fix');
  assert.ok(targetItem, 'Need at least one insert/fix item');

  // Create a synthetic negative vector for this item
  const negativeVectorMap = new Map();
  negativeVectorMap.set(targetItem.id, [
    { itemId: targetItem.id, input: 'completely wrong answer here', expectedCorrect: false },
  ]);

  const entry = buildItemEntry(targetItem, { productionIds, clusterMap, itemDecisionMap, negativeVectorMap });
  assert.equal(entry.fixedNegativeVectors.length, 1);
  assert.equal(entry.fixedNegativeVectors[0].input, 'completely wrong answer here');
  assert.equal(typeof entry.fixedNegativeVectors[0].result.correct, 'boolean');
});

// ─── Backward compatibility ──────────────────────────────────────────────────

test('buildProductionPool still works and returns 192 items', () => {
  const pool = buildProductionPool();
  assert.equal(pool.length, 192);
});

test('all required entry fields present (backward compat with P7 tests)', () => {
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

  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const itemDecisionMap = new Map();

  for (const item of pool) {
    const entry = buildItemEntry(item, { productionIds, clusterMap, itemDecisionMap, negativeVectorMap: new Map() });
    for (const field of REQUIRED_ENTRY_FIELDS) {
      assert.ok(field in entry, `Item ${entry.id} missing field "${field}"`);
    }
  }
});
