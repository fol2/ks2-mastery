import { defineEffect } from '../define-effect.js';
import { resolveMonsterColour } from './palette.js';

export const rareGlowEffect = defineEffect({
  kind: 'rare-glow',
  lifecycle: 'persistent',
  layer: 'overlay',
  surfaces: ['codex', 'lightbox', 'home'],
  reducedMotion: 'simplify',
  exclusiveGroup: 'rarity',
  zIndex: 8,
  params: {
    intensity: { type: 'number', default: 0.5, min: 0, max: 1 },
    palette: { type: 'enum', default: 'pale', values: ['accent', 'secondary', 'pale'] },
  },
  render({ params, monster, simplified }) {
    return (
      <span
        className={simplified ? 'fx fx-rare-glow is-simplified' : 'fx fx-rare-glow'}
        style={{
          '--fx-rare-intensity': params.intensity,
          '--fx-rare-color': resolveMonsterColour(monster, params.palette, 'rare-glow'),
        }}
        aria-hidden="true"
      />
    );
  },
});
