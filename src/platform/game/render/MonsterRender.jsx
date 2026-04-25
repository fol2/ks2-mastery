// Declarative monster renderer: composes registered effects via U1 and
// layers the result around <BaseSprite>. Trigger-agnostic — the caller
// decides which effects to mount; this component never reads mastery
// state or RNG. Transient (queue-shaped) effects belong in
// <CelebrationLayer>, not here, so we drop them with a dev-warn.

import { composeEffects, prefersReducedMotion, warnOnce } from './composition.js';
import { BaseSprite } from './BaseSprite.jsx';

// Numeric transform shorthands that callers may emit. We map each to its
// CSS form and assemble a `transform` string so multiple base effects can
// stack without each having to know about CSS variables.
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
  // translate*
  const unit = typeof value === 'number' ? 'px' : '';
  return `${key}(${value}${unit})`;
}

function mergeTransformStyle(baseEffects, monster, context) {
  const style = {};
  const transformPieces = [];
  for (const effect of baseEffects) {
    if (typeof effect.applyTransform !== 'function') continue;
    let result;
    try {
      result = effect.applyTransform({
        params: effect.params,
        monster,
        context,
      });
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
        // CSS-variable strings, arbitrary style props, or full strings
        // (e.g. `transform: 'translateY(2px) scale(1.01)'`) flow through
        // unchanged. Conflict resolution is "last in array wins" because
        // we just overwrite the same key.
        style[key] = value;
      }
    }
  }
  if (transformPieces.length > 0) {
    // Numeric pieces win over an inline `transform` string from a single
    // effect — but only if both arrived; with one source we keep its
    // value above. That's expected because we composed the pieces here.
    style.transform = transformPieces.join(' ');
  }
  return style;
}

export function MonsterRender({
  monster,
  stage: _stage,
  context = 'card',
  effects = [],
  sizes,
  reducedMotion,
}) {
  if (!monster) return null;

  // Fresh = uncaught placeholder; effects do not apply.
  if (monster.displayState === 'fresh') {
    return (
      <span className="codex-unknown" role="img" aria-label={monster.imageAlt}>
        {monster.placeholder || '?'}
      </span>
    );
  }

  const motionPreferred = typeof reducedMotion === 'boolean'
    ? reducedMotion
    : prefersReducedMotion();

  const composed = composeEffects({
    effects,
    monster,
    context,
    reducedMotion: motionPreferred,
  });

  // Transient effects belong in <CelebrationLayer>. We drop after
  // composeEffects resolves descriptors so the real-world case — caller
  // passes only `{ kind }` — is caught using the registered lifecycle.
  const dropTransient = (entries, layerName) => entries.filter((effect) => {
    if (effect.lifecycle !== 'transient') return true;
    warnOnce(
      `transient-in-monster-render:${effect.kind}`,
      `MonsterRender: dropping transient effect "${effect.kind}" from ${layerName}; `
      + 'use <CelebrationLayer>',
    );
    return false;
  });
  const base = dropTransient(composed.base, 'base');
  const overlay = dropTransient(composed.overlay, 'overlay');

  const baseStyle = mergeTransformStyle(base, monster, context);

  return (
    <>
      <BaseSprite
        monster={monster}
        sizes={sizes}
        style={Object.keys(baseStyle).length > 0 ? baseStyle : undefined}
      />
      {overlay.map((effect) => {
        if (typeof effect.render !== 'function') return null;
        let node;
        try {
          node = effect.render({
            params: effect.params,
            monster,
            context,
            // composeEffects() flags entries with `simplified: true` when
            // reducedMotion === 'simplify'. Effects use this to swap
            // animations for static fallbacks.
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
        // Stable key keeps reconciliation happy when overlays change order.
        return <Wrap key={effect.kind}>{node}</Wrap>;
      })}
    </>
  );
}

// Tiny wrapper so the overlay node reuses its own root. We do not inject
// extra DOM — the effect's returned JSX is the entire overlay.
function Wrap({ children }) {
  return children;
}
