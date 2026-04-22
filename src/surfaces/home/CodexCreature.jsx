import React from 'react';
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
  if (entry.displayState === 'fresh') {
    return (
      <span className="codex-unknown" role="img" aria-label={entry.imageAlt}>
        {entry.placeholder || '?'}
      </span>
    );
  }

  return (
    <img
      className={`codex-creature-image is-${entry.displayState}`}
      src={entry.img}
      srcSet={entry.srcSet}
      sizes={sizes}
      style={creatureMotionStyle(entry, context)}
      alt={entry.imageAlt}
    />
  );
}

function creatureMotionStyle(entry, context) {
  if (entry.displayState === 'egg') return eggBreatheStyle(entry, context);
  if (entry.displayState === 'monster') return monsterMotionStyle(entry, context);
  return undefined;
}
