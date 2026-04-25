// Persistent overlay: soft pulsing halo using `pale` (with safe accent
// fallback). Shares the `rarity` exclusive group with `shiny`.

import { defineEffect } from '../define-effect.js';
import { registerEffect } from '../registry.js';
import { warnOnce } from '../composition.js';

function resolveColour(monster, palette) {
  const direct = monster && palette ? monster[palette] : null;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  if (palette && palette !== 'accent') {
    warnOnce(
      `rare-glow-palette-missing:${palette}`,
      `effect "rare-glow": monster missing palette "${palette}", falling back to accent`,
    );
  }
  return (monster && monster.accent) || 'currentColor';
}

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
    const colour = resolveColour(monster, params.palette);
    const className = simplified ? 'fx fx-rare-glow is-simplified' : 'fx fx-rare-glow';
    return (
      <span
        className={className}
        style={{
          '--fx-rare-intensity': params.intensity,
          '--fx-rare-color': colour,
        }}
        aria-hidden="true"
      />
    );
  },
});

registerEffect(rareGlowEffect);
