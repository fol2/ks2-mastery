// `aura` template: covers the `mega-aura` overlay. Reads `monster.accent`
// + `monster.secondary` and emits a single `fx fx-mega-aura` span carrying
// the intensity + dual-colour CSS variables the existing stylesheet reads.

import { createElement } from 'react';

export default {
  id: 'aura',
  paramSchema: {
    intensity: { type: 'number', default: 0.8, min: 0, max: 1 },
  },
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
