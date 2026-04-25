import React from 'react';
import { MonsterRender } from '../../platform/game/render/MonsterRender.jsx';
import { useMonsterVisualConfig } from '../../platform/game/MonsterVisualConfigContext.jsx';
import { resolveMonsterVisual } from '../../platform/game/monster-visual-config.js';
import { monsterVisualFrameStyle, monsterVisualMotionStyle } from '../../platform/game/monster-visual-style.js';

// Effect resolution is now <MonsterRender>'s job (U4): it reads bindings from
// MonsterEffectConfigContext when mounted, otherwise falls back to its
// per-displayState defaults (egg-breathe / monster-motion-float). The
// runtime calls `runtimeRegistration()` at app boot, so both fallback kinds
// are already in the registry by the time this surface renders.

export function CodexCreatureTrigger({ entry, sizes, context = 'card', onPreview }) {
  if (!entry.caught) {
    return <CodexCreatureVisual entry={entry} sizes={sizes} context={context} />;
  }

  return (
    <button
      type="button"
      className={`codex-creature-button is-${context}`}
      aria-label={`View ${entry.name} full screen`}
      onClick={() => onPreview(entry)}
    >
      <CodexCreatureVisual entry={entry} sizes={sizes} context={context} />
    </button>
  );
}

export function CodexCreatureVisual({ entry, sizes, context = 'card' }) {
  const monsterVisualConfig = useMonsterVisualConfig();

  if (entry.displayState === 'fresh') {
    return (
      <span className="codex-unknown" role="img" aria-label={entry.imageAlt}>
        {entry.placeholder || '?'}
      </span>
    );
  }

  const visual = resolveMonsterVisual({
    monsterId: entry.id,
    branch: entry.branch,
    stage: entry.stage,
    context: codexVisualContext(context),
    config: monsterVisualConfig?.config,
    preferredSize: preferredMonsterImageSize(context),
  });

  // The resolved visual config picks a higher-resolution / variant-aware
  // asset than the entry default; fold it back into the monster object so
  // <BaseSprite> picks up src/srcSet without us forking its rendering.
  const monsterForRender = visual.src || visual.srcSet
    ? { ...entry, img: visual.src || entry.img, srcSet: visual.srcSet || entry.srcSet }
    : entry;

  return (
    <span
      className="codex-creature-visual"
      style={monsterVisualFrameStyle(visual)}
    >
      <MonsterRender
        monster={monsterForRender}
        context={context}
        sizes={sizes}
        extraStyle={monsterVisualMotionStyle(visual)}
      />
    </span>
  );
}

function codexVisualContext(context) {
  if (context === 'feature') return 'codexFeature';
  if (context === 'preview') return 'lightbox';
  return 'codexCard';
}

function preferredMonsterImageSize(context) {
  if (context === 'card' || context === 'feature' || context === 'preview') return 1280;
  return 640;
}
