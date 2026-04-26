import React from 'react';
import { useMonsterVisualConfig } from '../../platform/game/MonsterVisualConfigContext.jsx';
import { resolveMonsterVisual } from '../../platform/game/monster-visual-config.js';
import { eggBreatheStyle } from './data.js';
// SH2-U5: fresh learners land on the home hero with zero caught monsters.
// Before the re-skin the meadow rendered `null`, which meant learners saw
// an empty stretch of grass with no copy explaining the state. The shared
// primitive surfaces the canonical three-part copy (what happened /
// progress safe / what action).
import { EmptyState } from '../../platform/ui/EmptyState.jsx';

export function MonsterMeadow({ monsters = [], maxSlots = 10 }) {
  const monsterVisualConfig = useMonsterVisualConfig();
  const shown = monsters.slice(0, maxSlots);
  if (!shown.length) {
    // The fresh-meadow empty branch uses a dedicated wrapper instead of
    // reusing `.monster-meadow` because the base meadow class declares
    // `position: absolute` + `pointer-events: none`. Those constraints
    // are correct for the decorative sprite layer but would make the
    // empty-state card non-interactive and invisible behind the hero
    // copy. `.monster-meadow-empty` is a static-flow block that sits in
    // the hero's normal layout order; the primitive keeps its role=status.
    //
    // Post-review: no `aria-label` on the wrapper because the inner
    // EmptyState already carries `role="status"` with its own announced
    // copy. Adding an outer label would duplicate-announce without a
    // matching role, which AT engines read as a dead landmark.
    return (
      <div className="monster-meadow-empty">
        <EmptyState
          title="Nothing caught yet"
          body="Nothing caught yet. Your meadow stays tidy. Finish a round to see your first monster appear."
        />
      </div>
    );
  }
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
