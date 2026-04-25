import { defineEffect } from '../define-effect.js';
import { CelebrationShell, clampStage, stageName } from './celebration-shell.js';

export const megaEffect = defineEffect({
  kind: 'mega',
  lifecycle: 'transient',
  layer: 'overlay',
  surfaces: ['lesson', 'home', 'codex'],
  reducedMotion: 'simplify',
  render({ params, onComplete }) {
    const event = params || {};
    const monster = event.monster || {};
    const fromStage = clampStage(event.previous?.stage);
    const toStage = clampStage(event.next?.stage);

    return (
      <CelebrationShell
        kind="mega"
        monster={monster}
        fromStage={fromStage}
        toStage={toStage}
        branch={event.previous?.branch || event.next?.branch}
        showParticles
        showShine
        showBefore
        eyebrow="Final form"
        body={`${monster.name || 'A monster'} reached its mega form: ${stageName(monster, toStage)}.`}
        onComplete={onComplete}
      />
    );
  },
});
