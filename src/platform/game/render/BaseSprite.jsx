// Inner sprite: renders the monster <img> with composed transform style.
// Kept thin so MonsterRender owns the layering decisions and BaseSprite
// owns the visible shell tokens (className, src, srcSet, alt, sizes).
//
// SH2-U10 CLS: declare an intrinsic aspect ratio via `width`/`height` so
// the browser reserves the box before the .webp decodes. Monster sprites
// are uniformly 1:1 across all branches (the assets pipeline in
// `scripts/generate-monster-assets.mjs` emits 320/640/1280 square
// variants), so `640 x 640` is a safe, cache-stable shape. The actual
// rendered size is driven by the CSS (`.codex-creature-image { width:
// 100%; }` etc.) combined with the responsive `sizes` attribute — the
// width/height attributes here only feed modern browsers' intrinsic-
// aspect-ratio reservation.
const MONSTER_SPRITE_INTRINSIC_DIMENSION = 640;

export function BaseSprite({ monster, sizes, style }) {
  const className = `codex-creature-image is-${monster.displayState}`;
  return (
    <img
      className={className}
      src={monster.img}
      srcSet={monster.srcSet}
      sizes={sizes != null ? sizes : monster.sizes}
      width={MONSTER_SPRITE_INTRINSIC_DIMENSION}
      height={MONSTER_SPRITE_INTRINSIC_DIMENSION}
      style={style}
      alt={monster.imageAlt}
    />
  );
}
