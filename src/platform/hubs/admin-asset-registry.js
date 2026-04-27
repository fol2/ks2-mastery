// U10 (Admin Console P3): Asset & Effect Registry adapter.
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
export function buildMonsterVisualRegistryEntry(monsterVisualConfig) {
  const mvc = isPlainObject(monsterVisualConfig) ? monsterVisualConfig : {};
  const status = isPlainObject(mvc.status) ? mvc.status : {};
  const validation = isPlainObject(status.validation) ? status.validation : {};
  const permissions = isPlainObject(mvc.permissions) ? mvc.permissions : {};

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
    canManage: permissions.canManageMonsterVisualConfig === true,
    hasDraft: mvc.draft != null && isPlainObject(mvc.draft),
    hasPublished: mvc.published != null && isPlainObject(mvc.published),
    versions: Array.isArray(mvc.versions) ? mvc.versions : [],
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
