// Hybrid runtime registry tests (U3).
//
// Asserts that `runtimeRegistration({ catalog })` resets the registry,
// registers the bundled defaults FIRST, then iterates the published catalog
// (config wins on `kind` collision). Also covers `MonsterEffectConfigContext`
// provider semantics and `composeEffects` integration with config-defined
// kinds.
//
// The 8 bundled-default kinds split into two groups for testability:
//   - Five non-celebration kinds (motion ×2, sparkle, aura, pulse-halo)
//     register cleanly under plain `node --test` because their templates
//     are statically importable.
//   - Three celebration kinds (caught, evolve, mega) bind through
//     JSX-bearing templates (particles-burst, shine-streak) which need a
//     bundler. We exercise the all-8 case through `renderMonsterRenderFixture`,
//     mirroring the pattern `tests/effect-templates.test.js` already uses.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runtimeRegistration } from '../src/platform/game/render/runtime-registration.js';
import { lookupEffect, resetRegistry } from '../src/platform/game/render/registry.js';
import {
  composeEffects,
  resetWarnOnce,
  setDevMode,
  __setWarnSink,
} from '../src/platform/game/render/composition.js';
import { BUNDLED_EFFECT_CATALOG } from '../src/platform/game/render/effect-config-defaults.js';
import { renderMonsterRenderFixture } from './helpers/react-render.js';

const ALL_BUNDLED_KINDS = [
  'caught',
  'egg-breathe',
  'evolve',
  'mega',
  'mega-aura',
  'monster-motion-float',
  'rare-glow',
  'shiny',
];

// The five kinds whose templates load synchronously under plain Node.
const NODE_LOADABLE_KINDS = [
  'egg-breathe',
  'mega-aura',
  'monster-motion-float',
  'rare-glow',
  'shiny',
];

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function setupCapture() {
  const warnings = [];
  __setWarnSink((key, message) => { warnings.push({ key, message }); });
  resetWarnOnce();
  resetRegistry();
  setDevMode(true);
  return warnings;
}

function teardown() {
  __setWarnSink(null);
  resetWarnOnce();
  resetRegistry();
  setDevMode(true);
}

// 1. Happy path — no catalog: bundled defaults register (all 8 via SSR bundle).
test('runtimeRegistration: with no catalog, registers all 8 bundled-default kinds (SSR bundle)', async () => {
  const out = await renderMonsterRenderFixture({
    monster: { id: 'inklet', displayState: 'fresh', placeholder: '', imageAlt: 'shell' },
    context: 'codex',
    effects: [],
    registrations: `
      import { runtimeRegistration } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/runtime-registration.js'))};
      import { __registerCelebrationTemplates } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/index.js'))};
      import particlesBurst from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/particles-burst.js'))};
      import shineStreak from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/shine-streak.js'))};
      import { lookupEffect } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/registry.js'))};

      __registerCelebrationTemplates({ particlesBurst, shineStreak });
      runtimeRegistration({ catalog: undefined });

      const expected = ['caught', 'egg-breathe', 'evolve', 'mega', 'mega-aura', 'monster-motion-float', 'rare-glow', 'shiny'];
      const status = expected.map((k) => ({ kind: k, found: !!lookupEffect(k) }));
      const shiny = lookupEffect('shiny');
      __warnings.push({ key: '__status', message: JSON.stringify(status) });
      __warnings.push({ key: '__shiny-default', message: String(shiny?.params?.intensity?.default) });
    `,
  });
  const { warnings } = JSON.parse(out);
  const status = warnings.find((w) => w.key === '__status');
  const shinyDefault = warnings.find((w) => w.key === '__shiny-default');
  assert.ok(status, 'status probe must emit');
  const parsed = JSON.parse(status.message);
  for (const row of parsed) {
    assert.equal(row.found, true, `expected bundled "${row.kind}" to register`);
  }
  assert.equal(shinyDefault?.message, '0.6', 'bundled shiny intensity default must be 0.6');
});

// 2. Happy path — catalog === BUNDLED_EFFECT_CATALOG: same registry state.
test('runtimeRegistration: with bundled catalog as input, all 8 kinds remain registered (SSR bundle)', async () => {
  const out = await renderMonsterRenderFixture({
    monster: { id: 'inklet', displayState: 'fresh', placeholder: '', imageAlt: 'shell' },
    context: 'codex',
    effects: [],
    registrations: `
      import { runtimeRegistration } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/runtime-registration.js'))};
      import { __registerCelebrationTemplates } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/index.js'))};
      import particlesBurst from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/particles-burst.js'))};
      import shineStreak from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/shine-streak.js'))};
      import { lookupEffect } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/registry.js'))};
      import { BUNDLED_EFFECT_CATALOG } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-config-defaults.js'))};

      __registerCelebrationTemplates({ particlesBurst, shineStreak });
      runtimeRegistration({ catalog: BUNDLED_EFFECT_CATALOG });

      const expected = ['caught', 'egg-breathe', 'evolve', 'mega', 'mega-aura', 'monster-motion-float', 'rare-glow', 'shiny'];
      const status = expected.map((k) => ({ kind: k, found: !!lookupEffect(k) }));
      const shiny = lookupEffect('shiny');
      __warnings.push({ key: '__status', message: JSON.stringify(status) });
      __warnings.push({ key: '__shiny-default', message: String(shiny?.params?.intensity?.default) });
    `,
  });
  const { warnings } = JSON.parse(out);
  const status = warnings.find((w) => w.key === '__status');
  const shinyDefault = warnings.find((w) => w.key === '__shiny-default');
  assert.ok(status, 'status probe must emit');
  const parsed = JSON.parse(status.message);
  for (const row of parsed) {
    assert.equal(row.found, true, `expected "${row.kind}" to register from BUNDLED_EFFECT_CATALOG`);
  }
  assert.equal(shinyDefault?.message, '0.6');
});

// 3. Happy path — catalog override of `shiny` intensity default flows through.
test('runtimeRegistration: catalog overrides bundled "shiny" intensity default to 0.9', () => {
  setupCapture();
  try {
    const overrideCatalog = {
      shiny: {
        kind: 'shiny',
        template: 'sparkle',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['codex', 'lightbox', 'home'],
        reducedMotion: 'simplify',
        zIndex: 10,
        exclusiveGroup: 'rarity',
        params: {
          intensity: { type: 'number', default: 0.9, min: 0, max: 1 },
          palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
        },
        reviewed: true,
      },
    };
    runtimeRegistration({ catalog: overrideCatalog });
    const shiny = lookupEffect('shiny');
    assert.ok(shiny);
    assert.equal(shiny.params.intensity?.default, 0.9);
    // The other Node-loadable kinds still register.
    assert.ok(lookupEffect('mega-aura'));
    assert.ok(lookupEffect('egg-breathe'));
  } finally {
    teardown();
  }
});

// 4. Happy path — admin-defined new kind appears in registry.
test('runtimeRegistration: admin-defined "crystal-glint" via sparkle template registers', () => {
  setupCapture();
  try {
    const catalog = {
      'crystal-glint': {
        kind: 'crystal-glint',
        template: 'sparkle',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['codex', 'lightbox'],
        reducedMotion: 'simplify',
        zIndex: 11,
        exclusiveGroup: null,
        params: {
          intensity: { type: 'number', default: 0.7, min: 0, max: 1 },
          palette: { type: 'enum', default: 'secondary', values: ['accent', 'secondary', 'pale'] },
        },
        reviewed: true,
      },
    };
    runtimeRegistration({ catalog });
    const crystal = lookupEffect('crystal-glint');
    assert.ok(crystal, 'crystal-glint must register');
    assert.equal(crystal.kind, 'crystal-glint');
    assert.equal(crystal.lifecycle, 'persistent');
    assert.equal(crystal.params.intensity?.default, 0.7);
  } finally {
    teardown();
  }
});

// 5. Edge case — malformed catalog entry (unknown template) is skipped.
test('runtimeRegistration: malformed entry (unknown template) skipped, bundled default for same kind remains', () => {
  const warnings = setupCapture();
  try {
    const catalog = {
      shiny: {
        kind: 'shiny',
        template: 'unknown-template',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['codex'],
        reducedMotion: 'simplify',
        reviewed: true,
      },
    };
    runtimeRegistration({ catalog });
    const shiny = lookupEffect('shiny');
    assert.ok(shiny, 'bundled "shiny" must remain when override is malformed');
    // Bundled-default intensity default (0.6) stays put.
    assert.equal(shiny.params.intensity?.default, 0.6);
    assert.ok(
      warnings.some((w) => w.key.includes('apply-template') || w.key.includes('runtime-registration')),
      `expected dev-warn about malformed entry, got ${JSON.stringify(warnings)}`,
    );
  } finally {
    teardown();
  }
});

// 6. Edge case — invalid lifecycle: validateEffectCatalogEntry rejects it.
test('runtimeRegistration: catalog entry with invalid lifecycle skipped, bundled default remains', () => {
  const warnings = setupCapture();
  try {
    const catalog = {
      shiny: {
        kind: 'shiny',
        template: 'sparkle',
        lifecycle: 'eternal',
        layer: 'overlay',
        surfaces: ['codex'],
        reducedMotion: 'simplify',
        reviewed: true,
      },
    };
    runtimeRegistration({ catalog });
    const shiny = lookupEffect('shiny');
    assert.ok(shiny, 'bundled "shiny" must remain when override has invalid lifecycle');
    assert.equal(shiny.params.intensity?.default, 0.6);
    assert.ok(
      warnings.some((w) => w.key.includes('runtime-registration')),
      `expected dev-warn about invalid lifecycle, got ${JSON.stringify(warnings)}`,
    );
  } finally {
    teardown();
  }
});

// 7. Edge case — idempotency: calling twice produces identical registry state.
test('runtimeRegistration: idempotent — calling twice produces identical registry state', () => {
  setupCapture();
  try {
    runtimeRegistration({ catalog: undefined });
    const firstSnapshot = NODE_LOADABLE_KINDS.map((kind) => {
      const spec = lookupEffect(kind);
      return {
        kind: spec.kind,
        lifecycle: spec.lifecycle,
        layer: spec.layer,
        zIndex: spec.zIndex,
        exclusiveGroup: spec.exclusiveGroup,
        surfaces: [...spec.surfaces],
      };
    });
    runtimeRegistration({ catalog: undefined });
    const secondSnapshot = NODE_LOADABLE_KINDS.map((kind) => {
      const spec = lookupEffect(kind);
      return {
        kind: spec.kind,
        lifecycle: spec.lifecycle,
        layer: spec.layer,
        zIndex: spec.zIndex,
        exclusiveGroup: spec.exclusiveGroup,
        surfaces: [...spec.surfaces],
      };
    });
    assert.deepEqual(secondSnapshot, firstSnapshot, 'idempotency violation');
  } finally {
    teardown();
  }
});

// 8. Integration — bound `crystal-glint` rendered via composeEffects.
test('runtimeRegistration: bound config-defined kind composes through composeEffects', () => {
  setupCapture();
  try {
    const catalog = {
      'crystal-glint': {
        kind: 'crystal-glint',
        template: 'sparkle',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['codex'],
        reducedMotion: 'simplify',
        zIndex: 15,
        exclusiveGroup: null,
        params: {
          intensity: { type: 'number', default: 0.55, min: 0, max: 1 },
          palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
        },
        reviewed: true,
      },
    };
    runtimeRegistration({ catalog });
    const result = composeEffects({
      effects: [{ kind: 'crystal-glint' }],
      monster: { id: 'inklet', accent: '#3E6FA8', secondary: '#FFE9A8', pale: '#F8F4EA' },
      context: 'codex',
    });
    assert.equal(result.overlay.length, 1, 'expected crystal-glint to compose into overlay');
    assert.equal(result.overlay[0].kind, 'crystal-glint');
    assert.equal(result.overlay[0].zIndex, 15);
  } finally {
    teardown();
  }
});

// 9. Integration — MonsterEffectConfigProvider exposes the value via the hook.
test('MonsterEffectConfigProvider: provides bindings, celebrationTunables, catalog through useMonsterEffectConfig', async () => {
  // Render via the bundle host so we can mount the provider + a probe child
  // that reads the hook and emits its result back as data attributes.
  const out = await renderMonsterRenderFixture({
    monster: { id: 'inklet', displayState: 'fresh', placeholder: '', imageAlt: 'shell' },
    context: 'codex',
    effects: [],
    registrations: `
      import {
        MonsterEffectConfigProvider,
        useMonsterEffectConfig,
      } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/MonsterEffectConfigContext.jsx'))};

      function Probe() {
        const ctx = useMonsterEffectConfig();
        const has = ctx ? '1' : '0';
        const bindingsKeys = ctx && ctx.bindings ? Object.keys(ctx.bindings).join(',') : '';
        const tunablesKeys = ctx && ctx.celebrationTunables ? Object.keys(ctx.celebrationTunables).join(',') : '';
        const catalogKeys = ctx && ctx.catalog ? Object.keys(ctx.catalog).sort().join(',') : '';
        return React.createElement('div', {
          'data-probe-has-context': has,
          'data-probe-bindings': bindingsKeys,
          'data-probe-tunables': tunablesKeys,
          'data-probe-catalog': catalogKeys,
        });
      }

      const __probeValue = {
        bindings: { 'inklet-b1-1': { persistent: [], continuous: [] } },
        celebrationTunables: { 'inklet-b1-1': { caught: { showParticles: true, showShine: false, modifierClass: '', reviewed: true } } },
        catalog: { 'shiny': { kind: 'shiny' } },
      };
      const __wrapped = React.createElement(
        MonsterEffectConfigProvider,
        { value: __probeValue },
        React.createElement(Probe, null),
      );
      const __probeHtml = renderToStaticMarkup(__wrapped);
      __warnings.push({ key: '__probe-with-provider', message: __probeHtml });

      // Probe without provider returns null.
      const __probeBare = renderToStaticMarkup(React.createElement(Probe, null));
      __warnings.push({ key: '__probe-no-provider', message: __probeBare });
    `,
  });
  const { warnings } = JSON.parse(out);
  const withProvider = warnings.find((w) => w.key === '__probe-with-provider');
  const noProvider = warnings.find((w) => w.key === '__probe-no-provider');
  assert.ok(withProvider, 'provider probe must emit');
  assert.ok(noProvider, 'no-provider probe must emit');
  assert.match(withProvider.message, /data-probe-has-context="1"/);
  assert.match(withProvider.message, /data-probe-bindings="inklet-b1-1"/);
  assert.match(withProvider.message, /data-probe-tunables="inklet-b1-1"/);
  assert.match(withProvider.message, /data-probe-catalog="shiny"/);
  assert.match(noProvider.message, /data-probe-has-context="0"/);
});

// 10. Edge case — catalog === null behaves like undefined.
test('runtimeRegistration: catalog=null behaves the same as undefined', () => {
  setupCapture();
  try {
    runtimeRegistration({ catalog: null });
    for (const kind of NODE_LOADABLE_KINDS) {
      assert.ok(lookupEffect(kind), `bundled "${kind}" missing after null catalog`);
    }
  } finally {
    teardown();
  }
});

// 11a. Edge case — calling twice with different catalogs has the second win.
test('runtimeRegistration: second call replaces first catalog override (config-change refresh)', () => {
  setupCapture();
  try {
    const firstCatalog = {
      shiny: {
        kind: 'shiny',
        template: 'sparkle',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['codex', 'lightbox', 'home'],
        reducedMotion: 'simplify',
        zIndex: 10,
        exclusiveGroup: 'rarity',
        params: {
          intensity: { type: 'number', default: 0.3, min: 0, max: 1 },
          palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
        },
        reviewed: true,
      },
    };
    runtimeRegistration({ catalog: firstCatalog });
    const after1 = lookupEffect('shiny');
    assert.equal(after1.params.intensity?.default, 0.3, 'first catalog default applied');

    const secondCatalog = {
      shiny: {
        kind: 'shiny',
        template: 'sparkle',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['codex', 'lightbox', 'home'],
        reducedMotion: 'simplify',
        zIndex: 10,
        exclusiveGroup: 'rarity',
        params: {
          intensity: { type: 'number', default: 0.95, min: 0, max: 1 },
          palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
        },
        reviewed: true,
      },
    };
    runtimeRegistration({ catalog: secondCatalog });
    const after2 = lookupEffect('shiny');
    assert.equal(after2.params.intensity?.default, 0.95, 'second catalog must replace first');
  } finally {
    teardown();
  }
});

// 11. Edge case — catalog === {} behaves like undefined.
test('runtimeRegistration: catalog={} behaves the same as undefined', () => {
  setupCapture();
  try {
    runtimeRegistration({ catalog: {} });
    for (const kind of NODE_LOADABLE_KINDS) {
      assert.ok(lookupEffect(kind), `bundled "${kind}" missing after empty catalog`);
    }
  } finally {
    teardown();
  }
});

// 12. Frozen-fixture regression guard. Snapshots the post-runtimeRegistration
//     metadata for the 8 bundled defaults to lock the swap from per-module
//     side effects to centralised registration. Uses the SSR bundle so all 8
//     kinds (incl. the JSX-bearing celebration templates) load.
test('runtimeRegistration: frozen-fixture snapshot — bundled-only registry has stable kinds + metadata (SSR bundle)', async () => {
  const out = await renderMonsterRenderFixture({
    monster: { id: 'inklet', displayState: 'fresh', placeholder: '', imageAlt: 'shell' },
    context: 'codex',
    effects: [],
    registrations: `
      import { runtimeRegistration } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/runtime-registration.js'))};
      import { __registerCelebrationTemplates } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/index.js'))};
      import particlesBurst from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/particles-burst.js'))};
      import shineStreak from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/shine-streak.js'))};
      import { lookupEffect } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/registry.js'))};

      __registerCelebrationTemplates({ particlesBurst, shineStreak });
      runtimeRegistration({ catalog: undefined });

      const kinds = ['caught', 'egg-breathe', 'evolve', 'mega', 'mega-aura', 'monster-motion-float', 'rare-glow', 'shiny'];
      const snapshot = {};
      for (const kind of kinds) {
        const spec = lookupEffect(kind);
        snapshot[kind] = spec ? {
          kind: spec.kind,
          lifecycle: spec.lifecycle,
          layer: spec.layer,
          zIndex: spec.zIndex,
          exclusiveGroup: spec.exclusiveGroup,
          surfaces: [...spec.surfaces],
          reducedMotion: spec.reducedMotion,
        } : null;
      }
      __warnings.push({ key: '__snapshot', message: JSON.stringify(snapshot) });
    `,
  });
  const { warnings } = JSON.parse(out);
  const snapshotEntry = warnings.find((w) => w.key === '__snapshot');
  assert.ok(snapshotEntry, 'snapshot probe must emit');
  const snapshot = JSON.parse(snapshotEntry.message);
  const expected = {
    'caught': {
      kind: 'caught', lifecycle: 'transient', layer: 'overlay', zIndex: 0,
      exclusiveGroup: null, surfaces: ['lesson', 'home', 'codex'], reducedMotion: 'simplify',
    },
    'egg-breathe': {
      kind: 'egg-breathe', lifecycle: 'continuous', layer: 'base', zIndex: 0,
      exclusiveGroup: null, surfaces: ['*'], reducedMotion: 'simplify',
    },
    'evolve': {
      kind: 'evolve', lifecycle: 'transient', layer: 'overlay', zIndex: 0,
      exclusiveGroup: null, surfaces: ['lesson', 'home', 'codex'], reducedMotion: 'simplify',
    },
    'mega': {
      kind: 'mega', lifecycle: 'transient', layer: 'overlay', zIndex: 0,
      exclusiveGroup: null, surfaces: ['lesson', 'home', 'codex'], reducedMotion: 'simplify',
    },
    'mega-aura': {
      kind: 'mega-aura', lifecycle: 'persistent', layer: 'overlay', zIndex: 12,
      exclusiveGroup: null, surfaces: ['codex', 'lightbox', 'home'], reducedMotion: 'simplify',
    },
    'monster-motion-float': {
      kind: 'monster-motion-float', lifecycle: 'continuous', layer: 'base', zIndex: 0,
      exclusiveGroup: null, surfaces: ['*'], reducedMotion: 'simplify',
    },
    'rare-glow': {
      kind: 'rare-glow', lifecycle: 'persistent', layer: 'overlay', zIndex: 8,
      exclusiveGroup: 'rarity', surfaces: ['codex', 'lightbox', 'home'], reducedMotion: 'simplify',
    },
    'shiny': {
      kind: 'shiny', lifecycle: 'persistent', layer: 'overlay', zIndex: 10,
      exclusiveGroup: 'rarity', surfaces: ['codex', 'lightbox', 'home'], reducedMotion: 'simplify',
    },
  };
  // Quiet `unused` warnings from build cycles.
  void ALL_BUNDLED_KINDS;
  assert.deepEqual(snapshot, expected, 'bundled-only registry drift detected');
});
