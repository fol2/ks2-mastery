import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../src/platform/core/store.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { createEventRuntime, createPracticeStreakSubscriber } from '../src/platform/events/index.js';
import { createSpellingRewardSubscriber } from '../src/subjects/spelling/event-hooks.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function makeTts() {
  return {
    speak() {},
    stop() {},
    warmup() {},
  };
}

function ensureHarnessLearner(repositories) {
  const snapshot = repositories.learners.read();
  if (Array.isArray(snapshot?.allIds) && snapshot.allIds.length) {
    return snapshot.selectedId || snapshot.allIds[0];
  }

  repositories.learners.write({
    byId: {
      'learner-a': {
        id: 'learner-a',
        name: 'Ava',
        yearGroup: 'Y5',
        goal: 'sats',
        dailyMinutes: 15,
        avatarColor: '#3E6FA8',
        createdAt: 1,
      },
    },
    allIds: ['learner-a'],
    selectedId: 'learner-a',
  });

  return 'learner-a';
}

function cookieFrom(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  const match = /ks2_session=([^;]+)/.exec(setCookie);
  return match ? `ks2_session=${match[1]}` : '';
}

async function postJson(server, path, body = {}, headers = {}) {
  return server.fetchRaw(`https://repo.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeHarness(repositories, nowRef) {
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now: () => nowRef.value }),
    now: () => nowRef.value,
    tts: makeTts(),
  });
  const eventRuntime = createEventRuntime({
    repositories,
    subscribers: [
      createPracticeStreakSubscriber(),
      createSpellingRewardSubscriber({ gameStateRepository: repositories.gameState }),
    ],
  });
  const expectedLearnerId = ensureHarnessLearner(repositories);
  const store = createStore(SUBJECTS, { repositories });
  const learnerId = store.getState().learners.selectedId || expectedLearnerId;

  function applyTransition(transition) {
    store.updateSubjectUi('spelling', transition.state);
    eventRuntime.publish(transition.events);
  }

  function completeRound(answer = 'possess') {
    let transition = service.startSession(learnerId, {
      mode: 'single',
      words: ['possess'],
      yearFilter: 'all',
      length: 1,
    });
    applyTransition(transition);
    let state = transition.state;

    while (state.phase === 'session') {
      transition = service.submitAnswer(learnerId, state, answer);
      applyTransition(transition);
      state = transition.state;
      if (state.phase === 'session' && state.awaitingAdvance) {
        transition = service.continueSession(learnerId, state);
        applyTransition(transition);
        state = transition.state;
      }
    }

    return state;
  }

  return {
    learnerId,
    completeRound,
  };
}

function assertSpellingPersistenceShape(repositories, learnerId) {
  const subjectRecord = repositories.subjectStates.read(learnerId, 'spelling');
  assert.equal(subjectRecord.ui.phase, 'summary');
  assert.ok(subjectRecord.data.progress.possess);
  assert.equal(typeof subjectRecord.data.progress.possess.stage, 'number');

  const latestSession = repositories.practiceSessions.latest(learnerId, 'spelling');
  assert.equal(latestSession.subjectId, 'spelling');
  assert.equal(latestSession.status, 'completed');
  assert.equal(latestSession.summary.mistakes.length, 0);

  const gameState = repositories.gameState.read(learnerId, 'monster-codex');
  assert.ok(gameState.inklet.mastered.includes('possess'));

  const events = repositories.eventLog.list(learnerId);
  assert.ok(events.some((event) => event.type === 'spelling.word-secured'));
  assert.ok(events.some((event) => event.kind === 'caught' && event.monsterId === 'inklet'));
}

test('worker session route exposes the development session stub and account scope', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetch('https://repo.test/api/session');
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.auth.mode, 'development-stub');
  assert.equal(payload.session.accountId, 'adult-a');
  assert.equal(payload.learnerCount, 0);

  server.close();
});

test('worker denies raw source assets while allowing the built app bundle', async () => {
  const requests = [];
  const server = createWorkerRepositoryServer({
    env: {
      ASSETS: {
        fetch(request) {
          requests.push(new URL(request.url).pathname);
          return new Response('console.log("app bundle");', {
            headers: { 'content-type': 'text/javascript' },
          });
        },
      },
    },
  });

  const denied = await server.fetchRaw('https://repo.test/src/subjects/spelling/data/content-data.js');
  const bundle = await server.fetchRaw('https://repo.test/src/bundles/app.bundle.js');

  assert.equal(denied.status, 404);
  assert.equal(await denied.text(), 'Not found.');
  assert.equal(bundle.status, 200);
  assert.equal(await bundle.text(), 'console.log("app bundle");');
  assert.deepEqual(requests, ['/src/bundles/app.bundle.js']);

  server.close();
});

test('api repositories match the generic contract against the real D1-backed worker', async () => {
  const server = createWorkerRepositoryServer();
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor('adult-a'),
  });

  await repositories.hydrate();
  repositories.learners.write({
    byId: {
      'learner-a': {
        id: 'learner-a',
        name: 'Ava',
        yearGroup: 'Y5',
        goal: 'sats',
        dailyMinutes: 15,
        avatarColor: '#3E6FA8',
        createdAt: 1,
      },
    },
    allIds: ['learner-a'],
    selectedId: 'learner-a',
  });
  repositories.subjectStates.writeData('learner-a', 'spelling', { prefs: { mode: 'smart' } });
  repositories.subjectStates.writeUi('learner-a', 'spelling', { phase: 'dashboard', error: '' });
  repositories.practiceSessions.write({
    id: 'sess-a',
    learnerId: 'learner-a',
    subjectId: 'spelling',
    sessionKind: 'learning',
    status: 'active',
    sessionState: { id: 'sess-a' },
    summary: null,
    createdAt: 1,
    updatedAt: 1,
  });
  repositories.gameState.write('learner-a', 'monster-codex', { inklet: { mastered: ['possess'], caught: true } });
  repositories.eventLog.append({ learnerId: 'learner-a', type: 'spelling.word-secured', createdAt: 5 });
  await repositories.flush();

  const freshClient = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor('adult-a'),
  });
  await freshClient.hydrate();

  assert.equal(freshClient.learners.read().selectedId, 'learner-a');
  assert.deepEqual(freshClient.subjectStates.read('learner-a', 'spelling').data, { prefs: { mode: 'smart' } });
  assert.equal(freshClient.practiceSessions.latest('learner-a', 'spelling').id, 'sess-a');
  assert.ok(freshClient.gameState.read('learner-a', 'monster-codex').inklet.mastered.includes('possess'));
  assert.equal(freshClient.eventLog.list('learner-a').length, 1);

  server.close();
});

test('public bootstrap redacts spelling runtime state while preserving generic sync bootstrap', async () => {
  const server = createWorkerRepositoryServer();
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor('adult-a'),
  });

  await repositories.hydrate();
  const learnerId = ensureHarnessLearner(repositories);
  repositories.subjectStates.writeRecord(learnerId, 'spelling', {
    ui: {
      phase: 'session',
      session: {
        id: 'active-session',
        type: 'learning',
        mode: 'smart',
        phase: 'question',
        progress: { done: 0, total: 1 },
        currentCard: {
          word: { word: 'possess', slug: 'possess' },
          prompt: { sentence: 'Do not expose possess.', cloze: 'Do not expose ________.' },
        },
      },
    },
    data: { prefs: { mode: 'smart' }, progress: { possess: { stage: 2 } } },
    updatedAt: 10,
  });
  repositories.practiceSessions.write({
    id: 'active-session',
    learnerId,
    subjectId: 'spelling',
    sessionKind: 'learning',
    status: 'active',
    sessionState: { currentCard: { word: { word: 'possess' } } },
    summary: null,
    createdAt: 10,
    updatedAt: 10,
  });
  await repositories.flush();

  const raw = await server.fetchAs('adult-a', 'https://repo.test/api/bootstrap');
  const rawPayload = await raw.json();
  assert.equal(rawPayload.subjectStates[`${learnerId}::spelling`].data.progress.possess.stage, 2);
  assert.equal(rawPayload.practiceSessions[0].sessionState.currentCard.word.word, 'possess');

  const publicResponse = await server.fetchAs('adult-a', 'https://repo.test/api/bootstrap', {
    headers: { 'x-ks2-public-read-models': '1' },
  });
  const publicPayload = await publicResponse.json();
  const publicSpelling = publicPayload.subjectStates[`${learnerId}::spelling`];
  assert.equal(publicSpelling.data.progress, undefined);
  assert.equal(publicSpelling.ui.session.currentCard.word, undefined);
  assert.equal(publicSpelling.ui.session.currentCard.prompt.sentence, undefined);
  assert.equal(publicSpelling.ui.session.currentCard.prompt.cloze, 'Do not expose ________.');
  assert.equal(publicPayload.practiceSessions[0].sessionState, null);

  server.close();
});

test('production bootstrap redacts spelling runtime state by default', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const register = await postJson(server, '/api/auth/register', {
    email: 'bootstrap-redaction@example.test',
    password: 'password-1234',
  });
  const registerPayload = await register.json();
  const cookie = cookieFrom(register);
  const accountId = registerPayload.session.accountId;
  const now = Date.UTC(2026, 0, 1);

  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-prod', 'Ava', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, 'learner-prod', 'owner', 0, ?, ?)
  `).run(accountId, now, now);
  server.DB.db.prepare('UPDATE adult_accounts SET selected_learner_id = ? WHERE id = ?')
    .run('learner-prod', accountId);
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES ('learner-prod', 'spelling', ?, ?, ?, ?)
  `).run(JSON.stringify({
    phase: 'session',
    session: {
      id: 'active-session',
      type: 'learning',
      mode: 'smart',
      phase: 'question',
      currentCard: {
        word: { word: 'possess', slug: 'possess' },
        prompt: { sentence: 'Do not expose possess.', cloze: 'Do not expose ________.' },
      },
    },
  }), JSON.stringify({ progress: { possess: { stage: 2 } } }), now, accountId);
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at, updated_by_account_id)
    VALUES ('active-session', 'learner-prod', 'spelling', 'learning', 'active', ?, NULL, ?, ?, ?)
  `).run(JSON.stringify({ currentCard: { word: { word: 'possess' } } }), now, now, accountId);

  const response = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie },
  });
  const payload = await response.json();
  const publicSpelling = payload.subjectStates['learner-prod::spelling'];

  assert.equal(response.status, 200);
  assert.equal(publicSpelling.data.progress, undefined);
  assert.equal(publicSpelling.ui.session.currentCard.word, undefined);
  assert.equal(publicSpelling.ui.session.currentCard.prompt.sentence, undefined);
  assert.equal(publicSpelling.ui.session.currentCard.prompt.cloze, 'Do not expose ________.');
  assert.equal(payload.practiceSessions[0].sessionState, null);

  server.close();
});

test('the reference spelling flow works unchanged against the real worker backend', async () => {
  const day = 24 * 60 * 60 * 1000;
  const nowRef = { value: Date.UTC(2026, 0, 1) };
  const server = createWorkerRepositoryServer();
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor('adult-a'),
  });
  await repositories.hydrate();
  const harness = makeHarness(repositories, nowRef);

  for (let round = 0; round < 4; round += 1) {
    harness.completeRound();
    nowRef.value += day * 2;
  }

  await repositories.flush();
  const restored = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor('adult-a'),
  });
  await restored.hydrate();
  assertSpellingPersistenceShape(restored, harness.learnerId);

  server.close();
});
