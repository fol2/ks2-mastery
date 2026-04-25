import { defineEffect } from '../define-effect.js';
import { registerEffect } from '../registry.js';
import { CelebrationShell, clampStage, stageName } from './celebration-shell.js';

function eyebrowFor(fromStage, toStage) {
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
    const isEggCrack = fromStage === 0 && toStage === 1;

    return (
      <CelebrationShell
        kind="evolve"
        modifierClass={isEggCrack ? 'egg-crack' : ''}
        monster={monster}
        fromStage={fromStage}
        toStage={toStage}
        branch={event.previous?.branch || event.next?.branch}
        showBefore
        eyebrow={eyebrowFor(fromStage, toStage)}
        body={`${monster.name || 'A monster'} evolved into ${stageName(monster, toStage)}.`}
        onComplete={onComplete}
      />
    );
  },
});

registerEffect(evolveEffect);
