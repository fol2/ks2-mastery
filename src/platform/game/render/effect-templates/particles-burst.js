// `particles-burst` template: covers the transient `caught` and `evolve`
// celebration overlays. They share <CelebrationShell> and differ in eyebrow,
// body, and which decorative slots fire. The `kind` discriminator (taken
// verbatim from the catalog entry) selects the per-mode behaviour.
//
// JSX-bearing: imports CelebrationShell whose body uses JSX. This module
// only loads via the bundler (esbuild in tests, esbuild in production),
// never plain `node --test`. The index module accepts the default export
// through `__registerCelebrationTemplates`, so tests targeting the rest of
// the registry stay Node-loadable.

import { CelebrationShell, clampStage, stageName } from '../effects/celebration-shell.js';
import { TEMPLATE_PARAM_SCHEMAS } from './param-schemas.js';

function eyebrowForEvolve(fromStage, toStage) {
  if (fromStage === 0 && toStage === 1) return 'Hatched';
  if (fromStage === 1 && toStage === 2) return 'Grown';
  return 'Evolved';
}

function renderCaught({ event, onComplete, tunables }) {
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
      tunables={tunables}
    />
  );
}

function renderEvolve({ event, onComplete, tunables }) {
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
      eyebrow={eyebrowForEvolve(fromStage, toStage)}
      body={`${monster.name || 'A monster'} evolved into ${stageName(monster, toStage)}.`}
      onComplete={onComplete}
      tunables={tunables}
    />
  );
}

export default {
  id: 'particles-burst',
  // The mode discriminator (caught | evolve) is the only authored param;
  // the canonical `reward.monster` event flows through liveParams at render.
  paramSchema: TEMPLATE_PARAM_SCHEMAS['particles-burst'],
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
        if (kind === 'evolve') return renderEvolve({ event, onComplete, tunables });
        return renderCaught({ event, onComplete, tunables });
      },
    };
  },
};
