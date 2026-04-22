import React from 'react';
import { eggBreatheStyle, monsterAssetPath, monsterAssetSrcset, monsterFaceSign } from './data.js';

export function MonsterMeadow({ monsters = [], maxSlots = 10 }) {
  const shown = monsters.slice(0, maxSlots);
  if (!shown.length) return null;
  return (
    <div className="monster-meadow" aria-label={`${shown.length} codex creatures in the hero meadow`}>
      {shown.map((m) => {
        const footPct = Number.isFinite(m.footPct) ? m.footPct : parseFloat(m.footY || m.top) || 0;
        const size = Math.round(Number(m.size) || 64);
        const zIndex = 10 + Math.round(footPct);
        const isEgg = m.stage === 0;
        const faceSign = monsterFaceSign(m.species, m.variant, m.stage);
        const src = monsterAssetPath(m.species, m.variant, m.stage, 640);
        const srcSet = monsterAssetSrcset(m.species, m.variant, m.stage);
        const shadowScale = Number.isFinite(m.perspectiveScale) ? m.perspectiveScale : 1;
        return (
          <div
            key={m.id}
            className={'meadow-monster' + (isEgg ? ' egg' : '')}
            data-path={isEgg ? 'none' : (m.path || 'walk')}
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
            <img src={src} srcSet={srcSet} sizes={`${size}px`} alt="" />
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
