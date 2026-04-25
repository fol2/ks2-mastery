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

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEGA_PATH = path.join(rootDir, 'src/platform/game/render/effects/mega.js');

const REGISTER_MEGA = `
  import * as __megaMod from ${JSON.stringify(MEGA_PATH)};
  registerEffect(__megaMod.megaEffect);
`;

function makeMonster(overrides = {}) {
  return {
    id: 'inklet',
    name: 'Inklet',
    blurb: 'A tiny ink sprite.',
    accent: '#3E6FA8',
    secondary: '#FFE9A8',
    pale: '#F8F4EA',
    nameByStage: ['Inklet Egg', 'Inklet', 'Scribbla', 'Quillorn', 'Mega Quillorn'],
    masteredMax: 100,
    ...overrides,
  };
}

function makeMegaEvent(overrides = {}) {
  return normaliseMonsterCelebrationEvent({
    id: 'reward.monster:learner-a:inklet:mega:3-4',
    type: 'reward.monster',
    kind: 'mega',
    learnerId: 'learner-a',
    monsterId: 'inklet',
    monster: makeMonster(),
    previous: { mastered: 80, stage: 3, level: 9, caught: true, branch: 'b1' },
    next: { mastered: 100, stage: 4, level: 10, caught: true, branch: 'b1' },
    createdAt: Date.UTC(2026, 3, 24),
    ...overrides,
  });
}

test('mega effect: happy path — final form (stage 4) renders shine streak and "Mega" title', async () => {
  const out = await renderCelebrationLayerFixture({
    registrations: REGISTER_MEGA,
    setup: `
      store.pushMonsterCelebrations([${JSON.stringify(makeMegaEvent())}]);
    `,
  });
  const { html, before, after, warnings } = JSON.parse(out);

  assert.equal(before.queue.length, 1);
  assert.equal(after.queue.length, 1, 'render alone must not advance the queue');

  // Title resolves to nameByStage[4] === 'Mega Quillorn'.
  assert.match(html, /Mega Quillorn/);
  // Body text mirrors the legacy overlay's mega copy verbatim.
  assert.match(html, /Inklet reached its mega form: Mega Quillorn\./);
  // Eyebrow text — verbatim from the legacy overlay.
  assert.match(html, /Final form/);
  // Shine streak element — exclusive to the mega overlay.
  assert.match(html, /class="monster-celebration-shine"/);
  // Class hook keeps existing mega CSS rules applying.
  assert.match(html, /class="monster-celebration-overlay mega"/);
  // Both stages render so the cross-fade can play.
  assert.match(html, /data-stage="3"/);
  assert.match(html, /data-stage="4"/);
  assert.equal(warnings.length, 0, `unexpected warnings: ${JSON.stringify(warnings)}`);
});

test('mega effect: edge case — previous/next snapshots reflect the max-evolution framing', async () => {
  // Even when previous.stage is unknown (e.g. only the final stage is set
  // because the worker emitted an abbreviated payload), the body copy
  // should still frame the moment as a mega achievement and pull the
  // final-stage name correctly.
  const event = makeMegaEvent({
    previous: { stage: 3 },
    next: { stage: 4 },
    monster: makeMonster({ name: 'Phaeton', nameByStage: ['Egg', 'Wisp', 'Cloud', 'Star', 'Phaeton supreme'] }),
  });

  const out = await renderCelebrationLayerFixture({
    registrations: REGISTER_MEGA,
    setup: `
      store.pushMonsterCelebrations([${JSON.stringify(event)}]);
    `,
  });
  const { html } = JSON.parse(out);

  assert.match(html, /Final form/);
  assert.match(html, /Phaeton reached its mega form: Phaeton supreme\./);
  assert.match(html, /Phaeton supreme/);
});

test('mega effect: dismissal — onComplete drains the queue and persists an ack', async () => {
  // The event must carry the store's `learners.selectedId` so the ack is
  // recorded under the same key the fixture reads back when snapshotting.
  const eventTemplate = makeMegaEvent({ id: 'reward.monster:dismissal:mega:inklet' });
  const out = await renderCelebrationLayerFixture({
    registrations: `
      import * as __megaMod from ${JSON.stringify(MEGA_PATH)};
      const __original = __megaMod.megaEffect;
      registerEffect(defineEffect({
        kind: 'mega',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson', 'home', 'codex'],
        reducedMotion: 'simplify',
        render(args) {
          if (typeof args.onComplete === 'function' && !globalThis.__megaAlreadyDismissed) {
            globalThis.__megaAlreadyDismissed = true;
            args.onComplete();
          }
          return __original.render(args);
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
    result.after.ackedIds.includes('reward.monster:dismissal:mega:inklet'),
    `expected dismissed event to be acked; got ${JSON.stringify(result.after.ackedIds)}`,
  );
});

test('mega effect: integration — controller dispatch advances queue and persists ack', () => {
  installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage: globalThis.localStorage });
  const controller = createAppController({ repositories, subjects: SUBJECTS });
  const learnerId = controller.store.getState().learners.selectedId;

  const event = normaliseMonsterCelebrationEvent({
    id: 'reward.monster:integration:mega:inklet',
    type: 'reward.monster',
    kind: 'mega',
    learnerId,
    monsterId: 'inklet',
    monster: makeMonster(),
    previous: { stage: 3 },
    next: { stage: 4 },
  });
  controller.store.pushMonsterCelebrations([event]);
  assert.equal(controller.store.getState().monsterCelebrations.queue.length, 1);

  controller.dispatch('monster-celebration-dismiss');

  assert.equal(controller.store.getState().monsterCelebrations.queue.length, 0);
  const acked = acknowledgedMonsterCelebrationIds(learnerId);
  assert.ok(
    acked.has('reward.monster:integration:mega:inklet'),
    `expected acked id; got ${[...acked].join(', ')}`,
  );
});
