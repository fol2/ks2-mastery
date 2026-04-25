// `sparkle` template: covers the `shiny` overlay. Renders a single
// `fx fx-shiny` span with intensity + colour CSS variables resolved from
// the monster's palette.
//
// We use `React.createElement` directly rather than JSX so the module loads
// cleanly under plain `node --test` without a JSX transform, matching the
// approach used elsewhere when a render-bearing module needs Node-side
// reachability (e.g. lookups in the template registry's index module).

import { createElement } from 'react';
import { resolveMonsterColour } from '../effects/palette.js';

export default {
  id: 'sparkle',
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
          className: simplified ? 'fx fx-shiny is-simplified' : 'fx fx-shiny',
          style: {
            '--fx-shiny-intensity': liveParams.intensity,
            '--fx-shiny-color': resolveMonsterColour(monster, liveParams.palette, kind),
          },
          'aria-hidden': 'true',
        });
      },
    };
  },
};
