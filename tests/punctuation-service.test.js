import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPunctuationContentIndexes,
  createPunctuationMasteryKey,
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_RELEASE_ID,
} from '../shared/punctuation/content.js';
import { PUNCTUATION_EVENT_TYPES } from '../shared/punctuation/events.js';
import { createMemoryState, updateMemoryState } from '../shared/punctuation/scheduler.js';
import { createPunctuationService, PunctuationServiceError } from '../shared/punctuation/service.js';
import { projectPunctuationStars } from '../src/subjects/punctuation/star-projection.js';

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

function correctAnswerFor(item) {
  if (item.inputKind === 'choice') {
    return { choiceIndex: item.options.find((option) => option.text === item.model)?.index ?? 0 };
  }
  return { typed: item.model };
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

test('punctuation service uses injected randomness for stable session ids and generated practice', () => {
  const firstRepository = makeRepository();
  const firstService = createPunctuationService({ repository: firstRepository, now: () => 1_800_000_000_000, random: () => 0.99 });
  const firstStart = firstService.startSession('learner-a', { mode: 'endmarks', roundLength: '2' }).state;
  const choiceIndex = firstStart.session.currentItem.options.find((option) => option.text === firstStart.session.currentItem.model)?.index ?? 0;
  const firstFeedback = firstService.submitAnswer('learner-a', firstStart, { choiceIndex }).state;
  const firstGenerated = firstService.continueSession('learner-a', firstFeedback).state;

  const secondRepository = makeRepository();
  const secondService = createPunctuationService({ repository: secondRepository, now: () => 1_800_000_000_000, random: () => 0.99 });
  const secondStart = secondService.startSession('learner-a', { mode: 'endmarks', roundLength: '2' }).state;

  assert.equal(secondStart.session.id, firstStart.session.id);
  assert.equal(firstGenerated.session.currentItem.source, 'generated');
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

test('empty non-GPS submit records non-meaningful evidence and mints no Try Stars', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const start = service.startSession('learner-a', { mode: 'smart', roundLength: '1' }).state;

  service.submitAnswer('learner-a', start, start.session.currentItem.inputKind === 'choice'
    ? { choiceIndex: null }
    : { typed: '   ' });

  const attempt = repository.snapshot().data.progress.attempts.at(-1);
  assert.equal(attempt.meaningful, false);

  const stars = projectPunctuationStars(repository.snapshot().data.progress, PUNCTUATION_RELEASE_ID);
  assert.equal(stars.perMonster.pealark.total, 0);
  assert.equal(stars.perMonster.claspin.total, 0);
  assert.equal(stars.perMonster.curlune.total, 0);
});

test('wrong non-empty submit remains meaningful Try evidence', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 1_800_000_000_000, random: () => 0 });
  const start = service.startSession('learner-a', { mode: 'smart', roundLength: '1' }).state;

  service.submitAnswer('learner-a', start, start.session.currentItem.inputKind === 'choice'
    ? { choiceIndex: 99 }
    : { typed: 'not sure' });

  const attempt = repository.snapshot().data.progress.attempts.at(-1);
  assert.equal(attempt.meaningful, true);

  const stars = projectPunctuationStars(repository.snapshot().data.progress, PUNCTUATION_RELEASE_ID);
  assert.ok(stars.grand.grandStars >= 0);
  assert.ok(Object.values(stars.perMonster).some((entry) => entry.tryStars > 0));
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

test('focus sessions keep their selected cluster after continue and skip', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 0, random: () => 0 });
  const start = service.startSession('learner-a', { mode: 'structure', roundLength: '3' }).state;
  assert.equal(start.session.currentItem.clusterId, 'structure');

  const feedback = service.submitAnswer('learner-a', start, { choiceIndex: 1 }).state;
  const continued = service.continueSession('learner-a', feedback).state;
  assert.equal(continued.session.currentItem.clusterId, 'structure');

  const skipped = service.skipItem('learner-a', continued).state;
  assert.equal(skipped.session.currentItem.clusterId, 'structure');
});

test('weak spots sessions target weak facets and record weak attempt metadata', () => {
  const repository = makeRepository();
  repository.writeData('learner-a', {
    prefs: { mode: 'smart', roundLength: '1' },
    progress: {
      items: {},
      facets: { 'speech::insert': updateMemoryState(createMemoryState(), false, 0) },
      rewardUnits: {},
      attempts: [],
      sessionsCompleted: 0,
    },
  });
  const service = createPunctuationService({ repository, now: () => 0, random: () => 0 });

  const start = service.startSession('learner-a', { mode: 'weak', roundLength: '1' }).state;
  assert.equal(start.session.mode, 'weak');
  assert.equal(start.session.currentItem.id, 'sp_insert_question');
  assert.equal(start.session.weakFocus.skillId, 'speech');
  assert.equal(start.session.weakFocus.source, 'weak_facet');

  service.submitAnswer('learner-a', start, correctAnswerFor(start.session.currentItem));
  const attempt = repository.snapshot().data.progress.attempts.at(-1);
  assert.equal(attempt.sessionMode, 'weak');
  assert.equal(attempt.supportLevel, 0);
});

test('mixed transfer attempts update every included skill-by-mode facet', () => {
  const mixedTransfer = PUNCTUATION_CONTENT_MANIFEST.items.find((entry) => entry.id === 'sp_fa_transfer_at_last_speech');
  const manifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: [mixedTransfer],
    generatorFamilies: [],
  };
  const repository = makeRepository();
  const service = createPunctuationService({
    repository,
    now: () => 0,
    random: () => 0,
    manifest,
    indexes: createPunctuationContentIndexes(manifest),
  });

  const start = service.startSession('learner-a', { mode: 'smart', roundLength: '1' }).state;
  assert.equal(start.session.currentItem.id, 'sp_fa_transfer_at_last_speech');
  service.submitAnswer('learner-a', start, { typed: 'At last, Noah shouted, "We made it!"' });

  const data = repository.snapshot().data;
  assert.equal(data.progress.attempts.at(-1).mode, 'transfer');
  assert.equal(data.progress.facets['speech::transfer'].correct, 1);
  assert.equal(data.progress.facets['fronted_adverbial::transfer'].correct, 1);
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

test('previous release reward units do not count towards the current release denominator', () => {
  const oldReleaseId = 'punctuation-r3-endmarks-apostrophe-speech-comma-flow-boundary';
  assert.notEqual(oldReleaseId, PUNCTUATION_RELEASE_ID);
  const oldMasteryKey = createPunctuationMasteryKey({
    releaseId: oldReleaseId,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
  });
  const repository = makeRepository();
  repository.writeData('learner-a', {
    prefs: { mode: 'smart', roundLength: '1' },
    progress: {
      items: {},
      facets: {},
      rewardUnits: {
        [oldMasteryKey]: {
          masteryKey: oldMasteryKey,
          releaseId: oldReleaseId,
          clusterId: 'endmarks',
          rewardUnitId: 'sentence-endings-core',
          securedAt: 1,
        },
      },
      attempts: [],
      sessionsCompleted: 0,
    },
  });
  const service = createPunctuationService({ repository, now: () => 0, random: () => 0 });

  assert.equal(service.getStats('learner-a').securedRewardUnits, 0);
  assert.deepEqual(service.getAnalyticsSnapshot('learner-a').rewardUnits, []);

  const active = service.startSession('learner-a', { roundLength: '1' }).state;
  const summary = service.endSession('learner-a', active).state.summary;
  assert.equal(summary.rewardProgress.secured, 0);
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

test('getStats securedRewardUnits counts only entries with securedAt > 0 (defensive edge case)', () => {
  // Seed reward-unit entries where tracked != secured: 5 tracked, only 2
  // genuinely secured (positive securedAt). securedAt: 0, null, and missing
  // cannot occur after Writer normalisation but the filter is defensive.
  const repository = makeRepository();
  const now = Date.UTC(2026, 3, 25);
  repository.writeData('learner-a', {
    prefs: { mode: 'smart', roundLength: '4' },
    progress: {
      items: {},
      facets: {},
      rewardUnits: {
        [createPunctuationMasteryKey({ clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core' })]: {
          masteryKey: createPunctuationMasteryKey({ clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core' }),
          releaseId: PUNCTUATION_RELEASE_ID,
          clusterId: 'endmarks',
          rewardUnitId: 'sentence-endings-core',
          securedAt: now - 10_000,
        },
        [createPunctuationMasteryKey({ clusterId: 'apostrophe', rewardUnitId: 'apostrophe-contractions-core' })]: {
          masteryKey: createPunctuationMasteryKey({ clusterId: 'apostrophe', rewardUnitId: 'apostrophe-contractions-core' }),
          releaseId: PUNCTUATION_RELEASE_ID,
          clusterId: 'apostrophe',
          rewardUnitId: 'apostrophe-contractions-core',
          securedAt: now - 5_000,
        },
        [createPunctuationMasteryKey({ clusterId: 'apostrophe', rewardUnitId: 'apostrophe-possession-core' })]: {
          masteryKey: createPunctuationMasteryKey({ clusterId: 'apostrophe', rewardUnitId: 'apostrophe-possession-core' }),
          releaseId: PUNCTUATION_RELEASE_ID,
          clusterId: 'apostrophe',
          rewardUnitId: 'apostrophe-possession-core',
          securedAt: 0,
        },
        [createPunctuationMasteryKey({ clusterId: 'speech', rewardUnitId: 'speech-core' })]: {
          masteryKey: createPunctuationMasteryKey({ clusterId: 'speech', rewardUnitId: 'speech-core' }),
          releaseId: PUNCTUATION_RELEASE_ID,
          clusterId: 'speech',
          rewardUnitId: 'speech-core',
          securedAt: null,
        },
        [createPunctuationMasteryKey({ clusterId: 'comma_flow', rewardUnitId: 'list-commas-core' })]: {
          masteryKey: createPunctuationMasteryKey({ clusterId: 'comma_flow', rewardUnitId: 'list-commas-core' }),
          releaseId: PUNCTUATION_RELEASE_ID,
          clusterId: 'comma_flow',
          rewardUnitId: 'list-commas-core',
        },
      },
      attempts: [],
      sessionsCompleted: 0,
    },
  });
  const service = createPunctuationService({ repository, now: () => now, random: () => 0 });
  const stats = service.getStats('learner-a');

  assert.equal(stats.trackedRewardUnits, 5, 'all 5 tracked entries present');
  assert.equal(stats.securedRewardUnits, 2, 'only 2 entries with securedAt > 0 count as secured');
  assert.equal(stats.publishedRewardUnits, 14, 'published denominator unchanged');
});
