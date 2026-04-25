// Persistent overlay: radiating rays + slow rotation, accent + secondary.
// No exclusiveGroup — composes freely with shiny / rare-glow.

import { defineEffect } from '../define-effect.js';
import { registerEffect } from '../registry.js';

export const megaAuraEffect = defineEffect({
  kind: 'mega-aura',
  lifecycle: 'persistent',
  layer: 'overlay',
  surfaces: ['codex', 'lightbox', 'home'],
  reducedMotion: 'simplify',
  zIndex: 12,
  params: {
    intensity: { type: 'number', default: 0.8, min: 0, max: 1 },
  },
  render({ params, monster, simplified }) {
    const accent = (monster && monster.accent) || 'currentColor';
    const secondary = (monster && monster.secondary) || accent;
    const className = simplified ? 'fx fx-mega-aura is-simplified' : 'fx fx-mega-aura';
    return (
      <span
        className={className}
        style={{
          '--fx-mega-intensity': params.intensity,
          '--fx-mega-color-a': accent,
          '--fx-mega-color-b': secondary,
        }}
        aria-hidden="true"
      />
    );
  },
});

registerEffect(megaAuraEffect);
