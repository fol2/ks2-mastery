// U10 (Admin Console P3): Asset & Effect Registry adapter.
// P7 U11: Security hardening — URL allowlist integration + handler capability metadata.
//
// Transforms the existing `monsterVisualConfig` admin read-model (produced by
// `normaliseMonsterVisualConfigAdminModel` in admin-read-model.js) into a
// registry-shaped envelope. The registry envelope is designed so future asset
// categories (e.g. audio packs, curriculum snapshots) can be added as
// additional cards without changing the UI container.
//
// Content-free leaf: this module MUST NOT import subject content datasets,
// monster asset manifests, or any module that transitively pulls in the
// spelling / grammar / punctuation content bundles. The audit gate in
// `scripts/audit-client-bundle.mjs` enforces this invariant.
//
// The adapter is pure: it accepts the read-model sibling and returns a
// registry entry array. No side effects, no storage, no fetch.

import { getSafePreviewUrl, getPreviewBlockedReason } from './admin-asset-url-allowlist.js';

/**
 * @typedef {object} RegistryEntry
 * @property {string} assetId        — unique registry identifier
 * @property {string} category       — grouping label (e.g. 'visual', 'audio')
 * @property {string} displayName    — human-readable card title
 * @property {number} draftVersion   — current draft revision number
 * @property {number} publishedVersion — latest published version (0 = never published)
 * @property {string} manifestHash   — content-addressable hash of the draft
 * @property {string} reviewStatus   — 'clean' | 'has-blockers' | 'publishable'
 * @property {object} validationState — { ok, errorCount, warningCount }
 * @property {number} lastPublishedAt — epoch ms of the last publish (0 = never)
 * @property {string} lastPublishedBy — account ID of the last publisher
 * @property {boolean} canManage     — whether the current user can mutate
 * @property {boolean} hasDraft      — whether a draft document exists
 * @property {boolean} hasPublished  — whether a published document exists
 * @property {Array}  versions       — available version history for restore
 * @property {Array<string>} publishBlockers — blocker descriptions (empty = can publish)
 * @property {string|null} previewUrl — URL for asset preview (null = no preview)
 * @property {string|null} reducedMotionStatus — reduced-motion variant state
 * @property {string|null} fallbackStatus — fallback asset state
 */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value, fallback) {
  return typeof value === 'string' ? value : (fallback || '');
}

function safeNonNegativeInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function deriveReviewStatus(validation) {
  if (!isPlainObject(validation)) return 'unknown';
  // When the `ok` property is explicitly present we can derive a definitive
  // status. An empty validation object (e.g. from a null config that was
  // coerced to `{}`) has no `ok` key — treat that as unknown.
  if (!('ok' in validation)) return 'unknown';
  if (validation.ok) return 'publishable';
  if (safeNonNegativeInt(validation.errorCount) > 0) return 'has-blockers';
  return 'clean';
}

/**
 * Build a single registry entry from the Monster Visual Config admin model.
 *
 * @param {object|null} monsterVisualConfig — the `model.monsterVisualConfig`
 *   sibling from the admin hub read-model. May be null/undefined when the
 *   config has never been initialised.
 * @returns {RegistryEntry}
 */
/**
 * Derive publish blockers from the validation state and draft presence.
 * Returns an array of human-readable blocker descriptions. Empty array = OK to publish.
 */
function derivePublishBlockers(validation, hasDraft, canManage) {
  const blockers = [];
  if (!canManage) {
    blockers.push('Insufficient permissions to publish this asset.');
  }
  if (!hasDraft) {
    blockers.push('No draft exists — nothing to publish.');
  }
  if (isPlainObject(validation) && 'ok' in validation && !validation.ok) {
    const count = safeNonNegativeInt(validation.errorCount);
    if (count > 0) {
      blockers.push(`${count} validation error${count === 1 ? '' : 's'} must be resolved.`);
    }
  }
  return blockers;
}

export function buildMonsterVisualRegistryEntry(monsterVisualConfig) {
  const mvc = isPlainObject(monsterVisualConfig) ? monsterVisualConfig : {};
  const status = isPlainObject(mvc.status) ? mvc.status : {};
  const validation = isPlainObject(status.validation) ? status.validation : {};
  const permissions = isPlainObject(mvc.permissions) ? mvc.permissions : {};

  const canManage = permissions.canManageMonsterVisualConfig === true;
  const hasDraft = mvc.draft != null && isPlainObject(mvc.draft);

  // P6 U8 + P7 U11: preview URL — derived from status, validated via allowlist.
  const rawPreviewUrl = typeof status.previewUrl === 'string' && status.previewUrl
    ? status.previewUrl
    : null;
  const previewUrl = getSafePreviewUrl(rawPreviewUrl);
  const previewBlockedReason = getPreviewBlockedReason(rawPreviewUrl);

  // P6 U8: reduced-motion and fallback status — surfaced from the asset metadata.
  const reducedMotionStatus = typeof status.reducedMotionStatus === 'string'
    ? status.reducedMotionStatus
    : null;
  const fallbackStatus = typeof status.fallbackStatus === 'string'
    ? status.fallbackStatus
    : null;

  return {
    assetId: 'monster-visual-config',
    category: 'visual',
    displayName: 'Monster Visual & Effect Config',
    draftVersion: safeNonNegativeInt(status.draftRevision),
    publishedVersion: safeNonNegativeInt(status.publishedVersion),
    manifestHash: safeString(status.manifestHash, ''),
    reviewStatus: deriveReviewStatus(validation),
    validationState: {
      ok: Boolean(validation.ok),
      errorCount: safeNonNegativeInt(validation.errorCount),
      warningCount: safeNonNegativeInt(validation.warningCount),
      errors: Array.isArray(validation.errors) ? validation.errors : [],
      warnings: Array.isArray(validation.warnings) ? validation.warnings : [],
    },
    lastPublishedAt: safeNonNegativeInt(status.publishedAt),
    lastPublishedBy: safeString(status.publishedByAccountId, ''),
    canManage,
    hasDraft,
    hasPublished: mvc.published != null && isPlainObject(mvc.published),
    versions: Array.isArray(mvc.versions) ? mvc.versions : [],
    publishBlockers: derivePublishBlockers(validation, hasDraft, canManage),
    previewUrl,
    previewBlockedReason,
    reducedMotionStatus,
    fallbackStatus,
  };
}

/**
 * Build the full asset registry from the admin hub read-model.
 *
 * Returns an array of registry entries. Currently contains one entry
 * (monster-visual-config). Future asset categories append to this array.
 *
 * @param {object} model — the full admin hub read-model
 * @returns {RegistryEntry[]}
 */
export function buildAssetRegistry(model) {
  const hub = isPlainObject(model) ? model : {};
  return [
    buildMonsterVisualRegistryEntry(hub.monsterVisualConfig),
  ];
}

// ─── P7 U11: Handler Capability Registry ──────────────────────────────────────
//
// Each asset handler declares its security and operational metadata:
//   - roleRequired: minimum RBAC role to invoke the handler
//   - mutationClass: 'read' | 'draft-write' | 'publish' | 'delete'
//   - casFields: fields used for CAS conflict detection
//   - auditBehaviour: 'silent' | 'log' | 'log-and-notify'

/**
 * @typedef {object} HandlerCapability
 * @property {string} roleRequired
 * @property {string} mutationClass
 * @property {string[]} casFields
 * @property {string} auditBehaviour
 */

const HANDLER_CAPABILITY_REGISTRY = Object.freeze({
  'monster-visual-config-read': Object.freeze({
    roleRequired: 'viewer',
    mutationClass: 'read',
    casFields: [],
    auditBehaviour: 'silent',
  }),
  'monster-visual-config-draft-save': Object.freeze({
    roleRequired: 'editor',
    mutationClass: 'draft-write',
    casFields: ['draftRevision'],
    auditBehaviour: 'log',
  }),
  'monster-visual-config-publish': Object.freeze({
    roleRequired: 'publisher',
    mutationClass: 'publish',
    casFields: ['draftRevision', 'publishedVersion'],
    auditBehaviour: 'log-and-notify',
  }),
  'monster-visual-config-restore': Object.freeze({
    roleRequired: 'publisher',
    mutationClass: 'publish',
    casFields: ['publishedVersion'],
    auditBehaviour: 'log-and-notify',
  }),
  'monster-visual-config-delete-draft': Object.freeze({
    roleRequired: 'editor',
    mutationClass: 'delete',
    casFields: ['draftRevision'],
    auditBehaviour: 'log',
  }),
});

/**
 * Retrieve the capability metadata for a handler by key.
 *
 * @param {string} handlerKey
 * @returns {HandlerCapability|null}
 */
export function getHandlerCapability(handlerKey) {
  return Object.hasOwn(HANDLER_CAPABILITY_REGISTRY, handlerKey) ? HANDLER_CAPABILITY_REGISTRY[handlerKey] : null;
}

/**
 * List all registered handler keys.
 *
 * @returns {string[]}
 */
export function listHandlerKeys() {
  return Object.keys(HANDLER_CAPABILITY_REGISTRY);
}

export { HANDLER_CAPABILITY_REGISTRY };
