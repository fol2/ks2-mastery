/**
 * Punctuation depth-6 activation gate.
 *
 * PURELY EVALUATIVE — reports readiness for depth promotion from 4 to 6.
 * Does NOT mutate any state. Deterministic: same inputs = same outputs.
 *
 * Three possible outcomes:
 *   - 'keep-depth-4'         : one or more evidence checks fail
 *   - 'raise-all-to-6'       : all families pass all evidence checks
 *   - 'raise-selected-to-6'  : reserved for future partial promotion (not yet triggered)
 *
 * Depth-8 is NEVER recommended as learner-facing (always capacity-only).
 *
 * P7-U9  |  depth-6 activation gate
 */

import { PRODUCTION_DEPTH } from './generators.js';
import { BLOCKING_DECISIONS } from './reviewer-decisions.js';

// ─── Evidence checklist ─────────────────────────────────────────────────────

/**
 * All required evidence items that must be satisfied before depth can be raised.
 */
export const DEPTH_ACTIVATION_EVIDENCE = Object.freeze([
  'reviewer-decisions-populated',
  'no-blocking-decisions',
  'no-unresolved-clusters',
  'speech-oracle-pass',
  'semantic-lint-pass',
  'production-gate-pass',
  'runtime-count-valid',
  'release-id-change',
  'star-evidence-scoped',
  'preservation-oracle-pass',
  'negative-vectors-pass',
  'transfer-meaningfulness-pass',
  'candidate-decisions-populated',
]);

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPECTED_DEPTH_6_RELEASE_ID = 'punctuation-r5-qg-depth-6';

// ─── Gate evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate whether depth can be raised from 4 to 6.
 *
 * @param {object} options
 * @param {number} options.targetDepth - Target depth (must be 6)
 * @param {object} options.reviewerDecisions - Loaded reviewer decisions data
 * @param {string[]} options.candidateItemIds - Item IDs only in depth-6 pool
 * @param {Array} options.crossModeClusters - Cross-mode overlap clusters
 * @param {boolean} options.speechOraclePass - Whether speech oracle hardening passes
 * @param {boolean} options.semanticLintPass - Whether semantic explanation lint passes
 * @param {boolean} options.productionGatePass - Whether production gate passes
 * @param {string} options.currentReleaseId - Current release identifier
 * @param {number} options.expectedRuntimeCount - Expected total items at target depth
 * @param {number} options.fixedItemCount - Number of fixed (non-generated) items
 * @param {number} options.familyCount - Number of published generator families
 * @param {boolean} options.preservationOraclePass - Whether preservation oracle tests pass
 * @param {boolean} options.negativeVectorsPass - Whether negative vector tests pass
 * @param {boolean} options.transferMeaningfulnessPass - Whether transfer meaningfulness tests pass
 * @param {boolean} options.candidateDecisionsPopulated - Whether all depth-6 candidate items are reviewed
 * @returns {{ pass: boolean, outcome: string, blockers: Array, evidence: Array }}
 */
export function evaluateDepthActivationGate(options) {
  const {
    targetDepth,
    reviewerDecisions,
    candidateItemIds,
    crossModeClusters,
    speechOraclePass,
    semanticLintPass,
    productionGatePass,
    currentReleaseId,
    expectedRuntimeCount,
    fixedItemCount,
    familyCount,
    preservationOraclePass,
    negativeVectorsPass,
    transferMeaningfulnessPass,
    candidateDecisionsPopulated,
  } = options;

  // Depth-8 is NEVER learner-facing — reject immediately
  if (targetDepth > 6) {
    return {
      pass: false,
      outcome: 'keep-depth-4',
      blockers: [{
        evidence: 'target-depth-cap',
        reason: `Depth ${targetDepth} exceeds maximum learner-facing depth (6). Depth-8 is capacity-only.`,
      }],
      evidence: [],
    };
  }

  const evidence = [];
  const blockers = [];

  // 1. reviewer-decisions-populated
  const hasDecisions = reviewerDecisions &&
    Array.isArray(reviewerDecisions.itemDecisions) &&
    reviewerDecisions.itemDecisions.length > 0;
  evidence.push({ id: 'reviewer-decisions-populated', pass: hasDecisions });
  if (!hasDecisions) {
    blockers.push({
      evidence: 'reviewer-decisions-populated',
      reason: 'Reviewer decisions are empty — depth-6 candidate items have not been reviewed',
    });
  }

  // 2. no-blocking-decisions
  const itemDecisionMap = new Map();
  if (hasDecisions) {
    for (const d of reviewerDecisions.itemDecisions) {
      itemDecisionMap.set(d.itemId, d);
    }
  }
  const blockingCandidates = [];
  for (const itemId of (candidateItemIds || [])) {
    const decision = itemDecisionMap.get(itemId);
    if (decision && BLOCKING_DECISIONS.includes(decision.decision)) {
      blockingCandidates.push({ itemId, decision: decision.decision });
    }
  }
  const noBlocking = blockingCandidates.length === 0;
  evidence.push({ id: 'no-blocking-decisions', pass: noBlocking });
  if (!noBlocking) {
    blockers.push({
      evidence: 'no-blocking-decisions',
      reason: `${blockingCandidates.length} candidate item(s) have blocking decisions`,
      details: blockingCandidates,
    });
  }

  // 3. no-unresolved-clusters
  const clusterDecisionMap = new Map();
  if (reviewerDecisions && Array.isArray(reviewerDecisions.clusterDecisions)) {
    for (const d of reviewerDecisions.clusterDecisions) {
      clusterDecisionMap.set(d.clusterId, d);
    }
  }
  const unresolvedClusters = [];
  for (const cluster of (crossModeClusters || [])) {
    const clusterId = typeof cluster === 'string' ? cluster : cluster.clusterId;
    const decision = clusterDecisionMap.get(clusterId);
    if (!decision) {
      unresolvedClusters.push({ clusterId, reason: 'no decision recorded' });
    }
  }
  const noClustersUnresolved = unresolvedClusters.length === 0;
  evidence.push({ id: 'no-unresolved-clusters', pass: noClustersUnresolved });
  if (!noClustersUnresolved) {
    blockers.push({
      evidence: 'no-unresolved-clusters',
      reason: `${unresolvedClusters.length} cross-mode cluster(s) have no reviewer decision`,
      details: unresolvedClusters,
    });
  }

  // 4. speech-oracle-pass
  const speechPass = speechOraclePass === true;
  evidence.push({ id: 'speech-oracle-pass', pass: speechPass });
  if (!speechPass) {
    blockers.push({
      evidence: 'speech-oracle-pass',
      reason: 'Speech oracle hardening has not passed (U1 tests must be green)',
    });
  }

  // 5. semantic-lint-pass
  const lintPass = semanticLintPass === true;
  evidence.push({ id: 'semantic-lint-pass', pass: lintPass });
  if (!lintPass) {
    blockers.push({
      evidence: 'semantic-lint-pass',
      reason: 'Semantic explanation lint has not passed (U6 must be green)',
    });
  }

  // 6. production-gate-pass
  const prodPass = productionGatePass === true;
  evidence.push({ id: 'production-gate-pass', pass: prodPass });
  if (!prodPass) {
    blockers.push({
      evidence: 'production-gate-pass',
      reason: 'Production gate has not passed — existing depth-4 content is not fully cleared',
    });
  }

  // 7. runtime-count-valid
  // Formula: fixedItemCount + familyCount * targetDepth
  const computedCount = fixedItemCount + familyCount * targetDepth;
  const countValid = expectedRuntimeCount === computedCount;
  evidence.push({ id: 'runtime-count-valid', pass: countValid, expected: computedCount, actual: expectedRuntimeCount });
  if (!countValid) {
    blockers.push({
      evidence: 'runtime-count-valid',
      reason: `Expected runtime count ${computedCount} (fixed ${fixedItemCount} + ${familyCount} families × depth ${targetDepth}), got ${expectedRuntimeCount}`,
    });
  }

  // 8. release-id-change
  const releaseIdWouldChange = currentReleaseId !== EXPECTED_DEPTH_6_RELEASE_ID;
  evidence.push({ id: 'release-id-change', pass: releaseIdWouldChange, expectedNewId: EXPECTED_DEPTH_6_RELEASE_ID });
  if (!releaseIdWouldChange) {
    blockers.push({
      evidence: 'release-id-change',
      reason: `Release ID is already "${EXPECTED_DEPTH_6_RELEASE_ID}" — no promotion needed or ID not updated`,
    });
  }

  // 9. star-evidence-scoped — structural guarantee (always true by design)
  evidence.push({ id: 'star-evidence-scoped', pass: true });

  // 10. preservation-oracle-pass (P8-U9)
  const preservationPass = preservationOraclePass === true;
  evidence.push({ id: 'preservation-oracle-pass', pass: preservationPass });
  if (!preservationPass) {
    blockers.push({
      evidence: 'preservation-oracle-pass',
      reason: 'Preservation oracle tests are not passing (U1 must be green)',
    });
  }

  // 11. negative-vectors-pass (P8-U9)
  const negVectorsPass = negativeVectorsPass === true;
  evidence.push({ id: 'negative-vectors-pass', pass: negVectorsPass });
  if (!negVectorsPass) {
    blockers.push({
      evidence: 'negative-vectors-pass',
      reason: 'Negative vector tests are not passing (U4 must be green)',
    });
  }

  // 12. transfer-meaningfulness-pass (P8-U9)
  const transferPass = transferMeaningfulnessPass === true;
  evidence.push({ id: 'transfer-meaningfulness-pass', pass: transferPass });
  if (!transferPass) {
    blockers.push({
      evidence: 'transfer-meaningfulness-pass',
      reason: 'Transfer meaningfulness tests are not passing (U3 must be green)',
    });
  }

  // 13. candidate-decisions-populated (P8-U9)
  const candidatesPopulated = candidateDecisionsPopulated === true;
  evidence.push({ id: 'candidate-decisions-populated', pass: candidatesPopulated });
  if (!candidatesPopulated) {
    blockers.push({
      evidence: 'candidate-decisions-populated',
      reason: 'Not all depth-6 candidate items have been reviewed',
    });
  }

  // ─── Outcome determination ──────────────────────────────────────────────────

  const allPass = blockers.length === 0;
  let outcome;
  if (!allPass) {
    outcome = 'keep-depth-4';
  } else {
    // All evidence satisfied — raise all families to target depth
    outcome = 'raise-all-to-6';
  }

  return {
    pass: allPass,
    outcome,
    blockers,
    evidence,
  };
}
