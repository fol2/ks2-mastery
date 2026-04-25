// `motion` template: covers `egg-breathe` and `monster-motion-float`.
//
// Both code-registered effects compute a CSS-variable bag from a hash-seeded
// monster identity. The template selects which compute by the catalog
// entry's `kind` so per-monster bindings flow through unchanged.

import {
  computeEggBreatheStyle,
} from '../effects/egg-breathe.js';
import {
  computeMonsterMotionStyle,
} from '../effects/monster-motion-float.js';

const MOTION_KIND_HANDLERS = {
  'egg-breathe': computeEggBreatheStyle,
  'monster-motion-float': computeMonsterMotionStyle,
};

export default {
  id: 'motion',
  paramSchema: {},
  buildEffectSpec({
    kind,
    lifecycle,
    layer,
    surfaces,
    reducedMotion,
    zIndex,
    exclusiveGroup,
    params,
  }) {
    const compute = MOTION_KIND_HANDLERS[kind] || computeMonsterMotionStyle;
    return {
      kind,
      lifecycle,
      layer,
      surfaces: [...(surfaces || ['*'])],
      reducedMotion,
      zIndex: typeof zIndex === 'number' ? zIndex : 0,
      exclusiveGroup: exclusiveGroup ?? null,
      params: params || {},
      applyTransform({ monster, context }) {
        return compute(monster, context);
      },
    };
  },
};
