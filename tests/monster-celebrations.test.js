import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isMonsterCelebrationEvent,
  normaliseMonsterCelebrationEvent,
  shouldDelayMonsterCelebrations,
  spellingSessionEnded,
  subjectSessionEnded,
} from '../src/platform/game/monster-celebrations.js';
import {
  acknowledgeMonsterCelebrationEvents,
  acknowledgedMonsterCelebrationIds,
  unacknowledgedMonsterCelebrationEvents,
} from '../src/platform/game/monster-celebration-acks.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

test('monster celebration timing keeps Spelling session-end behaviour', () => {
  assert.equal(shouldDelayMonsterCelebrations('spelling', { phase: 'session' }, { phase: 'session' }), true);
  assert.equal(subjectSessionEnded('spelling', { phase: 'session' }, { phase: 'summary' }), true);
  assert.equal(spellingSessionEnded({ phase: 'session' }, { phase: 'summary' }), true);
});

test('monster celebration timing defers Punctuation active-question overlays until session end', () => {
  assert.equal(shouldDelayMonsterCelebrations('punctuation', { phase: 'active-item' }, { phase: 'feedback' }), true);
  assert.equal(shouldDelayMonsterCelebrations('punctuation', { phase: 'feedback' }, { phase: 'summary' }), true);
  assert.equal(subjectSessionEnded('punctuation', { phase: 'feedback' }, { phase: 'summary' }), true);
  assert.equal(subjectSessionEnded('punctuation', { phase: 'setup' }, { phase: 'summary' }), false);
});

test('monster celebration timing defers Grammar session overlays until session end', () => {
  assert.equal(shouldDelayMonsterCelebrations('grammar', { phase: 'session' }, { phase: 'session' }), true);
  assert.equal(shouldDelayMonsterCelebrations('grammar', { phase: 'feedback' }, { phase: 'summary' }), true);
  assert.equal(subjectSessionEnded('grammar', { phase: 'session' }, { phase: 'summary' }), true);
  assert.equal(subjectSessionEnded('grammar', { phase: 'setup' }, { phase: 'summary' }), false);
});

test('monster celebration timing leaves unknown subjects immediate', () => {
  assert.equal(shouldDelayMonsterCelebrations('reading', { phase: 'session' }, { phase: 'session' }), false);
  assert.equal(subjectSessionEnded('reading', { phase: 'session' }, { phase: 'summary' }), false);
});

test('reward.presentation celebration intents can enter the legacy monster celebration queue', () => {
  const event = {
    id: 'reward.presentation:subject:grammar:reward.monster:evolve:bracehart:hatch',
    type: 'reward.presentation',
    producerType: 'subject',
    producerId: 'grammar',
    rewardType: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    occurredAt: 1777399200000,
    fromState: { stage: 0, level: 0, caught: true, branch: 'b1' },
    toState: { stage: 1, level: 0, caught: true, branch: 'b1' },
    payload: {
      monsterId: 'bracehart',
      monster: { id: 'bracehart', name: 'Bracehart', accent: '#8B5CF6' },
    },
    presentations: {
      toast: [],
      celebration: [{
        id: 'reward.presentation:subject:grammar:reward.monster:evolve:bracehart:hatch:celebration:hatch',
        intentId: 'hatch',
        dedupeKey: 'reward:reward.presentation:subject:grammar:reward.monster:evolve:bracehart:hatch:celebration:hatch',
        visualKind: 'evolve',
        timing: 'session-end',
        title: 'Hatched',
        assetRef: { family: 'monster', monsterId: 'bracehart', branch: 'b1', stage: 1 },
      }],
    },
  };

  assert.equal(isMonsterCelebrationEvent(event), true);
  const normalised = normaliseMonsterCelebrationEvent(event);
  assert.equal(normalised.type, 'reward.presentation');
  assert.equal(normalised.kind, 'evolve');
  assert.equal(normalised.subjectId, 'grammar');
  assert.equal(normalised.producerType, 'subject');
  assert.equal(normalised.producerId, 'grammar');
  assert.equal(normalised.monsterId, 'bracehart');
  assert.equal(normalised.monster.name, 'Bracehart');
  assert.equal(normalised.next.stage, 1);
  assert.equal(
    normalised.presentationAckKey,
    'reward:reward.presentation:subject:grammar:reward.monster:evolve:bracehart:hatch:celebration:hatch',
  );
});

test('monster celebration normalisation preserves Star display fields for Egg Found overlays', () => {
  const event = {
    id: 'reward.monster:learner-a:punctuation:first-star:pealark:caught',
    type: 'reward.monster',
    kind: 'caught',
    subjectId: 'punctuation',
    learnerId: 'learner-a',
    monsterId: 'pealark',
    monster: { id: 'pealark', name: 'Pealark' },
    previous: { stage: 0, displayState: 'not-found', displayStars: 0, branch: 'b1' },
    next: { stage: 1, displayState: 'egg-found', displayStars: 1, displayStage: 1, branch: 'b2' },
    createdAt: 1777399200000,
  };

  const normalised = normaliseMonsterCelebrationEvent(event);

  assert.equal(normalised.next.displayState, 'egg-found');
  assert.equal(normalised.next.displayStars, 1);
  assert.equal(normalised.next.displayStage, 1);
  assert.equal(normalised.next.stage, 1);
  assert.equal(normalised.next.branch, 'b2');
  assert.equal(normalised.subjectId, 'punctuation');
  assert.equal(normalised.previous.displayState, 'not-found');
  assert.equal(normalised.previous.displayStars, 0);
});

test('monster celebration acknowledgement writes legacy id and presentation intent key', () => {
  const storage = installMemoryStorage();
  const legacyEvent = {
    id: 'reward.monster:learner-a:punctuation:r4:speech:unit-1:pealark:caught',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    monsterId: 'pealark',
    monster: { id: 'pealark', name: 'Pealark' },
    previous: { stage: 0, level: 0, caught: false, branch: 'b1' },
    next: { stage: 0, level: 0, caught: true, branch: 'b1' },
    createdAt: 1777399200000,
    toast: { title: 'Egg Found', body: 'You found Pealark.' },
  };

  assert.equal(acknowledgeMonsterCelebrationEvents(legacyEvent, { learnerId: 'learner-a', store: storage }), true);
  const ids = acknowledgedMonsterCelebrationIds('learner-a', { store: storage });
  assert.equal(ids.has(legacyEvent.id), true);
  assert.equal(
    ids.has('reward:reward.presentation:reward.monster:learner-a:punctuation:r4:speech:unit-1:pealark:caught:celebration:0'),
    true,
  );
  assert.deepEqual(unacknowledgedMonsterCelebrationEvents([legacyEvent], { learnerId: 'learner-a', store: storage }), []);
});

test('presentation celebration acknowledgement still honours old legacy event ids', () => {
  const storage = installMemoryStorage();
  const sourceEventId = 'reward.monster:learner-a:grammar:r4:word_classes:bracehart:evolve';
  const presentationEvent = {
    id: `reward.presentation:${sourceEventId}`,
    type: 'reward.presentation',
    producerType: 'subject',
    producerId: 'grammar',
    rewardType: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    sourceEventId,
    occurredAt: 1777399200000,
    fromState: { stage: 0, level: 0, caught: true, branch: 'b1' },
    toState: { stage: 1, level: 0, caught: true, branch: 'b1' },
    payload: {
      monsterId: 'bracehart',
      monster: { id: 'bracehart', name: 'Bracehart' },
    },
    presentations: {
      celebration: [{
        visualKind: 'evolve',
        timing: 'session-end',
        title: 'Hatched',
      }],
    },
  };

  acknowledgeMonsterCelebrationEvents({
    id: sourceEventId,
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    monsterId: 'bracehart',
    monster: { id: 'bracehart', name: 'Bracehart' },
    previous: { stage: 0, level: 0, caught: true, branch: 'b1' },
    next: { stage: 1, level: 0, caught: true, branch: 'b1' },
    createdAt: 1777399200000,
  }, { learnerId: 'learner-a', store: storage });

  assert.deepEqual(
    unacknowledgedMonsterCelebrationEvents([presentationEvent], { learnerId: 'learner-a', store: storage }),
    [],
  );
});
