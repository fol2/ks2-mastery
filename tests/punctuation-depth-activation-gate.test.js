import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEPTH_ACTIVATION_EVIDENCE,
  evaluateDepthActivationGate,
} from '../shared/punctuation/depth-activation-gate.js';
import { PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';
import { BLOCKING_DECISIONS, DECISION_STATES } from '../shared/punctuation/reviewer-decisions.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

const FIXED_ITEM_COUNT = 92;
const FAMILY_COUNT = 25;

function makePassingOptions(overrides = {}) {
  const candidateItemIds = ['d6-item-1', 'd6-item-2', 'd6-item-3'];
  return {
    targetDepth: 6,
    reviewerDecisions: {
      itemDecisions: candidateItemIds.map((itemId) => ({
        itemId,
        decision: DECISION_STATES.APPROVED,
        reviewer: 'james',
        reviewedAt: '2026-04-29',
      })),
      clusterDecisions: [
        {
          clusterId: 'cluster-A',
          decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
          reviewer: 'james',
          reviewedAt: '2026-04-29',
          rationale: 'Intentional cross-mode reuse for pedagogical coverage',
        },
      ],
    },
    candidateItemIds,
    crossModeClusters: [{ clusterId: 'cluster-A' }],
    speechOraclePass: true,
    semanticLintPass: true,
    productionGatePass: true,
    currentReleaseId: 'punctuation-r4-full-14-skill-structure',
    expectedRuntimeCount: FIXED_ITEM_COUNT + FAMILY_COUNT * 6,
    fixedItemCount: FIXED_ITEM_COUNT,
    familyCount: FAMILY_COUNT,
    ...overrides,
  };
}

// ─── Full pass scenario ─────────────────────────────────────────────────────

test('all evidence satisfied → gate passes with outcome "raise-all-to-6"', () => {
  const result = evaluateDepthActivationGate(makePassingOptions());

  assert.equal(result.pass, true);
  assert.equal(result.outcome, 'raise-all-to-6');
  assert.equal(result.blockers.length, 0);
  assert.equal(result.evidence.length, DEPTH_ACTIVATION_EVIDENCE.length);
  for (const item of result.evidence) {
    assert.equal(item.pass, true, `evidence "${item.id}" should pass`);
  }
});

// ─── Individual evidence failures ───────────────────────────────────────────

test('missing reviewer decisions → gate fails with specific blocker', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    reviewerDecisions: { itemDecisions: [], clusterDecisions: [] },
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'reviewer-decisions-populated'));
});

test('blocking decision on candidate item → gate fails', () => {
  const candidateItemIds = ['d6-item-1', 'd6-item-2'];
  const result = evaluateDepthActivationGate(makePassingOptions({
    candidateItemIds,
    reviewerDecisions: {
      itemDecisions: [
        { itemId: 'd6-item-1', decision: DECISION_STATES.APPROVED, reviewer: 'james', reviewedAt: '2026-04-29' },
        { itemId: 'd6-item-2', decision: DECISION_STATES.NEEDS_REWRITE, reviewer: 'james', reviewedAt: '2026-04-29' },
      ],
      clusterDecisions: [
        { clusterId: 'cluster-A', decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP, reviewer: 'james', reviewedAt: '2026-04-29', rationale: 'OK' },
      ],
    },
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  const blocker = result.blockers.find((b) => b.evidence === 'no-blocking-decisions');
  assert.ok(blocker, 'must report no-blocking-decisions blocker');
  assert.ok(blocker.details.some((d) => d.itemId === 'd6-item-2'));
});

test('unresolved cluster → gate fails', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    crossModeClusters: [{ clusterId: 'cluster-A' }, { clusterId: 'cluster-B' }],
    reviewerDecisions: {
      itemDecisions: [
        { itemId: 'd6-item-1', decision: DECISION_STATES.APPROVED, reviewer: 'james', reviewedAt: '2026-04-29' },
        { itemId: 'd6-item-2', decision: DECISION_STATES.APPROVED, reviewer: 'james', reviewedAt: '2026-04-29' },
        { itemId: 'd6-item-3', decision: DECISION_STATES.APPROVED, reviewer: 'james', reviewedAt: '2026-04-29' },
      ],
      clusterDecisions: [
        { clusterId: 'cluster-A', decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP, reviewer: 'james', reviewedAt: '2026-04-29', rationale: 'OK' },
        // cluster-B has no decision
      ],
    },
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  const blocker = result.blockers.find((b) => b.evidence === 'no-unresolved-clusters');
  assert.ok(blocker, 'must report no-unresolved-clusters blocker');
  assert.ok(blocker.details.some((d) => d.clusterId === 'cluster-B'));
});

test('speech oracle not passing → gate fails', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    speechOraclePass: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'speech-oracle-pass'));
});

test('semantic lint failing → gate fails', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    semanticLintPass: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'semantic-lint-pass'));
});

test('production gate failing → gate fails', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    productionGatePass: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'production-gate-pass'));
});

test('runtime count mismatch → gate fails', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    expectedRuntimeCount: 999,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  const blocker = result.blockers.find((b) => b.evidence === 'runtime-count-valid');
  assert.ok(blocker, 'must report runtime-count-valid blocker');
  assert.ok(blocker.reason.includes('999'));
});

// ─── Multiple blockers simultaneously ───────────────────────────────────────

test('multiple blockers reported simultaneously', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    speechOraclePass: false,
    semanticLintPass: false,
    productionGatePass: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.length >= 3, `expected at least 3 blockers, got ${result.blockers.length}`);
  assert.ok(result.blockers.some((b) => b.evidence === 'speech-oracle-pass'));
  assert.ok(result.blockers.some((b) => b.evidence === 'semantic-lint-pass'));
  assert.ok(result.blockers.some((b) => b.evidence === 'production-gate-pass'));
});

// ─── Purity and determinism ─────────────────────────────────────────────────

test('gate does not mutate input (pure function)', () => {
  const options = makePassingOptions();
  const originalDecisions = JSON.parse(JSON.stringify(options.reviewerDecisions));
  const originalCandidates = [...options.candidateItemIds];
  const originalClusters = JSON.parse(JSON.stringify(options.crossModeClusters));

  evaluateDepthActivationGate(options);

  assert.deepEqual(options.reviewerDecisions, originalDecisions, 'reviewerDecisions mutated');
  assert.deepEqual(options.candidateItemIds, originalCandidates, 'candidateItemIds mutated');
  assert.deepEqual(options.crossModeClusters, originalClusters, 'crossModeClusters mutated');
});

test('gate is deterministic — same inputs produce same outputs', () => {
  const options = makePassingOptions();
  const result1 = evaluateDepthActivationGate(options);
  const result2 = evaluateDepthActivationGate(options);

  assert.deepEqual(result1, result2);
});

// ─── Depth-8 never learner-facing ──────────────────────────────────────────

test('depth-8 is never recommended as learner-facing', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    targetDepth: 8,
    expectedRuntimeCount: FIXED_ITEM_COUNT + FAMILY_COUNT * 8,
  }));

  assert.equal(result.pass, false, 'depth-8 must never pass as learner-facing');
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(
    result.blockers.some((b) => b.reason.includes('capacity-only')),
    'must explain depth-8 is capacity-only',
  );
});

test('depth-10 is also rejected (cap at 6 for learner-facing)', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    targetDepth: 10,
    expectedRuntimeCount: FIXED_ITEM_COUNT + FAMILY_COUNT * 10,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
});

// ─── Output structure ───────────────────────────────────────────────────────

test('output lists exact blockers by item/cluster/family ID', () => {
  const candidateItemIds = ['item-X', 'item-Y', 'item-Z'];
  const result = evaluateDepthActivationGate(makePassingOptions({
    candidateItemIds,
    crossModeClusters: [{ clusterId: 'overlap-1' }, { clusterId: 'overlap-2' }],
    reviewerDecisions: {
      itemDecisions: [
        { itemId: 'item-X', decision: DECISION_STATES.APPROVED, reviewer: 'james', reviewedAt: '2026-04-29' },
        { itemId: 'item-Y', decision: DECISION_STATES.NEEDS_MARKING_FIX, reviewer: 'james', reviewedAt: '2026-04-29' },
        { itemId: 'item-Z', decision: DECISION_STATES.RETIRE, reviewer: 'james', reviewedAt: '2026-04-29', rationale: 'Confusing' },
      ],
      clusterDecisions: [
        // overlap-1 has decision, overlap-2 does not
        { clusterId: 'overlap-1', decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP, reviewer: 'james', reviewedAt: '2026-04-29', rationale: 'OK' },
      ],
    },
  }));

  assert.equal(result.pass, false);

  // Check blocking decisions details include exact item IDs
  const blockingBlocker = result.blockers.find((b) => b.evidence === 'no-blocking-decisions');
  assert.ok(blockingBlocker);
  assert.ok(blockingBlocker.details.some((d) => d.itemId === 'item-Y'));
  assert.ok(blockingBlocker.details.some((d) => d.itemId === 'item-Z'));

  // Check unresolved clusters details include exact cluster ID
  const clusterBlocker = result.blockers.find((b) => b.evidence === 'no-unresolved-clusters');
  assert.ok(clusterBlocker);
  assert.ok(clusterBlocker.details.some((d) => d.clusterId === 'overlap-2'));
});

// ─── Evidence constant coverage ─────────────────────────────────────────────

test('DEPTH_ACTIVATION_EVIDENCE contains exactly 9 items', () => {
  assert.equal(DEPTH_ACTIVATION_EVIDENCE.length, 9);
});

test('all evidence items are checked in a passing gate result', () => {
  const result = evaluateDepthActivationGate(makePassingOptions());
  const evidenceIds = result.evidence.map((e) => e.id);

  for (const expected of DEPTH_ACTIVATION_EVIDENCE) {
    assert.ok(evidenceIds.includes(expected), `evidence "${expected}" missing from gate output`);
  }
});

// ─── Release ID check ───────────────────────────────────────────────────────

test('release ID already at depth-6 value → gate fails (no promotion needed)', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    currentReleaseId: 'punctuation-r5-qg-depth-6',
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'release-id-change'));
});

// ─── Star evidence is structural guarantee ──────────────────────────────────

test('star-evidence-scoped always passes (structural guarantee)', () => {
  const result = evaluateDepthActivationGate(makePassingOptions());
  const starEvidence = result.evidence.find((e) => e.id === 'star-evidence-scoped');

  assert.ok(starEvidence);
  assert.equal(starEvidence.pass, true);
});

// ─── PRODUCTION_DEPTH import verification ───────────────────────────────────

test('PRODUCTION_DEPTH is imported and used as baseline (currently 4)', () => {
  assert.equal(PRODUCTION_DEPTH, 4);
});

// ─── Cross-mode clusters accept string or object format ─────────────────────

test('crossModeClusters accepts string array format', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    crossModeClusters: ['cluster-A'],
    reviewerDecisions: {
      itemDecisions: [
        { itemId: 'd6-item-1', decision: DECISION_STATES.APPROVED, reviewer: 'james', reviewedAt: '2026-04-29' },
        { itemId: 'd6-item-2', decision: DECISION_STATES.APPROVED, reviewer: 'james', reviewedAt: '2026-04-29' },
        { itemId: 'd6-item-3', decision: DECISION_STATES.APPROVED, reviewer: 'james', reviewedAt: '2026-04-29' },
      ],
      clusterDecisions: [
        { clusterId: 'cluster-A', decision: DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP, reviewer: 'james', reviewedAt: '2026-04-29', rationale: 'OK' },
      ],
    },
  }));

  assert.equal(result.pass, true);
  assert.equal(result.outcome, 'raise-all-to-6');
});
