import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMonsterMotionStyle,
  monsterMotionFloatEffect,
} from '../src/platform/game/render/effects/monster-motion-float.js';

// Fixtures captured from the original `monsterMotionStyle` helper before
// the port. Byte-identity proves stage profiles + hash seeding survive.
const MOTION_FIXTURES = [
  {
    label: 'inklet stage 1 card',
    seed: { id: 'inklet', stage: 1 },
    context: 'card',
    expected: {
      '--monster-float-duration': '2.45s',
      '--monster-float-delay': '-1.39s',
      '--monster-float-lift-a': '12.79px',
      '--monster-float-lift-b': '6.32px',
      '--monster-float-pan-a': '-8.82px',
      '--monster-float-pan-b': '5.93px',
      '--monster-float-scale-a': '1.009',
      '--monster-float-scale-b': '1.002',
      '--monster-float-tilt-a': '-2.22deg',
      '--monster-float-tilt-b': '1.38deg',
    },
  },
  {
    label: 'inklet stage 1 feature',
    seed: { id: 'inklet', stage: 1 },
    context: 'feature',
    expected: {
      '--monster-float-duration': '3.10s',
      '--monster-float-delay': '-2.66s',
      '--monster-float-lift-a': '12.89px',
      '--monster-float-lift-b': '5.31px',
      '--monster-float-pan-a': '-9.95px',
      '--monster-float-pan-b': '6.15px',
      '--monster-float-scale-a': '1.009',
      '--monster-float-scale-b': '1.002',
      '--monster-float-tilt-a': '-1.81deg',
      '--monster-float-tilt-b': '0.90deg',
    },
  },
  {
    label: 'inklet stage 1 preview',
    seed: { id: 'inklet', stage: 1 },
    context: 'preview',
    expected: {
      '--monster-float-duration': '4.09s',
      '--monster-float-delay': '-1.69s',
      '--monster-float-lift-a': '14.26px',
      '--monster-float-lift-b': '7.29px',
      '--monster-float-pan-a': '-7.51px',
      '--monster-float-pan-b': '3.48px',
      '--monster-float-scale-a': '1.008',
      '--monster-float-scale-b': '1.002',
      '--monster-float-tilt-a': '-2.31deg',
      '--monster-float-tilt-b': '1.48deg',
    },
  },
  {
    label: 'inklet stage 2 card',
    seed: { id: 'inklet', stage: 2 },
    context: 'card',
    expected: {
      '--monster-float-duration': '4.85s',
      '--monster-float-delay': '-4.45s',
      '--monster-float-lift-a': '9.23px',
      '--monster-float-lift-b': '4.56px',
      '--monster-float-pan-a': '7.40px',
      '--monster-float-pan-b': '-6.59px',
      '--monster-float-scale-a': '1.007',
      '--monster-float-scale-b': '1.001',
      '--monster-float-tilt-a': '1.43deg',
      '--monster-float-tilt-b': '-0.93deg',
    },
  },
  {
    label: 'inklet stage 2 feature',
    seed: { id: 'inklet', stage: 2 },
    context: 'feature',
    expected: {
      '--monster-float-duration': '5.86s',
      '--monster-float-delay': '-3.67s',
      '--monster-float-lift-a': '10.23px',
      '--monster-float-lift-b': '4.69px',
      '--monster-float-pan-a': '7.17px',
      '--monster-float-pan-b': '-5.59px',
      '--monster-float-scale-a': '1.010',
      '--monster-float-scale-b': '1.003',
      '--monster-float-tilt-a': '1.14deg',
      '--monster-float-tilt-b': '-0.61deg',
    },
  },
  {
    label: 'inklet stage 2 preview',
    seed: { id: 'inklet', stage: 2 },
    context: 'preview',
    expected: {
      '--monster-float-duration': '4.52s',
      '--monster-float-delay': '-2.52s',
      '--monster-float-lift-a': '9.63px',
      '--monster-float-lift-b': '4.48px',
      '--monster-float-pan-a': '6.65px',
      '--monster-float-pan-b': '-5.13px',
      '--monster-float-scale-a': '1.009',
      '--monster-float-scale-b': '1.002',
      '--monster-float-tilt-a': '1.17deg',
      '--monster-float-tilt-b': '-0.67deg',
    },
  },
  {
    label: 'inklet stage 3 card',
    seed: { id: 'inklet', stage: 3 },
    context: 'card',
    expected: {
      '--monster-float-duration': '5.78s',
      '--monster-float-delay': '-3.16s',
      '--monster-float-lift-a': '5.68px',
      '--monster-float-lift-b': '2.96px',
      '--monster-float-pan-a': '-2.50px',
      '--monster-float-pan-b': '1.62px',
      '--monster-float-scale-a': '1.005',
      '--monster-float-scale-b': '1.001',
      '--monster-float-tilt-a': '-0.60deg',
      '--monster-float-tilt-b': '0.34deg',
    },
  },
  {
    label: 'inklet stage 3 feature',
    seed: { id: 'inklet', stage: 3 },
    context: 'feature',
    expected: {
      '--monster-float-duration': '6.68s',
      '--monster-float-delay': '-6.29s',
      '--monster-float-lift-a': '6.58px',
      '--monster-float-lift-b': '3.31px',
      '--monster-float-pan-a': '-2.22px',
      '--monster-float-pan-b': '1.09px',
      '--monster-float-scale-a': '1.009',
      '--monster-float-scale-b': '1.002',
      '--monster-float-tilt-a': '-0.77deg',
      '--monster-float-tilt-b': '0.51deg',
    },
  },
  {
    label: 'inklet stage 3 preview',
    seed: { id: 'inklet', stage: 3 },
    context: 'preview',
    expected: {
      '--monster-float-duration': '7.73s',
      '--monster-float-delay': '-7.11s',
      '--monster-float-lift-a': '6.13px',
      '--monster-float-lift-b': '3.19px',
      '--monster-float-pan-a': '-3.98px',
      '--monster-float-pan-b': '3.32px',
      '--monster-float-scale-a': '1.008',
      '--monster-float-scale-b': '1.002',
      '--monster-float-tilt-a': '-0.90deg',
      '--monster-float-tilt-b': '0.62deg',
    },
  },
  {
    label: 'inklet stage 4 card',
    seed: { id: 'inklet', stage: 4 },
    context: 'card',
    expected: {
      '--monster-float-duration': '10.99s',
      '--monster-float-delay': '-1.96s',
      '--monster-float-lift-a': '5.40px',
      '--monster-float-lift-b': '1.34px',
      '--monster-float-pan-a': '2.47px',
      '--monster-float-pan-b': '-2.14px',
      '--monster-float-scale-a': '1.033',
      '--monster-float-scale-b': '1.010',
      '--monster-float-tilt-a': '0.22deg',
      '--monster-float-tilt-b': '-0.13deg',
    },
  },
  {
    label: 'inklet stage 4 feature',
    seed: { id: 'inklet', stage: 4 },
    context: 'feature',
    expected: {
      '--monster-float-duration': '9.59s',
      '--monster-float-delay': '-8.98s',
      '--monster-float-lift-a': '6.58px',
      '--monster-float-lift-b': '1.81px',
      '--monster-float-pan-a': '1.69px',
      '--monster-float-pan-b': '-1.13px',
      '--monster-float-scale-a': '1.030',
      '--monster-float-scale-b': '1.008',
      '--monster-float-tilt-a': '0.38deg',
      '--monster-float-tilt-b': '-0.27deg',
    },
  },
  {
    label: 'inklet stage 4 preview',
    seed: { id: 'inklet', stage: 4 },
    context: 'preview',
    expected: {
      '--monster-float-duration': '8.86s',
      '--monster-float-delay': '-3.22s',
      '--monster-float-lift-a': '7.21px',
      '--monster-float-lift-b': '3.08px',
      '--monster-float-pan-a': '1.82px',
      '--monster-float-pan-b': '-1.39px',
      '--monster-float-scale-a': '1.028',
      '--monster-float-scale-b': '1.005',
      '--monster-float-tilt-a': '0.14deg',
      '--monster-float-tilt-b': '-0.05deg',
    },
  },
];

test('monster-motion-float: fixture parity (happy path) — inklet stage 1 card', () => {
  const fixture = MOTION_FIXTURES[0];
  assert.deepEqual(
    computeMonsterMotionStyle(fixture.seed, fixture.context),
    fixture.expected,
  );
});

test('monster-motion-float: fixture parity across all stages × contexts', () => {
  for (const fixture of MOTION_FIXTURES) {
    assert.deepEqual(
      computeMonsterMotionStyle(fixture.seed, fixture.context),
      fixture.expected,
      `parity failed for ${fixture.label}`,
    );
  }
});

test('monster-motion-float: edge case — invalid stage (99) clamps to [1, 4]', () => {
  // Stage 99 must clamp to stage 4 → byte-identical to the stage 4 card fixture.
  const stage4Card = MOTION_FIXTURES.find((entry) => entry.label === 'inklet stage 4 card');
  assert.ok(stage4Card, 'fixture for stage 4 card missing');
  assert.deepEqual(
    computeMonsterMotionStyle({ id: 'inklet', stage: 99 }, 'card'),
    stage4Card.expected,
  );
});

test('monster-motion-float: edge case — stage falsy (0/null/undefined) clamps to 1', () => {
  const stage1Card = MOTION_FIXTURES.find((entry) => entry.label === 'inklet stage 1 card');
  assert.ok(stage1Card, 'fixture for stage 1 card missing');
  for (const fallback of [0, null, undefined, 'not-a-number']) {
    assert.deepEqual(
      computeMonsterMotionStyle({ id: 'inklet', stage: fallback }, 'card'),
      stage1Card.expected,
      `fallback stage ${String(fallback)} did not clamp to 1`,
    );
  }
});

test('monster-motion-float: descriptor metadata matches contract', () => {
  assert.equal(monsterMotionFloatEffect.kind, 'monster-motion-float');
  assert.equal(monsterMotionFloatEffect.lifecycle, 'continuous');
  assert.equal(monsterMotionFloatEffect.layer, 'base');
  assert.deepEqual([...monsterMotionFloatEffect.surfaces], ['*']);
  assert.equal(monsterMotionFloatEffect.reducedMotion, 'simplify');
});

test('monster-motion-float: applyTransform delegates to the same compute function', () => {
  const fixture = MOTION_FIXTURES[3];
  const viaApply = monsterMotionFloatEffect.applyTransform({
    params: {},
    monster: fixture.seed,
    context: fixture.context,
  });
  assert.deepEqual(viaApply, fixture.expected);
});
