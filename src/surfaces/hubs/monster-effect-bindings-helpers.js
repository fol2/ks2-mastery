// Pure helpers for the U7 Monster effect bindings panel. Mirrors the
// `monster-effect-catalog-helpers.js` split: the React surface lives in
// `MonsterEffectBindingsPanel.jsx` and this module hosts the JSX-free
// logic so `node --test` can exercise it without a JSX transform.
//
// Bindings authored here cover the persistent + continuous lifecycles only;
// transient celebrations are owned by `<CelebrationLayer>` and tuned via
// `MonsterEffectCelebrationPanel.jsx`.

import { lookupTemplate } from '../../platform/game/render/effect-templates/index.js';
import {
  catalogEntryNeedsReview,
  catalogParamSchemaErrors,
} from './monster-effect-catalog-helpers.js';

export const BINDING_LIFECYCLES = Object.freeze(['persistent', 'continuous']);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

// Seeds a binding row from the catalog entry's paramSchema defaults so the
// admin sees sensible starter values rather than an empty object.
export function defaultBindingRow({ kind, lifecycle = 'persistent', catalog = {} } = {}) {
  const entry = catalog?.[kind] || null;
  const template = entry ? lookupTemplate(entry.template) : null;
  const paramSchema = template?.paramSchema || {};
  const params = {};
  for (const [name, schema] of Object.entries(paramSchema)) {
    if (!schema) continue;
    if (schema.default !== undefined) {
      params[name] = clone(schema.default);
    }
  }
  return {
    kind: typeof kind === 'string' ? kind : '',
    lifecycle: BINDING_LIFECYCLES.includes(lifecycle) ? lifecycle : 'persistent',
    enabled: true,
    params,
    reviewed: false,
  };
}

// Returns every binding row across both lifecycle slots for a single asset,
// preserving slot identity so the panel can re-mount edits to the right
// array. Persistent rows come first to match the panel's z-index ordering
// note ("persistent overlays paint above continuous transforms").
export function bindingsRowsForAsset(draft, assetKey) {
  if (!assetKey) return [];
  const row = draft?.bindings?.[assetKey];
  if (!row) return [];
  const persistent = (Array.isArray(row.persistent) ? row.persistent : []).map((entry, index) => ({
    slot: 'persistent',
    index,
    entry,
  }));
  const continuous = (Array.isArray(row.continuous) ? row.continuous : []).map((entry, index) => ({
    slot: 'continuous',
    index,
    entry,
  }));
  return [...persistent, ...continuous];
}

// Aggregates all error sources for a single binding row:
// 1. Missing kind.
// 2. Kind references a deleted (no catalog entry) or unreviewed catalog entry.
// 3. Each param fails its template's paramSchema (re-uses
//    `catalogParamSchemaErrors`).
export function bindingRowAllErrors(row, { catalog = {} } = {}) {
  const errors = [];
  if (!row || typeof row !== 'object') {
    errors.push({
      code: 'effect_binding_row_required',
      message: 'Binding row must be an object.',
      field: 'row',
    });
    return errors;
  }
  if (typeof row.kind !== 'string' || row.kind.length === 0) {
    errors.push({
      code: 'effect_binding_kind_required',
      message: 'Binding kind is required.',
      field: 'kind',
    });
    return errors;
  }
  const entry = catalog?.[row.kind];
  if (!entry) {
    errors.push({
      code: 'effect_binding_kind_unknown',
      message: `Catalog entry for "${row.kind}" was deleted.`,
      field: 'kind',
    });
    return errors;
  }
  if (catalogEntryNeedsReview(entry)) {
    errors.push({
      code: 'effect_binding_kind_unreviewed',
      message: `Catalog entry "${row.kind}" is not reviewed yet.`,
      field: 'kind',
    });
  }
  const template = lookupTemplate(entry.template);
  const paramSchema = template?.paramSchema || {};
  // Bindings store params as plain `{ name: value }`. We re-use the catalog
  // param validator by adapting the value into a `{ type, default }`
  // descriptor — same shape the catalog entries use, so the validator stays
  // single-source-of-truth.
  if (row.params && typeof row.params === 'object') {
    for (const [name, value] of Object.entries(row.params)) {
      const schemaForParam = paramSchema[name];
      if (!schemaForParam) continue;
      const descriptor = { type: schemaForParam.type, default: value };
      const issues = catalogParamSchemaErrors({
        paramName: name,
        descriptor,
        schema: schemaForParam,
      });
      errors.push(...issues);
    }
  }
  return errors;
}

// Detects collisions where two enabled bindings share an `exclusiveGroup`.
// Returns a `{ groupId: [kind, kind, ...] }` map; absent group or a group
// with a single kind is excluded. composeEffects() resolves these at render
// time (the later one wins), so this is a soft warning, not a publish
// blocker.
export function exclusiveGroupCollisions(rows, catalog = {}) {
  const groups = {};
  for (const row of rows || []) {
    const entry = row?.entry;
    if (!entry || entry.enabled === false) continue;
    const catalogEntry = catalog?.[entry.kind];
    const groupId = catalogEntry?.exclusiveGroup;
    if (!groupId) continue;
    if (!groups[groupId]) groups[groupId] = [];
    if (!groups[groupId].includes(entry.kind)) groups[groupId].push(entry.kind);
  }
  const collisions = {};
  for (const [groupId, kinds] of Object.entries(groups)) {
    if (kinds.length >= 2) collisions[groupId] = kinds;
  }
  return collisions;
}

// Whether every binding row for a given asset is marked reviewed AND
// validates clean. Validating clean closes the deleted-kind regression:
// when a catalog kind is removed after a row was reviewed, the row's
// errors flip non-empty and `assetBindingsAllReviewed` correctly returns
// false — surfacing the asset in the queue's incomplete filter.
//
// Vacuously true when the asset has no row at all (no bindings authored).
// `catalog` defaults to the draft's own catalog so callers that already
// pass the full draft do not need to thread it again.
export function assetBindingsAllReviewed(draft, assetKey, { catalog } = {}) {
  const row = draft?.bindings?.[assetKey];
  if (!row || typeof row !== 'object') return true;
  const resolvedCatalog = catalog || draft?.catalog || {};
  for (const slot of BINDING_LIFECYCLES) {
    const list = Array.isArray(row[slot]) ? row[slot] : [];
    for (const entry of list) {
      if (!entry || entry.reviewed !== true) return false;
      if (bindingRowAllErrors(entry, { catalog: resolvedCatalog }).length > 0) return false;
    }
  }
  return true;
}
