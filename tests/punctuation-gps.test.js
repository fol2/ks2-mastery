import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_EVENT_TYPES } from '../shared/punctuation/events.js';
import { createPunctuationService } from '../shared/punctuation/service.js';
import { PUNCTUATION_RELEASE_ID } from '../shared/punctuation/content.js';
import { projectPunctuationStars } from '../src/subjects/punctuation/star-projection.js';

function makeRepository(initialData = null) {
  let data = initialData;
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
    snapshot() {
      return { data, practiceSession };
    },
  };
}

function correctAnswerFor(item) {
  if (item.inputKind === 'choice') {
    return { choiceIndex: item.options.find((option) => option.text === item.model)?.index ?? 0 };
  }
  return { typed: item.model };
}

function wrongAnswerFor(item) {
  return item.inputKind === 'choice' ? { choiceIndex: 99 } : { typed: 'not sure' };
}

function expectedContextForState(state) {
  return {
    expectedSessionId: state.session.id,
    expectedItemId: state.session.currentItem?.id || state.session.currentItemId,
    expectedAnsweredCount: state.session.answeredCount,
    expectedReleaseId: state.session.releaseId,
  };
}

function submitGpsAnswer(service, learnerId, state, answer) {
  return service.submitAnswer(learnerId, state, answer, expectedContextForState(state));
}

function skipGpsItem(service, learnerId, state) {
  return service.skipItem(learnerId, state, expectedContextForState(state));
}

function endGpsSession(service, learnerId, state) {
  return service.endSession(learnerId, state, expectedContextForState(state));
}

test('gps mode starts with a locked bounded queue and no guided support', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });

  const start = service.startSession('learner-a', { mode: 'gps', testLength: '3' }).state;

  assert.equal(start.phase, 'active-item');
  assert.equal(start.session.mode, 'gps');
  assert.equal(start.session.length, 3);
  assert.equal(start.session.gps.queueItemIds.length, 3);
  assert.equal(start.session.currentItemId, start.session.gps.queueItemIds[0]);
  assert.equal(start.session.guided, null);
  assert.equal(start.session.gps.delayedFeedback, true);
  assert.equal(repository.snapshot().practiceSession.status, 'active');
});

test('gps submit advances through the fixed queue without feedback or progress leakage', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const start = service.startSession('learner-a', { mode: 'gps', roundLength: '3' }).state;
  const queue = [...start.session.gps.queueItemIds];

  const first = submitGpsAnswer(service, 'learner-a', start, correctAnswerFor(start.session.currentItem));

  assert.equal(first.state.phase, 'active-item');
  assert.equal(first.state.feedback, null);
  assert.deepEqual(first.events, []);
  assert.deepEqual(first.state.session.gps.queueItemIds, queue);
  assert.equal(first.state.session.answeredCount, 1);
  assert.equal(first.state.session.currentItemId, queue[1]);
  assert.equal(first.state.session.gps.responses.length, 1);
  assert.equal(repository.snapshot().data, null);
  assert.equal(service.getStats('learner-a').attempts, 0);
});

test('gps mutating commands require visible session context', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const start = service.startSession('learner-a', { mode: 'gps', roundLength: '2' }).state;

  for (const runCommand of [
    () => service.submitAnswer('learner-a', start, correctAnswerFor(start.session.currentItem)),
    () => service.skipItem('learner-a', start),
    () => service.endSession('learner-a', start),
  ]) {
    assert.throws(
      runCommand,
      (error) => {
        assert.equal(error.code, 'punctuation_command_stale');
        assert.equal(error.details.missingExpectedContext, true);
        assert.equal(error.details.sessionId, start.session.id);
        assert.equal(error.details.itemId, start.session.currentItemId);
        return true;
      },
    );
  }
  assert.equal(repository.snapshot().data, null);
});

test('gps submit fails closed when the locked queue no longer resolves', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const start = service.startSession('learner-a', { mode: 'gps', roundLength: '3' }).state;
  const stale = JSON.parse(JSON.stringify(start));
  stale.session.gps.queueItemIds[1] = 'missing-content-item';

  assert.throws(
    () => submitGpsAnswer(service, 'learner-a', stale, correctAnswerFor(stale.session.currentItem)),
    (error) => {
      assert.equal(error.code, 'punctuation_gps_queue_stale');
      assert.equal(error.details.itemId, 'missing-content-item');
      assert.equal(error.details.answeredCount, 1);
      return true;
    },
  );
  assert.equal(repository.snapshot().data, null);
});

test('gps completion fails closed when a stored response no longer resolves', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const start = service.startSession('learner-a', { mode: 'gps', roundLength: '2' }).state;
  const active = submitGpsAnswer(service, 'learner-a', start, correctAnswerFor(start.session.currentItem)).state;
  const stale = JSON.parse(JSON.stringify(active));
  stale.session.gps.responses[0].itemId = 'missing-completed-item';

  assert.throws(
    () => submitGpsAnswer(service, 'learner-a', stale, correctAnswerFor(stale.session.currentItem)),
    (error) => {
      assert.equal(error.code, 'punctuation_gps_response_stale');
      assert.equal(error.details.itemId, 'missing-completed-item');
      assert.equal(error.details.responseIndex, 0);
      return true;
    },
  );
  assert.equal(repository.snapshot().data, null);
  assert.equal(repository.snapshot().practiceSession.status, 'active');
});

test('gps commands fail closed when the content release drifts even if item ids resolve', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const start = service.startSession('learner-a', { mode: 'gps', roundLength: '2' }).state;
  const staleStart = JSON.parse(JSON.stringify(start));
  staleStart.session.releaseId = 'stale-release-id';

  assert.throws(
    () => submitGpsAnswer(service, 'learner-a', staleStart, correctAnswerFor(staleStart.session.currentItem)),
    (error) => {
      assert.equal(error.code, 'punctuation_gps_release_stale');
      assert.equal(error.details.command, 'submit-answer');
      assert.equal(error.details.sessionReleaseId, 'stale-release-id');
      return true;
    },
  );
  assert.throws(
    () => skipGpsItem(service, 'learner-a', staleStart),
    (error) => {
      assert.equal(error.code, 'punctuation_gps_release_stale');
      assert.equal(error.details.command, 'skip-item');
      return true;
    },
  );

  const active = submitGpsAnswer(service, 'learner-a', start, correctAnswerFor(start.session.currentItem)).state;
  const staleActive = JSON.parse(JSON.stringify(active));
  staleActive.session.releaseId = 'stale-release-id';

  assert.throws(
    () => submitGpsAnswer(service, 'learner-a', staleActive, correctAnswerFor(staleActive.session.currentItem)),
    (error) => {
      assert.equal(error.code, 'punctuation_gps_release_stale');
      assert.equal(error.details.command, 'submit-answer');
      return true;
    },
  );
  assert.throws(
    () => endGpsSession(service, 'learner-a', staleActive),
    (error) => {
      assert.equal(error.code, 'punctuation_gps_release_stale');
      assert.equal(error.details.command, 'finalise-gps');
      return true;
    },
  );
  assert.equal(repository.snapshot().data, null);
  assert.equal(repository.snapshot().practiceSession.status, 'active');
});

test('gps completion releases review rows and then writes learning evidence', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  let state = service.startSession('learner-a', { mode: 'gps', roundLength: '3' }).state;

  state = submitGpsAnswer(service, 'learner-a', state, correctAnswerFor(state.session.currentItem)).state;
  state = submitGpsAnswer(service, 'learner-a', state, wrongAnswerFor(state.session.currentItem)).state;
  const finished = submitGpsAnswer(service, 'learner-a', state, correctAnswerFor(state.session.currentItem));

  assert.equal(finished.state.phase, 'summary');
  assert.equal(finished.state.feedback, null);
  assert.equal(finished.state.summary.label, 'Punctuation GPS test summary');
  assert.equal(finished.state.summary.total, 3);
  assert.equal(finished.state.summary.correct, 2);
  assert.equal(finished.state.summary.gps.reviewItems.length, 3);
  assert.equal(finished.state.summary.gps.reviewItems[1].correct, false);
  assert.equal(finished.state.summary.gps.reviewItems[1].displayCorrection.length > 0, true);
  assert.equal(finished.state.summary.gps.reviewItems.every((entry) => !('variantSignature' in entry)), true);
  assert.equal(finished.state.summary.gps.recommendedMode, 'weak');
  assert.equal(finished.events.filter((event) => event.type === PUNCTUATION_EVENT_TYPES.ITEM_ATTEMPTED).length, 3);
  assert.equal(finished.events.some((event) => event.type === PUNCTUATION_EVENT_TYPES.SESSION_COMPLETED), true);

  const data = repository.snapshot().data;
  assert.equal(data.progress.attempts.length, 3);
  assert.equal(data.progress.attempts.every((attempt) => attempt.sessionMode === 'gps'), true);
  assert.equal(data.progress.attempts.every((attempt) => attempt.testMode === 'gps'), true);
  assert.equal(data.progress.sessionsCompleted, 1);
});

test('gps skip records non-meaningful review evidence and mints no Try Stars', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const state = service.startSession('learner-a', { mode: 'gps', roundLength: '1' }).state;

  const finished = skipGpsItem(service, 'learner-a', state);

  assert.equal(finished.state.phase, 'summary');
  assert.equal(finished.state.summary.total, 1);
  assert.equal(repository.snapshot().data.progress.attempts.length, 1);
  assert.equal(repository.snapshot().data.progress.attempts[0].meaningful, false);

  const stars = projectPunctuationStars(repository.snapshot().data.progress, PUNCTUATION_RELEASE_ID);
  assert.equal(stars.perMonster.pealark.total, 0);
  assert.equal(stars.perMonster.claspin.total, 0);
  assert.equal(stars.perMonster.curlune.total, 0);
});

test('gps end early releases accumulated delayed review and evidence once', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const start = service.startSession('learner-a', { mode: 'gps', roundLength: '3' }).state;
  const active = submitGpsAnswer(service, 'learner-a', start, wrongAnswerFor(start.session.currentItem)).state;

  const ended = endGpsSession(service, 'learner-a', active);

  assert.equal(ended.state.phase, 'summary');
  assert.equal(ended.state.summary.total, 1);
  assert.equal(ended.state.summary.correct, 0);
  assert.equal(ended.state.summary.gps.reviewItems.length, 1);
  assert.equal(ended.events.filter((event) => event.type === PUNCTUATION_EVENT_TYPES.ITEM_ATTEMPTED).length, 1);
  assert.equal(ended.events.some((event) => event.type === PUNCTUATION_EVENT_TYPES.SESSION_COMPLETED), true);
  assert.equal(repository.snapshot().data.progress.attempts.length, 1);
  assert.equal(repository.snapshot().data.progress.sessionsCompleted, 1);

  const repeated = service.endSession('learner-a', ended.state);

  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.events, []);
  assert.equal(repository.snapshot().data.progress.attempts.length, 1);
  assert.equal(repository.snapshot().data.progress.sessionsCompleted, 1);
});
