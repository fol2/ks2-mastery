import { Fragment, useMemo } from 'react';
import { composeEffects, prefersReducedMotion, warnOnce } from './composition.js';
import { BaseSprite } from './BaseSprite.jsx';
import { useMonsterEffectConfig } from '../MonsterEffectConfigContext.jsx';

// Per-displayState fallback effects. Used when the caller does not pass an
// explicit `effects` prop AND no provider-supplied binding row exists for
// the asset. Mirrors the legacy CodexCreature behaviour byte-for-byte so
// surfaces without an effect-config provider keep today's animation.
const EGG_FALLBACK_EFFECTS = Object.freeze([{ kind: 'egg-breathe' }]);
const MONSTER_FALLBACK_EFFECTS = Object.freeze([{ kind: 'monster-motion-float' }]);
const EMPTY_EFFECTS = Object.freeze([]);

function fallbackEffectsForState(displayState) {
  if (displayState === 'egg') return EGG_FALLBACK_EFFECTS;
  if (displayState === 'monster') return MONSTER_FALLBACK_EFFECTS;
  return EMPTY_EFFECTS;
}

function bindingsToEffects(row) {
  // Synthesise a flat list per the plan: continuous first so transforms apply
  // beneath any persistent overlays. Both slots are arrays in the schema.
  if (!row) return null;
  const continuous = Array.isArray(row.continuous) ? row.continuous : [];
  const persistent = Array.isArray(row.persistent) ? row.persistent : [];
  if (continuous.length === 0 && persistent.length === 0) return EMPTY_EFFECTS;
  return [...continuous, ...persistent];
}

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
  effects,
  sizes,
  reducedMotion,
  extraStyle,
}) {
  const motionPreferred = typeof reducedMotion === 'boolean'
    ? reducedMotion
    : prefersReducedMotion();

  // Effect-config context resolution. When the caller supplies `effects`
  // explicitly we honour it (existing behaviour, used by tests + callers
  // that want to bypass config). When omitted, we read bindings from the
  // provider; if no provider OR no binding row, fall through to the
  // per-displayState default that reproduces today's CodexCreature output.
  const effectConfig = useMonsterEffectConfig();
  const resolvedEffects = useMemo(() => {
    if (effects !== undefined) return effects;
    if (!monster) return EMPTY_EFFECTS;
    if (effectConfig && effectConfig.bindings) {
      const assetKey = `${monster.id}-${monster.branch || 'b1'}-${monster.stage}`;
      const fromBindings = bindingsToEffects(effectConfig.bindings[assetKey]);
      if (fromBindings) return fromBindings;
    }
    return fallbackEffectsForState(monster.displayState);
  }, [effects, effectConfig, monster?.id, monster?.branch, monster?.stage, monster?.displayState]);

  // Hot path: codex renders 16+ tiles. We memoise on the inputs that change
  // output — the monster object identity is stable per tile; .id and
  // .displayState cover the cases where a parent swaps which monster a tile
  // shows or transitions egg → monster.
  const composed = useMemo(
    () => composeEffects({ effects: resolvedEffects, monster: monster || {}, context, reducedMotion: motionPreferred }),
    [resolvedEffects, monster?.id, monster?.displayState, context, motionPreferred],
  );
  const base = useMemo(() => dropTransient(composed.base, 'base'), [composed.base]);
  const overlay = useMemo(() => dropTransient(composed.overlay, 'overlay'), [composed.overlay]);
  // applyTransform reads stage/species/branch/variant for FNV seeding and
  // stage-tier profile lookup, so all four belong in the deps. id alone is
  // not enough — already-caught monsters keep displayState='monster' across
  // every stage transition, so the cache would otherwise hold stale motion.
  // `extraStyle` (from a caller's monster-visual-config or similar) is
  // spread last so per-monster overrides win over effect-derived defaults.
  const baseStyle = useMemo(
    () => {
      const fromEffects = mergeTransformStyle(base, monster, context);
      if (!extraStyle) return fromEffects;
      return { ...(fromEffects || {}), ...extraStyle };
    },
    [
      base,
      monster?.id,
      monster?.stage,
      monster?.species,
      monster?.branch,
      monster?.variant,
      context,
      extraStyle,
    ],
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
