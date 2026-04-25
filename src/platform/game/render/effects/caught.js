import { defineEffect } from '../define-effect.js';
import { registerEffect } from '../registry.js';
import { CelebrationShell, clampStage } from './celebration-shell.js';

export const caughtEffect = defineEffect({
  kind: 'caught',
  lifecycle: 'transient',
  layer: 'overlay',
  surfaces: ['lesson', 'home', 'codex'],
  reducedMotion: 'simplify',
  render({ params, onComplete }) {
    const event = params || {};
    return (
      <CelebrationShell
        kind="caught"
        monster={event.monster}
        toStage={clampStage(event.next?.stage)}
        branch={event.previous?.branch || event.next?.branch}
        showParticles
        eyebrow="New friend"
        body="You caught a new friend!"
        onComplete={onComplete}
      />
    );
  },
});

registerEffect(caughtEffect);
