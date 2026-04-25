import React from 'react';
import { MonsterRender } from '../../platform/game/render/MonsterRender.jsx';
// Side-effect imports: each effect module calls registerEffect() at the
// top level. We import them here so any consumer of <CodexCreatureVisual>
// gets the registry populated without depending on data.js loading first.
import '../../platform/game/render/effects/egg-breathe.js';
import '../../platform/game/render/effects/monster-motion-float.js';

const EGG_EFFECTS = Object.freeze([{ kind: 'egg-breathe' }]);
const MONSTER_EFFECTS = Object.freeze([{ kind: 'monster-motion-float' }]);

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
  return (
    <MonsterRender
      monster={entry}
      context={context}
      effects={effectsForState(entry.displayState)}
      sizes={sizes}
    />
  );
}

function effectsForState(displayState) {
  if (displayState === 'egg') return EGG_EFFECTS;
  if (displayState === 'monster') return MONSTER_EFFECTS;
  return [];
}
