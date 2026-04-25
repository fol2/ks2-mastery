// Continuous base-layer effect: hash-seeded breathing for unhatched eggs.
// Output is byte-identical to the original `eggBreatheStyle` helper that
// used to live in `src/surfaces/home/data.js` — surface stylesheets read
// the same `--egg-breathe-*` CSS variables.
//
// The registered EffectSpec for `egg-breathe` now lives in the `motion`
// effect template (`../effect-templates/motion.js`) which calls back into
// `computeEggBreatheStyle()` below. This module exists solely to host that
// pure compute helper.

import { hashString, valueBetween } from '../seed.js';

// Pure compute: shared by the `motion` template's applyTransform and any
// future caller that needs the CSS-variable bag without going through the
// effect registry.
export function computeEggBreatheStyle(seed, context = 'card') {
  const rawSeed = typeof seed === 'string'
    ? seed
    : [
      seed?.id,
      seed?.species,
      seed?.branch || seed?.variant,
      seed?.stage,
      context,
    ].filter((part) => part != null && part !== '').join(':');
  const durationMin = context === 'feature' ? 6.6 : 5.8;
  const durationMax = context === 'feature' ? 8.3 : 7.4;
  const liftMin = context === 'feature' ? 3 : 2.4;
  const liftMax = context === 'feature' ? 5 : 4.2;
  const duration = valueBetween(hashString(`${rawSeed}:duration`), durationMin, durationMax);
  const delay = -valueBetween(hashString(`${rawSeed}:phase`), 0.25, duration - 0.2);
  const lift = -valueBetween(hashString(`${rawSeed}:lift`), liftMin, liftMax);
  const scale = valueBetween(hashString(`${rawSeed}:scale`), 1.007, 1.014);

  return {
    '--egg-breathe-duration': `${duration.toFixed(2)}s`,
    '--egg-breathe-delay': `${delay.toFixed(2)}s`,
    '--egg-breathe-lift': `${lift.toFixed(2)}px`,
    '--egg-breathe-scale': scale.toFixed(3),
  };
}
