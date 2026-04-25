// `aura` template: covers the `mega-aura` overlay. Reads `monster.accent`
// + `monster.secondary` and emits a single `fx fx-mega-aura` span carrying
// the intensity + dual-colour CSS variables the existing stylesheet reads.

import { createElement } from 'react';
import { TEMPLATE_PARAM_SCHEMAS } from './param-schemas.js';

export default {
  id: 'aura',
  paramSchema: TEMPLATE_PARAM_SCHEMAS.aura,
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
    return {
      kind,
      lifecycle,
      layer,
      surfaces: [...(surfaces || ['codex', 'lightbox', 'home'])],
      reducedMotion,
      zIndex: typeof zIndex === 'number' ? zIndex : 0,
      exclusiveGroup: exclusiveGroup ?? null,
      params: params || {},
      render({ params: liveParams, monster, simplified }) {
        const accent = (monster && monster.accent) || 'currentColor';
        const secondary = (monster && monster.secondary) || accent;
        const className = simplified ? 'fx fx-mega-aura is-simplified' : 'fx fx-mega-aura';
        return createElement('span', {
          className,
          style: {
            '--fx-mega-intensity': liveParams.intensity,
            '--fx-mega-color-a': accent,
            '--fx-mega-color-b': secondary,
          },
          'aria-hidden': 'true',
        });
      },
    };
  },
};
