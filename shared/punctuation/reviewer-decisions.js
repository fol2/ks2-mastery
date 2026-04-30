/**
 * Punctuation reviewer-decision gate.
 *
 * Provides schema validation and gate evaluation for production, depth-6,
 * and cross-mode cluster decisions. Core P7 invariant: empty decisions FAIL.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ─── Stable cluster ID generation ───────────────────────────────────────────

/**
 * Generate a deterministic cluster ID from member item IDs.
 * Sorts member IDs, joins with ':', and produces a truncated SHA-256 hex hash.
 *
 * @param {string[]} memberItemIds - The IDs of items belonging to the cluster
 * @param {string} [clusterType='cluster'] - Optional cluster type prefix
 * @returns {string} Stable cluster ID in format `{type}_{hash12}`
 */
function generateStableClusterId(memberItemIds, clusterType = 'cluster') {
  const sorted = [...memberItemIds].sort();
  const hash = createHash('sha256').update(sorted.join(':')).digest('hex').slice(0, 12);
  return `${clusterType}_${hash}`;
}

// ─── Decision states ─────────────────────────────────────────────────────────

const DECISION_STATES = Object.freeze({
  APPROVED: 'approved',
  ACCEPTABLE_CROSS_MODE_OVERLAP: 'acceptable-cross-mode-overlap',
  NEEDS_REWRITE: 'needs-rewrite',
  NEEDS_MARKING_FIX: 'needs-marking-fix',
  NEEDS_PROMPT_TIGHTENING: 'needs-prompt-tightening',
  RETIRE: 'retire',
  PENDING: 'pending',
});

const ALL_DECISION_VALUES = Object.freeze(Object.values(DECISION_STATES));

/**
 * Decisions that block a gate from passing.
 * Items with these decisions are considered NOT cleared for production/depth-6.
 */
const BLOCKING_DECISIONS = Object.freeze([
  DECISION_STATES.NEEDS_REWRITE,
  DECISION_STATES.NEEDS_MARKING_FIX,
  DECISION_STATES.NEEDS_PROMPT_TIGHTENING,
  DECISION_STATES.RETIRE,
  DECISION_STATES.PENDING,
]);

// ─── Schema validation ───────────────────────────────────────────────────────

/**
 * Validate a single item decision entry.
 * @param {object} entry
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateItemDecision(entry) {
  const errors = [];

  if (!entry || typeof entry !== 'object') {
    return { valid: false, errors: ['Decision entry must be an object'] };
  }

  if (typeof entry.itemId !== 'string' || !entry.itemId) {
    errors.push('itemId is required and must be a non-empty string');
  }

  if (!ALL_DECISION_VALUES.includes(entry.decision)) {
    errors.push(
      `decision "${entry.decision}" is invalid. Must be one of: ${ALL_DECISION_VALUES.join(', ')}`,
    );
  }

  if (typeof entry.reviewer !== 'string' || !entry.reviewer) {
    errors.push('reviewer is required and must be a non-empty string');
  }

  if (typeof entry.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt)) {
    errors.push('reviewedAt is required and must be a YYYY-MM-DD string');
  }

  // Rationale required for specific decision types
  const rationaleRequired = [
    DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP,
    DECISION_STATES.RETIRE,
  ];
  if (rationaleRequired.includes(entry.decision)) {
    if (typeof entry.rationale !== 'string' || !entry.rationale) {
      errors.push(`rationale is required for decision "${entry.decision}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a single cluster decision entry.
 * @param {object} entry
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateClusterDecision(entry) {
  const errors = [];

  if (!entry || typeof entry !== 'object') {
    return { valid: false, errors: ['Cluster decision entry must be an object'] };
  }

  if (typeof entry.clusterId !== 'string' || !entry.clusterId) {
    errors.push('clusterId is required and must be a non-empty string');
  }

  if (!ALL_DECISION_VALUES.includes(entry.decision)) {
    errors.push(
      `decision "${entry.decision}" is invalid. Must be one of: ${ALL_DECISION_VALUES.join(', ')}`,
    );
  }

  if (typeof entry.reviewer !== 'string' || !entry.reviewer) {
    errors.push('reviewer is required and must be a non-empty string');
  }

  if (typeof entry.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt)) {
    errors.push('reviewedAt is required and must be a YYYY-MM-DD string');
  }

  // Cluster decisions for cross-mode overlap require rationale
  if (entry.decision === DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP) {
    if (typeof entry.rationale !== 'string' || !entry.rationale) {
      errors.push('rationale is required for acceptable-cross-mode-overlap cluster decisions');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate the complete decisions structure.
 * @param {object} data - The full fixture data with itemDecisions and clusterDecisions arrays
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDecisionSchema(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Decisions data must be an object'] };
  }

  if (!Array.isArray(data.itemDecisions)) {
    errors.push('itemDecisions must be an array');
  } else {
    for (let i = 0; i < data.itemDecisions.length; i++) {
      const result = validateItemDecision(data.itemDecisions[i]);
      if (!result.valid) {
        errors.push(...result.errors.map((e) => `itemDecisions[${i}]: ${e}`));
      }
    }
  }

  if (!Array.isArray(data.clusterDecisions)) {
    errors.push('clusterDecisions must be an array');
  } else {
    for (let i = 0; i < data.clusterDecisions.length; i++) {
      const result = validateClusterDecision(data.clusterDecisions[i]);
      if (!result.valid) {
        errors.push(...result.errors.map((e) => `clusterDecisions[${i}]: ${e}`));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Schema v3 meta validation ─────────────────────────────────────────────

const VALID_SCHEMA_VERSIONS = [2, 3];

/**
 * Validate v3 _meta block.
 * Backward-compatible: v2 meta is accepted without extra fields.
 * v3 meta requires ai_pre_review, human_acceptance, production_certification.
 *
 * @param {object} meta - The _meta object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateMetaSchema(meta) {
  const errors = [];

  if (!meta || typeof meta !== 'object') {
    return { valid: false, errors: ['_meta must be an object'] };
  }

  const version = meta.schema_version;
  if (!VALID_SCHEMA_VERSIONS.includes(version)) {
    errors.push(`schema_version ${version} is not supported. Must be one of: ${VALID_SCHEMA_VERSIONS.join(', ')}`);
  }

  // v3-specific validation
  if (version === 3) {
    // ai_pre_review
    if (!meta.ai_pre_review || typeof meta.ai_pre_review !== 'object') {
      errors.push('v3 _meta requires ai_pre_review object');
    } else {
      if (typeof meta.ai_pre_review.status !== 'string') {
        errors.push('ai_pre_review.status must be a string');
      }
    }

    // human_acceptance
    if (!meta.human_acceptance || typeof meta.human_acceptance !== 'object') {
      errors.push('v3 _meta requires human_acceptance object');
    } else {
      if (typeof meta.human_acceptance.status !== 'string') {
        errors.push('human_acceptance.status must be a string');
      }
      // If status is 'complete', reviewer must be present
      if (meta.human_acceptance.status === 'complete') {
        if (!meta.human_acceptance.reviewer || typeof meta.human_acceptance.reviewer !== 'string') {
          errors.push('human_acceptance.reviewer is required when status is "complete"');
        }
      }
    }

    // production_certification
    if (!meta.production_certification || typeof meta.production_certification !== 'object') {
      errors.push('v3 _meta requires production_certification object');
    } else {
      if (typeof meta.production_certification.status !== 'string') {
        errors.push('production_certification.status must be a string');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Evaluate the review-authority gate.
 *
 * FAILS if:
 * - ai_pre_review.status !== 'complete'
 * - production_certification.status === 'certified' while human_acceptance.status !== 'complete'
 *
 * @param {object} meta - The _meta object
 * @returns {{ pass: boolean, blockers: string[] }}
 */
function evaluateAuthorityGate(meta) {
  const blockers = [];

  if (!meta || typeof meta !== 'object') {
    return { pass: false, blockers: ['_meta is missing or invalid'] };
  }

  // v2 fixture has no authority fields — pass trivially for backward compat
  if (meta.schema_version === 2) {
    return { pass: true, blockers: [] };
  }

  // ai_pre_review must be complete
  if (!meta.ai_pre_review || meta.ai_pre_review.status !== 'complete') {
    blockers.push('ai_pre_review.status must be "complete"');
  }

  // Cannot certify without human acceptance
  if (meta.production_certification?.status === 'certified'
    && (!meta.human_acceptance || meta.human_acceptance.status !== 'complete')) {
    blockers.push('production_certification cannot be "certified" while human_acceptance is not "complete"');
  }

  return { pass: blockers.length === 0, blockers };
}

// ─── Gate evaluation ─────────────────────────────────────────────────────────

/**
 * Build a lookup map from itemDecisions array.
 * @param {Array} itemDecisions
 * @returns {Map<string, object>}
 */
function buildItemDecisionMap(itemDecisions) {
  const map = new Map();
  for (const d of itemDecisions) {
    map.set(d.itemId, d);
  }
  return map;
}

/**
 * Build a lookup map from clusterDecisions array.
 * @param {Array} clusterDecisions
 * @returns {Map<string, object>}
 */
function buildClusterDecisionMap(clusterDecisions) {
  const map = new Map();
  for (const d of clusterDecisions) {
    map.set(d.clusterId, d);
  }
  return map;
}

/**
 * Evaluate the production gate.
 *
 * FAILS if:
 * - itemDecisions is empty (core P7 invariant: empty = fail)
 * - Any production item has a blocking decision
 * - Any production item has no decision at all
 *
 * @param {object} data - The decisions data with itemDecisions array
 * @param {string[]} productionItemIds - IDs of production items to check
 * @returns {{ pass: boolean, blockers: Array<{itemId: string, reason: string}>, stats: object }}
 */
function evaluateProductionGate(data, productionItemIds) {
  const stats = { total: productionItemIds.length, approved: 0, blocked: 0, missing: 0, retired: 0 };
  const blockers = [];

  // Core P7 invariant: empty decisions FAIL
  if (!Array.isArray(data.itemDecisions) || data.itemDecisions.length === 0) {
    return {
      pass: false,
      blockers: [{ itemId: '*', reason: 'itemDecisions is empty — gate requires populated decisions' }],
      stats: { ...stats, missing: productionItemIds.length },
    };
  }

  const decisionMap = buildItemDecisionMap(data.itemDecisions);

  for (const itemId of productionItemIds) {
    const decision = decisionMap.get(itemId);

    if (!decision) {
      stats.missing++;
      blockers.push({ itemId, reason: 'no decision recorded' });
      continue;
    }

    if (BLOCKING_DECISIONS.includes(decision.decision)) {
      stats.blocked++;
      if (decision.decision === DECISION_STATES.RETIRE) stats.retired++;
      blockers.push({ itemId, reason: `decision is "${decision.decision}"` });
    } else {
      stats.approved++;
    }
  }

  // P8-U6: reject auto-generated identical rationales (requires 2+ items)
  const rationales = data.itemDecisions
    .map((d) => d.rationale)
    .filter((r) => typeof r === 'string' && r.length > 0);
  if (rationales.length > 1 && rationales.length === data.itemDecisions.length) {
    const allSame = rationales.every((r) => r === rationales[0]);
    if (allSame) {
      blockers.push({ itemId: '*', reason: 'auto-generated identical rationales detected' });
    }
  }

  return {
    pass: blockers.length === 0,
    blockers,
    stats,
  };
}

/**
 * Evaluate the depth-6 candidate gate.
 *
 * Checks ONLY candidate items (not in production). Fails if any has a blocking decision.
 * Does NOT affect the production gate.
 *
 * @param {object} data - The decisions data with itemDecisions array
 * @param {string[]} candidateItemIds - IDs of depth-6 candidate items
 * @returns {{ pass: boolean, blockers: Array<{itemId: string, reason: string}>, stats: object }}
 */
function evaluateDepth6Gate(data, candidateItemIds) {
  const stats = { total: candidateItemIds.length, approved: 0, blocked: 0, missing: 0, retired: 0 };
  const blockers = [];

  if (!Array.isArray(data.itemDecisions) || data.itemDecisions.length === 0) {
    // Depth-6 gate with no decisions: treat as "not yet reviewed" — still fails
    return {
      pass: false,
      blockers: [{ itemId: '*', reason: 'itemDecisions is empty — no candidate reviews exist' }],
      stats: { ...stats, missing: candidateItemIds.length },
    };
  }

  const decisionMap = buildItemDecisionMap(data.itemDecisions);

  for (const itemId of candidateItemIds) {
    const decision = decisionMap.get(itemId);

    if (!decision) {
      stats.missing++;
      blockers.push({ itemId, reason: 'no decision recorded' });
      continue;
    }

    if (BLOCKING_DECISIONS.includes(decision.decision)) {
      stats.blocked++;
      if (decision.decision === DECISION_STATES.RETIRE) stats.retired++;
      blockers.push({ itemId, reason: `decision is "${decision.decision}"` });
    } else {
      stats.approved++;
    }
  }

  return {
    pass: blockers.length === 0,
    blockers,
    stats,
  };
}

/**
 * Evaluate the cluster gate for cross-mode overlaps.
 *
 * Each cluster must have an `acceptable-cross-mode-overlap` decision with rationale.
 * Accepts either an array of cluster ID strings, or an array of cluster objects
 * with `stableId` and `reviewRequired` fields. When objects are provided, only
 * clusters where `reviewRequired === true` are checked.
 *
 * @param {object} data - The decisions data with clusterDecisions array
 * @param {Array<string|{stableId: string, reviewRequired: boolean}>} crossModeClusterIdsOrObjects - IDs or cluster objects
 * @returns {{ pass: boolean, blockers: Array<{clusterId: string, reason: string}>, stats: object }}
 */
function evaluateClusterGate(data, crossModeClusterIdsOrObjects) {
  // Normalise input: extract IDs, filtering to reviewRequired when objects provided
  let crossModeClusterIds;
  if (crossModeClusterIdsOrObjects.length > 0 && typeof crossModeClusterIdsOrObjects[0] === 'object') {
    crossModeClusterIds = crossModeClusterIdsOrObjects
      .filter((c) => c.reviewRequired === true)
      .map((c) => c.stableId);
  } else {
    crossModeClusterIds = crossModeClusterIdsOrObjects;
  }

  const stats = { total: crossModeClusterIds.length, approved: 0, blocked: 0, missing: 0 };
  const blockers = [];

  if (!Array.isArray(data.clusterDecisions)) {
    return {
      pass: crossModeClusterIds.length === 0,
      blockers: crossModeClusterIds.map((id) => ({ clusterId: id, reason: 'clusterDecisions array missing' })),
      stats: { ...stats, missing: crossModeClusterIds.length },
    };
  }

  const decisionMap = buildClusterDecisionMap(data.clusterDecisions);

  for (const clusterId of crossModeClusterIds) {
    const decision = decisionMap.get(clusterId);

    if (!decision) {
      stats.missing++;
      blockers.push({ clusterId, reason: 'no cluster decision recorded' });
      continue;
    }

    if (decision.decision !== DECISION_STATES.ACCEPTABLE_CROSS_MODE_OVERLAP) {
      stats.blocked++;
      blockers.push({ clusterId, reason: `decision is "${decision.decision}", expected "acceptable-cross-mode-overlap"` });
      continue;
    }

    if (typeof decision.rationale !== 'string' || !decision.rationale) {
      stats.blocked++;
      blockers.push({ clusterId, reason: 'acceptable-cross-mode-overlap requires rationale' });
      continue;
    }

    stats.approved++;
  }

  return {
    pass: blockers.length === 0,
    blockers,
    stats,
  };
}

// ─── Loader ──────────────────────────────────────────────────────────────────

/**
 * Load and validate reviewer decisions from a file path or data object.
 * @param {string|object} fixturePathOrData - File path (string) or parsed data (object)
 * @returns {{ data: object, valid: boolean, errors: string[] }}
 */
function loadReviewerDecisions(fixturePathOrData) {
  let data;

  if (typeof fixturePathOrData === 'string') {
    const raw = readFileSync(fixturePathOrData, 'utf8');
    data = JSON.parse(raw);
  } else {
    data = fixturePathOrData;
  }

  // Support legacy format: if data has 'decisions' object but no 'itemDecisions',
  // treat as schema v1 (backward compat)
  if (data && !Array.isArray(data.itemDecisions) && typeof data.decisions === 'object') {
    data = {
      ...data,
      itemDecisions: data.itemDecisions || [],
      clusterDecisions: data.clusterDecisions || [],
    };
  }

  const validation = validateDecisionSchema(data);
  return { data, valid: validation.valid, errors: validation.errors };
}

export {
  DECISION_STATES,
  ALL_DECISION_VALUES,
  BLOCKING_DECISIONS,
  VALID_SCHEMA_VERSIONS,
  generateStableClusterId,
  validateItemDecision,
  validateClusterDecision,
  validateDecisionSchema,
  validateMetaSchema,
  evaluateAuthorityGate,
  evaluateProductionGate,
  evaluateDepth6Gate,
  evaluateClusterGate,
  loadReviewerDecisions,
};
