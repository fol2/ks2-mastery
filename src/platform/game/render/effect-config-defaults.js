// Bundled effect-config defaults: reverse-extracted from the eight code-
// registered effect modules under `./effects/`. The first publish must be
// byte-equivalent to today's runtime, so this module is the seed for both
// the admin centre's first draft and the runtime fallback when no config has
// been published yet.
//
// We do not import the effect modules directly — six of the eight use JSX
// which the plain `node --test` runner cannot parse. The catalog below is a
// hand-mirrored copy of each module's `defineEffect()` call; the regression
// guard in `tests/effect-config-defaults.test.js` locks the byte output via
// a frozen fixture so divergence is caught immediately.

import { MONSTER_ASSET_MANIFEST } from '../monster-asset-manifest.js';

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
    Object.freeze(value);
  }
  return value;
}

function entry({
  kind,
  template,
  lifecycle,
  layer,
  surfaces,
  reducedMotion,
  zIndex = 0,
  exclusiveGroup = null,
  params = {},
}) {
  return {
    kind,
    template,
    lifecycle,
    layer,
    surfaces: [...surfaces],
    reducedMotion,
    zIndex,
    exclusiveGroup,
    params,
    reviewed: true,
  };
}

const RAW_CATALOG = {
  // Continuous base motion — egg breathing.
  'egg-breathe': entry({
    kind: 'egg-breathe',
    template: 'motion',
    lifecycle: 'continuous',
    layer: 'base',
    surfaces: ['*'],
    reducedMotion: 'simplify',
  }),
  // Continuous base motion — caught monster idle float.
  'monster-motion-float': entry({
    kind: 'monster-motion-float',
    template: 'motion',
    lifecycle: 'continuous',
    layer: 'base',
    surfaces: ['*'],
    reducedMotion: 'simplify',
  }),
  // Persistent rarity overlay — sparkle.
  'shiny': entry({
    kind: 'shiny',
    template: 'sparkle',
    lifecycle: 'persistent',
    layer: 'overlay',
    surfaces: ['codex', 'lightbox', 'home'],
    reducedMotion: 'simplify',
    zIndex: 10,
    exclusiveGroup: 'rarity',
    params: {
      intensity: { type: 'number', default: 0.6, min: 0, max: 1 },
      palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
    },
  }),
  // Persistent overlay — radiating mega aura.
  'mega-aura': entry({
    kind: 'mega-aura',
    template: 'aura',
    lifecycle: 'persistent',
    layer: 'overlay',
    surfaces: ['codex', 'lightbox', 'home'],
    reducedMotion: 'simplify',
    zIndex: 12,
    params: {
      intensity: { type: 'number', default: 0.8, min: 0, max: 1 },
    },
  }),
  // Persistent rarity overlay — pulse halo for rare-class encounters.
  'rare-glow': entry({
    kind: 'rare-glow',
    template: 'pulse-halo',
    lifecycle: 'persistent',
    layer: 'overlay',
    surfaces: ['codex', 'lightbox', 'home'],
    reducedMotion: 'simplify',
    zIndex: 8,
    exclusiveGroup: 'rarity',
    params: {
      intensity: { type: 'number', default: 0.5, min: 0, max: 1 },
      palette: { type: 'enum', default: 'pale', values: ['accent', 'secondary', 'pale'] },
    },
  }),
  // Transient celebration overlays.
  'caught': entry({
    kind: 'caught',
    template: 'particles-burst',
    lifecycle: 'transient',
    layer: 'overlay',
    surfaces: ['lesson', 'home', 'codex'],
    reducedMotion: 'simplify',
  }),
  'evolve': entry({
    kind: 'evolve',
    template: 'particles-burst',
    lifecycle: 'transient',
    layer: 'overlay',
    surfaces: ['lesson', 'home', 'codex'],
    reducedMotion: 'simplify',
  }),
  'mega': entry({
    kind: 'mega',
    template: 'shine-streak',
    lifecycle: 'transient',
    layer: 'overlay',
    surfaces: ['lesson', 'home', 'codex'],
    reducedMotion: 'simplify',
  }),
};

export const BUNDLED_EFFECT_CATALOG = freezeDeep(RAW_CATALOG);

function continuousEffectForStage(stage) {
  return stage === 0 ? 'egg-breathe' : 'monster-motion-float';
}

function buildBindings(manifest) {
  const map = {};
  for (const asset of manifest.assets) {
    map[asset.key] = {
      persistent: [],
      continuous: [
        { kind: continuousEffectForStage(asset.stage), params: {}, reviewed: true },
      ],
    };
  }
  return map;
}

function buildCelebrationTunables(manifest) {
  const map = {};
  for (const asset of manifest.assets) {
    map[asset.key] = {
      caught: { showParticles: true, showShine: false, modifierClass: '', reviewed: true },
      evolve: { showParticles: false, showShine: false, modifierClass: '', reviewed: true },
      mega: { showParticles: true, showShine: true, modifierClass: '', reviewed: true },
    };
  }
  return map;
}

export const BUNDLED_EFFECT_BINDINGS = freezeDeep(buildBindings(MONSTER_ASSET_MANIFEST));
export const BUNDLED_CELEBRATION_TUNABLES = freezeDeep(buildCelebrationTunables(MONSTER_ASSET_MANIFEST));

export function bundledEffectConfig() {
  // Returns a fresh, mutable deep clone — callers must be free to use this as
  // a draft seed without disturbing the frozen module-level constants.
  return JSON.parse(JSON.stringify({
    catalog: BUNDLED_EFFECT_CATALOG,
    bindings: BUNDLED_EFFECT_BINDINGS,
    celebrationTunables: BUNDLED_CELEBRATION_TUNABLES,
  }));
}
