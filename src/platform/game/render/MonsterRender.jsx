import { Fragment, useMemo } from 'react';
import { composeEffects, prefersReducedMotion, warnOnce } from './composition.js';
import { BaseSprite } from './BaseSprite.jsx';

const TRANSFORM_KEYS = new Set([
  'translateX', 'translateY', 'translateZ',
  'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'scale', 'scaleX', 'scaleY',
  'skewX', 'skewY',
]);

function formatTransformPiece(key, value) {
  if (key === 'scale' || key === 'scaleX' || key === 'scaleY') {
    return `${key}(${value})`;
  }
  if (key.startsWith('rotate') || key.startsWith('skew')) {
    const unit = typeof value === 'number' ? 'deg' : '';
    return `${key}(${value}${unit})`;
  }
  const unit = typeof value === 'number' ? 'px' : '';
  return `${key}(${value}${unit})`;
}

function mergeTransformStyle(baseEffects, monster, context) {
  if (baseEffects.length === 0) return undefined;
  const style = {};
  const transformPieces = [];
  for (const effect of baseEffects) {
    if (typeof effect.applyTransform !== 'function') continue;
    let result;
    try {
      result = effect.applyTransform({ params: effect.params, monster, context });
    } catch (_err) {
      warnOnce(
        `apply-transform-throw:${effect.kind}`,
        `effect "${effect.kind}" applyTransform threw; skipping`,
      );
      continue;
    }
    if (!result || typeof result !== 'object') continue;
    for (const [key, value] of Object.entries(result)) {
      if (value == null) continue;
      if (TRANSFORM_KEYS.has(key)) {
        transformPieces.push(formatTransformPiece(key, value));
      } else {
        // CSS-variable strings and full transform strings flow through
        // unchanged; numeric pieces are reassembled below.
        style[key] = value;
      }
    }
  }
  if (transformPieces.length > 0) {
    style.transform = transformPieces.join(' ');
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function dropTransient(entries, layerName) {
  let needsFilter = false;
  for (const effect of entries) {
    if (effect.lifecycle === 'transient') {
      warnOnce(
        `transient-in-monster-render:${effect.kind}`,
        `MonsterRender: dropping transient effect "${effect.kind}" from ${layerName}; `
        + 'use <CelebrationLayer>',
      );
      needsFilter = true;
    }
  }
  return needsFilter ? entries.filter((e) => e.lifecycle !== 'transient') : entries;
}

export function MonsterRender({
  monster,
  context = 'card',
  effects = [],
  sizes,
  reducedMotion,
}) {
  const motionPreferred = typeof reducedMotion === 'boolean'
    ? reducedMotion
    : prefersReducedMotion();

  // Hot path: codex renders 16+ tiles. We memoise on the inputs that change
  // output — the monster object identity is stable per tile; .id and
  // .displayState cover the cases where a parent swaps which monster a tile
  // shows or transitions egg → monster.
  const composed = useMemo(
    () => composeEffects({ effects, monster: monster || {}, context, reducedMotion: motionPreferred }),
    [effects, monster?.id, monster?.displayState, context, motionPreferred],
  );
  const base = useMemo(() => dropTransient(composed.base, 'base'), [composed.base]);
  const overlay = useMemo(() => dropTransient(composed.overlay, 'overlay'), [composed.overlay]);
  const baseStyle = useMemo(
    () => mergeTransformStyle(base, monster, context),
    [base, monster?.id, context],
  );

  if (!monster) return null;

  if (monster.displayState === 'fresh') {
    return (
      <span className="codex-unknown" role="img" aria-label={monster.imageAlt}>
        {monster.placeholder || '?'}
      </span>
    );
  }

  return (
    <>
      <BaseSprite monster={monster} sizes={sizes} style={baseStyle} />
      {overlay.map((effect) => {
        if (typeof effect.render !== 'function') return null;
        let node;
        try {
          node = effect.render({
            params: effect.params,
            monster,
            context,
            simplified: effect.simplified === true,
          });
        } catch (_err) {
          warnOnce(
            `overlay-render-throw:${effect.kind}`,
            `effect "${effect.kind}" render threw; dropping overlay`,
          );
          return null;
        }
        if (node == null) return null;
        return <Fragment key={effect.kind}>{node}</Fragment>;
      })}
    </>
  );
}
