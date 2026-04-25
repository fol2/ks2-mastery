// Pure helpers for the U7 celebration tunables panel. Mirrors the shape
// used by the bindings + catalog panels so test-runners can exercise the
// logic without bundling JSX.

import {
  BUNDLED_CELEBRATION_TUNABLES,
} from '../../platform/game/render/effect-config-defaults.js';
import {
  EFFECT_CONFIG_CELEBRATION_KINDS,
  validateSingleCelebrationTunable,
} from '../../platform/game/render/effect-config-schema.js';

export const CELEBRATION_KINDS = EFFECT_CONFIG_CELEBRATION_KINDS;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

// First bundled asset that actually carries this kind. The bundled map is
// invariant in production but iterating defends against a future asset
// whose first slot omits a kind — we never want to fall through to a
// hard-coded shape that could drift from the runtime baseline.
function sampleForKind(kind) {
  for (const row of Object.values(BUNDLED_CELEBRATION_TUNABLES)) {
    if (row?.[kind]) return row[kind];
  }
  return null;
}

// Seeds a tunable for a given kind from the bundled defaults so a freshly
// added tunable starts at parity with the runtime fallback. The seed is
// always unreviewed: any edit must be confirmed by the admin before publish.
export function defaultCelebrationTunables(kind) {
  const sample = sampleForKind(kind);
  if (!sample) {
    return {
      showParticles: true,
      showShine: false,
      modifierClass: '',
      reviewed: false,
    };
  }
  return {
    showParticles: sample.showParticles === true,
    showShine: sample.showShine === true,
    modifierClass: typeof sample.modifierClass === 'string' ? sample.modifierClass : '',
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

// Validates a single tunable directly via the shared schema validator —
// a non-object tunable, a kind outside the closed allowlist, or a
// modifierClass outside the closed allowlist all surface as errors,
// regardless of how they reached the draft (UI, autosave deserialisation,
// programmatic injection).
export function celebrationTunablesAllErrors(tunable, { kind } = {}) {
  const result = validateSingleCelebrationTunable(tunable, kind);
  return result.ok ? [] : result.errors;
}

// Whether every celebration tunable for a given asset is marked reviewed
// AND validates clean. Validating clean catches the deleted-kind regression
// where reviewed=true but the tunable now fails (e.g. modifierClass turned
// into an invalid string by a stale draft).
export function assetCelebrationAllReviewed(draft, assetKey) {
  const row = draft?.celebrationTunables?.[assetKey];
  if (!row || typeof row !== 'object') return true;
  for (const kind of CELEBRATION_KINDS) {
    const tunable = row[kind];
    if (!tunable || tunable.reviewed !== true) return false;
    if (celebrationTunablesAllErrors(tunable, { kind }).length > 0) return false;
  }
  return true;
}
