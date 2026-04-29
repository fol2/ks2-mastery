// Admin Console P5 / U3: Action classification registry.
//
// Maps admin action keys to a 4-level severity classification. Each level
// determines whether the UI must present a confirmation step before dispatch:
//   - low:      no confirmation required
//   - medium:   no confirmation required (logged but non-destructive)
//   - high:     confirmation dialog with danger copy + target display
//   - critical: typed confirmation (user types target identifier to confirm)
//
// Exported:
//   - LEVELS — frozen set of valid classification levels
//   - classifyAction(actionKey, context) → classification result
//
// This module is pure logic — no React imports. The companion component
// `AdminConfirmAction.jsx` consumes the classification to render the
// appropriate confirmation UI.

const LEVELS = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
});

// --- Internal registry --------------------------------------------------

const REGISTRY = new Map([
  // low: read-only refreshes, searches, bundle generation
  ['admin-ops-kpi-refresh', { level: LEVELS.low }],
  ['admin-ops-activity-refresh', { level: LEVELS.low }],
  ['account-search', { level: LEVELS.low }],
  ['admin-debug-bundle-generate', { level: LEVELS.low }],

  // medium: single-record writes scoped to one entity
  ['account-ops-metadata-save', { level: LEVELS.medium }],
  ['marketing-create', { level: LEVELS.medium }],
  ['admin-section-change', { level: LEVELS.medium }],

  // high: publish/transition actions affecting live content
  ['marketing-transition-published', { level: LEVELS.high }],
  ['marketing-transition-scheduled', { level: LEVELS.high }],
  ['monster-visual-config-publish', { level: LEVELS.high }],
  ['monster-visual-config-restore', { level: LEVELS.high }],
  ['grammar-transfer-admin-archive', { level: LEVELS.high }],
  ['asset-publish', { level: LEVELS.high }],
  ['asset-restore', { level: LEVELS.high }],

  // medium: asset draft deletion (recoverable via restore)
  ['asset-delete-draft', { level: LEVELS.medium }],

  // medium: asset draft save (single-entity write, CAS-protected)
  ['asset-draft-save', { level: LEVELS.medium }],

  // low: asset read / preview (no mutation)
  ['asset-preview', { level: LEVELS.low }],
  ['asset-read', { level: LEVELS.low }],

  // critical: broad-audience mutations, irreversible deletes, seed operations
  ['post-mega-seed-apply', { level: LEVELS.critical }],
  ['grammar-transfer-admin-delete', { level: LEVELS.critical }],
  ['marketing-transition-all-signed-in-publish', { level: LEVELS.critical }],
]);

// --- Danger copy templates ----------------------------------------------

const DANGER_COPY = Object.freeze({
  high: 'This action will modify live content visible to users.',
  critical: 'This is a destructive operation that cannot be easily reversed.',
});

// --- Classification logic -----------------------------------------------

/**
 * Classify an admin action by key and optional context.
 *
 * @param {string} actionKey   Registered action identifier.
 * @param {object} [context]   Optional context: `{ audience, environment, targetId, targetLabel }`.
 * @returns {{
 *   level: string,
 *   requiresConfirmation: boolean,
 *   requiresTypedTarget: boolean,
 *   dangerCopy: string | null,
 *   targetDisplay: string | null,
 * }}
 */
export function classifyAction(actionKey, context) {
  const ctx = context && typeof context === 'object' ? context : {};
  const entry = REGISTRY.get(actionKey);

  // Unknown actions default to medium — safe enough to log but not silently
  // destructive. The caller should validate action keys before reaching this
  // point; this default prevents an unregistered key from bypassing all gates.
  const level = entry ? entry.level : LEVELS.medium;

  const requiresConfirmation = level === LEVELS.high || level === LEVELS.critical;
  const requiresTypedTarget = level === LEVELS.critical;

  const dangerCopy = requiresConfirmation
    ? (DANGER_COPY[level] || null)
    : null;

  const targetDisplay = requiresConfirmation && ctx.targetLabel
    ? String(ctx.targetLabel)
    : requiresConfirmation && ctx.targetId
      ? String(ctx.targetId)
      : null;

  return {
    level,
    requiresConfirmation,
    requiresTypedTarget,
    dangerCopy,
    targetDisplay,
  };
}

export { LEVELS };
