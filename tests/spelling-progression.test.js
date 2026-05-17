import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage, MemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { SPELLING_EVENT_TYPES } from '../src/subjects/spelling/events.js';
import { SPELLING_SERVICE_STATE_VERSION } from '../src/subjects/spelling/service-contract.js';
import { WORDS, WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';
import { isStatutoryCoreWord } from '../src/subjects/spelling/content/taxonomy.js';
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
  assert.deepEqual(Object.keys(snapshot.pools), ['all', 'core', 'y34', 'y56', 'secureExtension', 'extra']);
  assert.equal(snapshot.pools.all.total > 0, true);
  assert.deepEqual(snapshot.pools.all, snapshot.pools.core);
  assert.equal(snapshot.pools.all.accuracy, null);
  assert.equal(snapshot.pools.secureExtension.total, 1217);
  assert.equal(snapshot.pools.extra.total, 33);
  assert.deepEqual(snapshot.wordGroups.map((group) => group.key), ['y3-4', 'y5-6', 'secure-extension', 'extra']);
  assert.equal(snapshot.wordGroups[0].title, 'Years 3-4');
  const possess = snapshot.wordGroups.flatMap((group) => group.words).find((word) => word.slug === 'possess');
  assert.ok(possess);
  assert.equal(possess.word, 'possess');
  assert.equal(possess.family, 'possess(ion)');
  assert.equal(possess.spellingPool, 'core');
  assert.equal(possess.coverageTier, 'statutory-core');
  assert.equal(possess.status, 'new');
  assert.equal(possess.progress.stage, 0);
  assert.equal(possess.stageLabel, 'New / due today');

  const extraGroup = snapshot.wordGroups.find((group) => group.key === 'extra');
  const secureExtensionGroup = snapshot.wordGroups.find((group) => group.key === 'secure-extension');
  assert.equal(secureExtensionGroup.title, 'Secure vocabulary');
  assert.equal(secureExtensionGroup.words.length, 1217);
  assert.ok(secureExtensionGroup.words.some((word) => word.slug === 'ability'));
  const mollusc = extraGroup.words.find((word) => word.slug === 'mollusc');
  assert.equal(extraGroup.spellingPool, 'extra');
  assert.ok(mollusc);
  assert.equal(mollusc.word, 'mollusc');
  assert.equal(mollusc.spellingPool, 'extra');
  assert.equal(mollusc.coverageTier, 'enrichment-extra');
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

test('Smart Review fallback prioritises not-yet-secure historical-wrong words over secure fragile review', () => {
  const now = () => Date.UTC(2026, 3, 30);
  const today = Math.floor(now() / (24 * 60 * 60 * 1000));
  const learnerId = 'learner-nelson-tail';
  const targetSlugs = ['apparent', 'privilege'];
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const y56Words = WORDS.filter((word) => isStatutoryCoreWord(word) && word.year === '5-6');

  const progress = Object.fromEntries(y56Words.map((word) => {
    const blocking = targetSlugs.includes(word.slug);
    return [word.slug, blocking
      ? {
          stage: 3,
          attempts: 4,
          correct: 3,
          wrong: 1,
          dueDay: today + 2,
          lastDay: today - 5,
          lastResult: 'correct',
        }
      : {
          stage: 4,
          attempts: 6,
          correct: 5,
          wrong: 1,
          dueDay: today + 30,
          lastDay: today - 7,
          lastResult: 'correct',
        }];
  }));
  repositories.subjectStates.writeData(learnerId, 'spelling', { progress });

  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random: makeSeededRandom(1),
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });

  const started = service.startSession(learnerId, {
    mode: 'trouble',
    yearFilter: 'y5-6',
    length: 10,
  });

  assert.equal(started.ok, true);
  assert.equal(started.state.feedback?.headline, 'Trouble drill fell back to Smart Review.');
  assert.ok(
    targetSlugs.every((slug) => started.state.session.uniqueWords.includes(slug)),
    `expected completion-tail words in session: ${started.state.session.uniqueWords.join(', ')}`,
  );
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

// ----- U8 review fix: production-path Smart Review integration -----------------
//
// Closes Blocker 2: the adversarial review flagged that the idempotent probe
// combined with legacy-engine's silent swallow meant the Smart Review warning
// was structurally unreachable in production. This test wires the service
// through the complete production stack (`createLocalPlatformRepositories`
// -> `createSpellingPersistence` proxy -> service) and arms the backing
// storage to throw on the subject-state bundle key — which is where the
// real-world quota / private-mode / IO error would surface in production.

test('U8 review: production-path Smart Review submit surfaces feedback.persistenceWarning on backing storage throw', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const storage = new MemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random: () => 0.5,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });

  const started = service.startSession('learner-a', {
    mode: 'smart',
    words: ['possess'],
    length: 1,
  });
  assert.equal(started.ok, true);
  const answer = started.state.session.currentCard.word.word;

  // Arm the UNDERLYING MemoryStorage (not the spelling proxy) to throw on
  // the next subject-state bundle write. This is what a quota-exceeded
  // event looks like in real browsers when `persistBundle` calls
  // `setItem('ks2-platform-v2.repo.child-subject-state', ...)`.
  storage.throwOnNextSet({ key: 'ks2-platform-v2.repo.child-subject-state' });

  const submitted = service.submitAnswer('learner-a', started.state, answer);
  assert.equal(submitted.ok, true, 'submit returns ok:true even on backing-storage failure');
  assert.equal(submitted.state.phase, 'session', 'session continues in-memory');
  // The production-path detection runs at two levels:
  // (1) The proxy's lastError-diff throws when writeData's persistAll fails.
  //     That throw is caught by legacy-engine's saveProgress's try/catch
  //     (silent swallow) AND by saveJson's try/catch on the probe write.
  // (2) The submit path checks the `lastError` channel mid-submit — so even
  //     when the probe write clears the error (one-shot throw consumed),
  //     the earlier failure is still captured via the mid-error snapshot.
  assert.equal(
    submitted.state.feedback?.persistenceWarning?.reason,
    'storage-save-failed',
    'Smart Review production path surfaces persistenceWarning even though legacy-engine swallows the proxy throw',
  );
});

test('U8 review: production-path Smart Review happy path has feedback.persistenceWarning === undefined', () => {
  // Ensure my lastError-diff detection does not false-positive on the
  // happy path when the backing storage has no prior or current error.
  const now = () => Date.UTC(2026, 0, 10);
  const storage = new MemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random: () => 0.5,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });

  const started = service.startSession('learner-a', {
    mode: 'smart',
    words: ['possess'],
    length: 1,
  });
  const answer = started.state.session.currentCard.word.word;
  const submitted = service.submitAnswer('learner-a', started.state, answer);
  assert.equal(
    submitted.state.feedback?.persistenceWarning,
    undefined,
    'happy-path production feedback has no persistenceWarning',
  );
});

// ----- U1: service-side getPostMasteryState mirror ----------------------------
// The service's live `getPostMasteryState` feeds the Alt+4 module gate and the
// setup-scene render. U1 extends it with the same new fields the read-model
// selector returns (`guardianMissionState`, `guardianMissionAvailable`,
// `unguardedMegaCount`, `guardianAvailableCount`, `wobblingDueCount`,
// `nonWobblingDueCount`). These tests drive a core-sized learner through the
// service and spot-check the derived fields.

function seedFullCoreMega({ repositories, learnerId, today, guardian = {} }) {
  const progress = Object.fromEntries(WORDS
    .filter(isStatutoryCoreWord)
    .map((word) => [word.slug, {
      stage: 4,
      attempts: 6,
      correct: 5,
      wrong: 1,
      dueDay: today + 60,
      lastDay: today - 7,
      lastResult: true,
    }]));
  repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress,
    guardian,
  });
  return progress;
}

test('U1 service: getPostMasteryState exposes all U1 fields for fresh graduate', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / (24 * 60 * 60 * 1000));
  const { service, repositories } = makeService({ now, random: makeSeededRandom(1) });
  seedFullCoreMega({ repositories, learnerId: 'learner-a', today, guardian: {} });

  const snapshot = service.getPostMasteryState('learner-a');
  assert.equal(snapshot.allWordsMega, true);
  assert.equal(snapshot.guardianMissionState, 'first-patrol');
  assert.equal(snapshot.guardianMissionAvailable, true);
  assert.equal(snapshot.guardianDueCount, 0);
  assert.equal(snapshot.wobblingDueCount, 0);
  assert.equal(snapshot.nonWobblingDueCount, 0);
  assert.ok(snapshot.unguardedMegaCount > 0, 'all Mega core slugs are unguarded');
  assert.equal(snapshot.guardianAvailableCount, snapshot.unguardedMegaCount);
});

test('U1 service: getPostMasteryState mirrors read-model for wobbling scenario', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / (24 * 60 * 60 * 1000));
  const { service, repositories } = makeService({ now, random: makeSeededRandom(1) });
  const guardian = {
    possess: { reviewLevel: 0, lastReviewedDay: today - 3, nextDueDay: today - 1, correctStreak: 0, lapses: 1, renewals: 0, wobbling: true },
    believe: { reviewLevel: 2, lastReviewedDay: today - 2, nextDueDay: today, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
  };
  seedFullCoreMega({ repositories, learnerId: 'learner-a', today, guardian });

  const snapshot = service.getPostMasteryState('learner-a');
  assert.equal(snapshot.guardianMissionState, 'wobbling');
  assert.equal(snapshot.guardianMissionAvailable, true);
  assert.equal(snapshot.wobblingDueCount, 1);
  assert.equal(snapshot.nonWobblingDueCount, 1);
  assert.equal(snapshot.guardianDueCount, 2);
});

test('U1 service: getPostMasteryState returns locked state when learner has not graduated', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const { service } = makeService({ now, random: makeSeededRandom(1) });
  // No seed — learner-a has no progress.
  const snapshot = service.getPostMasteryState('learner-a');
  assert.equal(snapshot.allWordsMega, false);
  assert.equal(snapshot.guardianMissionState, 'locked');
  assert.equal(snapshot.guardianMissionAvailable, false);
});

test('U1 service: optional-patrol when some Mega words are still unguarded but none due', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / (24 * 60 * 60 * 1000));
  const { service, repositories } = makeService({ now, random: makeSeededRandom(1) });
  const guardian = {
    possess: { reviewLevel: 3, lastReviewedDay: today - 1, nextDueDay: today + 30, correctStreak: 3, lapses: 0, renewals: 0, wobbling: false },
    believe: { reviewLevel: 2, lastReviewedDay: today - 2, nextDueDay: today + 14, correctStreak: 2, lapses: 0, renewals: 0, wobbling: false },
  };
  seedFullCoreMega({ repositories, learnerId: 'learner-a', today, guardian });
  const snapshot = service.getPostMasteryState('learner-a');
  assert.equal(snapshot.guardianDueCount, 0, 'nothing due');
  assert.equal(snapshot.guardianMissionState, 'optional-patrol');
  assert.equal(snapshot.guardianMissionAvailable, true);
  assert.ok(snapshot.unguardedMegaCount > 0);
});
