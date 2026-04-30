import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEPTH_ACTIVATION_EVIDENCE,
  evaluateDepthActivationGate,
} from '../shared/punctuation/depth-activation-gate.js';
import { DECISION_STATES } from '../shared/punctuation/reviewer-decisions.js';

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
    preservationOraclePass: true,
    negativeVectorsPass: true,
    transferMeaningfulnessPass: true,
    candidateDecisionsPopulated: true,
    starEvidenceScoped: true,
    deploymentCommitSha: 'abc1234567890def1234567890abcdef12345678',
    ...overrides,
  };
}

// ─── P8-U9: DEPTH_ACTIVATION_EVIDENCE now contains 14 items (13 + deployment-commit-sha) ───

test('DEPTH_ACTIVATION_EVIDENCE contains exactly 14 items after P8', () => {
  assert.equal(DEPTH_ACTIVATION_EVIDENCE.length, 14);
});

test('DEPTH_ACTIVATION_EVIDENCE includes the 4 new P8 checks plus deployment-commit-sha', () => {
  assert.ok(DEPTH_ACTIVATION_EVIDENCE.includes('preservation-oracle-pass'));
  assert.ok(DEPTH_ACTIVATION_EVIDENCE.includes('negative-vectors-pass'));
  assert.ok(DEPTH_ACTIVATION_EVIDENCE.includes('transfer-meaningfulness-pass'));
  assert.ok(DEPTH_ACTIVATION_EVIDENCE.includes('candidate-decisions-populated'));
  assert.ok(DEPTH_ACTIVATION_EVIDENCE.includes('deployment-commit-sha'));
});

// ─── All evidence present → raise-all-to-6 outcome ──────────────────────────

test('all 14 evidence checks present → raise-all-to-6 outcome', () => {
  const result = evaluateDepthActivationGate(makePassingOptions());

  assert.equal(result.pass, true);
  assert.equal(result.outcome, 'raise-all-to-6');
  assert.equal(result.blockers.length, 0);
  assert.equal(result.evidence.length, 14);
  for (const item of result.evidence) {
    assert.equal(item.pass, true, `evidence "${item.id}" should pass`);
  }
});

// ─── Missing candidate decisions → keep-depth-4 ─────────────────────────────

test('candidate decisions not populated → keep-depth-4', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    candidateDecisionsPopulated: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'candidate-decisions-populated'));
});

// ─── Preservation tests not passing → keep-depth-4 ──────────────────────────

test('preservation oracle not passing → keep-depth-4', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    preservationOraclePass: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'preservation-oracle-pass'));
  const blocker = result.blockers.find((b) => b.evidence === 'preservation-oracle-pass');
  assert.ok(blocker.reason.includes('U1'));
});

// ─── Negative vectors not passing → keep-depth-4 ────────────────────────────

test('negative vectors not passing → keep-depth-4', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    negativeVectorsPass: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'negative-vectors-pass'));
  const blocker = result.blockers.find((b) => b.evidence === 'negative-vectors-pass');
  assert.ok(blocker.reason.includes('U4'));
});

// ─── Transfer meaningfulness not passing → keep-depth-4 ─────────────────────

test('transfer meaningfulness not passing → keep-depth-4', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    transferMeaningfulnessPass: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'transfer-meaningfulness-pass'));
  const blocker = result.blockers.find((b) => b.evidence === 'transfer-meaningfulness-pass');
  assert.ok(blocker.reason.includes('U3'));
});

// ─── Existing 9 checks still evaluated ──────────────────────────────────────

test('existing original 9 checks still function correctly', () => {
  // Fail one of the original checks
  const result = evaluateDepthActivationGate(makePassingOptions({
    speechOraclePass: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.some((b) => b.evidence === 'speech-oracle-pass'));
});

test('production gate failure still blocks depth promotion', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    productionGatePass: false,
  }));

  assert.equal(result.pass, false);
  assert.ok(result.blockers.some((b) => b.evidence === 'production-gate-pass'));
});

test('runtime count mismatch still blocks depth promotion', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    expectedRuntimeCount: 999,
  }));

  assert.equal(result.pass, false);
  assert.ok(result.blockers.some((b) => b.evidence === 'runtime-count-valid'));
});

// ─── Multiple P8 failures reported simultaneously ────────────────────────────

test('multiple P8 failures reported simultaneously', () => {
  const result = evaluateDepthActivationGate(makePassingOptions({
    preservationOraclePass: false,
    negativeVectorsPass: false,
    transferMeaningfulnessPass: false,
    candidateDecisionsPopulated: false,
  }));

  assert.equal(result.pass, false);
  assert.equal(result.outcome, 'keep-depth-4');
  assert.ok(result.blockers.length >= 4);
  assert.ok(result.blockers.some((b) => b.evidence === 'preservation-oracle-pass'));
  assert.ok(result.blockers.some((b) => b.evidence === 'negative-vectors-pass'));
  assert.ok(result.blockers.some((b) => b.evidence === 'transfer-meaningfulness-pass'));
  assert.ok(result.blockers.some((b) => b.evidence === 'candidate-decisions-populated'));
});

// ─── Gate purity: does not mutate input ──────────────────────────────────────

test('gate does not mutate input with new P8 options', () => {
  const options = makePassingOptions();
  const original = JSON.parse(JSON.stringify(options));

  evaluateDepthActivationGate(options);

  assert.equal(options.preservationOraclePass, original.preservationOraclePass);
  assert.equal(options.negativeVectorsPass, original.negativeVectorsPass);
  assert.equal(options.transferMeaningfulnessPass, original.transferMeaningfulnessPass);
  assert.equal(options.candidateDecisionsPopulated, original.candidateDecisionsPopulated);
});

// ─── All evidence items are checked in gate result ───────────────────────────

test('all 14 evidence items appear in passing gate result', () => {
  const result = evaluateDepthActivationGate(makePassingOptions());
  const evidenceIds = result.evidence.map((e) => e.id);

  for (const expected of DEPTH_ACTIVATION_EVIDENCE) {
    assert.ok(evidenceIds.includes(expected), `evidence "${expected}" missing from gate output`);
  }
});
