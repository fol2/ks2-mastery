// Transient overlay: "evolve" celebration. Mirrors the legacy
// `<MonsterCelebrationOverlay>` rendering for `kind: 'evolve'` so existing
// CSS keeps applying. The egg-crack variant fires when a stage 0 → 1
// transition lands.

import { defineEffect } from '../define-effect.js';
import { registerEffect } from '../registry.js';
import { monsterAsset, monsterAssetSrcSet } from '../../monsters.js';

function imageSources(monsterId, stage, branch) {
  return {
    src: monsterAsset(monsterId, stage, 640, branch),
    srcSet: monsterAssetSrcSet(monsterId, stage, branch),
  };
}

function stageName(monster, stage) {
  return Array.isArray(monster?.nameByStage) && monster.nameByStage[stage]
    ? monster.nameByStage[stage]
    : `${monster?.name || 'Monster'} stage ${stage}`;
}

function clampStage(value) {
  return Math.max(0, Math.min(4, Number(value) || 0));
}

function eyebrow(fromStage, toStage) {
  if (fromStage === 0 && toStage === 1) return 'Hatched';
  if (fromStage === 1 && toStage === 2) return 'Grown';
  return 'Evolved';
}

export const evolveEffect = defineEffect({
  kind: 'evolve',
  lifecycle: 'transient',
  layer: 'overlay',
  surfaces: ['lesson', 'home', 'codex'],
  reducedMotion: 'simplify',
  render({ params, onComplete }) {
    const event = params || {};
    const monster = event.monster || {};
    const fromStage = clampStage(event.previous?.stage);
    const toStage = clampStage(event.next?.stage);
    const branch = event.previous?.branch || event.next?.branch;
    const primary = monster.accent || '#3E6FA8';
    const secondary = monster.secondary || '#FFE9A8';
    const pale = monster.pale || '#F8F4EA';
    const isEggCrack = fromStage === 0 && toStage === 1;
    const className = `monster-celebration-overlay evolve${isEggCrack ? ' egg-crack' : ''}`;

    return (
      <section
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby="monster-celebration-title"
        style={{
          '--monster-primary': primary,
          '--monster-secondary': secondary,
          '--monster-pale': pale,
        }}
      >
        <div className="monster-celebration-stage" aria-hidden="true">
          <div className="monster-celebration-halo" />
          <img
            className="monster-celebration-art before"
            alt=""
            data-stage={fromStage}
            {...imageSources(monster.id, fromStage, branch)}
            sizes="min(90vw, 540px)"
          />
          <div className="monster-celebration-white" />
          <img
            className="monster-celebration-art after"
            alt=""
            data-stage={toStage}
            {...imageSources(monster.id, toStage, branch)}
            sizes="min(90vw, 540px)"
          />
        </div>

        <div className="monster-celebration-card">
          <p className="eyebrow">{eyebrow(fromStage, toStage)}</p>
          <h2 id="monster-celebration-title">{stageName(monster, toStage)}</h2>
          <p>{`${monster.name || 'A monster'} evolved into ${stageName(monster, toStage)}.`}</p>
          <button className="btn primary lg" type="button" onClick={onComplete}>Keep going</button>
        </div>
      </section>
    );
  },
});

registerEffect(evolveEffect);
