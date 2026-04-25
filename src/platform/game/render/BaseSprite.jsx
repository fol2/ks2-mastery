// Inner sprite: renders the monster <img> with composed transform style.
// Kept thin so MonsterRender owns the layering decisions and BaseSprite
// owns the visible shell tokens (className, src, srcSet, alt, sizes).

export function BaseSprite({ monster, sizes, style }) {
  const className = `codex-creature-image is-${monster.displayState}`;
  return (
    <img
      className={className}
      src={monster.img}
      srcSet={monster.srcSet}
      sizes={sizes != null ? sizes : monster.sizes}
      style={style}
      alt={monster.imageAlt}
    />
  );
}
