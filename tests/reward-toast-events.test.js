import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseRewardToastEvent,
  normaliseRewardToastEvents,
  REWARD_TOAST_PRESENTATION_TYPE,
} from '../src/platform/rewards/reward-toast-events.js';

test('legacy reward.toast events become explicit toast presentation rows', () => {
  const rows = normaliseRewardToastEvent({
    id: 'reward.toast:guardian.renewed:learner-a:session-1:word-1',
    type: 'reward.toast',
    kind: 'guardian.renewed',
    subjectId: 'spelling',
    learnerId: 'learner-a',
    toast: {
      title: 'Word renewed.',
      body: '"because" held steady.',
    },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, REWARD_TOAST_PRESENTATION_TYPE);
  assert.equal(rows[0].rewardType, 'reward.toast');
  assert.equal(rows[0].kind, 'guardian.renewed');
  assert.equal(rows[0].title, 'Word renewed.');
  assert.equal(rows[0].body, '"because" held steady.');
  assert.equal(rows[0].dedupeKey, 'reward:reward.presentation:reward.toast:guardian.renewed:learner-a:session-1:word-1:toast:0');
});

test('legacy monster reward toasts preserve current shelf copy and portrait metadata', () => {
  const rows = normaliseRewardToastEvent({
    id: 'reward.monster:learner-a:inklet:caught:1:0',
    type: 'reward.monster',
    kind: 'caught',
    subjectId: 'spelling',
    learnerId: 'learner-a',
    monsterId: 'inklet',
    monster: { id: 'inklet', name: 'Inklet' },
    previous: { stage: 0, branch: 'b1' },
    next: { stage: 1, branch: 'b1' },
    toast: { title: 'Inklet', body: 'New creature unlocked.' },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rewardType, 'reward.monster');
  assert.equal(rows[0].kind, 'caught');
  assert.equal(rows[0].title, 'Inklet joined your Codex');
  assert.equal(rows[0].body, 'You caught a new friend!');
  assert.equal(rows[0].assetRef.monsterId, 'inklet');
  assert.equal(rows[0].assetRef.stage, 1);
  assert.equal(rows[0].monster.name, 'Inklet');
});

test('canonical celebration-only presentation events do not create toast rows', () => {
  const rows = normaliseRewardToastEvents({
    id: 'reward.presentation:module:hero-mode:reward.hero:purchase:txn-1',
    type: 'reward.presentation',
    producerType: 'module',
    producerId: 'hero-mode',
    rewardType: 'reward.hero',
    kind: 'purchase',
    learnerId: 'learner-a',
    presentations: {
      toast: [],
      celebration: [{ visualKind: 'hero-purchase', title: 'Unlocked' }],
    },
  });

  assert.deepEqual(rows, []);
});

test('canonical presentation events preserve multiple toast intents independently', () => {
  const rows = normaliseRewardToastEvents({
    id: 'reward.presentation:module:hero-mode:reward.hero:purchase:txn-2',
    type: 'reward.presentation',
    producerType: 'module',
    producerId: 'hero-mode',
    rewardType: 'reward.hero',
    kind: 'purchase',
    learnerId: 'learner-a',
    presentations: {
      toast: [
        { title: 'New outfit unlocked', body: 'Blue Cape is ready.' },
        { intentId: 'first-time-help', title: 'Try it on later', body: 'Open Hero Camp when you are ready.' },
      ],
    },
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].dedupeKey, 'reward:reward.presentation:module:hero-mode:reward.hero:purchase:txn-2:toast:0');
  assert.equal(rows[1].dedupeKey, 'reward:reward.presentation:module:hero-mode:reward.hero:purchase:txn-2:toast:first-time-help');
  assert.equal(rows[1].title, 'Try it on later');
});
