// Persistent overlay: sparkle layer using monster.accent (or palette
// override). Shares the `rarity` exclusive group with `rare-glow` so a
// monster cannot wear two rarity treatments at once.

import { defineEffect } from '../define-effect.js';
import { registerEffect } from '../registry.js';
import { warnOnce } from '../composition.js';

function resolveColour(monster, palette) {
  // The enum is validated upstream; defensive fallback keeps render() pure.
  const direct = monster && palette ? monster[palette] : null;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  if (palette && palette !== 'accent') {
    warnOnce(
      `shiny-palette-missing:${palette}`,
      `effect "shiny": monster missing palette "${palette}", falling back to accent`,
    );
  }
  return (monster && monster.accent) || 'currentColor';
}

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
    const colour = resolveColour(monster, params.palette);
    const className = simplified ? 'fx fx-shiny is-simplified' : 'fx fx-shiny';
    return (
      <span
        className={className}
        style={{
          '--fx-shiny-intensity': params.intensity,
          '--fx-shiny-color': colour,
        }}
        aria-hidden="true"
      />
    );
  },
});

registerEffect(shinyEffect);
