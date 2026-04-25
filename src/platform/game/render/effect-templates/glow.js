// `glow` template: generic intensity + palette overlay. No bundled effect
// uses this template today — it exists for admin-defined effects whose
// rendered DOM should resemble `sparkle` but live under a different
// `fx-glow` class so future stylesheets can theme them independently.

import { createElement } from 'react';
import { resolveMonsterColour } from '../effects/palette.js';

export default {
  id: 'glow',
  paramSchema: {
    intensity: { type: 'number', default: 0.6, min: 0, max: 1 },
    palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
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
        return createElement('span', {
          className: simplified ? 'fx fx-glow is-simplified' : 'fx fx-glow',
          style: {
            '--fx-glow-intensity': liveParams.intensity,
            '--fx-glow-color': resolveMonsterColour(monster, liveParams.palette, kind),
          },
          'aria-hidden': 'true',
        });
      },
    };
  },
};
