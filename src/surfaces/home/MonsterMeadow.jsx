import React from 'react';
import { useMonsterVisualConfig } from '../../platform/game/MonsterVisualConfigContext.jsx';
import { resolveMonsterVisual } from '../../platform/game/monster-visual-config.js';
import { eggBreatheStyle } from './data.js';

export function MonsterMeadow({ monsters = [], maxSlots = 10 }) {
  const monsterVisualConfig = useMonsterVisualConfig();
  const shown = monsters.slice(0, maxSlots);
  if (!shown.length) return null;
  return (
    <div className="monster-meadow" aria-label={`${shown.length} codex creatures in the hero meadow`}>
      {shown.map((m) => {
        const footPct = Number.isFinite(m.footPct) ? m.footPct : parseFloat(m.footY || m.top) || 0;
        const size = Math.round(Number(m.size) || 64);
        const zIndex = 10 + Math.round(footPct);
        const isEgg = m.stage === 0;
        const visual = resolveMonsterVisual({
          monsterId: m.species,
          branch: m.variant,
          stage: m.stage,
          context: 'meadow',
          config: monsterVisualConfig?.config,
          preferredSize: 640,
        });
        const faceSign = visual.faceSign;
        const src = visual.src;
        const srcSet = visual.srcSet;
        const shadowScale = Number.isFinite(m.perspectiveScale) ? m.perspectiveScale : 1;
        const visualPath = meadowPathForRenderer(visual.path, isEgg ? 'none' : (m.path || 'walk'));
        return (
          <div
            key={m.id}
            className={'meadow-monster' + (isEgg ? ' egg' : '')}
            data-path={visualPath}
            data-lane={m.lane || 'ground'}
            style={{
              '--x': m.x || m.left,
              '--foot-y': m.footY || m.top,
              '--size': `${size}px`,
              '--shadow-scale': shadowScale.toFixed(3),
              '--shadow-opacity': Math.min(1, Math.max(0.5, 0.62 + shadowScale * 0.26)).toFixed(3),
              '--dur': `${m.dur || 0}s`,
              '--delay': `${m.delay || 0}s`,
              '--bob-delay': `${m.bobDelay || 0}s`,
              '--face': faceSign,
              '--roam-forward-x': signedPx(m.roamForward, faceSign, 58),
              '--roam-back-x': signedPx(m.roamBack, -faceSign, 38),
              '--roam-forward-y': px(m.roamForwardY, 0),
              '--roam-back-y': px(m.roamBackY, 0),
              ...(isEgg ? eggBreatheStyle(m, 'meadow') : {}),
              zIndex,
            }}
          >
            <span className="meadow-shadow" aria-hidden="true" />
            <span
              className="meadow-visual"
              style={{
                '--visual-offset-x': px(visual.offsetX, 0),
                '--visual-offset-y': px(visual.offsetY, 0),
                '--visual-scale': Number.isFinite(Number(visual.scale)) ? Number(visual.scale).toFixed(3) : '1',
                opacity: Number.isFinite(Number(visual.opacity)) ? Math.max(0, Math.min(1, Number(visual.opacity))) : 1,
                filter: visual.filter && visual.filter !== 'none' ? visual.filter : undefined,
              }}
            >
              <img src={src} srcSet={srcSet} sizes={`${size}px`} alt="" />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function px(value, fallback) {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? numeric : fallback}px`;
}

function signedPx(value, sign, fallback) {
  const numeric = Number(value);
  return `${(Number.isFinite(numeric) ? numeric : fallback) * sign}px`;
}

function meadowPathForRenderer(path, fallback) {
  if (path === 'fly-a' || path === 'fly-b' || path === 'none') return path;
  if (path === 'walk' || path === 'walk-b') return 'walk';
  return fallback || 'walk';
}
