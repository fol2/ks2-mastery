import test from 'node:test';
import assert from 'node:assert/strict';

import { createPunctuationMasteryKey } from '../shared/punctuation/content.js';
import { PUNCTUATION_EVENT_TYPES } from '../shared/punctuation/events.js';
import { createPunctuationService, PunctuationServiceError } from '../shared/punctuation/service.js';

function makeRepository() {
  let data = null;
  let practiceSession = null;
  return {
    readData() {
      return data;
    },
    writeData(_learnerId, nextData) {
      data = JSON.parse(JSON.stringify(nextData));
      return data;
    },
    syncPracticeSession(_learnerId, _state, record) {
      practiceSession = JSON.parse(JSON.stringify(record));
      return practiceSession;
    },
    resetLearner() {
      data = null;
      practiceSession = null;
    },
    snapshot() {
      return { data, practiceSession };
    },
  };
}

test('punctuation service follows setup -> active-item -> feedback -> active-item -> summary', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const start = service.startSession('learner-a', { roundLength: '2' });
  assert.equal(start.state.phase, 'active-item');
  assert.equal(start.state.session.currentItem.mode, 'choose');
  assert.equal(repository.snapshot().practiceSession.status, 'active');

  const first = service.submitAnswer('learner-a', start.state, { choiceIndex: start.state.session.currentItem.options.find((option) => option.text === start.state.session.currentItem.model)?.index ?? 1 });
  assert.equal(first.state.phase, 'feedback');
  assert.equal(first.state.feedback.kind, 'success');
  assert.equal(first.events.some((event) => event.type === PUNCTUATION_EVENT_TYPES.ITEM_ATTEMPTED), true);

  const secondItem = service.continueSession('learner-a', first.state);
  assert.equal(secondItem.state.phase, 'active-item');
  const second = service.submitAnswer('learner-a', secondItem.state, { typed: secondItem.state.session.currentItem.model });
  const summary = service.continueSession('learner-a', second.state);
  assert.equal(summary.state.phase, 'summary');
  assert.equal(summary.state.summary.total, 2);
  assert.equal(summary.events.some((event) => event.type === PUNCTUATION_EVENT_TYPES.SESSION_COMPLETED), true);
  assert.equal(repository.snapshot().practiceSession.status, 'completed');
});

test('punctuation service emits misconception events and serialisable feedback', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  let state = service.startSession('learner-a', { mode: 'speech', roundLength: '1' }).state;
  while (state.session.currentItem.id !== 'sp_choose_reporting_comma') {
    state = service.skipItem('learner-a', state).state;
    if (state.phase === 'summary') state = service.startSession('learner-a', { mode: 'speech', roundLength: '4' }).state;
  }
  const result = service.submitAnswer('learner-a', state, { choiceIndex: 1 });
  assert.equal(result.state.feedback.kind, 'error');
  assert.equal(result.events.some((event) => event.type === PUNCTUATION_EVENT_TYPES.MISCONCEPTION_OBSERVED), true);
  assert.doesNotThrow(() => JSON.stringify(result.state));
});

test('punctuation service rejects illegal transitions with named errors and no mutation', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1, random: () => 0 });
  const initial = service.initState(null);
  assert.throws(
    () => service.submitAnswer('learner-a', initial, { typed: 'x' }),
    (error) => error instanceof PunctuationServiceError && error.code === 'punctuation_session_stale',
  );
  assert.equal(repository.snapshot().data, null);

  const active = service.startSession('learner-a').state;
  assert.throws(
    () => service.continueSession('learner-a', active),
    (error) => error instanceof PunctuationServiceError && error.code === 'punctuation_transition_invalid',
  );
});

test('one correct answer does not unlock secure-unit progress', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 0, random: () => 0 });
  const start = service.startSession('learner-a', { roundLength: '1' }).state;
  service.submitAnswer('learner-a', start, { choiceIndex: 1 });
  const data = repository.snapshot().data;
  assert.deepEqual(Object.keys(data.progress.rewardUnits), []);
  const stats = service.getStats('learner-a');
  assert.equal(stats.securedRewardUnits, 0);
});

test('spaced clean attempts emit a secure-unit event once', () => {
  const repository = makeRepository();
  let now = 0;
  const service = createPunctuationService({ repository, now: () => now, random: () => 0 });
  let unitEvents = [];
  for (const day of [0, 4, 8]) {
    now = day * 24 * 60 * 60 * 1000;
    const start = service.startSession('learner-a', { mode: 'endmarks', roundLength: '1' }).state;
    const submit = service.submitAnswer('learner-a', start, { choiceIndex: 1 });
    unitEvents = unitEvents.concat(submit.events.filter((event) => event.type === PUNCTUATION_EVENT_TYPES.UNIT_SECURED));
  }
  assert.equal(unitEvents.length, 1);
  assert.equal(unitEvents[0].masteryKey, createPunctuationMasteryKey({
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
  }));
  assert.equal(service.getStats('learner-a').securedRewardUnits, 1);
});
