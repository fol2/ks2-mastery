import React from 'react';
import { useMonsterVisualConfig } from '../../platform/game/MonsterVisualConfigContext.jsx';
import { resolveMonsterVisual } from '../../platform/game/monster-visual-config.js';
import { monsterVisualFrameStyle, monsterVisualMotionStyle } from '../../platform/game/monster-visual-style.js';
import { eggBreatheStyle, monsterMotionStyle } from './data.js';

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
    preferredSize: context === 'preview' ? 1280 : 640,
  });

  return (
    <span
      className="codex-creature-visual"
      style={monsterVisualFrameStyle(visual)}
    >
      <img
        className={`codex-creature-image is-${entry.displayState}`}
        src={visual.src || entry.img}
        srcSet={visual.srcSet || entry.srcSet}
        sizes={sizes}
        style={mergedCreatureMotionStyle(entry, context, visual)}
        alt={entry.imageAlt}
      />
    </span>
  );
}

function codexVisualContext(context) {
  if (context === 'feature') return 'codexFeature';
  if (context === 'preview') return 'lightbox';
  return 'codexCard';
}

function creatureMotionStyle(entry, context) {
  if (entry.displayState === 'egg') return eggBreatheStyle(entry, context);
  if (entry.displayState === 'monster') return monsterMotionStyle(entry, context);
  return undefined;
}

function mergedCreatureMotionStyle(entry, context, visual) {
  return {
    ...(creatureMotionStyle(entry, context) || {}),
    ...creatureContextMotionStyle(visual),
  };
}

function creatureContextMotionStyle(visual) {
  return monsterVisualMotionStyle(visual);
}
