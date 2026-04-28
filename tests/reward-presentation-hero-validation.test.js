import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseMonsterCelebrationEvent,
} from '../src/platform/game/monster-celebrations.js';
import {
  acknowledgeMonsterCelebrationEvents,
  acknowledgedMonsterCelebrationIds,
  unacknowledgedMonsterCelebrationEvents,
} from '../src/platform/game/monster-celebration-acks.js';
import {
  normaliseRewardToastEvents,
} from '../src/platform/rewards/reward-toast-events.js';
import {
  normaliseRewardPresentationEvent,
  resolveRewardCelebration,
  resolveRewardToast,
} from '../src/platform/rewards/reward-presentations.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

function heroPurchasePresentation(overrides = {}) {
  const id = overrides.id || 'reward.presentation:module:hero-mode:reward.hero:purchase:txn-hero-1';
  return {
    id,
    type: 'reward.presentation',
    producerType: 'module',
    producerId: 'hero-mode',
    rewardType: 'reward.hero',
    kind: 'purchase',
    learnerId: 'learner-a',
    occurredAt: 1777399500000,
    sourceEventId: 'hero-mode:transaction:txn-hero-1',
    payload: {
      transactionId: 'txn-hero-1',
      inventoryItemId: 'cape-blue',
      heroItemId: 'cape-blue',
      price: 20,
      currency: 'hero-coin',
    },
    presentations: {
      toast: [],
      celebration: [{
        intentId: 'purchase-reveal',
        visualKind: 'hero-purchase',
        timing: 'immediate',
        title: 'New outfit unlocked',
        body: 'Blue Cape is ready.',
        priority: 50,
        assetRef: {
          family: 'hero',
          itemId: 'cape-blue',
        },
      }],
    },
    ...overrides,
  };
}

test('synthetic Hero purchase stays module-scoped and celebration-only', () => {
  const event = normaliseRewardPresentationEvent(heroPurchasePresentation());

  assert.equal(event.type, 'reward.presentation');
  assert.equal(event.producerType, 'module');
  assert.equal(event.producerId, 'hero-mode');
  assert.equal(event.rewardType, 'reward.hero');
  assert.equal(event.kind, 'purchase');
  assert.equal(event.payload.transactionId, 'txn-hero-1');
  assert.equal(event.payload.inventoryItemId, 'cape-blue');

  assert.deepEqual(resolveRewardToast(event), []);
  assert.equal(resolveRewardCelebration(event).length, 1);
  assert.equal(event.presentations.celebration[0].visualKind, 'hero-purchase');
  assert.equal(event.presentations.celebration[0].timing, 'immediate');
  assert.equal(
    event.presentations.celebration[0].dedupeKey,
    'reward:reward.presentation:module:hero-mode:reward.hero:purchase:txn-hero-1:celebration:purchase-reveal',
  );
});

test('synthetic Hero purchase creates no ToastShelf rows', () => {
  const rows = normaliseRewardToastEvents(heroPurchasePresentation());

  assert.deepEqual(rows, []);
});

test('synthetic Hero purchase can enter the celebration queue without subject state', () => {
  const queued = normaliseMonsterCelebrationEvent(heroPurchasePresentation());

  assert.ok(queued);
  assert.equal(queued.type, 'reward.presentation');
  assert.equal(queued.kind, 'hero-purchase');
  assert.equal(queued.learnerId, 'learner-a');
  assert.equal(queued.sourceEventId, 'hero-mode:transaction:txn-hero-1');
  assert.equal(queued.monsterId, '');
  assert.equal(queued.monster.name, 'New outfit unlocked');
  assert.equal(
    queued.presentationAckKey,
    'reward:reward.presentation:module:hero-mode:reward.hero:purchase:txn-hero-1:celebration:purchase-reveal',
  );
});

test('synthetic Hero purchase acknowledgement dedupes replay without mutating event payload', () => {
  const storage = installMemoryStorage();
  const event = heroPurchasePresentation();
  const originalPayload = structuredClone(event.payload);

  const first = unacknowledgedMonsterCelebrationEvents([event], {
    learnerId: 'learner-a',
    store: storage,
  });

  assert.equal(first.length, 1);
  assert.equal(first[0].kind, 'hero-purchase');

  assert.equal(
    acknowledgeMonsterCelebrationEvents(first[0], {
      learnerId: 'learner-a',
      store: storage,
    }),
    true,
  );

  const acknowledged = acknowledgedMonsterCelebrationIds('learner-a', { store: storage });
  assert.equal(acknowledged.has(event.id), true);
  assert.equal(acknowledged.has('hero-mode:transaction:txn-hero-1'), true);
  assert.equal(
    acknowledged.has('reward:reward.presentation:module:hero-mode:reward.hero:purchase:txn-hero-1:celebration:purchase-reveal'),
    true,
  );
  assert.deepEqual(
    unacknowledgedMonsterCelebrationEvents([event], {
      learnerId: 'learner-a',
      store: storage,
    }),
    [],
  );
  assert.deepEqual(event.payload, originalPayload);
});
