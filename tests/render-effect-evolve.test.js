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
const EVOLVE_PATH = path.join(rootDir, 'src/platform/game/render/effects/evolve.js');

const REGISTER_EVOLVE = `
  import * as __evolveMod from ${JSON.stringify(EVOLVE_PATH)};
  registerEffect(__evolveMod.evolveEffect);
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

function makeEvolveEvent(overrides = {}) {
  return normaliseMonsterCelebrationEvent({
    id: 'reward.monster:learner-a:inklet:evolve:2-3',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    monsterId: 'inklet',
    monster: makeMonster(),
    previous: { mastered: 40, stage: 2, level: 5, caught: true, branch: 'b1' },
    next: { mastered: 60, stage: 3, level: 7, caught: true, branch: 'b1' },
    createdAt: Date.UTC(2026, 3, 24),
    ...overrides,
  });
}

test('evolve effect: happy path — stage 2 → 3 renders both before + after stages', async () => {
  const out = await renderCelebrationLayerFixture({
    registrations: REGISTER_EVOLVE,
    setup: `
      store.pushMonsterCelebrations([${JSON.stringify(makeEvolveEvent())}]);
    `,
  });
  const { html, before, after, warnings } = JSON.parse(out);

  assert.equal(before.queue.length, 1);
  assert.equal(after.queue.length, 1, 'render alone must not advance the queue');

  // Title resolves via nameByStage[next.stage] === 'Quillorn'.
  assert.match(html, /Quillorn/);
  // Body text reproduces the legacy overlay's evolve string.
  assert.match(html, /Inklet evolved into Quillorn\./);
  // Eyebrow defaults to 'Evolved' for non egg-crack / non-grown stage transitions.
  assert.match(html, /Evolved/);
  // The before art (stage 2) is rendered alongside the after art (stage 3).
  assert.match(html, /data-stage="2"/);
  assert.match(html, /data-stage="3"/);
  // Class hook (no egg-crack modifier here) — preserves existing CSS.
  assert.match(html, /class="monster-celebration-overlay evolve"/);
  assert.equal(warnings.length, 0, `unexpected warnings: ${JSON.stringify(warnings)}`);
});

test('evolve effect: edge case — egg-crack variant fires for stage 0 → 1', async () => {
  const event = makeEvolveEvent({
    previous: { mastered: 0, stage: 0, level: 0, caught: true, branch: 'b1' },
    next: { mastered: 10, stage: 1, level: 2, caught: true, branch: 'b1' },
  });
  const out = await renderCelebrationLayerFixture({
    registrations: REGISTER_EVOLVE,
    setup: `
      store.pushMonsterCelebrations([${JSON.stringify(event)}]);
    `,
  });
  const { html } = JSON.parse(out);

  // Egg-crack modifier on the overlay class — drives the special CSS variant.
  assert.match(html, /class="monster-celebration-overlay evolve egg-crack"/);
  // Eyebrow flips to 'Hatched' for 0 → 1.
  assert.match(html, /Hatched/);
  // Title resolves to nameByStage[1] === 'Inklet'.
  assert.match(html, /Inklet evolved into Inklet\./);
});

test('evolve effect: edge case — stage 1 → 2 reads "Grown" eyebrow', async () => {
  const event = makeEvolveEvent({
    previous: { mastered: 10, stage: 1, level: 2, caught: true, branch: 'b1' },
    next: { mastered: 25, stage: 2, level: 4, caught: true, branch: 'b1' },
  });
  const out = await renderCelebrationLayerFixture({
    registrations: REGISTER_EVOLVE,
    setup: `
      store.pushMonsterCelebrations([${JSON.stringify(event)}]);
    `,
  });
  const { html } = JSON.parse(out);

  assert.match(html, /Grown/);
  assert.match(html, /class="monster-celebration-overlay evolve"/);
  assert.doesNotMatch(html, /egg-crack/);
});

test('evolve effect: dismissal — onComplete drains the queue and persists an ack', async () => {
  // The event must carry the store's `learners.selectedId` so the ack is
  // recorded under the same key the fixture reads back when snapshotting.
  const eventTemplate = makeEvolveEvent({ id: 'reward.monster:dismissal:evolve:inklet' });
  const out = await renderCelebrationLayerFixture({
    registrations: `
      import * as __evolveMod from ${JSON.stringify(EVOLVE_PATH)};
      const __original = __evolveMod.evolveEffect;
      registerEffect(defineEffect({
        kind: 'evolve',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson', 'home', 'codex'],
        reducedMotion: 'simplify',
        render(args) {
          if (typeof args.onComplete === 'function' && !globalThis.__evolveAlreadyDismissed) {
            globalThis.__evolveAlreadyDismissed = true;
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
    result.after.ackedIds.includes('reward.monster:dismissal:evolve:inklet'),
    `expected dismissed event to be acked; got ${JSON.stringify(result.after.ackedIds)}`,
  );
});

test('evolve effect: integration — controller dispatch advances queue and persists ack', () => {
  installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage: globalThis.localStorage });
  const controller = createAppController({ repositories, subjects: SUBJECTS });
  const learnerId = controller.store.getState().learners.selectedId;

  const event = normaliseMonsterCelebrationEvent({
    id: 'reward.monster:integration:evolve:inklet',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId,
    monsterId: 'inklet',
    monster: makeMonster(),
    previous: { stage: 1 },
    next: { stage: 2 },
  });
  controller.store.pushMonsterCelebrations([event]);
  assert.equal(controller.store.getState().monsterCelebrations.queue.length, 1);

  controller.dispatch('monster-celebration-dismiss');

  assert.equal(controller.store.getState().monsterCelebrations.queue.length, 0);
  const acked = acknowledgedMonsterCelebrationIds(learnerId);
  assert.ok(
    acked.has('reward.monster:integration:evolve:inklet'),
    `expected acked id; got ${[...acked].join(', ')}`,
  );
});
