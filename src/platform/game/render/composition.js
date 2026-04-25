// Composition pipeline + shared dev-warn helper.
//
// The pipeline is deliberately defensive: malformed entries drop with a
// dev-warn rather than throwing, mirroring the normalisation style in
// `monster-celebrations.js`. Only `defineEffect()` throws — that's a
// developer error caught at module load.

import { lookupEffect } from './registry.js';

let devMode = true;
const warnedKeys = new Set();
let warnSink = null;

export function setDevMode(value) {
  devMode = value !== false;
}

export function isDevMode() {
  return devMode;
}

export function resetWarnOnce() {
  warnedKeys.clear();
}

// Test seam: redirect warnings into a sink so tests can assert on them
// without polluting stderr. Pass `null` to restore default console.warn.
export function __setWarnSink(sink) {
  warnSink = typeof sink === 'function' ? sink : null;
}

export function warnOnce(key, message) {
  if (!devMode) return;
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  if (warnSink) {
    warnSink(key, message);
  } else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[render-effect] ${message}`);
  }
}

// `prefers-reduced-motion` is checked at the call site (e.g. <MonsterRender>)
// so render code stays branch-free per effect. The helper tolerates a missing
// `window` (node tests) and accepts an injected window-like object for tests.
export function prefersReducedMotion(injectedWindow) {
  const win = injectedWindow != null ? injectedWindow : (typeof window !== 'undefined' ? window : null);
  if (!win || typeof win.matchMedia !== 'function') return false;
  try {
    return win.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch (_err) {
    return false;
  }
}

import { isPlainObject } from '../../core/utils.js';

function normaliseEntry(entry) {
  if (!isPlainObject(entry)) return null;
  if (typeof entry.kind !== 'string' || entry.kind.length === 0) return null;
  return {
    kind: entry.kind,
    params: isPlainObject(entry.params) ? entry.params : {},
  };
}

function resolveParams(descriptor, suppliedParams, context) {
  const schema = descriptor.params || {};
  const resolved = {};
  // Walk each declared param; defaults apply when the caller omits a value.
  for (const [name, def] of Object.entries(schema)) {
    if (Object.prototype.hasOwnProperty.call(suppliedParams, name)) {
      resolved[name] = suppliedParams[name];
    } else if (def.default !== undefined) {
      resolved[name] = def.default;
    } else if (def.required) {
      warnOnce(
        `missing-required:${descriptor.kind}:${name}`,
        `effect "${descriptor.kind}" missing required param "${name}"`,
      );
      return null;
    }
  }

  // Validate + clamp + enum-fallback. We mutate `resolved` in place.
  for (const [name, def] of Object.entries(schema)) {
    if (!Object.prototype.hasOwnProperty.call(resolved, name)) continue;
    const value = resolved[name];
    if (def.type === 'number') {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        warnOnce(
          `bad-number:${descriptor.kind}:${name}`,
          `effect "${descriptor.kind}" param "${name}" expected number, got ${value}`,
        );
        resolved[name] = def.default !== undefined ? def.default : 0;
        continue;
      }
      let clamped = num;
      if (typeof def.min === 'number' && clamped < def.min) clamped = def.min;
      if (typeof def.max === 'number' && clamped > def.max) clamped = def.max;
      resolved[name] = clamped;
    } else if (def.type === 'string') {
      if (typeof value !== 'string') {
        warnOnce(
          `bad-string:${descriptor.kind}:${name}`,
          `effect "${descriptor.kind}" param "${name}" expected string, got ${typeof value}`,
        );
        resolved[name] = def.default !== undefined ? def.default : '';
      }
    } else if (def.type === 'boolean') {
      resolved[name] = value === true;
    } else if (def.type === 'enum') {
      if (!def.values.includes(value)) {
        warnOnce(
          `invalid-enum:${descriptor.kind}:${name}`,
          `effect "${descriptor.kind}" param "${name}" value "${value}" not in `
          + `[${def.values.join(', ')}]`,
        );
        resolved[name] = def.default !== undefined ? def.default : def.values[0];
      }
    }
  }

  // Surface unknown params (caller typo'd, or supplied something the spec did
  // not declare). We keep them out of the resolved bag — render code only
  // sees declared params.
  for (const name of Object.keys(suppliedParams)) {
    if (!Object.prototype.hasOwnProperty.call(schema, name)) {
      warnOnce(
        `unknown-param:${descriptor.kind}:${name}:${context}`,
        `effect "${descriptor.kind}" received unknown param "${name}"`,
      );
    }
  }

  return resolved;
}

function applyReducedMotion(resolved, reducedMotion) {
  if (!reducedMotion) return resolved;
  if (resolved.reducedMotion === 'omit') return null;
  if (resolved.reducedMotion === 'simplify') {
    return { ...resolved, simplified: true };
  }
  return resolved;
}

export function composeEffects({ effects, monster: _monster, context, reducedMotion = false } = {}) {
  if (!Array.isArray(effects)) {
    return { base: [], overlay: [] };
  }

  const ctx = typeof context === 'string' ? context : '';

  // Step 1: list-level dedup (same kind appearing twice — last wins). We do
  // this before lookup so we only resolve each kind once.
  const dedupedByKind = new Map();
  for (const raw of effects) {
    const normalised = normaliseEntry(raw);
    if (!normalised) continue;
    dedupedByKind.set(normalised.kind, normalised);
  }

  const resolvedList = [];
  for (const entry of dedupedByKind.values()) {
    // Step 2: registry lookup
    const descriptor = lookupEffect(entry.kind);
    if (!descriptor) {
      warnOnce(
        `unknown-kind:${entry.kind}`,
        `composeEffects: no registered effect for kind "${entry.kind}"`,
      );
      continue;
    }

    // Step 3: surface filter
    const surfaces = descriptor.surfaces;
    const matchesSurface = surfaces.length === 1 && surfaces[0] === '*'
      ? true
      : surfaces.includes(ctx);
    if (!matchesSurface) {
      warnOnce(
        `surface-mismatch:${ctx}:${entry.kind}`,
        `composeEffects: effect "${entry.kind}" not allowed on surface "${ctx}"`,
      );
      continue;
    }

    // Step 4: param resolution
    const params = resolveParams(descriptor, entry.params, ctx);
    if (params === null) continue; // missing-required already warned

    resolvedList.push({
      kind: descriptor.kind,
      lifecycle: descriptor.lifecycle,
      layer: descriptor.layer,
      surfaces: descriptor.surfaces,
      reducedMotion: descriptor.reducedMotion,
      zIndex: descriptor.zIndex,
      exclusiveGroup: descriptor.exclusiveGroup,
      params,
      render: descriptor.render,
      applyTransform: descriptor.applyTransform,
    });
  }

  // Step 5: exclusive-group resolution. Walk in order; for each group the
  // later entry wins, earlier entries are dropped with a dev-warn. We track
  // index-of-keeper per group, then filter at the end.
  const keeperByGroup = new Map();
  for (let i = 0; i < resolvedList.length; i += 1) {
    const entry = resolvedList[i];
    if (!entry.exclusiveGroup) continue;
    if (keeperByGroup.has(entry.exclusiveGroup)) {
      const previousIndex = keeperByGroup.get(entry.exclusiveGroup);
      const previous = resolvedList[previousIndex];
      warnOnce(
        `exclusive-group:${entry.exclusiveGroup}:${previous.kind}-vs-${entry.kind}`,
        `composeEffects: exclusiveGroup "${entry.exclusiveGroup}" — "${entry.kind}" `
        + `wins over "${previous.kind}"`,
      );
    }
    keeperByGroup.set(entry.exclusiveGroup, i);
  }
  const groupFiltered = resolvedList.filter((entry, index) => {
    if (!entry.exclusiveGroup) return true;
    return keeperByGroup.get(entry.exclusiveGroup) === index;
  });

  // Step 6: reduced-motion application
  const motionFiltered = [];
  for (const entry of groupFiltered) {
    const applied = applyReducedMotion(entry, reducedMotion);
    if (applied) motionFiltered.push(applied);
  }

  // Step 7: split by layer; sort overlay by zIndex ascending (stable).
  const base = [];
  const overlay = [];
  for (const entry of motionFiltered) {
    if (entry.layer === 'overlay') overlay.push(entry);
    else base.push(entry);
  }
  overlay.sort((a, b) => a.zIndex - b.zIndex);

  return { base, overlay };
}
