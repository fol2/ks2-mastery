import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderCelebrationLayerFixture } from './helpers/react-render.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createAppController } from '../src/platform/app/create-app-controller.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import {
  acknowledgedMonsterCelebrationIds,
} from '../src/platform/game/monster-celebration-acks.js';
import { normaliseMonsterCelebrationEvent } from '../src/platform/game/monster-celebrations.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

// `caught` registers through the `particles-burst` template via
// `runtimeRegistration`. The fixture's bundler compiles the JSX-bearing
// celebration template cleanly; tests pre-register the JSX templates via
// the synchronous `__registerCelebrationTemplates` seam (mirrors the
// production bootstrap path in `src/app/App.jsx`).
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REGISTER_CAUGHT = `
  import { runtimeRegistration } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/runtime-registration.js'))};
  import { __registerCelebrationTemplates } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/index.js'))};
  import particlesBurst from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/particles-burst.js'))};
  import shineStreak from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/shine-streak.js'))};
  __registerCelebrationTemplates({ particlesBurst, shineStreak });
  runtimeRegistration({ catalog: undefined });
`;

function makeMonster(overrides = {}) {
  return {
    id: 'inklet',
    name: 'Inklet',
    blurb: 'A tiny ink sprite.',
    accent: '#3E6FA8',
    secondary: '#FFE9A8',
    pale: '#F8F4EA',
    nameByStage: ['Inklet Egg', 'Inklet'],
    masteredMax: 100,
    ...overrides,
  };
}

function makeRewardEvent(overrides = {}) {
  return normaliseMonsterCelebrationEvent({
    id: 'reward.monster:learner-a:inklet:caught:1',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    monsterId: 'inklet',
    monster: makeMonster(),
    previous: { mastered: 0, stage: 0, level: 0, caught: false, branch: 'b1' },
    next: { mastered: 1, stage: 0, level: 0, caught: true, branch: 'b1' },
    createdAt: Date.UTC(2026, 3, 24),
    ...overrides,
  });
}

test('caught effect: happy path — reward.monster event renders with toast text and dialog chrome', async () => {
  const out = await renderCelebrationLayerFixture({
    registrations: REGISTER_CAUGHT,
    setup: `
      store.pushMonsterCelebrations([${JSON.stringify(makeRewardEvent())}]);
    `,
  });
  const { html, before, after, warnings } = JSON.parse(out);

  assert.equal(before.queue.length, 1);
  assert.equal(after.queue.length, 1, 'render alone must not advance the queue');
  // Title resolves via nameByStage[next.stage]; next.stage === 0 picks the
  // egg name verbatim from the legacy overlay's behaviour.
  assert.match(html, /Inklet Egg/);
  // Body + eyebrow text — verbatim from the legacy overlay so stylesheet
  // selectors and screen-reader output are unchanged.
  assert.match(html, /You caught a new friend!/);
  assert.match(html, /New friend/);
  // Class hook keeps existing CSS keyframes applying.
  assert.match(html, /class="monster-celebration-overlay caught"/);
  assert.match(html, /Keep going/);
  assert.equal(warnings.length, 0, `unexpected warnings: ${JSON.stringify(warnings)}`);
});

test('caught effect: dismissal — onComplete drains the queue and persists an ack', async () => {
  // Wrap the registered effect so its render fires onComplete the first
  // time it sees one. <CelebrationLayer> evaluates render() during SSR,
  // so the queue advance + ack happen before the snapshot we assert on.
  // The event must carry the store's `learners.selectedId` so the ack is
  // recorded under the same key the fixture reads back.
  const eventTemplate = makeRewardEvent({ id: 'reward.monster:dismissal:caught:inklet' });
  const out = await renderCelebrationLayerFixture({
    registrations: `
      import { runtimeRegistration } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/runtime-registration.js'))};
      import { __registerCelebrationTemplates } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/index.js'))};
      import particlesBurst from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/particles-burst.js'))};
      import shineStreak from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/effect-templates/shine-streak.js'))};
      import { lookupEffect } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/registry.js'))};
      __registerCelebrationTemplates({ particlesBurst, shineStreak });
      runtimeRegistration({ catalog: undefined });
      const __originalCaught = lookupEffect('caught');
      registerEffect(defineEffect({
        kind: 'caught',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson', 'home', 'codex'],
        reducedMotion: 'simplify',
        render(args) {
          if (typeof args.onComplete === 'function' && !globalThis.__caughtAlreadyDismissed) {
            globalThis.__caughtAlreadyDismissed = true;
            args.onComplete();
          }
          return __originalCaught.render(args);
        },
      }));
    `,
    setup: `
      const __learnerId = store.getState().learners.selectedId;
      const __event = { ...${JSON.stringify(eventTemplate)}, learnerId: __learnerId };
      store.pushMonsterCelebrations([__event]);
    `,
  });
  const result = JSON.parse(out);

  assert.equal(result.before.queue.length, 1);
  assert.equal(result.after.queue.length, 0, 'onComplete must drain the queue');
  assert.ok(
    result.after.ackedIds.includes('reward.monster:dismissal:caught:inklet'),
    `expected dismissed event to be acked; got ${JSON.stringify(result.after.ackedIds)}`,
  );
});

test('caught effect: edge case — previous/next snapshots thread into render', async () => {
  const event = makeRewardEvent({
    previous: { mastered: 0, stage: 0, level: 0, caught: false, branch: 'b2' },
    next: { mastered: 1, stage: 1, level: 1, caught: true, branch: 'b2' },
    monster: makeMonster({ nameByStage: ['Inklet Egg', 'Inklet juvenile'] }),
  });

  const out = await renderCelebrationLayerFixture({
    registrations: REGISTER_CAUGHT,
    setup: `
      store.pushMonsterCelebrations([${JSON.stringify(event)}]);
    `,
  });
  const { html } = JSON.parse(out);

  // next.stage === 1 selects 'Inklet juvenile' for the title.
  assert.match(html, /Inklet juvenile/);
  // The branch hint (b2) flows through to the asset URL because the
  // legacy overlay reads `previous?.branch || next?.branch` and we have
  // pinned both snapshots to b2.
  assert.match(html, /assets\/monsters\/inklet\/b2\/inklet-b2-1/);
  // data-stage attribute reflects the resolved stage.
  assert.match(html, /data-stage="1"/);
});

test('caught effect: integration — controller dispatch advances queue and persists ack', () => {
  // The dismiss dispatch path doesn't go through <CelebrationLayer> or the
  // registry — it acks via `acknowledgeMonsterCelebrationEvents` and then
  // calls `store.dismissMonsterCelebration()`. So this test is the
  // primary guard that the existing controller wiring still works.
  installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage: globalThis.localStorage });
  const controller = createAppController({ repositories, subjects: SUBJECTS });
  const learnerId = controller.store.getState().learners.selectedId;

  const event = normaliseMonsterCelebrationEvent({
    id: 'reward.monster:integration:caught:inklet',
    type: 'reward.monster',
    kind: 'caught',
    learnerId,
    monsterId: 'inklet',
    monster: makeMonster(),
    previous: { stage: 0 },
    next: { stage: 0 },
  });
  controller.store.pushMonsterCelebrations([event]);
  assert.equal(controller.store.getState().monsterCelebrations.queue.length, 1);

  controller.dispatch('monster-celebration-dismiss');

  assert.equal(controller.store.getState().monsterCelebrations.queue.length, 0);
  const acked = acknowledgedMonsterCelebrationIds(learnerId);
  assert.ok(
    acked.has('reward.monster:integration:caught:inklet'),
    `expected acked id; got ${[...acked].join(', ')}`,
  );
});

test('caught effect: U4 — tunables override hardcoded showParticles=true so particles are absent', async () => {
  // The bundled `caught` defaults render particles. With
  // tunables.showParticles=false, the celebration shell must skip the
  // `monster-celebration-parts` container.
  const event = makeRewardEvent({
    previous: { mastered: 0, stage: 0, level: 0, caught: false, branch: 'b1' },
    next: { mastered: 1, stage: 0, level: 0, caught: true, branch: 'b1' },
  });
  const out = await renderCelebrationLayerFixture({
    effectConfigValue: {
      celebrationTunables: {
        'inklet-b1-0': {
          caught: { showParticles: false, showShine: false, modifierClass: '' },
        },
      },
    },
    registrations: REGISTER_CAUGHT,
    setup: `
      store.pushMonsterCelebrations([${JSON.stringify(event)}]);
    `,
  });
  const { html } = JSON.parse(out);

  assert.match(html, /class="monster-celebration-overlay caught"/);
  // Particles container present in default render — must be absent here.
  assert.equal(html.includes('class="monster-celebration-parts"'), false);
});

test('caught effect: legacy event shape (normalised by monster-celebrations.js) renders correctly', async () => {
  // Existing pending/queue events in storage take this normalised shape;
  // the new layer reads queue[0] and looks up by `kind`. This guards the
  // backward-compat seam called out in U6's plan.
  const legacy = makeRewardEvent({
    id: 'reward.monster:legacy:inklet:caught',
    learnerId: 'legacy-learner',
    createdAt: Date.UTC(2026, 0, 1),
  });

  const out = await renderCelebrationLayerFixture({
    registrations: REGISTER_CAUGHT,
    setup: `
      store.pushMonsterCelebrations([${JSON.stringify(legacy)}]);
    `,
  });
  const { html, before } = JSON.parse(out);

  assert.equal(before.queue.length, 1);
  assert.equal(before.queue[0].id, 'reward.monster:legacy:inklet:caught');
  assert.match(html, /You caught a new friend!/);
  assert.match(html, /New friend/);
});
