import test from 'node:test';
import assert from 'node:assert/strict';

import { computeEggBreatheStyle } from '../src/platform/game/render/effects/egg-breathe.js';
import { runtimeRegistration } from '../src/platform/game/render/runtime-registration.js';
import { lookupEffect, resetRegistry } from '../src/platform/game/render/registry.js';
import { resetWarnOnce } from '../src/platform/game/render/composition.js';

// Fixtures captured from the original `eggBreatheStyle` helper before the
// port. Byte-identity proves the new effect does not drift from today's
// CSS-variable output.
const EGG_BREATHE_FIXTURES = [
  {
    label: 'inklet stage 0 card',
    seed: { id: 'inklet', stage: 0 },
    context: 'card',
    expected: {
      '--egg-breathe-duration': '6.41s',
      '--egg-breathe-delay': '-2.34s',
      '--egg-breathe-lift': '-2.52px',
      '--egg-breathe-scale': '1.009',
    },
  },
  {
    label: 'inklet stage 0 feature',
    seed: { id: 'inklet', stage: 0 },
    context: 'feature',
    expected: {
      '--egg-breathe-duration': '7.96s',
      '--egg-breathe-delay': '-5.06s',
      '--egg-breathe-lift': '-3.64px',
      '--egg-breathe-scale': '1.013',
    },
  },
  {
    label: 'inklet stage 0 preview',
    seed: { id: 'inklet', stage: 0 },
    context: 'preview',
    expected: {
      '--egg-breathe-duration': '5.99s',
      '--egg-breathe-delay': '-4.05s',
      '--egg-breathe-lift': '-3.71px',
      '--egg-breathe-scale': '1.010',
    },
  },
];

const MISSING_ID_FIXTURE = {
  label: 'missing id (uses species + branch + stage + context)',
  seed: { species: 'phaeton', branch: 'b2', stage: 0 },
  context: 'card',
  expected: {
    '--egg-breathe-duration': '7.21s',
    '--egg-breathe-delay': '-4.73s',
    '--egg-breathe-lift': '-3.67px',
    '--egg-breathe-scale': '1.012',
  },
};

test('egg-breathe: fixture parity (happy path) — inklet stage 0 card', () => {
  const fixture = EGG_BREATHE_FIXTURES[0];
  assert.deepEqual(
    computeEggBreatheStyle(fixture.seed, fixture.context),
    fixture.expected,
  );
});

test('egg-breathe: fixture parity across contexts — card / feature / preview', () => {
  for (const fixture of EGG_BREATHE_FIXTURES) {
    assert.deepEqual(
      computeEggBreatheStyle(fixture.seed, fixture.context),
      fixture.expected,
      `parity failed for ${fixture.label}`,
    );
  }
});

test('egg-breathe: edge case — missing seed.id falls back to species + branch + stage', () => {
  assert.deepEqual(
    computeEggBreatheStyle(MISSING_ID_FIXTURE.seed, MISSING_ID_FIXTURE.context),
    MISSING_ID_FIXTURE.expected,
  );
});

// The `egg-breathe` EffectSpec is now produced by the `motion` template
// during `runtimeRegistration`. We assert against the registered descriptor
// to lock the contract — this is the spec production code paths see.
function withRuntimeRegistration(fn) {
  resetRegistry();
  resetWarnOnce();
  try {
    runtimeRegistration({ catalog: undefined });
    fn();
  } finally {
    resetRegistry();
    resetWarnOnce();
  }
}

test('egg-breathe: descriptor metadata matches contract (via runtimeRegistration)', () => {
  withRuntimeRegistration(() => {
    const eggBreatheEffect = lookupEffect('egg-breathe');
    assert.ok(eggBreatheEffect, 'runtimeRegistration must register egg-breathe');
    assert.equal(eggBreatheEffect.kind, 'egg-breathe');
    assert.equal(eggBreatheEffect.lifecycle, 'continuous');
    assert.equal(eggBreatheEffect.layer, 'base');
    assert.deepEqual([...eggBreatheEffect.surfaces], ['*']);
    assert.equal(eggBreatheEffect.reducedMotion, 'simplify');
  });
});

test('egg-breathe: applyTransform delegates to the same compute function (via runtimeRegistration)', () => {
  withRuntimeRegistration(() => {
    const eggBreatheEffect = lookupEffect('egg-breathe');
    const fixture = EGG_BREATHE_FIXTURES[1];
    const viaApply = eggBreatheEffect.applyTransform({
      params: {},
      monster: fixture.seed,
      context: fixture.context,
    });
    assert.deepEqual(viaApply, fixture.expected);
  });
});
