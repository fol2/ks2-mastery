// Effect-config schema + runtime validators. Mirrors the shape and validator
// style used by `monster-visual-config.js` so the admin tooling can reuse the
// same plumbing for both sub-documents.
//
// Three sub-trees:
//   - catalog: keyed by `kind`; declares which template renders an effect
//     and the typed param schema admin tools surface as fields.
//   - bindings: keyed by `monster-branch-stage`; declares which catalog kinds
//     wrap a monster (continuous + persistent slots, with caller params).
//   - celebrationTunables: keyed by `monster-branch-stage`; per-kind toggles
//     that today's celebration shell hardcodes (`showParticles`,
//     `showShine`, `modifierClass`).

const ALLOWED_TEMPLATES = Object.freeze([
  'motion',
  'glow',
  'sparkle',
  'aura',
  'particles-burst',
  'shine-streak',
  'pulse-halo',
]);

const ALLOWED_LIFECYCLES = Object.freeze(['persistent', 'transient', 'continuous']);
const ALLOWED_LAYERS = Object.freeze(['base', 'overlay']);
const ALLOWED_REDUCED_MOTION = Object.freeze(['omit', 'simplify', 'asis']);
const ALLOWED_PARAM_TYPES = Object.freeze(['number', 'string', 'enum', 'boolean']);

// Closed allow-list for celebration `modifierClass`. Extending this is a
// code change, never an admin input — keeps the publish path XSS-safe.
const ALLOWED_MODIFIER_CLASSES = Object.freeze(['', 'egg-crack']);

const CELEBRATION_KINDS = Object.freeze(['caught', 'evolve', 'mega']);

/**
 * @typedef {object} EffectCatalogEntry
 * @property {string} kind
 * @property {string} template
 * @property {string} lifecycle
 * @property {string} layer
 * @property {string[]} surfaces
 * @property {string} reducedMotion
 * @property {number} zIndex
 * @property {string|null} exclusiveGroup
 * @property {object} params
 * @property {boolean} reviewed
 */

/**
 * @typedef {object} EffectBindingEntry
 * @property {string} kind
 * @property {object} params
 * @property {boolean} reviewed
 */

/**
 * @typedef {object} EffectBindingRow
 * @property {EffectBindingEntry[]} persistent
 * @property {EffectBindingEntry[]} continuous
 */

/**
 * @typedef {object} CelebrationTunable
 * @property {boolean} showParticles
 * @property {boolean} showShine
 * @property {string} modifierClass
 * @property {boolean} reviewed
 */

/**
 * @typedef {object} CelebrationTunablesRow
 * @property {CelebrationTunable} caught
 * @property {CelebrationTunable} evolve
 * @property {CelebrationTunable} mega
 */

/**
 * @typedef {object} EffectConfig
 * @property {{ [kind: string]: EffectCatalogEntry }} catalog
 * @property {{ [assetKey: string]: EffectBindingRow }} bindings
 * @property {{ [assetKey: string]: CelebrationTunablesRow }} celebrationTunables
 */

export const EFFECT_CONFIG_TEMPLATES = ALLOWED_TEMPLATES;
export const EFFECT_CONFIG_MODIFIER_CLASSES = ALLOWED_MODIFIER_CLASSES;
export const EFFECT_CONFIG_CELEBRATION_KINDS = CELEBRATION_KINDS;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function issue(code, message, details = {}) {
  return {
    code,
    message,
    path: details.path || '',
    kind: details.kind || '',
    assetKey: details.assetKey || '',
    field: details.field || '',
  };
}

function validateParamSchemaShape(kind, paramName, schema, errors) {
  if (!isPlainObject(schema)) {
    errors.push(issue('effect_param_invalid', `Param "${paramName}" must be an object descriptor.`, { kind, field: paramName }));
    return;
  }
  if (typeof schema.type !== 'string' || !ALLOWED_PARAM_TYPES.includes(schema.type)) {
    errors.push(issue('effect_param_type_invalid', `Param "${paramName}" has invalid type "${schema.type}".`, { kind, field: paramName }));
    return;
  }
  if (schema.type === 'enum') {
    if (!Array.isArray(schema.values) || schema.values.length === 0) {
      errors.push(issue('effect_param_enum_values_required', `Enum param "${paramName}" must declare a non-empty values array.`, { kind, field: paramName }));
    }
  }
  if (schema.type === 'number') {
    if (schema.min != null && typeof schema.min !== 'number') {
      errors.push(issue('effect_param_min_invalid', `Param "${paramName}" min must be a number.`, { kind, field: paramName }));
    }
    if (schema.max != null && typeof schema.max !== 'number') {
      errors.push(issue('effect_param_max_invalid', `Param "${paramName}" max must be a number.`, { kind, field: paramName }));
    }
  }
}

export function validateEffectCatalogEntry(entry) {
  const errors = [];
  if (!isPlainObject(entry)) {
    return { ok: false, errors: [issue('effect_catalog_entry_required', 'Catalog entry must be an object.')] };
  }
  const kind = typeof entry.kind === 'string' ? entry.kind : '';
  if (!kind) {
    errors.push(issue('effect_catalog_kind_required', 'Catalog entry kind is required.', { field: 'kind' }));
  }
  if (typeof entry.template !== 'string' || entry.template.length === 0) {
    errors.push(issue('effect_catalog_template_required', 'Catalog entry template is required.', { kind, field: 'template' }));
  } else if (!ALLOWED_TEMPLATES.includes(entry.template)) {
    errors.push(issue('effect_catalog_template_invalid', `Unknown template "${entry.template}".`, { kind, field: 'template' }));
  }
  if (!ALLOWED_LIFECYCLES.includes(entry.lifecycle)) {
    errors.push(issue('effect_catalog_lifecycle_invalid', `Catalog entry lifecycle "${entry.lifecycle}" is invalid.`, { kind, field: 'lifecycle' }));
  }
  if (!ALLOWED_LAYERS.includes(entry.layer)) {
    errors.push(issue('effect_catalog_layer_invalid', `Catalog entry layer "${entry.layer}" is invalid.`, { kind, field: 'layer' }));
  }
  if (!ALLOWED_REDUCED_MOTION.includes(entry.reducedMotion)) {
    errors.push(issue('effect_catalog_reducedMotion_invalid', `Catalog entry reducedMotion "${entry.reducedMotion}" is invalid.`, { kind, field: 'reducedMotion' }));
  }
  if (!Array.isArray(entry.surfaces)) {
    errors.push(issue('effect_catalog_surfaces_invalid', 'Catalog entry surfaces must be an array.', { kind, field: 'surfaces' }));
  } else if (entry.surfaces.length === 0) {
    errors.push(issue('effect_catalog_surfaces_empty', 'Catalog entry surfaces must include at least one entry or "*".', { kind, field: 'surfaces' }));
  } else {
    for (const surface of entry.surfaces) {
      if (typeof surface !== 'string' || surface.length === 0) {
        errors.push(issue('effect_catalog_surfaces_invalid', 'Catalog entry surfaces entries must be non-empty strings.', { kind, field: 'surfaces' }));
        break;
      }
    }
  }
  if (entry.zIndex != null && !Number.isFinite(Number(entry.zIndex))) {
    errors.push(issue('effect_catalog_zIndex_invalid', 'Catalog entry zIndex must be numeric.', { kind, field: 'zIndex' }));
  }
  if (entry.exclusiveGroup != null && typeof entry.exclusiveGroup !== 'string') {
    errors.push(issue('effect_catalog_exclusiveGroup_invalid', 'Catalog entry exclusiveGroup must be a string or null.', { kind, field: 'exclusiveGroup' }));
  }
  if (entry.params != null) {
    if (!isPlainObject(entry.params)) {
      errors.push(issue('effect_catalog_params_invalid', 'Catalog entry params must be a plain object.', { kind, field: 'params' }));
    } else {
      for (const [paramName, schema] of Object.entries(entry.params)) {
        validateParamSchemaShape(kind, paramName, schema, errors);
      }
    }
  }
  if (typeof entry.reviewed !== 'boolean') {
    errors.push(issue('effect_catalog_reviewed_invalid', 'Catalog entry reviewed must be a boolean.', { kind, field: 'reviewed' }));
  }

  return { ok: errors.length === 0, errors };
}

function validateBindingEntry(assetKey, slot, index, candidate, knownKinds, errors) {
  if (!isPlainObject(candidate)) {
    errors.push(issue('effect_binding_entry_invalid', `Binding ${slot}[${index}] must be an object.`, { assetKey, field: slot }));
    return;
  }
  if (typeof candidate.kind !== 'string' || candidate.kind.length === 0) {
    errors.push(issue('effect_binding_kind_required', `Binding ${slot}[${index}] kind is required.`, { assetKey, field: slot }));
    return;
  }
  if (knownKinds && !knownKinds.has(candidate.kind)) {
    errors.push(issue('effect_binding_kind_unknown', `Binding ${slot}[${index}] references unknown kind "${candidate.kind}".`, { assetKey, kind: candidate.kind, field: slot }));
  }
  if (candidate.params != null && !isPlainObject(candidate.params)) {
    errors.push(issue('effect_binding_params_invalid', `Binding ${slot}[${index}] params must be a plain object.`, { assetKey, kind: candidate.kind, field: slot }));
  }
  if (typeof candidate.reviewed !== 'boolean') {
    errors.push(issue('effect_binding_reviewed_invalid', `Binding ${slot}[${index}] reviewed must be a boolean.`, { assetKey, kind: candidate.kind, field: slot }));
  }
}

export function validateEffectBindingRow(row, { knownKinds = null, assetKey = '' } = {}) {
  const errors = [];
  if (!isPlainObject(row)) {
    return { ok: false, errors: [issue('effect_binding_row_required', 'Binding row must be an object.', { assetKey })] };
  }
  for (const slot of ['persistent', 'continuous']) {
    if (!Array.isArray(row[slot])) {
      errors.push(issue('effect_binding_slot_invalid', `Binding row "${slot}" must be an array.`, { assetKey, field: slot }));
      continue;
    }
    row[slot].forEach((candidate, index) => {
      validateBindingEntry(assetKey, slot, index, candidate, knownKinds, errors);
    });
  }
  return { ok: errors.length === 0, errors };
}

function validateModifierClass(value) {
  if (typeof value !== 'string') return false;
  if (/\s/.test(value)) return false;
  if (!/^[a-z0-9-]*$/i.test(value)) return false;
  return ALLOWED_MODIFIER_CLASSES.includes(value);
}

function validateCelebrationKind(assetKey, kind, candidate, errors) {
  if (!isPlainObject(candidate)) {
    errors.push(issue('celebration_tunable_required', `Celebration tunable "${kind}" must be an object.`, { assetKey, kind, field: kind }));
    return;
  }
  if (typeof candidate.showParticles !== 'boolean') {
    errors.push(issue('celebration_tunable_showParticles_invalid', `Celebration "${kind}".showParticles must be a boolean.`, { assetKey, kind, field: 'showParticles' }));
  }
  if (typeof candidate.showShine !== 'boolean') {
    errors.push(issue('celebration_tunable_showShine_invalid', `Celebration "${kind}".showShine must be a boolean.`, { assetKey, kind, field: 'showShine' }));
  }
  if (!validateModifierClass(candidate.modifierClass)) {
    errors.push(issue('celebration_tunable_modifierClass_invalid', `Celebration "${kind}".modifierClass must be one of: ${ALLOWED_MODIFIER_CLASSES.map((v) => `"${v}"`).join(', ')}.`, { assetKey, kind, field: 'modifierClass' }));
  }
  if (typeof candidate.reviewed !== 'boolean') {
    errors.push(issue('celebration_tunable_reviewed_invalid', `Celebration "${kind}".reviewed must be a boolean.`, { assetKey, kind, field: 'reviewed' }));
  }
}

export function validateCelebrationTunables(row, { assetKey = '' } = {}) {
  const errors = [];
  if (!isPlainObject(row)) {
    return { ok: false, errors: [issue('celebration_tunables_required', 'Celebration tunables row must be an object.', { assetKey })] };
  }
  for (const kind of CELEBRATION_KINDS) {
    if (!(kind in row)) {
      errors.push(issue('celebration_tunable_kind_required', `Celebration tunable "${kind}" is required.`, { assetKey, kind, field: kind }));
      continue;
    }
    validateCelebrationKind(assetKey, kind, row[kind], errors);
  }
  return { ok: errors.length === 0, errors };
}

export function validateEffectConfig(config) {
  const errors = [];
  if (!isPlainObject(config)) {
    return { ok: false, errors: [issue('effect_config_required', 'Effect config must be an object.')] };
  }
  if (!isPlainObject(config.catalog)) {
    errors.push(issue('effect_config_catalog_required', 'Effect config catalog is required.', { field: 'catalog' }));
  }
  if (!isPlainObject(config.bindings)) {
    errors.push(issue('effect_config_bindings_required', 'Effect config bindings is required.', { field: 'bindings' }));
  }
  if (!isPlainObject(config.celebrationTunables)) {
    errors.push(issue('effect_config_celebrationTunables_required', 'Effect config celebrationTunables is required.', { field: 'celebrationTunables' }));
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const knownKinds = new Set(Object.keys(config.catalog));
  for (const [kind, entry] of Object.entries(config.catalog)) {
    const result = validateEffectCatalogEntry({ ...entry, kind: entry.kind ?? kind });
    if (!result.ok) errors.push(...result.errors);
  }
  for (const [assetKey, row] of Object.entries(config.bindings)) {
    const result = validateEffectBindingRow(row, { knownKinds, assetKey });
    if (!result.ok) errors.push(...result.errors);
  }
  for (const [assetKey, row] of Object.entries(config.celebrationTunables)) {
    const result = validateCelebrationTunables(row, { assetKey });
    if (!result.ok) errors.push(...result.errors);
  }

  return { ok: errors.length === 0, errors };
}
