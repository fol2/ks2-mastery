import { defineEffect } from '../define-effect.js';
import { registerEffect } from '../registry.js';
import { resolveMonsterColour } from './palette.js';

export const shinyEffect = defineEffect({
  kind: 'shiny',
  lifecycle: 'persistent',
  layer: 'overlay',
  surfaces: ['codex', 'lightbox', 'home'],
  reducedMotion: 'simplify',
  exclusiveGroup: 'rarity',
  zIndex: 10,
  params: {
    intensity: { type: 'number', default: 0.6, min: 0, max: 1 },
    palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
  },
  render({ params, monster, simplified }) {
    return (
      <span
        className={simplified ? 'fx fx-shiny is-simplified' : 'fx fx-shiny'}
        style={{
          '--fx-shiny-intensity': params.intensity,
          '--fx-shiny-color': resolveMonsterColour(monster, params.palette, 'shiny'),
        }}
        aria-hidden="true"
      />
    );
  },
});

registerEffect(shinyEffect);
