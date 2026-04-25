// `shine-streak` template: covers the transient `mega` celebration. Renders
// <CelebrationShell> with both particles + shine enabled, mirroring today's
// `mega.js` body verbatim.

import { CelebrationShell, clampStage, stageName } from '../effects/celebration-shell.js';
import { TEMPLATE_PARAM_SCHEMAS } from './param-schemas.js';

export default {
  id: 'shine-streak',
  paramSchema: TEMPLATE_PARAM_SCHEMAS['shine-streak'],
  buildEffectSpec({
    kind,
    lifecycle,
    layer,
    surfaces,
    reducedMotion,
    zIndex,
    exclusiveGroup,
    params,
  }) {
    return {
      kind,
      lifecycle,
      layer,
      surfaces: [...(surfaces || ['lesson', 'home', 'codex'])],
      reducedMotion,
      zIndex: typeof zIndex === 'number' ? zIndex : 0,
      exclusiveGroup: exclusiveGroup ?? null,
      params: params || {},
      render({ params: liveParams, onComplete, tunables }) {
        const event = liveParams || {};
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
            tunables={tunables}
          />
        );
      },
    };
  },
};
