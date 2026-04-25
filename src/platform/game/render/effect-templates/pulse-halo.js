// `pulse-halo` template: covers the `rare-glow` overlay. Renders a single
// `fx fx-rare-glow` span with intensity + palette-resolved colour.

import { createElement } from 'react';
import { resolveMonsterColour } from '../effects/palette.js';
import { TEMPLATE_PARAM_SCHEMAS } from './param-schemas.js';

export default {
  id: 'pulse-halo',
  paramSchema: TEMPLATE_PARAM_SCHEMAS['pulse-halo'],
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
          className: simplified ? 'fx fx-rare-glow is-simplified' : 'fx fx-rare-glow',
          style: {
            '--fx-rare-intensity': liveParams.intensity,
            '--fx-rare-color': resolveMonsterColour(monster, liveParams.palette, kind),
          },
          'aria-hidden': 'true',
        });
      },
    };
  },
};
