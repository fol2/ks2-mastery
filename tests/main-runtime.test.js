// Unit tests for the `monsterEffectConfig` runtime getter exposed on
// `appRuntime` in `src/main.js`. The factory `createMonsterEffectConfigGetter`
// is the testable seam — `src/main.js` itself is async-top-level and pulls in
// the full bootstrap, so we exercise the getter via a stubbed repositories
// object that mimics the real `monsterVisualConfig.read()` clone-on-read
// contract.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createMonsterEffectConfigGetter } from '../src/platform/game/monster-effect-runtime.js';
import { runtimeRegistration } from '../src/platform/game/render/runtime-registration.js';
import { lookupEffect, resetRegistry } from '../src/platform/game/render/registry.js';
import { resetWarnOnce, setDevMode, __setWarnSink } from '../src/platform/game/render/composition.js';

function cloneOnReadRepositories(buildEffect) {
  // Mimic the production repository contract: every `.read()` returns a
  // fresh deep-clone (the real implementation uses `cloneSerialisable`).
  return {
    monsterVisualConfig: {
      read() {
        const effect = buildEffect();
        if (effect == null) return null;
        return JSON.parse(JSON.stringify({ config: { effect } }));
      },
    },
  };
}

test('createMonsterEffectConfigGetter: returns a function on the runtime', () => {
  const getter = createMonsterEffectConfigGetter(cloneOnReadRepositories(() => null));
  assert.equal(typeof getter, 'function');
});

test('createMonsterEffectConfigGetter: surfaces inner effect when read returns the bundled shape', () => {
  const effect = {
    catalog: { shiny: { kind: 'shiny', template: 'sparkle', reviewed: true } },
    bindings: {},
    celebrationTunables: {},
  };
  const getter = createMonsterEffectConfigGetter(cloneOnReadRepositories(() => effect));
  const result = getter();
  assert.ok(result, 'expected non-null effect');
  assert.deepEqual(Object.keys(result.catalog), ['shiny']);
  assert.equal(result.catalog.shiny.kind, 'shiny');
});

test('createMonsterEffectConfigGetter: returns null when read() returns null', () => {
  const getter = createMonsterEffectConfigGetter(cloneOnReadRepositories(() => null));
  assert.equal(getter(), null);
});

test('createMonsterEffectConfigGetter: returns null when read() returns row without effect', () => {
  const repositories = {
    monsterVisualConfig: {
      read() { return { config: { /* effect missing */ } }; },
    },
  };
  const getter = createMonsterEffectConfigGetter(repositories);
  assert.equal(getter(), null);
});

test('createMonsterEffectConfigGetter: returns null when monsterVisualConfig repository is missing', () => {
  const getter = createMonsterEffectConfigGetter({});
  assert.equal(getter(), null);
});

test('createMonsterEffectConfigGetter: structurally identical reads return the SAME reference (memoisation)', () => {
  // The real repo clones every read, so two successive calls produce
  // structurally identical but reference-distinct objects. The getter must
  // collapse those into one stable reference, otherwise the App.jsx
  // useEffect dep `[monsterEffectConfig?.catalog]` re-fires every render.
  const buildEffect = () => ({
    catalog: { shiny: { kind: 'shiny', template: 'sparkle', reviewed: true } },
    bindings: {},
    celebrationTunables: {},
  });
  const getter = createMonsterEffectConfigGetter(cloneOnReadRepositories(buildEffect));
  const first = getter();
  const second = getter();
  assert.ok(first, 'first read must yield an effect');
  assert.equal(second, first, 'second read with identical content must reuse the cached reference');
});

test('createMonsterEffectConfigGetter: content change yields a NEW reference (cache busts)', () => {
  let intensityDefault = 0.6;
  const buildEffect = () => ({
    catalog: {
      shiny: {
        kind: 'shiny',
        template: 'sparkle',
        reviewed: true,
        params: { intensity: { type: 'number', default: intensityDefault } },
      },
    },
    bindings: {},
    celebrationTunables: {},
  });
  const getter = createMonsterEffectConfigGetter(cloneOnReadRepositories(buildEffect));
  const first = getter();
  intensityDefault = 0.9;
  const second = getter();
  assert.notEqual(second, first, 'content change must produce a new reference');
  assert.equal(second.catalog.shiny.params.intensity.default, 0.9);
});

test('createMonsterEffectConfigGetter: null-then-effect-then-null preserves expected refs', () => {
  // Edge case: bouncing between null and present must not stash a stale ref
  // such that a later null read returns the prior object.
  let phase = 'null';
  const buildEffect = () => {
    if (phase === 'null') return null;
    return { catalog: { shiny: { kind: 'shiny', template: 'sparkle', reviewed: true } } };
  };
  const getter = createMonsterEffectConfigGetter(cloneOnReadRepositories(buildEffect));
  assert.equal(getter(), null, 'starts null');
  phase = 'present';
  const present = getter();
  assert.ok(present, 'becomes present');
  phase = 'null';
  assert.equal(getter(), null, 'returns null when content disappears');
});

// Canary for the App.jsx useEffect bug: pair the getter with
// `runtimeRegistration` so the relationship between getter stability and
// registry refreshes is explicit. Two calls with identical content must
// produce the same reference (so React's `[catalog]` dep stays stable);
// changing content must refresh the registry on the next call.
test('runtime getter + runtimeRegistration: identical content keeps registry stable; content change refreshes', () => {
  const warnings = [];
  __setWarnSink((key, message) => { warnings.push({ key, message }); });
  resetWarnOnce();
  resetRegistry();
  setDevMode(true);
  try {
    let phase = 'A';
    const buildEffect = () => ({
      catalog: {
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
            intensity: { type: 'number', default: phase === 'A' ? 0.4 : 0.85, min: 0, max: 1 },
            palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
          },
          reviewed: true,
        },
      },
      bindings: {},
      celebrationTunables: {},
    });
    const getter = createMonsterEffectConfigGetter(cloneOnReadRepositories(buildEffect));

    // First mount: catalog applied at intensity 0.4.
    const e1 = getter();
    runtimeRegistration({ catalog: e1.catalog });
    assert.equal(lookupEffect('shiny')?.params?.intensity?.default, 0.4);

    // Re-render with no content change — the getter MUST return the same
    // ref so an `[catalog]` useEffect dep does not refire.
    const e2 = getter();
    assert.equal(e2, e1, 'identical-content re-read must reuse the cached reference');

    // Content change — getter yields a new ref, registry honours the new
    // catalog on the next run.
    phase = 'B';
    const e3 = getter();
    assert.notEqual(e3, e1, 'content change must produce a new reference');
    runtimeRegistration({ catalog: e3.catalog });
    assert.equal(lookupEffect('shiny')?.params?.intensity?.default, 0.85);
  } finally {
    __setWarnSink(null);
    resetWarnOnce();
    resetRegistry();
    setDevMode(true);
  }
});
