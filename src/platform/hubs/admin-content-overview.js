// U9 (Admin Console P3): Content Management cross-subject overview.
//
// Subject status provider contract + cross-subject normaliser. Inspired
// by the Hero P0 read-only shadow subsystem pattern: each subject
// exposes a status envelope without the admin surface importing subject
// internals. The overview panel in AdminContentSection.jsx consumes the
// normalised array returned by `buildSubjectContentOverview`.
//
// Content-free leaf: this module MUST NOT import subject content
// datasets, subject engines, or any module that transitively pulls in
// spelling / grammar / punctuation content bundles. The audit gate in
// `scripts/audit-client-bundle.mjs` enforces this invariant.
//
// The normaliser is pure: it accepts the overview payload from the
// worker endpoint and returns a rendering-ready array. No side effects,
// no storage, no fetch.

/**
 * @typedef {object} SubjectStatusEnvelope
 * @property {string}  subjectKey        — canonical subject identifier
 * @property {string}  displayName       — human-readable label
 * @property {'live'|'gated'|'placeholder'} status — lifecycle stage
 * @property {string|null}  releaseVersion    — latest content release version
 * @property {number}  validationErrors  — count of unresolved validation errors
 * @property {number}  errorCount7d      — ops error events in the last 7 days
 * @property {'low'|'medium'|'high'|'none'} supportLoadSignal — relative support load
 */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeNonNegativeInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function safeString(value, fallback) {
  return typeof value === 'string' && value ? value : (fallback || '');
}

const VALID_STATUSES = ['live', 'gated', 'placeholder'];
const VALID_SIGNALS = ['low', 'medium', 'high', 'none'];

/**
 * Known drilldown panel mappings. Each entry maps a subject key to the
 * data-panel attribute of the target panel within AdminContentSection.
 *
 * @type {Record<string, { action: string, panel: string }>}
 */
const DRILLDOWN_PANEL_MAP = {
  spelling: { action: 'diagnostics', panel: 'post-mega-spelling-debug' },
  grammar: { action: 'diagnostics', panel: 'grammar-concept-confidence' },
};

/**
 * Subjects that link to the asset registry panel.
 * Currently none are subject-specific — the registry is cross-subject.
 */
const ASSET_REGISTRY_SUBJECTS = new Set(/* future: add subject keys here */);

/**
 * Subjects that link to the content release panel.
 */
const CONTENT_RELEASE_SUBJECTS = new Set(/* future: add subject keys here */);

/**
 * Derive the drilldown action for a normalised subject entry.
 *
 * @param {object} entry — normalised subject status envelope
 * @returns {'diagnostics'|'asset_registry'|'content_release'|'none'|'placeholder'}
 */
export function deriveDrilldownAction(entry) {
  if (entry.status === 'placeholder') return 'placeholder';
  if (DRILLDOWN_PANEL_MAP[entry.subjectKey]) return DRILLDOWN_PANEL_MAP[entry.subjectKey].action;
  if (ASSET_REGISTRY_SUBJECTS.has(entry.subjectKey)) return 'asset_registry';
  if (CONTENT_RELEASE_SUBJECTS.has(entry.subjectKey)) return 'content_release';
  return 'none';
}

/**
 * Get the data-panel selector for a subject's drilldown target.
 * Returns null when the action is 'none' or 'placeholder'.
 *
 * @param {object} entry — normalised subject status envelope with drilldownAction
 * @returns {string|null}
 */
export function drilldownPanelSelector(entry) {
  if (entry.drilldownAction === 'diagnostics') {
    const mapping = DRILLDOWN_PANEL_MAP[entry.subjectKey];
    return mapping ? `[data-panel="${mapping.panel}"]` : null;
  }
  if (entry.drilldownAction === 'asset_registry') return '[data-panel="asset-registry"]';
  if (entry.drilldownAction === 'content_release') return '[data-panel="content-release"]';
  return null;
}

/**
 * Normalise a single subject status envelope from the worker payload.
 *
 * Defensive: every field is coerced to a safe rendering-ready value so
 * the UI never receives undefined / NaN / wrong-typed data from the
 * worker layer.
 *
 * @param {object} raw — single subject envelope from the worker
 * @returns {SubjectStatusEnvelope}
 */
export function normaliseSubjectStatus(raw) {
  const entry = isPlainObject(raw) ? raw : {};
  const status = VALID_STATUSES.includes(entry.status) ? entry.status : 'placeholder';
  const signal = VALID_SIGNALS.includes(entry.supportLoadSignal) ? entry.supportLoadSignal : 'none';
  return {
    subjectKey: safeString(entry.subjectKey, 'unknown'),
    displayName: safeString(entry.displayName, entry.subjectKey || 'Unknown'),
    status,
    releaseVersion: typeof entry.releaseVersion === 'string' && entry.releaseVersion
      ? entry.releaseVersion
      : (typeof entry.releaseVersion === 'number' && entry.releaseVersion > 0
        ? String(entry.releaseVersion)
        : null),
    validationErrors: safeNonNegativeInt(entry.validationErrors),
    errorCount7d: safeNonNegativeInt(entry.errorCount7d),
    supportLoadSignal: signal,
  };
}

/**
 * Build the complete cross-subject overview from the worker payload.
 *
 * Returns an array of normalised `SubjectStatusEnvelope` objects ordered
 * by lifecycle priority: live subjects first, then gated, then placeholders.
 *
 * @param {object} payload — the `contentOverview` object from the worker
 * @returns {SubjectStatusEnvelope[]}
 */
export function buildSubjectContentOverview(payload) {
  const data = isPlainObject(payload) ? payload : {};
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];
  const normalised = subjects.map((raw) => {
    const entry = normaliseSubjectStatus(raw);
    entry.drilldownAction = deriveDrilldownAction(entry);
    return entry;
  });

  // Sort: live first, gated second, placeholder last. Within each group
  // preserve the server-provided order (which is the canonical subject
  // display order).
  const priority = { live: 0, gated: 1, placeholder: 2 };
  normalised.sort((a, b) => (priority[a.status] ?? 3) - (priority[b.status] ?? 3));

  return normalised;
}

/**
 * Status badge colour mapping for the rendering layer.
 * Matches the chip class convention used across admin panels.
 *
 * @param {'live'|'gated'|'placeholder'} status
 * @returns {string} CSS class suffix for the chip
 */
export function statusBadgeClass(status) {
  if (status === 'live') return 'good';
  if (status === 'gated') return 'warn';
  return '';
}

/**
 * Human-readable label for a subject lifecycle status.
 *
 * @param {'live'|'gated'|'placeholder'} status
 * @returns {string}
 */
export function statusLabel(status) {
  if (status === 'live') return 'Live';
  if (status === 'gated') return 'Gated';
  return 'Placeholder';
}
