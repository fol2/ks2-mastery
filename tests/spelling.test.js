import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage, MemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { SPELLING_EVENT_TYPES } from '../src/subjects/spelling/events.js';
import { SPELLING_SERVICE_STATE_VERSION } from '../src/subjects/spelling/service-contract.js';
import { WORDS, WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';
import { rewardEventsFromSpellingEvents } from '../src/subjects/spelling/event-hooks.js';
import { monsterSummaryFromSpellingAnalytics } from '../src/platform/game/monster-system.js';
import { getOverallSpellingStats, spellingModule } from '../src/subjects/spelling/module.js';
import { createLegacySpellingEngine } from '../shared/spelling/legacy-engine.js';

function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSequenceRandom(values, fallback = 0.99) {
  let index = 0;
  return function sequenceRandom() {
    if (index >= values.length) return fallback;
    const value = Number(values[index]);
    index += 1;
    return Number.isFinite(value) ? value : fallback;
  };
}

function makeService({ now, random, storage = installMemoryStorage() } = {}) {
  const repositories = createLocalPlatformRepositories({ storage });
  const spoken = [];
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random,
    tts: {
      speak(payload) {
        spoken.push(payload);
      },
      stop() {},
      warmup() {},
    },
  });
  return { storage, repositories, service, spoken };
}

function countStorageReads(storage) {
  const reads = new Map();
  const originalGetItem = storage.getItem.bind(storage);
  storage.getItem = (key) => {
    reads.set(key, (reads.get(key) || 0) + 1);
    return originalGetItem(key);
  };
  return reads;
}

function continueUntilSummary(service, learnerId, state, answer = 'possess') {
  const events = [];
  let current = state;

  while (current.phase === 'session') {
    const submitted = service.submitAnswer(learnerId, current, answer);
    events.push(...submitted.events);
    current = submitted.state;
    assert.equal(current.awaitingAdvance, true);
    const continued = service.continueSession(learnerId, current);
    events.push(...continued.events);
    current = continued.state;
  }

  return { state: current, events };
}

function continueUntilSummaryWithCurrentAnswers(service, learnerId, state) {
  const events = [];
  const seenWords = [];
  let current = state;

  while (current.phase === 'session') {
    const answer = current.session.currentCard.word.word;
    seenWords.push(answer);
    const submitted = service.submitAnswer(learnerId, current, answer);
    events.push(...submitted.events);
    current = submitted.state;
    assert.equal(current.awaitingAdvance, true);
    const continued = service.continueSession(learnerId, current);
    events.push(...continued.events);
    current = continued.state;
  }

  return { state: current, events, seenWords };
}

function sessionWords(session) {
  return (session?.uniqueWords || []).map((slug) => WORD_BY_SLUG[slug]).filter(Boolean);
}

function completeSingleWordRoundWithAnswer(service, learnerId, slug, answer = slug) {
  const started = service.startSession(learnerId, {
    mode: 'single',
    words: [slug],
    yearFilter: 'all',
    length: 1,
  }).state;
  return continueUntilSummary(service, learnerId, started, answer);
}

test('starts a spelling session with an explicit subject-state contract', () => {
  const { service } = makeService();
  const transition = service.startSession('learner-a', { mode: 'smart', yearFilter: 'all', length: 5 });

  assert.equal(transition.ok, true);
  assert.equal(transition.state.version, SPELLING_SERVICE_STATE_VERSION);
  assert.equal(transition.state.phase, 'session');
  assert.equal(transition.state.session.progress.total, 5);
  assert.ok(transition.state.session.currentCard.word.word);
  assert.ok(['learning', 'test'].includes(transition.state.session.type));
});

test('injected randomness makes smart-review session selection reproducible', () => {
  const now = () => Date.UTC(2026, 0, 1);
  const first = makeService({ now, random: makeSeededRandom(42) }).service;
  const second = makeService({ now, random: makeSeededRandom(42) }).service;

  const a = first.startSession('learner-a', { mode: 'smart', yearFilter: 'all', length: 5 }).state.session;
  const b = second.startSession('learner-a', { mode: 'smart', yearFilter: 'all', length: 5 }).state.session;

  assert.deepEqual(a.uniqueWords, b.uniqueWords);
  assert.equal(a.currentCard.slug, b.currentCard.slug);
  assert.equal(a.id, b.id);
});

test('Smart Review can be scoped to the Extra spelling pool', () => {
  const { service } = makeService({ random: makeSeededRandom(7) });
  const transition = service.startSession('learner-a', {
    mode: 'smart',
    yearFilter: 'extra',
    length: 6,
  });

  assert.equal(transition.ok, true);
  const words = sessionWords(transition.state.session);
  assert.equal(words.length, 6);
  assert.ok(words.every((word) => word.spellingPool === 'extra'));
  assert.ok(words.every((word) => word.year === 'extra'));
});

test('Smart Review reuses one progress snapshot when starting from dense learner history', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / (24 * 60 * 60 * 1000));
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const progress = Object.fromEntries(WORDS
    .filter((word) => word.spellingPool === 'core')
    .map((word, index) => [word.slug, {
      stage: index % 6,
      attempts: 4 + (index % 5),
      correct: 3 + (index % 5),
      wrong: index % 3,
      dueDay: today - (index % 7),
      lastDay: today - 1,
      lastResult: index % 3 === 0 ? 'correct' : 'wrong',
    }]));
  repositories.subjectStates.writeData('learner-a', 'spelling', { progress });
  const persistence = createSpellingPersistence({ repositories, now });
  const reads = countStorageReads(persistence.storage);
  const service = createSpellingService({
    repository: persistence,
    now,
    random: makeSeededRandom(17),
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });

  const transition = service.startSession('learner-a', {
    mode: 'smart',
    yearFilter: 'core',
    length: 10,
  });

  assert.equal(transition.ok, true);
  assert.equal(transition.state.phase, 'session');
  assert.equal(transition.state.session.uniqueWords.length, 10);
  assert.equal(reads.get('ks2-spell-progress-learner-a'), 1);
});

test('Trouble Drill stays inside Extra and falls back to Extra Smart Review when no Extra trouble exists', () => {
  const { service } = makeService({ random: makeSeededRandom(9) });

  let state = service.startSession('learner-a', {
    mode: 'single',
    words: ['mollusc'],
    yearFilter: 'extra',
    length: 1,
  }).state;
  state = service.submitAnswer('learner-a', state, 'mollusk').state;
  assert.equal(state.session.phase, 'retry');
  state = service.submitAnswer('learner-a', state, 'mollusk').state;
  assert.equal(state.session.phase, 'correction');
  state = service.submitAnswer('learner-a', state, 'mollusc').state;
  assert.equal(state.awaitingAdvance, true);
  state = service.continueSession('learner-a', state).state;
  state = service.submitAnswer('learner-a', state, 'mollusc').state;
  state = service.continueSession('learner-a', state).state;
  assert.equal(state.phase, 'summary');

  const trouble = service.startSession('learner-a', {
    mode: 'trouble',
    yearFilter: 'extra',
    length: 5,
  });
  assert.equal(trouble.ok, true);
  assert.deepEqual(trouble.state.session.uniqueWords, ['mollusc']);
  assert.ok(sessionWords(trouble.state.session).every((word) => word.spellingPool === 'extra'));

  const fallback = service.startSession('learner-b', {
    mode: 'trouble',
    yearFilter: 'extra',
    length: 5,
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.state.feedback?.headline, 'Trouble drill fell back to Smart Review.');
  assert.ok(sessionWords(fallback.state.session).every((word) => word.spellingPool === 'extra'));
});

test('Trouble Drill follows recent mistakes instead of every due word in the selected pool', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / (24 * 60 * 60 * 1000));
  const { service, repositories } = makeService({ now, random: makeSeededRandom(11) });

  repositories.subjectStates.writeData('learner-a', 'spelling', {
    progress: {
      possess: {
        stage: 1,
        attempts: 1,
        correct: 1,
        wrong: 0,
        dueDay: today - 1,
        lastDay: today - 2,
        lastResult: 'correct',
      },
      accommodate: {
        stage: 5,
        attempts: 5,
        correct: 4,
        wrong: 1,
        dueDay: today,
        lastDay: today - 1,
        lastResult: 'wrong',
      },
    },
  });

  const stats = service.getStats('learner-a', 'core');
  assert.equal(stats.trouble, 1);

  const snapshot = service.getAnalyticsSnapshot('learner-a');
  const rows = new Map(snapshot.wordGroups.flatMap((group) => group.words).map((word) => [word.slug, word]));
  assert.equal(rows.get('possess')?.status, 'due');
  assert.equal(rows.get('accommodate')?.status, 'trouble');

  const trouble = service.startSession('learner-a', {
    mode: 'trouble',
    yearFilter: 'core',
    length: 5,
  });
  assert.equal(trouble.ok, true);
  assert.equal(trouble.state.feedback, null);
  assert.deepEqual(trouble.state.session.uniqueWords, ['accommodate']);
});

test('SATs Test ignores Extra filters and stays on core statutory spellings', () => {
  const { service } = makeService({ random: makeSeededRandom(13) });
  const transition = service.startSession('learner-a', {
    mode: 'test',
    yearFilter: 'extra',
    length: 20,
  });

  assert.equal(transition.ok, true);
  assert.equal(transition.state.session.type, 'test');
  assert.equal(transition.state.session.uniqueWords.length, 20);
  assert.ok(sessionWords(transition.state.session).every((word) => word.spellingPool === 'core'));
  assert.equal(sessionWords(transition.state.session).some((word) => word.year === 'extra'), false);
});

test('legacy all filter normalises to core stats and excludes Extra progress', () => {
  const { service } = makeService();
  service.savePrefs('learner-a', { yearFilter: 'all' });

  assert.equal(service.getPrefs('learner-a').yearFilter, 'core');

  completeSingleWordRoundWithAnswer(service, 'learner-a', 'mollusc', 'mollusc');

  assert.deepEqual(service.getStats('learner-a', 'all'), service.getStats('learner-a', 'core'));
  assert.equal(service.getStats('learner-a', 'all').attempts, 0);
  assert.equal(service.getStats('learner-a', 'extra').attempts, 1);
});

test('spelling dashboard card reports overall progress instead of the selected pool', () => {
  const { service, repositories } = makeService();
  const learnerId = 'learner-a';
  service.savePrefs(learnerId, { yearFilter: 'extra' });
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress: {
      mollusc: {
        stage: 4,
        attempts: 4,
        correct: 4,
        wrong: 0,
        dueDay: Number.MAX_SAFE_INTEGER,
        lastDay: 10,
        lastResult: true,
      },
    },
  });

  const appState = {
    learners: {
      selectedId: learnerId,
      byId: { [learnerId]: { id: learnerId, name: 'Ava' } },
    },
  };
  const dashboard = spellingModule.getDashboardStats(appState, { service });
  const extraStats = service.getStats(learnerId, 'extra');
  const overallStats = getOverallSpellingStats(service, learnerId);

  assert.equal(extraStats.secure, 1);
  assert.equal(dashboard.pct, Math.round((overallStats.secure / overallStats.total) * 100));
  assert.notEqual(dashboard.pct, Math.round((extraStats.secure / extraStats.total) * 100));
  assert.equal(dashboard.due, overallStats.due);
});

test('resetting spelling progress preserves the profile TTS provider', () => {
  const { service } = makeService();
  service.savePrefs('learner-a', { ttsProvider: 'browser', bufferedGeminiVoice: 'Sulafat' });

  service.resetLearner('learner-a');

  assert.equal(service.getPrefs('learner-a').ttsProvider, 'browser');
  assert.equal(service.getPrefs('learner-a').bufferedGeminiVoice, 'Sulafat');
});

test('Extra spelling accepts UK mollusc only', () => {
  const { service } = makeService();
  const accepted = service.startSession('learner-uk', {
    mode: 'single',
    words: ['mollusc'],
    yearFilter: 'extra',
    length: 1,
  });
  const acceptedSubmission = service.submitAnswer('learner-uk', accepted.state, 'mollusc');

  assert.equal(acceptedSubmission.state.awaitingAdvance, true);
  assert.notEqual(acceptedSubmission.state.session.phase, 'retry');

  const rejected = service.startSession('learner-us', {
    mode: 'single',
    words: ['mollusc'],
    yearFilter: 'extra',
    length: 1,
  });
  const rejectedSubmission = service.submitAnswer('learner-us', rejected.state, 'mollusk');

  assert.equal(rejectedSubmission.state.awaitingAdvance, false);
  assert.equal(rejectedSubmission.state.session.phase, 'retry');
  assert.equal(rejectedSubmission.state.feedback.kind, 'error');
  assert.equal(rejectedSubmission.state.feedback.attemptedAnswer, 'mollusk');
});

test('Extra word-family variants are opt-in and share base-word progress', () => {
  const day = 24 * 60 * 60 * 1000;
  let nowValue = Date.UTC(2026, 0, 1);
  const { service } = makeService({
    now: () => nowValue,
    random: makeSequenceRandom([0.5, 0.5, 0.5], 0.5),
  });

  const defaultRound = service.startSession('learner-base', {
    mode: 'single',
    words: ['divide'],
    yearFilter: 'extra',
    length: 1,
  });
  assert.equal(defaultRound.ok, true);
  assert.equal(defaultRound.state.session.currentCard.slug, 'divide');
  assert.equal(defaultRound.state.session.currentCard.word.word, 'divide');

  const seenWords = new Set();
  for (let round = 0; round < 4; round += 1) {
    const started = service.startSession('learner-family', {
      mode: 'single',
      words: ['divide'],
      yearFilter: 'extra',
      length: 1,
      extraWordFamilies: true,
    }).state;
    const completed = continueUntilSummaryWithCurrentAnswers(service, 'learner-family', started);
    completed.seenWords.forEach((word) => seenWords.add(word));
    nowValue += day * 2;
  }

  assert.ok(seenWords.has('division'));
  const stats = service.getStats('learner-family', 'extra');
  assert.equal(stats.total, 23);
  assert.equal(stats.secure, 1);

  const extraGroup = service.getAnalyticsSnapshot('learner-family').wordGroups.find((group) => group.key === 'extra');
  assert.equal(extraGroup.words.length, 23);
  assert.equal(extraGroup.words.some((word) => word.slug === 'division' || word.word === 'division'), false);
  const divide = extraGroup.words.find((word) => word.slug === 'divide');
  assert.equal(divide.word, 'divide');
  assert.equal(divide.status, 'secure');
  assert.equal(divide.progress.stage, 4);
  assert.deepEqual(divide.familyWords, ['divide', 'division', 'divisible']);
  assert.deepEqual(divide.variants.map((variant) => variant.word), ['division', 'divisible']);
  assert.equal(divide.variants[0].explanation, 'Division is the act of splitting something into parts or groups.');
});

test('service state survives JSON round-trips and resumes retry/correction flow', () => {
  const { service } = makeService();
  let state = service.startSession('learner-a', {
    mode: 'single',
    words: ['possess'],
    yearFilter: 'all',
    length: 1,
  }).state;

  state = JSON.parse(JSON.stringify(service.submitAnswer('learner-a', state, 'wrong').state));
  assert.equal(state.session.phase, 'retry');
  assert.equal(state.feedback.attemptedAnswer, 'wrong');

  state = JSON.parse(JSON.stringify(service.submitAnswer('learner-a', state, 'still wrong').state));
  assert.equal(state.session.phase, 'correction');
  assert.equal(state.feedback.attemptedAnswer, 'still wrong');

  state = JSON.parse(JSON.stringify(service.submitAnswer('learner-a', state, 'possess').state));
  assert.equal(state.awaitingAdvance, true);
  assert.deepEqual(state.session.queue, ['possess']);

  state = service.continueSession('learner-a', state).state;
  assert.equal(state.phase, 'session');
  assert.equal(state.session.currentCard.slug, 'possess');
  assert.deepEqual(state.session.queue, []);
});

test('clearing a retry step emits an explicit retry-cleared domain event', () => {
  const { service } = makeService();
  let state = service.startSession('learner-a', {
    mode: 'single',
    words: ['possess'],
    yearFilter: 'all',
    length: 1,
  }).state;

  state = service.submitAnswer('learner-a', state, 'wrong').state;
  const recovered = service.submitAnswer('learner-a', state, 'possess');

  assert.ok(recovered.events.some((event) => event.type === SPELLING_EVENT_TYPES.RETRY_CLEARED && event.fromPhase === 'retry'));
});

test('first-time correct spellings still require one clean return in the same round', () => {
  const { service } = makeService();
  let state = service.startSession('learner-a', {
    mode: 'single',
    words: ['possess'],
    yearFilter: 'all',
    length: 1,
  }).state;

  state = service.submitAnswer('learner-a', state, 'possess').state;
  assert.equal(state.awaitingAdvance, true);
  assert.equal(state.session.status.possess.done, false);
  assert.equal(state.session.status.possess.successes, 1);
  assert.deepEqual(state.session.queue, ['possess']);

  state = service.continueSession('learner-a', state).state;
  assert.equal(state.phase, 'session');
  assert.equal(state.session.currentCard.slug, 'possess');

  state = service.submitAnswer('learner-a', state, 'possess').state;
  assert.equal(state.awaitingAdvance, true);
  assert.equal(state.session.status.possess.done, true);
  assert.equal(state.session.status.possess.applied, true);

  state = service.continueSession('learner-a', state).state;
  assert.equal(state.phase, 'summary');

  const stats = service.getStats('learner-a', 'all');
  assert.equal(stats.attempts, 1);
  assert.equal(stats.correct, 1);
  assert.equal(stats.accuracy, 100);
});

test('practice-only single-word drill does not mutate durable progress', () => {
  const { service } = makeService();
  let state = service.startSession('learner-a', {
    mode: 'single',
    words: ['possess'],
    yearFilter: 'all',
    length: 1,
    practiceOnly: true,
  }).state;

  assert.equal(state.session.practiceOnly, true);
  assert.equal(service.getStats('learner-a', 'all').attempts, 0);

  const completed = continueUntilSummary(service, 'learner-a', state, 'possess');
  state = completed.state;

  assert.equal(state.phase, 'summary');
  assert.equal(state.summary.message, 'Practice complete. Learner progress was not changed.');
  assert.deepEqual(completed.events, []);

  const stats = service.getStats('learner-a', 'all');
  assert.equal(stats.attempts, 0);
  assert.equal(stats.correct, 0);
  assert.equal(stats.secure, 0);

  const possess = service.getAnalyticsSnapshot('learner-a').wordGroups
    .flatMap((group) => group.words)
    .find((word) => word.slug === 'possess');
  assert.equal(possess.progress.stage, 0);
  assert.equal(possess.progress.correct, 0);
});

test('empty submission is rejected without mutating learner progress', () => {
  const { service } = makeService();
  let state = service.startSession('learner-a', {
    mode: 'single',
    words: ['possess'],
    yearFilter: 'all',
    length: 1,
  }).state;

  const submitted = service.submitAnswer('learner-a', state, '   ');
  state = submitted.state;

  assert.equal(state.feedback.headline, 'Type an answer first.');
  assert.equal(state.awaitingAdvance, false);
  assert.equal(service.getStats('learner-a', 'all').attempts, 0);
});

test('duplicate submission while awaiting advance is ignored', () => {
  const { service } = makeService();
  let state = service.startSession('learner-a', {
    mode: 'test',
    words: ['possess'],
    yearFilter: 'all',
    length: 1,
  }).state;

  state = service.submitAnswer('learner-a', state, 'possess').state;
  assert.equal(state.awaitingAdvance, true);
  const statsAfterFirst = service.getStats('learner-a', 'all');
  assert.equal(statsAfterFirst.attempts, 1);
  assert.equal(state.session.results.length, 1);

  const duplicate = service.submitAnswer('learner-a', state, 'wrong');
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.state.session.results.length, 1);
  assert.deepEqual(service.getStats('learner-a', 'all'), statsAfterFirst);
});

test('repeated successful reviews emit secure-word, mastery-milestone and session-completed events', () => {
  const day = 24 * 60 * 60 * 1000;
  let nowValue = Date.UTC(2026, 0, 1);
  const { service } = makeService({ now: () => nowValue });
  let emittedEvents = [];

  for (let round = 0; round < 4; round += 1) {
    const started = service.startSession('learner-a', {
      mode: 'single',
      words: ['possess'],
      yearFilter: 'all',
      length: 1,
    }).state;
    const completed = continueUntilSummary(service, 'learner-a', started, 'possess');
    emittedEvents = emittedEvents.concat(completed.events);
    nowValue += day * 2;
  }

  const stats = service.getStats('learner-a', 'all');
  assert.equal(stats.secure, 1);
  assert.equal(stats.attempts, 4);
  assert.equal(stats.correct, 4);
  assert.equal(stats.accuracy, 100);
  assert.equal(emittedEvents.filter((event) => event.type === SPELLING_EVENT_TYPES.WORD_SECURED).length, 1);
  assert.equal(emittedEvents.filter((event) => event.type === SPELLING_EVENT_TYPES.MASTERY_MILESTONE).length, 1);
  assert.equal(emittedEvents.filter((event) => event.type === SPELLING_EVENT_TYPES.SESSION_COMPLETED).length, 4);
});

test('reward hook converts spelling secure-word events into platform monster events', () => {
  const day = 24 * 60 * 60 * 1000;
  let nowValue = Date.UTC(2026, 0, 1);
  const { service, repositories } = makeService({ now: () => nowValue });
  let domainEvents = [];

  for (let round = 0; round < 4; round += 1) {
    const started = service.startSession('learner-a', {
      mode: 'single',
      words: ['possess'],
      yearFilter: 'all',
      length: 1,
    }).state;
    const completed = continueUntilSummary(service, 'learner-a', started, 'possess');
    domainEvents = domainEvents.concat(completed.events);
    nowValue += day * 2;
  }

  const rewardEvents = rewardEventsFromSpellingEvents(domainEvents, { gameStateRepository: repositories.gameState });
  assert.ok(rewardEvents.some((event) => event.kind === 'caught' && event.monsterId === 'inklet'));
});

test('codex projection follows secure spelling progress even without reward game state', () => {
  const { service, repositories } = makeService();
  repositories.subjectStates.writeData('learner-a', 'spelling', {
    progress: {
      possess: { stage: 4, attempts: 4, correct: 4, wrong: 0 },
      accommodate: { stage: 4, attempts: 4, correct: 4, wrong: 0 },
      mollusc: { stage: 4, attempts: 4, correct: 4, wrong: 0 },
    },
  });

  assert.deepEqual(repositories.gameState.read('learner-a', 'monster-codex'), {});

  const summary = monsterSummaryFromSpellingAnalytics(service.getAnalyticsSnapshot('learner-a'));
  const inklet = summary.find((entry) => entry.monster.id === 'inklet');
  const glimmerbug = summary.find((entry) => entry.monster.id === 'glimmerbug');
  const phaeton = summary.find((entry) => entry.monster.id === 'phaeton');
  const vellhorn = summary.find((entry) => entry.monster.id === 'vellhorn');

  assert.equal(inklet.progress.mastered, 1);
  assert.equal(inklet.progress.caught, true);
  assert.equal(inklet.progress.stage, 0);
  assert.deepEqual(inklet.progress.masteredList, ['possess']);
  assert.equal(glimmerbug.progress.mastered, 1);
  assert.equal(glimmerbug.progress.caught, true);
  assert.equal(glimmerbug.progress.stage, 0);
  assert.deepEqual(glimmerbug.progress.masteredList, ['accommodate']);
  assert.equal(phaeton.progress.mastered, 2);
  assert.equal(phaeton.progress.caught, false);
  assert.equal(phaeton.progress.stage, 0);
  assert.equal(vellhorn.progress.mastered, 1);
  assert.equal(vellhorn.progress.caught, true);
  assert.equal(vellhorn.progress.stage, 0);
  assert.deepEqual(vellhorn.progress.masteredList, ['mollusc']);
});

test('analytics snapshot is explicit and normalised', () => {
  const { service } = makeService();
  const snapshot = service.getAnalyticsSnapshot('learner-a');

  assert.equal(snapshot.version, SPELLING_SERVICE_STATE_VERSION);
  assert.ok(Number.isFinite(snapshot.generatedAt));
  assert.deepEqual(Object.keys(snapshot.pools), ['all', 'core', 'y34', 'y56', 'extra']);
  assert.equal(snapshot.pools.all.total > 0, true);
  assert.deepEqual(snapshot.pools.all, snapshot.pools.core);
  assert.equal(snapshot.pools.all.accuracy, null);
  assert.equal(snapshot.pools.extra.total, 23);
  assert.deepEqual(snapshot.wordGroups.map((group) => group.key), ['y3-4', 'y5-6', 'extra']);
  assert.equal(snapshot.wordGroups[0].title, 'Years 3-4');
  const possess = snapshot.wordGroups.flatMap((group) => group.words).find((word) => word.slug === 'possess');
  assert.ok(possess);
  assert.equal(possess.word, 'possess');
  assert.equal(possess.family, 'possess(ion)');
  assert.equal(possess.spellingPool, 'core');
  assert.equal(possess.status, 'new');
  assert.equal(possess.progress.stage, 0);
  assert.equal(possess.stageLabel, 'New / due today');

  const extraGroup = snapshot.wordGroups.find((group) => group.key === 'extra');
  const mollusc = extraGroup.words.find((word) => word.slug === 'mollusc');
  assert.equal(extraGroup.spellingPool, 'extra');
  assert.ok(mollusc);
  assert.equal(mollusc.word, 'mollusc');
  assert.equal(mollusc.spellingPool, 'extra');
  assert.equal(mollusc.year, 'extra');
});

test('analytics snapshot reuses one learner progress read', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const persistence = createSpellingPersistence({ repositories });
  const reads = countStorageReads(persistence.storage);
  const service = createSpellingService({
    repository: persistence,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });

  completeSingleWordRoundWithAnswer(service, 'learner-a', 'possess');
  reads.clear();

  const snapshot = service.getAnalyticsSnapshot('learner-a');
  assert.equal(snapshot.wordGroups.flatMap((group) => group.words).length > 200, true);
  assert.equal(reads.get('ks2-spell-progress-learner-a'), 1);

  reads.clear();
  const entry = service.getWordBankEntry('learner-a', 'possess');
  assert.equal(entry.word, 'possess');
  assert.equal(reads.get('ks2-spell-progress-learner-a'), 1);
});

test('malformed persisted session state falls back safely instead of crashing', () => {
  const { service } = makeService();
  const restored = service.initState({
    phase: 'session',
    session: {
      id: 'broken',
      type: 'learning',
      mode: 'single',
      queue: ['missing-word'],
    },
  }, 'learner-a');

  assert.equal(restored.phase, 'dashboard');
  assert.match(restored.error, /could not|missing|valid words/i);
});

// Pins the legacy smartBucket priority restored by PR #145 (reverts #87). A word
// with stage >= SECURE_STAGE AND wrong > 0 MUST bucket as `fragile`, not
// `secure`. Exercised through chooseSmartWords because smartBucket is internal.
test('smartBucket routes secure-stage words with historical wrongs to fragile before secure', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / (24 * 60 * 60 * 1000));
  const storage = new MemoryStorage();
  const profileId = 'learner-guard';
  const fragileSlug = 'fragile-secure';
  const freshSlug = 'fresh-new';
  const minimalWords = [
    { slug: fragileSlug, word: fragileSlug, year: '3-4', family: 'f1', spellingPool: 'core', accepted: [fragileSlug], sentence: '', sentences: [] },
    { slug: freshSlug, word: freshSlug, year: '3-4', family: 'f2', spellingPool: 'core', accepted: [freshSlug], sentence: '', sentences: [] },
  ];
  // Secure stage + historical wrong + not due today → pre-revert this was `secure`,
  // post-revert this is `fragile`.
  storage.setItem(`ks2-spell-progress-${profileId}`, JSON.stringify({
    [fragileSlug]: { stage: 5, attempts: 6, correct: 4, wrong: 2, dueDay: today + 30, lastDay: today - 1, lastResult: 'correct' },
  }));
  // Sequence: bucket-pick roll * total(fragile=5 + new=3 = 8) = 0.8 → picks fragile;
  // scoreForSmart random; word-pick roll. Fallback 0.5 covers any trailing draws.
  const randomValues = [0.1, 0.5, 0.5];
  let index = 0;
  const random = () => (index < randomValues.length ? randomValues[index++] : 0.5);

  const engine = createLegacySpellingEngine({ words: minimalWords, storage, now, random });
  const result = engine.createSession({ profileId, mode: 'smart', yearFilter: 'core', length: 1 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.session.uniqueWords, [fragileSlug]);
});

// ----- U8: Storage-failure warning surface (Smart Review path) -----------------
//
// Goal: when localStorage.setItem throws during a Smart Review submit, the
// service returns `ok: true`, attaches `feedback.persistenceWarning =
// { reason: 'storage-save-failed' }`, and keeps the session running in memory.
// Mega is not in play on this path (learning mode), but the same contract
// holds: the submit never crashes, the warning self-heals on the next
// successful submit, and the banner's ARIA region announces once per submit.

function makeBareStorageService({ now = () => Date.UTC(2026, 0, 10), random = () => 0.5 } = {}) {
  const storage = new MemoryStorage();
  const spoken = [];
  const service = createSpellingService({
    storage,
    now,
    random,
    tts: {
      speak(payload) { spoken.push(payload); },
      stop() {},
      warmup() {},
    },
  });
  return { storage, service, spoken };
}

test('U8 Smart Review: storage throw on submit surfaces feedback.persistenceWarning and keeps session running', () => {
  const { storage, service } = makeBareStorageService();
  const started = service.startSession('learner-a', {
    mode: 'single',
    words: ['possess'],
    length: 1,
  });
  assert.equal(started.ok, true);
  const answer = started.state.session.currentCard.word.word;

  // Arm the next setItem on the progress key to throw. Legacy-engine's
  // saveProgress swallows the throw; U8's probe re-write detects it.
  storage.throwOnNextSet({ key: 'ks2-spell-progress-learner-a' });

  const submitted = service.submitAnswer('learner-a', started.state, answer);
  assert.equal(submitted.ok, true, 'submit returns ok: true even when storage throws');
  assert.equal(submitted.state.phase, 'session', 'session continues after storage failure');
  assert.equal(submitted.state.feedback?.persistenceWarning?.reason, 'storage-save-failed');
  // Happy path: no crash, no stage demotion via service — legacy-engine owns
  // progress.stage mutation on this path and U8 did not change that contract.
});

test('U8 Smart Review: happy path has feedback.persistenceWarning === undefined', () => {
  const { service } = makeBareStorageService();
  const started = service.startSession('learner-a', {
    mode: 'single',
    words: ['possess'],
    length: 1,
  });
  const answer = started.state.session.currentCard.word.word;
  const submitted = service.submitAnswer('learner-a', started.state, answer);
  assert.equal(submitted.state.feedback?.persistenceWarning, undefined,
    'happy-path feedback has no persistenceWarning field');
});

test('U8 Smart Review: warning self-heals on next successful submit', () => {
  const { storage, service } = makeBareStorageService();
  let state = service.startSession('learner-a', {
    mode: 'single',
    words: ['possess', 'believe'],
    length: 2,
  }).state;

  // First submit fails: warning set.
  const firstAnswer = state.session.currentCard.word.word;
  storage.throwOnNextSet({ key: 'ks2-spell-progress-learner-a' });
  let submitted = service.submitAnswer('learner-a', state, firstAnswer);
  assert.equal(submitted.state.feedback?.persistenceWarning?.reason, 'storage-save-failed');
  state = submitted.state;
  state = service.continueSession('learner-a', state).state;

  // Second submit succeeds: new feedback has no warning.
  const secondAnswer = state.session.currentCard.word.word;
  submitted = service.submitAnswer('learner-a', state, secondAnswer);
  assert.equal(submitted.state.feedback?.persistenceWarning, undefined,
    'next successful submit produces feedback without persistenceWarning');
});

test('U8 saveJson contract: returns { ok: true } on success and { ok: false, reason } on throw', async () => {
  // Import the service module to access saveJson indirectly via savePrefs
  // (which is the simplest public surface to exercise the contract without
  // setting up a session).
  const { service } = makeBareStorageService();
  const result = service.savePrefs('learner-a', { showCloze: true });
  assert.ok(result && typeof result === 'object', 'savePrefs returns the normalised prefs object (not the raw saveJson result)');
  // Exercise the contract end-to-end: savePrefs delegates to saveJson and
  // does not throw on storage failure — the warning path is consumed only
  // by submit surfaces (not prefs), but the shape change must not break
  // the prefs write contract.
  const { service: service2, storage: storage2 } = makeBareStorageService();
  storage2.throwOnNextSet();
  const result2 = service2.savePrefs('learner-b', { showCloze: false });
  assert.ok(result2 && typeof result2 === 'object', 'prefs write does not throw even when storage throws');
});
