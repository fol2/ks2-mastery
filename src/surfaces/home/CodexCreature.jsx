import React from 'react';
import { useMonsterVisualConfig } from '../../platform/game/MonsterVisualConfigContext.jsx';
import { resolveMonsterVisual } from '../../platform/game/monster-visual-config.js';
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
      style={creatureVisualStyle(visual)}
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
  const style = {};
  const duration = positiveNumber(visual.duration, 0);
  const delay = numberOrDefault(visual.delay, null);
  const bob = numberOrDefault(visual.bob, null);
  const tilt = numberOrDefault(visual.tilt, null);

  if (duration > 0) {
    style['--monster-float-duration'] = `${duration.toFixed(2)}s`;
    style['--egg-breathe-duration'] = `${duration.toFixed(2)}s`;
  }
  if (delay !== null && delay !== 0) {
    style['--monster-float-delay'] = `${delay.toFixed(2)}s`;
    style['--egg-breathe-delay'] = `${delay.toFixed(2)}s`;
  }
  if (bob !== null && bob !== 0) {
    style['--monster-float-lift-a'] = `${bob.toFixed(2)}px`;
    style['--monster-float-lift-b'] = `${(bob * 0.42).toFixed(2)}px`;
  }
  if (tilt !== null && tilt !== 0) {
    style['--monster-float-tilt-a'] = `${tilt.toFixed(2)}deg`;
    style['--monster-float-tilt-b'] = `${(tilt * -0.42).toFixed(2)}deg`;
  }

  return style;
}

function creatureVisualStyle(visual) {
  const style = {
    '--visual-offset-x': px(visual.offsetX, 0),
    '--visual-offset-y': px(visual.offsetY, 0),
    '--visual-scale': positiveNumber(visual.scale, 1).toFixed(3),
    '--visual-face': Number(visual.faceSign) === -1 ? -1 : 1,
    '--visual-anchor-x': percentage(visual.anchorX, 0.5),
    '--visual-anchor-y': percentage(visual.anchorY, 1),
    opacity: clamp(numberOrDefault(visual.opacity, 1), 0, 1),
  };
  if (visual.filter && visual.filter !== 'none') style.filter = visual.filter;

  const clipPath = cropClipPath(visual);
  if (clipPath) style.clipPath = clipPath;

  return style;
}

function numberOrDefault(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function positiveNumber(value, fallback) {
  const numeric = numberOrDefault(value, fallback);
  return numeric > 0 ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function px(value, fallback) {
  return `${numberOrDefault(value, fallback).toFixed(2)}px`;
}

function percentage(value, fallback) {
  return `${(clamp(numberOrDefault(value, fallback), 0, 1) * 100).toFixed(1)}%`;
}

function cropClipPath(visual) {
  const cropX = clamp(numberOrDefault(visual.cropX, 0), 0, 1);
  const cropY = clamp(numberOrDefault(visual.cropY, 0), 0, 1);
  const cropWidth = clamp(numberOrDefault(visual.cropWidth, 1), 0, 1);
  const cropHeight = clamp(numberOrDefault(visual.cropHeight, 1), 0, 1);
  if (cropX === 0 && cropY === 0 && cropWidth === 1 && cropHeight === 1) return '';

  const right = clamp(1 - cropX - cropWidth, 0, 1);
  const bottom = clamp(1 - cropY - cropHeight, 0, 1);
  return `inset(${percentage(cropY, 0)} ${percentage(right, 0)} ${percentage(bottom, 0)} ${percentage(cropX, 0)})`;
}
