// Continuous base-layer effect: hash-seeded idle float for caught monsters.
// Output is byte-identical to the original `monsterMotionStyle` helper.
// Stage-tier profiles select amplitude bands so older monsters drift more
// slowly while younger ones bob with sharper energy.
//
// The registered EffectSpec for `monster-motion-float` now lives in the
// `motion` effect template; this module hosts the pure compute helper the
// template calls back into.

import { hashString, valueBetween } from '../seed.js';

const STAGE_PROFILES = Object.freeze({
  1: { duration: [2.2, 4.1], lift: [8, 15], pan: [6, 13], scale: [1.006, 1.016], tilt: [1.2, 2.8] },
  2: { duration: [3.5, 6.1], lift: [6, 11], pan: [3.5, 8], scale: [1.006, 1.014], tilt: [0.7, 1.7] },
  3: { duration: [5.2, 8.4], lift: [3.5, 6.4], pan: [1.5, 4.6], scale: [1.003, 1.01], tilt: [0.3, 1] },
  4: { duration: [7.6, 11.8], lift: [5, 8.6], pan: [0.8, 3], scale: [1.022, 1.046], tilt: [0.1, 0.5] },
});

export function computeMonsterMotionStyle(seed, context = 'card') {
  const stage = Math.max(1, Math.min(4, Number(seed?.stage) || 1));
  const profile = STAGE_PROFILES[stage];
  const rawSeed = [
    seed?.id,
    seed?.species,
    seed?.branch || seed?.variant,
    stage,
    context,
  ].filter((part) => part != null && part !== '').join(':');
  const sizeFactor = context === 'feature' ? 1.18 : context === 'preview' ? 1.08 : 1;
  const durationFactor = context === 'feature' ? 1.06 : 1;
  const duration = valueBetween(
    hashString(`${rawSeed}:monster-duration`),
    profile.duration[0],
    profile.duration[1],
  ) * durationFactor;
  const delay = -valueBetween(hashString(`${rawSeed}:monster-phase`), 0.1, duration - 0.12);
  const direction = hashString(`${rawSeed}:monster-direction`) % 2 === 0 ? 1 : -1;
  const liftA = valueBetween(hashString(`${rawSeed}:monster-lift-a`), profile.lift[0], profile.lift[1]) * sizeFactor;
  const liftB = valueBetween(hashString(`${rawSeed}:monster-lift-b`), profile.lift[0] * 0.18, profile.lift[1] * 0.58) * sizeFactor;
  const panA = valueBetween(hashString(`${rawSeed}:monster-pan-a`), profile.pan[0], profile.pan[1]) * sizeFactor * direction;
  const panB = valueBetween(hashString(`${rawSeed}:monster-pan-b`), profile.pan[0] * 0.3, profile.pan[1] * 0.92) * sizeFactor * -direction;
  const scaleA = valueBetween(hashString(`${rawSeed}:monster-scale-a`), profile.scale[0], profile.scale[1]);
  const scaleB = valueBetween(hashString(`${rawSeed}:monster-scale-b`), 1.001, Math.max(1.002, profile.scale[0] - 0.002));
  const tiltA = valueBetween(hashString(`${rawSeed}:monster-tilt-a`), profile.tilt[0], profile.tilt[1]) * direction;
  const tiltB = valueBetween(hashString(`${rawSeed}:monster-tilt-b`), profile.tilt[0] * 0.2, profile.tilt[1] * 0.72) * -direction;

  return {
    '--monster-float-duration': `${duration.toFixed(2)}s`,
    '--monster-float-delay': `${delay.toFixed(2)}s`,
    '--monster-float-lift-a': `${liftA.toFixed(2)}px`,
    '--monster-float-lift-b': `${liftB.toFixed(2)}px`,
    '--monster-float-pan-a': `${panA.toFixed(2)}px`,
    '--monster-float-pan-b': `${panB.toFixed(2)}px`,
    '--monster-float-scale-a': scaleA.toFixed(3),
    '--monster-float-scale-b': scaleB.toFixed(3),
    '--monster-float-tilt-a': `${tiltA.toFixed(2)}deg`,
    '--monster-float-tilt-b': `${tiltB.toFixed(2)}deg`,
  };
}
