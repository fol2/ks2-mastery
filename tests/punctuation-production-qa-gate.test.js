import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECISION_STATES,
  evaluateProductionGate,
  evaluateClusterGate,
} from '../shared/punctuation/reviewer-decisions.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItemDecision(itemId, overrides = {}) {
  return {
    itemId,
    decision: DECISION_STATES.APPROVED,
    reviewer: 'james',
    reviewedAt: '2026-04-29',
    rationale: `Reviewed ${itemId} — quality confirmed`,
    ...overrides,
  };
}

function makeProductionIds(count = 192) {
  return Array.from({ length: count }, (_, i) => `item-${String(i + 1).padStart(3, '0')}`);
}

function makeDecisionsData(itemDecisions = [], clusterDecisions = []) {
  return { itemDecisions, clusterDecisions };
}

// ─── All 192 items with valid distinct decisions → gate passes ───────────────

test('all 192 items with valid distinct decisions → gate passes', () => {
  const ids = makeProductionIds(192);
  const decisions = ids.map((id) => makeItemDecision(id));
  const data = makeDecisionsData(decisions, []);

  const result = evaluateProductionGate(data, ids);

  assert.equal(result.pass, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.stats.total, 192);
  assert.equal(result.stats.approved, 192);
});

// ─── Empty itemDecisions → gate fails (P7 invariant) ─────────────────────────

test('empty itemDecisions → gate fails (P7 invariant)', () => {
  const ids = makeProductionIds(192);
  const data = makeDecisionsData([], []);

  const result = evaluateProductionGate(data, ids);

  assert.equal(result.pass, false);
  assert.ok(result.blockers.length > 0);
  assert.ok(result.blockers[0].reason.includes('empty'));
});

// ─── One item with pending decision → gate fails ─────────────────────────────

test('one item with pending decision → gate fails', () => {
  const ids = makeProductionIds(10);
  const decisions = ids.map((id, i) =>
    i === 5
      ? makeItemDecision(id, { decision: DECISION_STATES.PENDING })
      : makeItemDecision(id),
  );
  const data = makeDecisionsData(decisions, []);

  const result = evaluateProductionGate(data, ids);

  assert.equal(result.pass, false);
  const blocker = result.blockers.find((b) => b.itemId === 'item-006');
  assert.ok(blocker, 'must report the pending item as a blocker');
  assert.ok(blocker.reason.includes('pending'));
});

// ─── One item missing entirely → gate fails ──────────────────────────────────

test('one item missing entirely → gate fails', () => {
  const ids = makeProductionIds(10);
  // Only provide decisions for first 9 items
  const decisions = ids.slice(0, 9).map((id) => makeItemDecision(id));
  const data = makeDecisionsData(decisions, []);

  const result = evaluateProductionGate(data, ids);

  assert.equal(result.pass, false);
  const blocker = result.blockers.find((b) => b.itemId === 'item-010');
  assert.ok(blocker, 'must report the missing item as a blocker');
  assert.ok(blocker.reason.includes('no decision'));
});

// ─── All rationales identical → gate fails ───────────────────────────────────

test('all rationales identical → gate fails with auto-generated message', () => {
  const ids = makeProductionIds(10);
  const decisions = ids.map((id) => makeItemDecision(id, {
    rationale: 'Auto-approved by script',
  }));
  const data = makeDecisionsData(decisions, []);

  const result = evaluateProductionGate(data, ids);

  assert.equal(result.pass, false);
  const blocker = result.blockers.find((b) => b.reason.includes('identical rationales'));
  assert.ok(blocker, 'must report identical rationale blocker');
  assert.ok(blocker.reason.includes('auto-generated'));
});

test('all rationales identical (large set) → gate fails', () => {
  const ids = makeProductionIds(192);
  const decisions = ids.map((id) => makeItemDecision(id, {
    rationale: 'Looks good',
  }));
  const data = makeDecisionsData(decisions, []);

  const result = evaluateProductionGate(data, ids);

  assert.equal(result.pass, false);
  assert.ok(result.blockers.some((b) => b.reason.includes('identical rationales')));
});

// ─── Mix of approved and acceptable-cross-mode-overlap → passes ──────────────

test('mix of approved and acceptable-cross-mode-overlap → passes', () => {
  const ids = makeProductionIds(10);
  const decisions = ids.map((id, i) =>
    i % 3 === 0
      ? makeItemDecision(id, {
          decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
          rationale: `Cross-mode overlap for ${id} is intentional`,
        })
      : makeItemDecision(id),
  );
  const data = makeDecisionsData(decisions, []);

  const result = evaluateProductionGate(data, ids);

  assert.equal(result.pass, true);
  assert.equal(result.blockers.length, 0);
});

// ─── Cluster gate requires rationale for cross-mode overlap ──────────────────

test('cluster gate requires rationale for cross-mode overlap', () => {
  const clusterIds = ['cluster-001', 'cluster-002'];
  const data = makeDecisionsData([], [
    {
      clusterId: 'cluster-001',
      decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
      reviewer: 'james',
      reviewedAt: '2026-04-29',
      rationale: 'Intentional pedagogical reuse across modes',
    },
    {
      clusterId: 'cluster-002',
      decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
      reviewer: 'james',
      reviewedAt: '2026-04-29',
      rationale: '', // empty rationale
    },
  ]);

  const result = evaluateClusterGate(data, clusterIds);

  assert.equal(result.pass, false);
  const blocker = result.blockers.find((b) => b.clusterId === 'cluster-002');
  assert.ok(blocker, 'must report cluster-002 without rationale');
  assert.ok(blocker.reason.includes('rationale'));
});

test('cluster gate passes when all have valid rationale', () => {
  const clusterIds = ['cluster-001', 'cluster-002'];
  const data = makeDecisionsData([], [
    {
      clusterId: 'cluster-001',
      decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
      reviewer: 'james',
      reviewedAt: '2026-04-29',
      rationale: 'Cross-mode overlap for pedagogical coverage',
    },
    {
      clusterId: 'cluster-002',
      decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
      reviewer: 'james',
      reviewedAt: '2026-04-29',
      rationale: 'Intentional shared sentence for depth progression',
    },
  ]);

  const result = evaluateClusterGate(data, clusterIds);

  assert.equal(result.pass, true);
  assert.equal(result.blockers.length, 0);
});

// ─── Distinct rationales pass ────────────────────────────────────────────────

test('distinct rationales do not trigger auto-generation rejection', () => {
  const ids = makeProductionIds(10);
  const decisions = ids.map((id, i) => makeItemDecision(id, {
    rationale: `Unique review note for item ${i + 1}`,
  }));
  const data = makeDecisionsData(decisions, []);

  const result = evaluateProductionGate(data, ids);

  assert.equal(result.pass, true);
  assert.equal(result.blockers.length, 0);
});

// ─── No rationale at all does NOT trigger identical check ────────────────────

test('items without rationale field do not trigger identical rationale check', () => {
  const ids = makeProductionIds(10);
  const decisions = ids.map((id) => ({
    itemId: id,
    decision: DECISION_STATES.APPROVED,
    reviewer: 'james',
    reviewedAt: '2026-04-29',
    // no rationale field
  }));
  const data = makeDecisionsData(decisions, []);

  const result = evaluateProductionGate(data, ids);

  assert.equal(result.pass, true);
  assert.equal(result.blockers.length, 0);
});
