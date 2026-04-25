import test from 'node:test';
import assert from 'node:assert/strict';

import { defineEffect } from '../src/platform/game/render/define-effect.js';
import {
  registerEffect,
  lookupEffect,
  resetRegistry,
} from '../src/platform/game/render/registry.js';
import {
  composeEffects,
  prefersReducedMotion,
  setDevMode,
  resetWarnOnce,
  __setWarnSink,
} from '../src/platform/game/render/composition.js';

// Capture dev warnings into an array so tests can assert on them without
// polluting stderr. Each test resets the sink + registry + warnOnce cache.
function setupCapture() {
  const warnings = [];
  __setWarnSink((key, message) => {
    warnings.push({ key, message });
  });
  resetWarnOnce();
  resetRegistry();
  setDevMode(true);
  return warnings;
}

function teardownCapture() {
  __setWarnSink(null);
  resetWarnOnce();
  resetRegistry();
  setDevMode(true);
}

function makeMonster(overrides = {}) {
  return {
    id: 'inklet',
    name: 'Inklet',
    accent: '#3E6FA8',
    secondary: '#FFE9A8',
    pale: '#F8F4EA',
    ...overrides,
  };
}

test('defineEffect: minimal valid spec returns a frozen descriptor with defaults', () => {
  setupCapture();
  try {
    const effect = defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'simplify',
    });
    assert.equal(effect.kind, 'shiny');
    assert.equal(effect.lifecycle, 'persistent');
    assert.equal(effect.layer, 'overlay');
    assert.deepEqual(effect.surfaces, ['*']);
    assert.equal(effect.reducedMotion, 'simplify');
    assert.equal(effect.zIndex, 0);
    assert.equal(effect.exclusiveGroup, null);
    assert.deepEqual(effect.params, {});
    assert.equal(Object.isFrozen(effect), true);
  } finally {
    teardownCapture();
  }
});

test('defineEffect: throws on missing kind with descriptive message', () => {
  setupCapture();
  try {
    assert.throws(
      () => defineEffect({
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['*'],
        reducedMotion: 'asis',
      }),
      /kind/i,
    );
  } finally {
    teardownCapture();
  }
});

test('defineEffect: throws on invalid lifecycle with descriptive message', () => {
  setupCapture();
  try {
    assert.throws(
      () => defineEffect({
        kind: 'broken',
        lifecycle: 'eternal',
        layer: 'overlay',
        surfaces: ['*'],
        reducedMotion: 'asis',
      }),
      /lifecycle/i,
    );
  } finally {
    teardownCapture();
  }
});

test('defineEffect: throws on invalid layer', () => {
  setupCapture();
  try {
    assert.throws(
      () => defineEffect({
        kind: 'broken',
        lifecycle: 'persistent',
        layer: 'particle',
        surfaces: ['*'],
        reducedMotion: 'asis',
      }),
      /layer/i,
    );
  } finally {
    teardownCapture();
  }
});

test('defineEffect: throws on invalid reducedMotion value', () => {
  setupCapture();
  try {
    assert.throws(
      () => defineEffect({
        kind: 'broken',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['*'],
        reducedMotion: 'maybe',
      }),
      /reducedMotion/i,
    );
  } finally {
    teardownCapture();
  }
});

test('defineEffect: throws when surfaces is not an array', () => {
  setupCapture();
  try {
    assert.throws(
      () => defineEffect({
        kind: 'broken',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: 'codex',
        reducedMotion: 'asis',
      }),
      /surfaces/i,
    );
  } finally {
    teardownCapture();
  }
});

test('defineEffect: validates params schema shape', () => {
  setupCapture();
  try {
    assert.throws(
      () => defineEffect({
        kind: 'broken',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['*'],
        reducedMotion: 'asis',
        params: {
          intensity: { type: 'banana' },
        },
      }),
      /param|type/i,
    );
  } finally {
    teardownCapture();
  }
});

test('composeEffects: empty effects array returns empty base and overlay', () => {
  setupCapture();
  try {
    const result = composeEffects({
      effects: [],
      monster: makeMonster(),
      context: 'codex',
    });
    assert.deepEqual(result, { base: [], overlay: [] });
  } finally {
    teardownCapture();
  }
});

test('composeEffects: splits by layer and sorts overlay by zIndex ascending', () => {
  setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'motion',
      lifecycle: 'continuous',
      layer: 'base',
      surfaces: ['*'],
      reducedMotion: 'asis',
    }));
    registerEffect(defineEffect({
      kind: 'high-overlay',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      zIndex: 50,
    }));
    registerEffect(defineEffect({
      kind: 'low-overlay',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      zIndex: 5,
    }));
    registerEffect(defineEffect({
      kind: 'mid-overlay',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      zIndex: 20,
    }));

    const result = composeEffects({
      effects: [
        { kind: 'high-overlay' },
        { kind: 'motion' },
        { kind: 'low-overlay' },
        { kind: 'mid-overlay' },
      ],
      monster: makeMonster(),
      context: 'codex',
    });

    assert.equal(result.base.length, 1);
    assert.equal(result.base[0].kind, 'motion');
    assert.deepEqual(
      result.overlay.map((entry) => entry.kind),
      ['low-overlay', 'mid-overlay', 'high-overlay'],
    );
  } finally {
    teardownCapture();
  }
});

test('composeEffects: same kind listed twice — last wins (list dedup)', () => {
  const warnings = setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'simplify',
      params: {
        intensity: { type: 'number', default: 0.5, min: 0, max: 1 },
      },
    }));

    const result = composeEffects({
      effects: [
        { kind: 'shiny', params: { intensity: 0.2 } },
        { kind: 'shiny', params: { intensity: 0.9 } },
      ],
      monster: makeMonster(),
      context: 'codex',
    });

    assert.equal(result.overlay.length, 1);
    assert.equal(result.overlay[0].params.intensity, 0.9);
    // Silent dedup — no warning is required for the duplicate.
    const dupWarnings = warnings.filter((w) => w.key.startsWith('list-dup:'));
    assert.equal(dupWarnings.length, 0);
  } finally {
    teardownCapture();
  }
});

test('composeEffects: unknown kind is dropped and dev-warns; does not throw', () => {
  const warnings = setupCapture();
  try {
    const result = composeEffects({
      effects: [{ kind: 'no-such-effect' }],
      monster: makeMonster(),
      context: 'codex',
    });
    assert.deepEqual(result, { base: [], overlay: [] });
    assert.ok(
      warnings.some((w) => w.key.includes('unknown-kind') && w.key.includes('no-such-effect')),
      `expected unknown-kind warning, got ${JSON.stringify(warnings)}`,
    );
  } finally {
    teardownCapture();
  }
});

test('composeEffects: surface mismatch — effect dropped with dev-warn', () => {
  const warnings = setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['codex', 'home'],
      reducedMotion: 'simplify',
    }));

    const result = composeEffects({
      effects: [{ kind: 'shiny' }],
      monster: makeMonster(),
      context: 'lesson',
    });

    assert.deepEqual(result, { base: [], overlay: [] });
    assert.ok(
      warnings.some((w) => w.key.includes('surface-mismatch') && w.key.includes('shiny')),
      `expected surface-mismatch warning, got ${JSON.stringify(warnings)}`,
    );
  } finally {
    teardownCapture();
  }
});

test('composeEffects: surfaces ["*"] passes any context', () => {
  setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
    }));

    const result = composeEffects({
      effects: [{ kind: 'shiny' }],
      monster: makeMonster(),
      context: 'lesson',
    });

    assert.equal(result.overlay.length, 1);
  } finally {
    teardownCapture();
  }
});

test('composeEffects: exclusiveGroup — later one wins, earlier dev-warns', () => {
  const warnings = setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      exclusiveGroup: 'rarity',
    }));
    registerEffect(defineEffect({
      kind: 'rare-glow',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      exclusiveGroup: 'rarity',
    }));

    const result = composeEffects({
      effects: [{ kind: 'shiny' }, { kind: 'rare-glow' }],
      monster: makeMonster(),
      context: 'codex',
    });

    assert.equal(result.overlay.length, 1);
    assert.equal(result.overlay[0].kind, 'rare-glow');
    assert.ok(
      warnings.some((w) => w.key.includes('exclusive-group')),
      `expected exclusive-group warning, got ${JSON.stringify(warnings)}`,
    );
  } finally {
    teardownCapture();
  }
});

test('composeEffects: reducedMotion=true with policy "omit" drops effect entirely', () => {
  setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shake',
      lifecycle: 'continuous',
      layer: 'base',
      surfaces: ['*'],
      reducedMotion: 'omit',
    }));

    const result = composeEffects({
      effects: [{ kind: 'shake' }],
      monster: makeMonster(),
      context: 'codex',
      reducedMotion: true,
    });

    assert.deepEqual(result, { base: [], overlay: [] });
  } finally {
    teardownCapture();
  }
});

test('composeEffects: reducedMotion=true with policy "simplify" keeps simplified flag', () => {
  setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'simplify',
    }));

    const result = composeEffects({
      effects: [{ kind: 'shiny' }],
      monster: makeMonster(),
      context: 'codex',
      reducedMotion: true,
    });

    assert.equal(result.overlay.length, 1);
    assert.equal(result.overlay[0].simplified, true);
  } finally {
    teardownCapture();
  }
});

test('composeEffects: reducedMotion=true with policy "asis" leaves entry unchanged', () => {
  setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'glow',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
    }));

    const result = composeEffects({
      effects: [{ kind: 'glow' }],
      monster: makeMonster(),
      context: 'codex',
      reducedMotion: true,
    });

    assert.equal(result.overlay.length, 1);
    assert.notEqual(result.overlay[0].simplified, true);
  } finally {
    teardownCapture();
  }
});

test('composeEffects: reducedMotion=false leaves all entries unchanged', () => {
  setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'simplify',
    }));

    const result = composeEffects({
      effects: [{ kind: 'shiny' }],
      monster: makeMonster(),
      context: 'codex',
      reducedMotion: false,
    });

    assert.equal(result.overlay.length, 1);
    assert.notEqual(result.overlay[0].simplified, true);
  } finally {
    teardownCapture();
  }
});

test('composeEffects: params schema — defaults are merged when not supplied', () => {
  setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      params: {
        intensity: { type: 'number', default: 0.6, min: 0, max: 1 },
        tint: { type: 'string', default: 'auto' },
      },
    }));

    const result = composeEffects({
      effects: [{ kind: 'shiny' }],
      monster: makeMonster(),
      context: 'codex',
    });

    assert.equal(result.overlay[0].params.intensity, 0.6);
    assert.equal(result.overlay[0].params.tint, 'auto');
  } finally {
    teardownCapture();
  }
});

test('composeEffects: params schema — number out-of-range clamps to [min, max]', () => {
  setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      params: {
        intensity: { type: 'number', default: 0.5, min: 0, max: 1 },
      },
    }));

    const above = composeEffects({
      effects: [{ kind: 'shiny', params: { intensity: 1.5 } }],
      monster: makeMonster(),
      context: 'codex',
    });
    const below = composeEffects({
      effects: [{ kind: 'shiny', params: { intensity: -0.4 } }],
      monster: makeMonster(),
      context: 'codex',
    });

    assert.equal(above.overlay[0].params.intensity, 1);
    assert.equal(below.overlay[0].params.intensity, 0);
  } finally {
    teardownCapture();
  }
});

test('composeEffects: params schema — unknown param dev-warns but entry survives', () => {
  const warnings = setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      params: {
        intensity: { type: 'number', default: 0.5, min: 0, max: 1 },
      },
    }));

    const result = composeEffects({
      effects: [{ kind: 'shiny', params: { intensity: 0.7, ghost: true } }],
      monster: makeMonster(),
      context: 'codex',
    });

    assert.equal(result.overlay.length, 1);
    assert.equal(result.overlay[0].params.intensity, 0.7);
    assert.ok(
      warnings.some((w) => w.key.includes('unknown-param')),
      `expected unknown-param warning, got ${JSON.stringify(warnings)}`,
    );
  } finally {
    teardownCapture();
  }
});

test('composeEffects: required param missing — entry dropped with dev-warn', () => {
  const warnings = setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'gauge',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      params: {
        target: { type: 'string', required: true },
      },
    }));

    const result = composeEffects({
      effects: [{ kind: 'gauge' }],
      monster: makeMonster(),
      context: 'codex',
    });

    assert.deepEqual(result, { base: [], overlay: [] });
    assert.ok(
      warnings.some((w) => w.key.includes('missing-required')),
      `expected missing-required warning, got ${JSON.stringify(warnings)}`,
    );
  } finally {
    teardownCapture();
  }
});

test('composeEffects: enum param — value not in allow-list dev-warns and falls back to default', () => {
  const warnings = setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'palette',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      params: {
        mode: { type: 'enum', values: ['warm', 'cool'], default: 'warm' },
      },
    }));

    const result = composeEffects({
      effects: [{ kind: 'palette', params: { mode: 'spicy' } }],
      monster: makeMonster(),
      context: 'codex',
    });

    assert.equal(result.overlay.length, 1);
    assert.equal(result.overlay[0].params.mode, 'warm');
    assert.ok(
      warnings.some((w) => w.key.includes('invalid-enum')),
      `expected invalid-enum warning, got ${JSON.stringify(warnings)}`,
    );
  } finally {
    teardownCapture();
  }
});

test('registry: re-registering same kind replaces the descriptor', () => {
  setupCapture();
  try {
    const first = defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      zIndex: 5,
    });
    registerEffect(first);
    assert.equal(lookupEffect('shiny').zIndex, 5);

    const second = defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
      zIndex: 25,
    });
    registerEffect(second);
    assert.equal(lookupEffect('shiny').zIndex, 25);

    const result = composeEffects({
      effects: [{ kind: 'shiny' }],
      monster: makeMonster(),
      context: 'codex',
    });
    assert.equal(result.overlay[0].zIndex, 25);
  } finally {
    teardownCapture();
  }
});

test('lookupEffect: returns null for unknown kind', () => {
  setupCapture();
  try {
    assert.equal(lookupEffect('not-real'), null);
  } finally {
    teardownCapture();
  }
});

test('warnOnce: identical key only emits one warning across calls', () => {
  const warnings = setupCapture();
  try {
    composeEffects({
      effects: [{ kind: 'no-such' }, { kind: 'no-such' }],
      monster: makeMonster(),
      context: 'codex',
    });
    composeEffects({
      effects: [{ kind: 'no-such' }],
      monster: makeMonster(),
      context: 'codex',
    });
    const matching = warnings.filter((w) => w.key.includes('unknown-kind') && w.key.includes('no-such'));
    assert.equal(matching.length, 1);
  } finally {
    teardownCapture();
  }
});

test('prefersReducedMotion: returns false when window is missing (node)', () => {
  // Tests run under node with no window/matchMedia; helper must tolerate.
  assert.equal(prefersReducedMotion(), false);
});

test('prefersReducedMotion: respects injected matchMedia for testability', () => {
  const fakeWindow = {
    matchMedia(query) {
      return {
        matches: query === '(prefers-reduced-motion: reduce)',
      };
    },
  };
  assert.equal(prefersReducedMotion(fakeWindow), true);

  const denyWindow = {
    matchMedia() {
      return { matches: false };
    },
  };
  assert.equal(prefersReducedMotion(denyWindow), false);
});

test('composeEffects: setDevMode(false) suppresses dev-warns', () => {
  const warnings = setupCapture();
  try {
    setDevMode(false);
    composeEffects({
      effects: [{ kind: 'no-such' }],
      monster: makeMonster(),
      context: 'codex',
    });
    assert.equal(warnings.length, 0);
  } finally {
    teardownCapture();
  }
});

test('composeEffects: malformed effects entry (null) is silently dropped', () => {
  setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'asis',
    }));

    const result = composeEffects({
      effects: [null, undefined, { kind: 'shiny' }, { /* no kind */ }],
      monster: makeMonster(),
      context: 'codex',
    });

    assert.equal(result.overlay.length, 1);
    assert.equal(result.overlay[0].kind, 'shiny');
  } finally {
    teardownCapture();
  }
});

test('composeEffects: handles missing/invalid effects array gracefully', () => {
  setupCapture();
  try {
    assert.deepEqual(
      composeEffects({ effects: undefined, monster: makeMonster(), context: 'codex' }),
      { base: [], overlay: [] },
    );
    assert.deepEqual(
      composeEffects({ effects: 'not an array', monster: makeMonster(), context: 'codex' }),
      { base: [], overlay: [] },
    );
  } finally {
    teardownCapture();
  }
});
