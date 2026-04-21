import React from 'react';
import { monsterAssetPath, monsterAssetSrcset, monsterFaceSign } from './data.js';

const MEADOW_HEIGHT_ESTIMATE = 420;

export function MonsterMeadow({ monsters = [], maxSlots = 10 }) {
  const shown = monsters.slice(0, maxSlots);
  if (!shown.length) {
    return (
      <div className="monster-meadow empty" aria-hidden="true">
        <span className="meadow-empty-note">Catch your first monster to populate the meadow.</span>
      </div>
    );
  }
  return (
    <div className="monster-meadow" aria-label={`${shown.length} caught monsters roaming`}>
      {shown.map((m) => {
        const topPct = parseFloat(m.top) || 0;
        const feetPct = topPct + (m.size / MEADOW_HEIGHT_ESTIMATE) * 100;
        const depthRaw = Math.min(Math.max(feetPct, 0), 100) / 100;
        const depth = 0.82 + depthRaw * 0.34;
        const size = Math.round(m.size * depth);
        const zIndex = 10 + Math.round(feetPct);
        const isEgg = m.stage === 0;
        const faceSign = monsterFaceSign(m.species, m.variant, m.stage);
        const src = monsterAssetPath(m.species, m.variant, m.stage, 640);
        const srcSet = monsterAssetSrcset(m.species, m.variant, m.stage);
        return (
          <div
            key={m.id}
            className={'meadow-monster' + (isEgg ? ' egg' : '')}
            data-path={isEgg ? 'none' : (m.path || 'walk')}
            style={{
              '--left': m.left,
              '--top': m.top,
              '--size': `${size}px`,
              '--dur': `${m.dur || 0}s`,
              '--delay': `${m.delay || 0}s`,
              '--bob-delay': `${m.bobDelay || 0}s`,
              '--face': faceSign,
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
