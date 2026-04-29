/**
 * Punctuation reviewer-decision gate.
 *
 * Provides schema validation and gate evaluation for production, depth-6,
 * and cross-mode cluster decisions. Core P7 invariant: empty decisions FAIL.
 */

import { readFileSync } from 'node:fs';

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
 *
 * @param {object} data - The decisions data with clusterDecisions array
 * @param {string[]} crossModeClusterIds - IDs of cross-mode overlap clusters to check
 * @returns {{ pass: boolean, blockers: Array<{clusterId: string, reason: string}>, stats: object }}
 */
function evaluateClusterGate(data, crossModeClusterIds) {
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
  validateItemDecision,
  validateClusterDecision,
  validateDecisionSchema,
  evaluateProductionGate,
  evaluateDepth6Gate,
  evaluateClusterGate,
  loadReviewerDecisions,
};
