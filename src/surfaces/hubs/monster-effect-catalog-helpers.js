// Pure helpers for the U6 Monster effect catalog panel. The panel itself
// (`MonsterEffectCatalogPanel.jsx`) hosts the React surface; the logic
// below is colocated here as plain JS so `node --test` can exercise it
// without bundling JSX. The panel imports the same helpers — single source
// of truth, no drift.

import { BUNDLED_EFFECT_CATALOG } from '../../platform/game/render/effect-config-defaults.js';
import {
  EFFECT_TEMPLATE_IDS,
  lookupTemplate,
} from '../../platform/game/render/effect-templates/index.js';
import { validateEffectCatalogEntry } from '../../platform/game/render/effect-config-schema.js';

export const EFFECT_CATALOG_BUNDLED_KINDS = Object.freeze(Object.keys(BUNDLED_EFFECT_CATALOG));

const BUNDLED_KINDS_SET = new Set(EFFECT_CATALOG_BUNDLED_KINDS);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function jsonStable(value) {
  return JSON.stringify(value || null);
}

// Builds a fresh catalog entry seeded with the given template's paramSchema
// defaults. Returned entry validates against `validateEffectCatalogEntry`
// when both `kind` and `templateId` resolve.
export function buildCatalogEntryFromTemplate({ kind, templateId } = {}) {
  const template = lookupTemplate(templateId);
  const paramSchema = template?.paramSchema || {};
  // Mirror the descriptor shape used in BUNDLED_EFFECT_CATALOG: each param
  // is a full descriptor `{ type, default, min?, max?, values? }` so the
  // validator and the field controls share one shape.
  const params = {};
  for (const [name, schema] of Object.entries(paramSchema)) {
    if (!schema) continue;
    const descriptor = { type: schema.type };
    if (schema.default !== undefined) descriptor.default = clone(schema.default);
    if (schema.min !== undefined) descriptor.min = schema.min;
    if (schema.max !== undefined) descriptor.max = schema.max;
    if (Array.isArray(schema.values)) descriptor.values = [...schema.values];
    params[name] = descriptor;
  }
  return {
    kind: typeof kind === 'string' ? kind : '',
    template: typeof templateId === 'string' ? templateId : '',
    lifecycle: 'persistent',
    layer: 'overlay',
    surfaces: ['*'],
    reducedMotion: 'simplify',
    zIndex: 0,
    exclusiveGroup: null,
    params,
    reviewed: false,
  };
}

// Switches the entry's template, resetting params to the new template's
// defaults. Other metadata (kind, lifecycle, layer, surfaces, etc.) is
// preserved so admin's typed-in identity survives the swap.
export function applyCatalogTemplateChange({ entry, nextTemplateId } = {}) {
  if (!entry) return entry;
  const seeded = buildCatalogEntryFromTemplate({
    kind: entry.kind,
    templateId: nextTemplateId,
  });
  return {
    ...entry,
    template: seeded.template,
    params: seeded.params,
    // Re-mark unreviewed: a template swap is a substantive shape change.
    reviewed: false,
  };
}

// Whether a kind is bundled (read: code-default, no admin delete allowed).
export function catalogEntryIsBundled(kind) {
  return BUNDLED_KINDS_SET.has(kind);
}

// Whether the entry should appear in the "needs review" filter view.
export function catalogEntryNeedsReview(entry) {
  if (!entry) return true;
  return entry.reviewed !== true;
}

// Whether the entry differs from its bundled-default counterpart. Used by
// the revert button (only enabled when there is something to revert) and by
// the queue's "changed" view.
export function catalogEntryDiffersFromBundled(entry, kind) {
  if (!catalogEntryIsBundled(kind)) return true;
  return jsonStable(entry) !== jsonStable(BUNDLED_EFFECT_CATALOG[kind]);
}

// Returns the bundled-default catalog entry for a given kind, or null. Used
// by the revert action.
export function bundledCatalogEntry(kind) {
  if (!catalogEntryIsBundled(kind)) return null;
  return clone(BUNDLED_EFFECT_CATALOG[kind]);
}

// Validates a single param descriptor against a template's paramSchema.
// Returns an array of `{ code, message }` issues — empty when the
// descriptor is acceptable. Used by the field controls to show inline
// errors.
export function catalogParamSchemaErrors({ paramName, descriptor, schema } = {}) {
  if (!schema) return [];
  if (!descriptor || typeof descriptor !== 'object') {
    return [{
      code: 'effect_param_descriptor_required',
      message: `Param "${paramName}" must be an object descriptor.`,
      field: paramName,
    }];
  }
  const errors = [];
  if (schema.type === 'number') {
    const value = Number(descriptor.default);
    if (!Number.isFinite(value)) {
      errors.push({
        code: 'effect_param_default_not_number',
        message: `Param "${paramName}" must be a number.`,
        field: paramName,
      });
      return errors;
    }
    if (typeof schema.min === 'number' && value < schema.min) {
      errors.push({
        code: 'effect_param_default_below_min',
        message: `Param "${paramName}" must be ≥ ${schema.min}.`,
        field: paramName,
      });
    }
    if (typeof schema.max === 'number' && value > schema.max) {
      errors.push({
        code: 'effect_param_default_above_max',
        message: `Param "${paramName}" must be ≤ ${schema.max}.`,
        field: paramName,
      });
    }
  } else if (schema.type === 'enum') {
    const allowed = Array.isArray(schema.values) ? schema.values : [];
    if (descriptor.default != null && !allowed.includes(descriptor.default)) {
      errors.push({
        code: 'effect_param_enum_default_invalid',
        message: `Param "${paramName}" must be one of: ${allowed.join(', ')}.`,
        field: paramName,
      });
    }
  } else if (schema.type === 'boolean') {
    if (descriptor.default != null && typeof descriptor.default !== 'boolean') {
      errors.push({
        code: 'effect_param_default_not_boolean',
        message: `Param "${paramName}" must be true or false.`,
        field: paramName,
      });
    }
  } else if (schema.type === 'string') {
    if (descriptor.default != null && typeof descriptor.default !== 'string') {
      errors.push({
        code: 'effect_param_default_not_string',
        message: `Param "${paramName}" must be a string.`,
        field: paramName,
      });
    }
  }
  return errors;
}

// Aggregates validator + per-param schema errors for an entry. Used by the
// panel to disable the save action while errors exist.
export function catalogEntryAllErrors(entry) {
  const shape = validateEffectCatalogEntry(entry);
  const errors = [...(shape.errors || [])];
  const template = lookupTemplate(entry?.template);
  const paramSchema = template?.paramSchema || {};
  if (entry?.params && typeof entry.params === 'object') {
    for (const [name, descriptor] of Object.entries(entry.params)) {
      const schemaForParam = paramSchema[name];
      if (!schemaForParam) continue;
      errors.push(...catalogParamSchemaErrors({
        paramName: name,
        descriptor,
        schema: schemaForParam,
      }));
    }
  }
  return errors;
}

// Convenience: list of available template IDs for the New-entry dropdown.
export const EFFECT_CATALOG_TEMPLATE_OPTIONS = EFFECT_TEMPLATE_IDS;
