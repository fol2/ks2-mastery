// Transient overlay: "caught" celebration. Reproduces the visual semantics
// of the legacy `<MonsterCelebrationOverlay>` for `kind: 'caught'` events
// so existing CSS (`styles/app.css` rules under `.monster-celebration-*`)
// keeps working without change.
//
// `params` is the canonical `reward.monster` event payload — see
// `src/platform/game/monster-celebrations.js` for the normalised shape.

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

function Particles() {
  return (
    <div className="monster-celebration-parts">
      {Array.from({ length: 10 }).map((_, index) => (
        <span className="monster-celebration-part" key={index} />
      ))}
    </div>
  );
}

export const caughtEffect = defineEffect({
  kind: 'caught',
  lifecycle: 'transient',
  layer: 'overlay',
  surfaces: ['lesson', 'home', 'codex'],
  reducedMotion: 'simplify',
  render({ params, onComplete }) {
    const event = params || {};
    const monster = event.monster || {};
    const toStage = clampStage(event.next?.stage);
    const branch = event.previous?.branch || event.next?.branch;
    const primary = monster.accent || '#3E6FA8';
    const secondary = monster.secondary || '#FFE9A8';
    const pale = monster.pale || '#F8F4EA';

    return (
      <section
        className="monster-celebration-overlay caught"
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
          <Particles />
          <div className="monster-celebration-halo" />
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
          <p className="eyebrow">New friend</p>
          <h2 id="monster-celebration-title">{stageName(monster, toStage)}</h2>
          <p>You caught a new friend!</p>
          <button className="btn primary lg" type="button" onClick={onComplete}>Keep going</button>
        </div>
      </section>
    );
  },
});

registerEffect(caughtEffect);
