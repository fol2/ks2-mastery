// Pure helpers for the U7 celebration tunables panel. Mirrors the shape
// used by the bindings + catalog panels so test-runners can exercise the
// logic without bundling JSX.

import {
  BUNDLED_CELEBRATION_TUNABLES,
} from '../../platform/game/render/effect-config-defaults.js';
import {
  EFFECT_CONFIG_CELEBRATION_KINDS,
  EFFECT_CONFIG_MODIFIER_CLASSES,
  validateCelebrationTunables,
} from '../../platform/game/render/effect-config-schema.js';

export const CELEBRATION_KINDS = EFFECT_CONFIG_CELEBRATION_KINDS;
export const CELEBRATION_MODIFIER_CLASSES = EFFECT_CONFIG_MODIFIER_CLASSES;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

// Seeds a tunable for a given kind from the bundled defaults so a freshly
// added tunable starts at parity with the runtime fallback. The seed is
// always unreviewed: any edit must be confirmed by the admin before publish.
export function defaultCelebrationTunables(kind) {
  // Use any asset's bundled default — they all carry the same per-kind shell
  // baseline. Falling back to a hard-coded shape if the bundled map is empty.
  const fallback = {
    showParticles: true,
    showShine: false,
    modifierClass: '',
    reviewed: false,
  };
  const sample = Object.values(BUNDLED_CELEBRATION_TUNABLES)[0];
  const sampleForKind = sample?.[kind];
  if (!sampleForKind) return fallback;
  return {
    showParticles: sampleForKind.showParticles === true,
    showShine: sampleForKind.showShine === true,
    modifierClass: typeof sampleForKind.modifierClass === 'string' ? sampleForKind.modifierClass : '',
    reviewed: false,
  };
}

// Returns the tunable for one (asset, kind) pair from a draft, falling back
// to a freshly-seeded default so the panel always has something to render.
export function celebrationTunableFromDraft(draft, assetKey, kind) {
  const row = draft?.celebrationTunables?.[assetKey];
  const tunable = row?.[kind];
  if (tunable && typeof tunable === 'object') {
    return clone(tunable);
  }
  return defaultCelebrationTunables(kind);
}

// Validates a single tunable against the schema validator. We adapt the
// shared `validateCelebrationTunables` (which expects the full row shape)
// by feeding it a row that contains every required kind, with the
// non-target kinds filled in from defaults — keeps validation centralised.
export function celebrationTunablesAllErrors(tunable, { kind } = {}) {
  if (!CELEBRATION_KINDS.includes(kind)) {
    return [{
      code: 'celebration_tunable_kind_invalid',
      message: `Unknown celebration kind "${kind}".`,
      field: 'kind',
    }];
  }
  const row = {};
  for (const candidateKind of CELEBRATION_KINDS) {
    row[candidateKind] = candidateKind === kind
      ? clone(tunable) || {}
      : { showParticles: true, showShine: false, modifierClass: '', reviewed: true };
  }
  const result = validateCelebrationTunables(row);
  if (result.ok) return [];
  // Filter to errors scoped to the kind we care about — the schema validator
  // surfaces issues from every kind in the row, but the panel only cares
  // about the one being edited right now.
  return result.errors.filter((issue) => issue.kind === kind || issue.field === kind);
}

// Whether every celebration tunable for a given asset is marked reviewed.
// Mirrors `assetBindingsAllReviewed` — used by the queue's
// `effect-incomplete` filter and the panel's per-asset review chip.
export function assetCelebrationAllReviewed(draft, assetKey) {
  const row = draft?.celebrationTunables?.[assetKey];
  if (!row || typeof row !== 'object') return true;
  for (const kind of CELEBRATION_KINDS) {
    const tunable = row[kind];
    if (tunable && tunable.reviewed !== true) return false;
  }
  return true;
}
