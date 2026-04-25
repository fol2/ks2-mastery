import { warnOnce } from '../composition.js';

// Resolves a colour from a monster palette key. Falls back to
// monster.accent (with a dev-warn) when the requested key is missing or
// empty. The enum is validated upstream so this only guards against
// monsters that lack the optional secondary/pale slots.
export function resolveMonsterColour(monster, palette, effectKind) {
  const direct = monster && palette ? monster[palette] : null;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  if (palette && palette !== 'accent') {
    warnOnce(
      `${effectKind}-palette-missing:${palette}`,
      `effect "${effectKind}": monster missing palette "${palette}", falling back to accent`,
    );
  }
  return (monster && monster.accent) || 'currentColor';
}
