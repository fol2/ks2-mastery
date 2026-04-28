import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseRewardPresentationEvent,
  presentationAckKey,
  presentationEventsFromLegacyRewardEvents,
  resolveRewardCelebration,
  resolveRewardToast,
} from '../src/platform/rewards/reward-presentations.js';

const monster = Object.freeze({
  id: 'pealark',
  name: 'Pealark',
  accent: '#3E6FA8',
});

function legacyMonsterEvent(overrides = {}) {
  return {
    id: 'reward.monster:learner-a:punctuation:r4:speech:unit-1:pealark:caught',
    type: 'reward.monster',
    kind: 'caught',
    subjectId: 'punctuation',
    learnerId: 'learner-a',
    monsterId: 'pealark',
    monster,
    previous: { stage: 0, level: 0, caught: false, branch: 'a' },
    next: { stage: 0, level: 0, caught: true, branch: 'a' },
    createdAt: 1777399200000,
    toast: {
      title: 'Egg Found',
      body: 'You found Pealark.',
    },
    releaseId: 'r4',
    clusterId: 'speech',
    rewardUnitId: 'unit-1',
    masteryKey: 'punctuation:r4:speech:unit-1',
    ...overrides,
  };
}

test('legacy reward.monster adapts to source-agnostic toast and celebration presentations', () => {
  const presentation = normaliseRewardPresentationEvent(legacyMonsterEvent());

  assert.equal(presentation.type, 'reward.presentation');
  assert.equal(presentation.producerType, 'subject');
  assert.equal(presentation.producerId, 'punctuation');
  assert.equal(presentation.rewardType, 'reward.monster');
  assert.equal(presentation.kind, 'caught');
  assert.equal(presentation.learnerId, 'learner-a');
  assert.equal(presentation.sourceEventId, 'reward.monster:learner-a:punctuation:r4:speech:unit-1:pealark:caught');
  assert.equal(presentation.payload.monsterId, 'pealark');
  assert.equal(presentation.payload.masteryKey, 'punctuation:r4:speech:unit-1');

  assert.equal(presentation.presentations.toast.length, 1);
  assert.equal(presentation.presentations.toast[0].title, 'Egg Found');
  assert.equal(presentation.presentations.toast[0].body, 'You found Pealark.');
  assert.equal(presentation.presentations.toast[0].timing, 'immediate');
  assert.equal(
    presentation.presentations.toast[0].dedupeKey,
    `reward:${presentation.id}:toast:0`,
  );

  assert.equal(presentation.presentations.celebration.length, 1);
  assert.equal(presentation.presentations.celebration[0].visualKind, 'caught');
  assert.equal(presentation.presentations.celebration[0].timing, 'producer-controlled');
  assert.equal(presentation.presentations.celebration[0].assetRef.monsterId, 'pealark');
  assert.equal(
    presentation.presentations.celebration[0].dedupeKey,
    `reward:${presentation.id}:celebration:0`,
  );
});

test('legacy reward.monster levelup adapts to toast-only unless explicitly promoted later', () => {
  const presentation = normaliseRewardPresentationEvent(legacyMonsterEvent({
    id: 'reward.monster:learner-a:pealark:levelup:1:2',
    kind: 'levelup',
    toast: {
      title: 'Pealark',
      body: 'Level increased.',
    },
  }));

  assert.equal(presentation.kind, 'levelup');
  assert.equal(presentation.presentations.toast.length, 1);
  assert.equal(presentation.presentations.toast[0].body, 'Level increased.');
  assert.deepEqual(presentation.presentations.celebration, []);
});

test('legacy reward.toast adapts to toast-only presentation without monster payload', () => {
  const presentation = normaliseRewardPresentationEvent({
    id: 'reward.toast:guardian.renewed:learner-a:session-1:word-1',
    type: 'reward.toast',
    kind: 'guardian.renewed',
    subjectId: 'spelling',
    learnerId: 'learner-a',
    sessionId: 'session-1',
    sourceEventId: 'spelling.guardian.renewed:word-1',
    createdAt: 1777399300000,
    toast: {
      title: 'Word renewed.',
      body: '"because" held steady.',
    },
  });

  assert.equal(presentation.type, 'reward.presentation');
  assert.equal(presentation.producerType, 'subject');
  assert.equal(presentation.producerId, 'spelling');
  assert.equal(presentation.rewardType, 'reward.toast');
  assert.equal(presentation.payload.sessionId, 'session-1');
  assert.equal(presentation.payload.sourceEventId, 'spelling.guardian.renewed:word-1');
  assert.equal(presentation.presentations.toast.length, 1);
  assert.equal(presentation.presentations.toast[0].title, 'Word renewed.');
  assert.deepEqual(presentation.presentations.celebration, []);
});

test('canonical presentation event preserves plural presentation arrays and unknown future keys', () => {
  const presentation = normaliseRewardPresentationEvent({
    id: 'reward.presentation:module:hero-mode:reward.hero:purchase:txn-1',
    type: 'reward.presentation',
    producerType: 'module',
    producerId: 'hero-mode',
    rewardType: 'reward.hero',
    kind: 'purchase',
    learnerId: 'learner-a',
    occurredAt: 1777399400000,
    payload: {
      transactionId: 'txn-1',
      inventoryItemId: 'cape-blue',
    },
    presentations: {
      toast: [
        { title: 'New outfit unlocked', body: 'Blue Cape is ready.' },
        { intentId: 'first-time-help', title: 'Try it on later', body: 'Open Hero Camp when you are ready.' },
      ],
      celebration: [
        { visualKind: 'hero-purchase', timing: 'immediate', title: 'New outfit unlocked' },
      ],
      audio: [
        { intentId: 'soft-chime', src: '/audio/chime.mp3' },
      ],
    },
  });

  assert.equal(presentation.producerType, 'module');
  assert.equal(presentation.producerId, 'hero-mode');
  assert.equal(presentation.presentations.toast.length, 2);
  assert.equal(presentation.presentations.toast[1].dedupeKey, `reward:${presentation.id}:toast:first-time-help`);
  assert.equal(presentation.presentations.celebration.length, 1);
  assert.equal(presentation.presentations.celebration[0].visualKind, 'hero-purchase');
  assert.equal(presentation.presentations.audio.length, 1);
  assert.equal(presentation.presentations.audio[0].dedupeKey, `reward:${presentation.id}:audio:soft-chime`);
});

test('presentation helpers resolve intents from both canonical and legacy shapes', () => {
  const legacy = legacyMonsterEvent();
  const canonical = normaliseRewardPresentationEvent(legacy);

  assert.equal(resolveRewardToast(legacy).length, 1);
  assert.equal(resolveRewardCelebration(legacy).length, 1);
  assert.equal(resolveRewardToast(canonical).length, 1);
  assert.equal(resolveRewardCelebration(canonical).length, 1);
});

test('presentationEventsFromLegacyRewardEvents filters invalid entries and keeps stable order', () => {
  const events = presentationEventsFromLegacyRewardEvents([
    null,
    { type: 'unknown.reward' },
    legacyMonsterEvent({ monsterId: 'pealark' }),
    {
      id: 'reward.toast:mission:learner-a:session-1',
      type: 'reward.toast',
      kind: 'guardian.mission-completed',
      subjectId: 'spelling',
      learnerId: 'learner-a',
      toast: { title: 'Mission complete.', body: '3 renewed, 1 recovered.' },
    },
  ]);

  assert.equal(events.length, 2);
  assert.equal(events[0].rewardType, 'reward.monster');
  assert.equal(events[1].rewardType, 'reward.toast');
});

test('presentationAckKey is deterministic per event, presentation kind, and intent id', () => {
  assert.equal(
    presentationAckKey('reward.presentation:subject:grammar:reward.monster:evolve:1', 'celebration', 'hatch'),
    'reward:reward.presentation:subject:grammar:reward.monster:evolve:1:celebration:hatch',
  );
  assert.equal(
    presentationAckKey({ id: 'reward.presentation:subject:spelling:reward.toast:guardian:1' }, 'toast', 0),
    'reward:reward.presentation:subject:spelling:reward.toast:guardian:1:toast:0',
  );
  assert.equal(presentationAckKey('', 'toast', 0), '');
  assert.equal(presentationAckKey('event-1', '', 0), '');
});
