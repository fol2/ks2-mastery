import React from 'react';
import { monsterAsset, monsterAssetSrcSet } from '../../platform/game/monsters.js';

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

function bodyCopy(event, toStage) {
  const monster = event.monster || {};
  if (event.kind === 'caught') return 'You caught a new friend!';
  if (event.kind === 'mega') return `${monster.name || 'A monster'} reached its mega form: ${stageName(monster, toStage)}.`;
  if (event.kind === 'evolve') return `${monster.name || 'A monster'} evolved into ${stageName(monster, toStage)}.`;
  return `${monster.name || 'A monster'} grew stronger.`;
}

function eyebrow(event, fromStage, toStage) {
  if (event.kind === 'caught') return 'New friend';
  if (event.kind === 'mega') return 'Final form';
  if (fromStage === 0 && toStage === 1) return 'Hatched';
  if (fromStage === 1 && toStage === 2) return 'Grown';
  return 'Evolved';
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

export function MonsterCelebrationOverlay({ queue = [], onDismiss }) {
  const event = queue[0];
  if (!event) return null;

  const monster = event.monster || {};
  const fromStage = Math.max(0, Math.min(4, Number(event.previous?.stage) || 0));
  const toStage = Math.max(0, Math.min(4, Number(event.next?.stage) || 0));
  const branch = event.previous?.branch || event.next?.branch;
  const primary = monster.accent || '#3E6FA8';
  const secondary = monster.secondary || '#FFE9A8';
  const pale = monster.pale || '#F8F4EA';
  const hasFrom = event.kind !== 'caught';
  const hasParts = event.kind === 'caught' || event.kind === 'mega';
  const isEggCrack = event.kind === 'evolve' && fromStage === 0 && toStage === 1;

  return (
    <section
      className={`monster-celebration-overlay ${event.kind}${isEggCrack ? ' egg-crack' : ''}`}
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
        {hasParts && <Particles />}
        <div className="monster-celebration-halo" />
        {event.kind === 'mega' && <div className="monster-celebration-shine" />}
        {hasFrom && (
          <img
            className="monster-celebration-art before"
            alt=""
            data-stage={fromStage}
            {...imageSources(monster.id, fromStage, branch)}
            sizes="min(90vw, 540px)"
          />
        )}
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
        <p className="eyebrow">{eyebrow(event, fromStage, toStage)}</p>
        <h2 id="monster-celebration-title">{stageName(monster, toStage)}</h2>
        <p>{bodyCopy(event, toStage)}</p>
        <button className="btn primary lg" type="button" onClick={onDismiss}>Keep going</button>
      </div>
    </section>
  );
}
