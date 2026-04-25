// Effect contract: validates a spec at definition time and returns a frozen
// descriptor. defineEffect() is the only place that throws — registration and
// composition stay defensive, never crashing the renderer for a learner.

const ALLOWED_LIFECYCLES = new Set(['persistent', 'transient', 'continuous']);
const ALLOWED_LAYERS = new Set(['base', 'overlay']);
const ALLOWED_REDUCED_MOTION = new Set(['omit', 'simplify', 'asis']);
const ALLOWED_PARAM_TYPES = new Set(['number', 'string', 'enum', 'boolean']);

import { isPlainObject } from '../../core/utils.js';

function fail(message) {
  throw new Error(`defineEffect: ${message}`);
}

function validateParamsSchema(params, kind) {
  if (params == null) return {};
  if (!isPlainObject(params)) {
    fail(`"${kind}" params must be an object map of name → schema, got ${typeof params}`);
  }
  const out = {};
  for (const [name, schema] of Object.entries(params)) {
    if (!isPlainObject(schema)) {
      fail(`"${kind}" param "${name}" must be an object descriptor`);
    }
    if (typeof schema.type !== 'string' || !ALLOWED_PARAM_TYPES.has(schema.type)) {
      fail(
        `"${kind}" param "${name}" has invalid type "${schema.type}"; expected one of `
        + `${[...ALLOWED_PARAM_TYPES].join(', ')}`,
      );
    }
    if (schema.type === 'enum') {
      if (!Array.isArray(schema.values) || schema.values.length === 0) {
        fail(`"${kind}" param "${name}" of type "enum" must declare a non-empty values array`);
      }
    }
    if (schema.type === 'number') {
      if (schema.min != null && typeof schema.min !== 'number') {
        fail(`"${kind}" param "${name}" min must be a number`);
      }
      if (schema.max != null && typeof schema.max !== 'number') {
        fail(`"${kind}" param "${name}" max must be a number`);
      }
    }
    out[name] = Object.freeze({
      type: schema.type,
      default: schema.default,
      min: schema.min,
      max: schema.max,
      values: Array.isArray(schema.values) ? Object.freeze([...schema.values]) : undefined,
      required: schema.required === true,
    });
  }
  return Object.freeze(out);
}

export function defineEffect(spec) {
  if (!isPlainObject(spec)) {
    fail('spec must be a plain object');
  }
  const { kind } = spec;
  if (typeof kind !== 'string' || kind.length === 0) {
    fail('spec.kind is required and must be a non-empty string');
  }
  if (!ALLOWED_LIFECYCLES.has(spec.lifecycle)) {
    fail(
      `"${kind}" has invalid lifecycle "${spec.lifecycle}"; expected one of `
      + `${[...ALLOWED_LIFECYCLES].join(', ')}`,
    );
  }
  if (!ALLOWED_LAYERS.has(spec.layer)) {
    fail(
      `"${kind}" has invalid layer "${spec.layer}"; expected one of `
      + `${[...ALLOWED_LAYERS].join(', ')}`,
    );
  }
  if (!Array.isArray(spec.surfaces)) {
    fail(`"${kind}" surfaces must be an array of strings`);
  }
  for (const surface of spec.surfaces) {
    if (typeof surface !== 'string' || surface.length === 0) {
      fail(`"${kind}" surfaces entries must be non-empty strings`);
    }
  }
  if (!ALLOWED_REDUCED_MOTION.has(spec.reducedMotion)) {
    fail(
      `"${kind}" has invalid reducedMotion "${spec.reducedMotion}"; expected one of `
      + `${[...ALLOWED_REDUCED_MOTION].join(', ')}`,
    );
  }

  const zIndex = Number.isFinite(spec.zIndex) ? Number(spec.zIndex) : 0;
  const exclusiveGroup = typeof spec.exclusiveGroup === 'string' && spec.exclusiveGroup.length > 0
    ? spec.exclusiveGroup
    : null;
  const params = validateParamsSchema(spec.params, kind);

  const descriptor = {
    kind,
    lifecycle: spec.lifecycle,
    layer: spec.layer,
    surfaces: Object.freeze([...spec.surfaces]),
    reducedMotion: spec.reducedMotion,
    zIndex,
    exclusiveGroup,
    params,
    render: typeof spec.render === 'function' ? spec.render : null,
    applyTransform: typeof spec.applyTransform === 'function' ? spec.applyTransform : null,
  };

  return Object.freeze(descriptor);
}
