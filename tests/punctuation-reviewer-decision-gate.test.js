import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  DECISION_STATES,
  ALL_DECISION_VALUES,
  BLOCKING_DECISIONS,
  validateItemDecision,
  validateClusterDecision,
  validateDecisionSchema,
  evaluateProductionGate,
  evaluateDepth6Gate,
  evaluateClusterGate,
  loadReviewerDecisions,
} from '../shared/punctuation/reviewer-decisions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECISIONS_PATH = join(__dirname, 'fixtures', 'punctuation-reviewer-decisions.json');

// ─── Helper factories ────────────────────────────────────────────────────────

function makeItemDecision(overrides = {}) {
  return {
    itemId: 'test-item-001',
    decision: DECISION_STATES.APPROVED,
    reviewer: 'james',
    reviewedAt: '2026-04-29',
    ...overrides,
  };
}

function makeClusterDecision(overrides = {}) {
  return {
    clusterId: 'cluster-001',
    decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
    reviewer: 'james',
    reviewedAt: '2026-04-29',
    rationale: 'Same sentence used in fix and combine modes — intentional pedagogical reuse',
    ...overrides,
  };
}

function makeDecisionsData(itemDecisions = [], clusterDecisions = []) {
  return { itemDecisions, clusterDecisions };
}

// ─── Core P7 invariant: empty decisions FAIL ─────────────────────────────────

test('production gate: empty itemDecisions FAILS (core P7 invariant)', () => {
  const data = makeDecisionsData([], []);
  const result = evaluateProductionGate(data, ['item-1', 'item-2', 'item-3']);

  assert.equal(result.pass, false, 'empty decisions must fail');
  assert.ok(result.blockers.length > 0, 'must report blockers');
  assert.equal(result.blockers[0].itemId, '*');
  assert.ok(result.blockers[0].reason.includes('empty'), 'reason mentions empty');
});

test('production gate: fixture file with empty itemDecisions FAILS', () => {
  const raw = readFileSync(DECISIONS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const result = evaluateProductionGate(parsed, ['any-item-id']);

  assert.equal(result.pass, false, 'fixture with empty itemDecisions must fail');
});

// ─── Production gate: populated decisions ────────────────────────────────────

test('production gate: all items approved PASSES', () => {
  const productionIds = ['item-1', 'item-2', 'item-3'];
  const data = makeDecisionsData(
    productionIds.map((id) => makeItemDecision({ itemId: id })),
    [],
  );

  const result = evaluateProductionGate(data, productionIds);

  assert.equal(result.pass, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.stats.approved, 3);
  assert.equal(result.stats.blocked, 0);
  assert.equal(result.stats.missing, 0);
});

test('production gate: one item with needs-rewrite FAILS', () => {
  const productionIds = ['item-1', 'item-2', 'item-3'];
  const data = makeDecisionsData([
    makeItemDecision({ itemId: 'item-1' }),
    makeItemDecision({ itemId: 'item-2', decision: DECISION_STATES.NEEDS_REWRITE }),
    makeItemDecision({ itemId: 'item-3' }),
  ], []);

  const result = evaluateProductionGate(data, productionIds);

  assert.equal(result.pass, false);
  assert.equal(result.blockers.length, 1);
  assert.equal(result.blockers[0].itemId, 'item-2');
  assert.ok(result.blockers[0].reason.includes('needs-rewrite'));
});

test('production gate: one item with pending FAILS', () => {
  const productionIds = ['item-1', 'item-2'];
  const data = makeDecisionsData([
    makeItemDecision({ itemId: 'item-1' }),
    makeItemDecision({ itemId: 'item-2', decision: DECISION_STATES.PENDING }),
  ], []);

  const result = evaluateProductionGate(data, productionIds);

  assert.equal(result.pass, false);
  assert.equal(result.blockers.length, 1);
  assert.equal(result.blockers[0].itemId, 'item-2');
  assert.ok(result.blockers[0].reason.includes('pending'));
});

test('production gate: one item with needs-marking-fix FAILS', () => {
  const productionIds = ['item-1'];
  const data = makeDecisionsData([
    makeItemDecision({ itemId: 'item-1', decision: DECISION_STATES.NEEDS_MARKING_FIX }),
  ], []);

  const result = evaluateProductionGate(data, productionIds);

  assert.equal(result.pass, false);
  assert.equal(result.stats.blocked, 1);
});

test('production gate: one item with needs-prompt-tightening FAILS', () => {
  const productionIds = ['item-1'];
  const data = makeDecisionsData([
    makeItemDecision({ itemId: 'item-1', decision: DECISION_STATES.NEEDS_PROMPT_TIGHTENING }),
  ], []);

  const result = evaluateProductionGate(data, productionIds);

  assert.equal(result.pass, false);
  assert.equal(result.stats.blocked, 1);
});

test('production gate: one item with retire FAILS', () => {
  const productionIds = ['item-1'];
  const data = makeDecisionsData([
    makeItemDecision({
      itemId: 'item-1',
      decision: DECISION_STATES.RETIRE,
      rationale: 'Ambiguous stem — learner confusion in trials',
    }),
  ], []);

  const result = evaluateProductionGate(data, productionIds);

  assert.equal(result.pass, false);
  assert.equal(result.stats.retired, 1);
});

test('production gate: missing item (no decision recorded) FAILS', () => {
  const productionIds = ['item-1', 'item-2'];
  const data = makeDecisionsData([
    makeItemDecision({ itemId: 'item-1' }),
    // item-2 has no decision
  ], []);

  const result = evaluateProductionGate(data, productionIds);

  assert.equal(result.pass, false);
  assert.equal(result.stats.missing, 1);
  assert.ok(result.blockers.some((b) => b.itemId === 'item-2'));
});

test('production gate: acceptable-cross-mode-overlap counts as approved for items', () => {
  const productionIds = ['item-1'];
  const data = makeDecisionsData([
    makeItemDecision({
      itemId: 'item-1',
      decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
      rationale: 'Intentional cross-mode reuse for pedagogical coverage',
    }),
  ], []);

  const result = evaluateProductionGate(data, productionIds);

  assert.equal(result.pass, true, 'acceptable-cross-mode-overlap is not blocking');
  assert.equal(result.stats.approved, 1);
});

// ─── Depth-6 gate: candidate isolation ───────────────────────────────────────

test('depth-6 gate: candidate with blocking decision fails depth-6 but NOT production', () => {
  const productionIds = ['prod-1', 'prod-2'];
  const candidateIds = ['candidate-1', 'candidate-2'];

  const data = makeDecisionsData([
    makeItemDecision({ itemId: 'prod-1' }),
    makeItemDecision({ itemId: 'prod-2' }),
    makeItemDecision({ itemId: 'candidate-1', decision: DECISION_STATES.NEEDS_REWRITE }),
    makeItemDecision({ itemId: 'candidate-2' }),
  ], []);

  // Depth-6 gate fails
  const depth6Result = evaluateDepth6Gate(data, candidateIds);
  assert.equal(depth6Result.pass, false, 'depth-6 gate fails for candidate with blocking decision');
  assert.equal(depth6Result.blockers.length, 1);
  assert.equal(depth6Result.blockers[0].itemId, 'candidate-1');

  // Production gate passes (only checks production items)
  const prodResult = evaluateProductionGate(data, productionIds);
  assert.equal(prodResult.pass, true, 'production gate unaffected by candidate blocking decision');
});

test('depth-6 gate: all candidates approved PASSES', () => {
  const candidateIds = ['c-1', 'c-2', 'c-3'];
  const data = makeDecisionsData(
    candidateIds.map((id) => makeItemDecision({ itemId: id })),
    [],
  );

  const result = evaluateDepth6Gate(data, candidateIds);

  assert.equal(result.pass, true);
  assert.equal(result.stats.approved, 3);
});

test('depth-6 gate: empty decisions FAILS', () => {
  const result = evaluateDepth6Gate(makeDecisionsData([], []), ['c-1']);

  assert.equal(result.pass, false);
});

// ─── Cluster gate: cross-mode overlap ────────────────────────────────────────

test('cluster gate: cluster without acceptable-cross-mode-overlap FAILS', () => {
  const clusterIds = ['cluster-A'];
  const data = makeDecisionsData([], []);

  const result = evaluateClusterGate(data, clusterIds);

  assert.equal(result.pass, false);
  assert.equal(result.stats.missing, 1);
});

test('cluster gate: cluster with decision but no rationale FAILS', () => {
  const clusterIds = ['cluster-A'];
  const data = makeDecisionsData([], [
    {
      clusterId: 'cluster-A',
      decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
      reviewer: 'james',
      reviewedAt: '2026-04-29',
      rationale: '', // Empty rationale
    },
  ]);

  const result = evaluateClusterGate(data, clusterIds);

  assert.equal(result.pass, false);
  assert.ok(result.blockers[0].reason.includes('rationale'));
});

test('cluster gate: cluster with wrong decision type FAILS', () => {
  const clusterIds = ['cluster-A'];
  const data = makeDecisionsData([], [
    makeClusterDecision({ clusterId: 'cluster-A', decision: DECISION_STATES.APPROVED, rationale: undefined }),
  ]);

  const result = evaluateClusterGate(data, clusterIds);

  assert.equal(result.pass, false);
  assert.ok(result.blockers[0].reason.includes('expected "acceptable-cross-mode-overlap"'));
});

test('cluster gate: cluster with valid acceptable-cross-mode-overlap and rationale PASSES', () => {
  const clusterIds = ['cluster-A', 'cluster-B'];
  const data = makeDecisionsData([], [
    makeClusterDecision({ clusterId: 'cluster-A' }),
    makeClusterDecision({ clusterId: 'cluster-B', rationale: 'Fix-mode adds pedagogical contrast' }),
  ]);

  const result = evaluateClusterGate(data, clusterIds);

  assert.equal(result.pass, true);
  assert.equal(result.stats.approved, 2);
});

test('cluster gate: no clusters to check passes vacuously', () => {
  const result = evaluateClusterGate(makeDecisionsData([], []), []);
  assert.equal(result.pass, true);
});

// ─── Schema validation ───────────────────────────────────────────────────────

test('schema validation: rejects invalid decision states', () => {
  const entry = makeItemDecision({ decision: 'invalid-state' });
  const result = validateItemDecision(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('invalid')));
});

test('schema validation: rejects missing itemId', () => {
  const entry = makeItemDecision({ itemId: '' });
  const result = validateItemDecision(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('itemId')));
});

test('schema validation: rejects missing reviewer', () => {
  const entry = makeItemDecision({ reviewer: '' });
  const result = validateItemDecision(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('reviewer')));
});

test('schema validation: rejects invalid reviewedAt format', () => {
  const entry = makeItemDecision({ reviewedAt: '29-04-2026' });
  const result = validateItemDecision(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('reviewedAt')));
});

test('schema validation: requires rationale for retire decision', () => {
  const entry = makeItemDecision({ decision: DECISION_STATES.RETIRE });
  const result = validateItemDecision(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('rationale')));
});

test('schema validation: requires rationale for acceptable-cross-mode-overlap', () => {
  const entry = makeItemDecision({ decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP });
  const result = validateItemDecision(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('rationale')));
});

test('schema validation: accepts valid approved entry', () => {
  const entry = makeItemDecision();
  const result = validateItemDecision(entry);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('schema validation: accepts valid retire entry with rationale', () => {
  const entry = makeItemDecision({
    decision: DECISION_STATES.RETIRE,
    rationale: 'Stem is ambiguous post-curriculum update',
  });
  const result = validateItemDecision(entry);

  assert.equal(result.valid, true);
});

test('schema validation: validates full decisions data', () => {
  const data = makeDecisionsData(
    [makeItemDecision()],
    [makeClusterDecision()],
  );
  const result = validateDecisionSchema(data);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('schema validation: reports errors from both arrays', () => {
  const data = makeDecisionsData(
    [makeItemDecision({ decision: 'bogus' })],
    [{ clusterId: '', decision: 'invalid' }],
  );
  const result = validateDecisionSchema(data);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 2, `expected multiple errors, got ${result.errors.length}`);
});

// ─── Stats reporting ─────────────────────────────────────────────────────────

test('gate reports exact counts (approved, blocked, missing, retired)', () => {
  const productionIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const data = makeDecisionsData([
    makeItemDecision({ itemId: 'p1' }),
    makeItemDecision({ itemId: 'p2' }),
    makeItemDecision({ itemId: 'p3', decision: DECISION_STATES.NEEDS_REWRITE }),
    makeItemDecision({
      itemId: 'p4',
      decision: DECISION_STATES.RETIRE,
      rationale: 'Obsolete after curriculum revision',
    }),
    // p5 has no decision
  ], []);

  const result = evaluateProductionGate(data, productionIds);

  assert.equal(result.stats.total, 5);
  assert.equal(result.stats.approved, 2);
  assert.equal(result.stats.blocked, 2); // needs-rewrite + retire
  assert.equal(result.stats.missing, 1); // p5
  assert.equal(result.stats.retired, 1); // p4
  assert.equal(result.pass, false);
});

// ─── Loader ──────────────────────────────────────────────────────────────────

test('loadReviewerDecisions: loads fixture file and returns valid structure', () => {
  const { data, valid, errors } = loadReviewerDecisions(DECISIONS_PATH);

  assert.ok(data !== null);
  assert.ok(Array.isArray(data.itemDecisions));
  assert.ok(Array.isArray(data.clusterDecisions));
  // Empty arrays are valid schema (but fail gate — that is the point)
  assert.equal(valid, true);
  assert.equal(errors.length, 0);
});

test('loadReviewerDecisions: handles data object directly', () => {
  const input = makeDecisionsData([makeItemDecision()], [makeClusterDecision()]);
  const { data, valid } = loadReviewerDecisions(input);

  assert.equal(valid, true);
  assert.equal(data.itemDecisions.length, 1);
});

// ─── Decision state coverage ─────────────────────────────────────────────────

test('BLOCKING_DECISIONS includes exactly the expected states', () => {
  assert.deepEqual(
    [...BLOCKING_DECISIONS].sort(),
    ['needs-marking-fix', 'needs-prompt-tightening', 'needs-rewrite', 'pending', 'retire'].sort(),
  );
});

test('ALL_DECISION_VALUES covers all 7 states', () => {
  assert.equal(ALL_DECISION_VALUES.length, 7);
  assert.ok(ALL_DECISION_VALUES.includes('approved'));
  assert.ok(ALL_DECISION_VALUES.includes('acceptable-cross-mode-overlap'));
  assert.ok(ALL_DECISION_VALUES.includes('needs-rewrite'));
  assert.ok(ALL_DECISION_VALUES.includes('needs-marking-fix'));
  assert.ok(ALL_DECISION_VALUES.includes('needs-prompt-tightening'));
  assert.ok(ALL_DECISION_VALUES.includes('retire'));
  assert.ok(ALL_DECISION_VALUES.includes('pending'));
});
