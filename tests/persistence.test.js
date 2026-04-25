import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createApiPlatformRepositories,
  createStaticHeaderRepositoryAuthSession,
} from '../src/platform/core/repositories/index.js';
import { createSubjectCommandClient } from '../src/platform/runtime/subject-command-client.js';
import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { createMockRepositoryServer } from './helpers/mock-api-server.js';

const DEFAULT_API_CACHE_STORAGE_KEY = 'ks2-platform-v2.api-cache-state:default';

async function waitForPersistenceIdle(repositories, attempts = 25) {
  await Promise.resolve();
  for (let index = 0; index < attempts; index += 1) {
    if (repositories.persistence.read().inFlightWriteCount === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function learnerSnapshot() {
  return {
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
  };
}

test('retired legacy runtime pending writes are discarded once remote bootstrap succeeds', async () => {
  const storage = installMemoryStorage();
  const remoteLearners = learnerSnapshot();
  const localSubjectState = {
    ui: { phase: 'dashboard', error: 'local-only marker' },
    data: { prefs: { mode: 'single' } },
    updatedAt: 20,
  };
  const localSession = {
    id: 'local-session',
    learnerId: 'learner-a',
    subjectId: 'spelling',
    sessionKind: 'learning',
    status: 'active',
    sessionState: { cursor: 3 },
    summary: null,
    createdAt: 20,
    updatedAt: 20,
  };

  storage.setItem(DEFAULT_API_CACHE_STORAGE_KEY, JSON.stringify({
    bundle: {
      learners: remoteLearners,
      subjectStates: {
        'learner-a::spelling': localSubjectState,
      },
      practiceSessions: [localSession],
      gameState: {
        'learner-a::monster-codex': { localOnly: true },
      },
      eventLog: [{
        id: 'local-event',
        learnerId: 'learner-a',
        type: 'spelling.word-secured',
        createdAt: 21,
      }],
    },
    pendingOperations: [
      {
        id: 'old-subject-state',
        kind: 'subjectStates.put',
        learnerId: 'learner-a',
        subjectId: 'spelling',
        record: localSubjectState,
        expectedRevision: 0,
        createdAt: 21,
      },
      {
        id: 'old-practice-session',
        kind: 'practiceSessions.put',
        record: localSession,
        expectedRevision: 0,
        createdAt: 22,
      },
      {
        id: 'old-game-state',
        kind: 'gameState.put',
        learnerId: 'learner-a',
        systemId: 'monster-codex',
        state: { localOnly: true },
        expectedRevision: 0,
        createdAt: 23,
      },
    ],
    syncState: {
      policyVersion: 1,
      accountRevision: 0,
      learnerRevisions: { 'learner-a': 0 },
    },
  }));

  const server = createMockRepositoryServer({ learners: remoteLearners });
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    legacyRuntimeWritesEnabled: false,
  });

  await repositories.hydrate();

  const snapshot = repositories.persistence.read();
  assert.equal(snapshot.mode, 'remote-sync');
  assert.equal(snapshot.trustedState, 'remote');
  assert.equal(snapshot.cacheState, 'aligned');
  assert.equal(snapshot.pendingWriteCount, 0);
  assert.equal(snapshot.lastError, null);
  assert.deepEqual(repositories.subjectStates.read('learner-a', 'spelling'), { ui: null, data: {}, updatedAt: 0 });
  assert.equal(repositories.practiceSessions.latest('learner-a', 'spelling'), null);
  assert.deepEqual(repositories.gameState.read('learner-a', 'monster-codex'), {});
  assert.equal(server.requests.some(({ path }) => ['/api/child-subject-state', '/api/practice-sessions', '/api/child-game-state'].includes(path)), false);

  const harness = createAppHarness({ repositories });
  const html = harness.render();
  assert.doesNotMatch(html, /Sync degraded/);
  assert.doesNotMatch(html, /Retry sync/);
  assert.doesNotMatch(html, /cached changes still need remote sync/i);

  const persisted = JSON.parse(storage.getItem(DEFAULT_API_CACHE_STORAGE_KEY));
  assert.deepEqual(persisted.pendingOperations, []);
  assert.deepEqual(persisted.bundle.practiceSessions, []);
});

test('remote write failure is surfaced as degraded persistence instead of pretending the write succeeded', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer();
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
  });

  await repositories.hydrate();
  server.failNext('PUT', '/api/learners', {
    status: 503,
    body: { ok: false, message: 'remote unavailable' },
  });

  repositories.learners.write(learnerSnapshot());
  await waitForPersistenceIdle(repositories);

  const snapshot = repositories.persistence.read();
  assert.equal(snapshot.mode, 'degraded');
  assert.equal(snapshot.remoteAvailable, true);
  assert.equal(snapshot.trustedState, 'local-cache');
  assert.equal(snapshot.cacheState, 'ahead-of-remote');
  assert.equal(snapshot.pendingWriteCount, 1);
  assert.equal(snapshot.inFlightWriteCount, 0);
  assert.equal(snapshot.lastError.retryable, true);
  assert.match(snapshot.lastError.message, /remote unavailable/i);

  assert.equal(repositories.learners.read().selectedId, 'learner-a');
  assert.equal(server.store.learners.selectedId, null);
});

test('retryable remote failures can leave degraded mode and clear pending writes once sync succeeds', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer();
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
  });

  await repositories.hydrate();
  server.failNext('PUT', '/api/learners', {
    status: 503,
    body: { ok: false, message: 'try again later' },
  });

  repositories.learners.write(learnerSnapshot());
  await waitForPersistenceIdle(repositories);
  assert.equal(repositories.persistence.read().mode, 'degraded');
  assert.equal(server.store.learners.selectedId, null);

  const afterRetry = await repositories.persistence.retry();

  assert.equal(afterRetry.mode, 'remote-sync');
  assert.equal(afterRetry.trustedState, 'remote');
  assert.equal(afterRetry.cacheState, 'aligned');
  assert.equal(afterRetry.pendingWriteCount, 0);
  assert.equal(server.store.learners.selectedId, 'learner-a');

  const restored = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage: installMemoryStorage(),
  });
  await restored.hydrate();
  assert.equal(restored.learners.read().selectedId, 'learner-a');
});

test('successful sync logging is quiet by default and available behind the debug flag', async () => {
  const originalInfo = globalThis.console.info;
  const originalDebugFlag = globalThis.KS2_SYNC_DEBUG;
  const messages = [];
  globalThis.console.info = (...args) => messages.push(args);
  delete globalThis.KS2_SYNC_DEBUG;

  try {
    const quietServer = createMockRepositoryServer();
    const quietRepositories = createApiPlatformRepositories({
      baseUrl: 'https://repo.test',
      fetch: quietServer.fetch.bind(quietServer),
      storage: installMemoryStorage(),
    });

    await quietRepositories.hydrate();
    quietRepositories.learners.write(learnerSnapshot());
    await waitForPersistenceIdle(quietRepositories);

    assert.equal(messages.length, 0);

    globalThis.KS2_SYNC_DEBUG = true;
    const debugServer = createMockRepositoryServer();
    const debugRepositories = createApiPlatformRepositories({
      baseUrl: 'https://repo.test',
      fetch: debugServer.fetch.bind(debugServer),
      storage: installMemoryStorage(),
    });

    await debugRepositories.hydrate();
    debugRepositories.learners.write(learnerSnapshot());
    await waitForPersistenceIdle(debugRepositories);

    assert.equal(messages.some((args) => String(args[0]).includes('[ks2-sync]')), true);
    assert.equal(messages.some((args) => String(args[1]).includes('sync.operation_applied')), true);
  } finally {
    globalThis.console.info = originalInfo;
    if (originalDebugFlag === undefined) {
      delete globalThis.KS2_SYNC_DEBUG;
    } else {
      globalThis.KS2_SYNC_DEBUG = originalDebugFlag;
    }
  }
});

test('in-flight remote writes stay in remote-sync mode instead of showing degraded', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer();
  let releaseWrite;
  let writeStarted;
  const writeStartedPromise = new Promise((resolve) => {
    writeStarted = resolve;
  });
  const releaseWritePromise = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'https://repo.test');
    const method = String(init.method || 'GET').toUpperCase();
    if (url.pathname === '/api/learners' && method === 'PUT') {
      writeStarted();
      await releaseWritePromise;
    }
    return server.fetch(input, init);
  };
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch,
    storage,
  });

  await repositories.hydrate();
  repositories.learners.write(learnerSnapshot());
  await writeStartedPromise;

  const inFlight = repositories.persistence.read();
  assert.equal(inFlight.mode, 'remote-sync');
  assert.equal(inFlight.remoteAvailable, true);
  assert.equal(inFlight.trustedState, 'local-cache');
  assert.equal(inFlight.cacheState, 'ahead-of-remote');
  assert.equal(inFlight.pendingWriteCount, 1);
  assert.equal(inFlight.lastError, null);

  releaseWrite();
  await waitForPersistenceIdle(repositories);

  const afterWrite = repositories.persistence.read();
  assert.equal(afterWrite.mode, 'remote-sync');
  assert.equal(afterWrite.trustedState, 'remote');
  assert.equal(afterWrite.pendingWriteCount, 0);
});

test('reload after failed sync keeps the local cache ahead of stale remote data instead of losing the unsynced change', async () => {
  const sharedStorage = installMemoryStorage();
  const server = createMockRepositoryServer();
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage: sharedStorage,
  });

  await repositories.hydrate();
  server.failNext('PUT', '/api/learners', {
    status: 503,
    body: { ok: false, message: 'write failed' },
  });

  repositories.learners.write(learnerSnapshot());
  await waitForPersistenceIdle(repositories);
  assert.equal(server.store.learners.selectedId, null);

  const restored = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage: sharedStorage,
  });
  await restored.hydrate();

  assert.equal(restored.learners.read().selectedId, 'learner-a');
  assert.equal(server.store.learners.selectedId, null);
  assert.equal(restored.persistence.read().mode, 'degraded');
  assert.equal(restored.persistence.read().trustedState, 'local-cache');
  assert.equal(restored.persistence.read().cacheState, 'ahead-of-remote');
  assert.equal(restored.persistence.read().pendingWriteCount, 1);
});

test('degraded persistence is rendered as explicit shell feedback and clears once sync is restored', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer();
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
  });

  await repositories.hydrate();
  server.failNext('PUT', '/api/learners', {
    status: 503,
    body: { ok: false, message: 'worker offline' },
  });

  repositories.learners.write(learnerSnapshot());
  await waitForPersistenceIdle(repositories);

  const harness = createAppHarness({ repositories });
  const degradedHtml = harness.render();
  assert.match(degradedHtml, /Sync degraded/);
  assert.match(degradedHtml, /Trusted: local cache/);
  assert.match(degradedHtml, /server may be behind/i);
  assert.match(degradedHtml, /Retry sync/);

  await repositories.persistence.retry();
  const healthyHtml = harness.render();
  assert.doesNotMatch(healthyHtml, /Sync degraded/);
  assert.equal(repositories.persistence.read().mode, 'remote-sync');
});

test('api cache is scoped by auth session so degraded fallback does not leak between accounts', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer();
  const repoA = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:a',
      headers: { 'x-ks2-dev-account-id': 'adult-a' },
    }),
  });

  await repoA.hydrate();
  server.failNext('PUT', '/api/learners', {
    status: 503,
    body: { ok: false, message: 'write failed' },
  });
  repoA.learners.write(learnerSnapshot());
  await waitForPersistenceIdle(repoA);
  assert.equal(repoA.persistence.read().mode, 'degraded');

  server.failNext('GET', '/api/bootstrap', {
    status: 503,
    body: { ok: false, message: 'bootstrap unavailable' },
  });

  const repoB = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:b',
      headers: { 'x-ks2-dev-account-id': 'adult-b' },
    }),
  });

  await assert.rejects(() => repoB.hydrate(), /bootstrap unavailable/i);
});

test('bootstrap 503 with a usable cache degrades once and backs off immediate full-bootstrap retries', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({ learners: learnerSnapshot() });
  let now = 1_000;
  const commonOptions = {
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    now: () => now,
    random: () => 0,
  };
  const bootstrapRequestCount = () => server.requests
    .filter((request) => request.method === 'GET' && request.path === '/api/bootstrap')
    .length;

  const warmRepositories = createApiPlatformRepositories(commonOptions);
  await warmRepositories.hydrate();
  assert.equal(bootstrapRequestCount(), 1);

  server.setFailure('GET', '/api/bootstrap', {
    status: 503,
    body: {
      ok: false,
      code: 'exceeded_cpu',
      message: 'Worker CPU limit exceeded during bootstrap.',
    },
  });

  const restoredRepositories = createApiPlatformRepositories(commonOptions);
  await restoredRepositories.hydrate();

  const degraded = restoredRepositories.persistence.read();
  assert.equal(bootstrapRequestCount(), 2);
  assert.equal(degraded.mode, 'degraded');
  assert.equal(degraded.trustedState, 'local-cache');
  assert.equal(degraded.cacheState, 'stale-copy');
  assert.equal(degraded.pendingWriteCount, 0);
  assert.equal(degraded.lastError.code, 'exceeded_cpu');
  assert.equal(degraded.lastError.details.bootstrapBackoff.attempt, 1);
  assert.equal(degraded.lastError.details.bootstrapBackoff.retryAfterMs, 2_000);
  assert.equal(restoredRepositories.learners.read().selectedId, 'learner-a');
  assert.equal(JSON.parse(storage.getItem(DEFAULT_API_CACHE_STORAGE_KEY)).bootstrapBackoff.retryAt, 3_000);

  await assert.rejects(
    () => restoredRepositories.persistence.retry(),
    /backing off/i,
  );

  const throttled = restoredRepositories.persistence.read();
  assert.equal(bootstrapRequestCount(), 2);
  assert.equal(throttled.mode, 'degraded');
  assert.equal(throttled.lastError.code, 'bootstrap_retry_backoff');
  assert.equal(throttled.lastError.details.retryAfterMs, 2_000);

  const reloadedDuringBackoff = createApiPlatformRepositories(commonOptions);
  await reloadedDuringBackoff.hydrate();
  assert.equal(bootstrapRequestCount(), 2);
  assert.equal(reloadedDuringBackoff.persistence.read().lastError.code, 'bootstrap_retry_backoff');

  server.clearFailure('GET', '/api/bootstrap');
  now = 3_000;
  const recovered = await reloadedDuringBackoff.persistence.retry();

  assert.equal(bootstrapRequestCount(), 3);
  assert.equal(recovered.mode, 'remote-sync');
  assert.equal(recovered.lastError, null);
});

test('bootstrap backoff blocks retry flush from masking pending-write recovery state', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer();
  let now = 5_000;
  const commonOptions = {
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    now: () => now,
    random: () => 0,
  };
  const bootstrapRequestCount = () => server.requests
    .filter((request) => request.method === 'GET' && request.path === '/api/bootstrap')
    .length;
  const learnerWriteCount = () => server.requests
    .filter((request) => request.method === 'PUT' && request.path === '/api/learners')
    .length;

  const repositories = createApiPlatformRepositories(commonOptions);
  await repositories.hydrate();
  server.failNext('PUT', '/api/learners', {
    status: 503,
    body: { ok: false, message: 'write temporarily unavailable' },
  });
  repositories.learners.write(learnerSnapshot());
  await waitForPersistenceIdle(repositories);
  assert.equal(repositories.persistence.read().pendingWriteCount, 1);
  assert.equal(server.store.learners.selectedId, null);
  assert.equal(learnerWriteCount(), 1);

  server.setFailure('GET', '/api/bootstrap', {
    status: 503,
    body: {
      ok: false,
      code: 'exceeded_cpu',
      message: 'Worker CPU limit exceeded during bootstrap.',
    },
  });
  const restoredRepositories = createApiPlatformRepositories(commonOptions);
  await restoredRepositories.hydrate();
  assert.equal(bootstrapRequestCount(), 2);
  assert.equal(restoredRepositories.persistence.read().lastError.code, 'exceeded_cpu');

  await assert.rejects(
    () => restoredRepositories.persistence.retry(),
    /backing off/i,
  );

  const backedOff = restoredRepositories.persistence.read();
  assert.equal(bootstrapRequestCount(), 2);
  assert.equal(learnerWriteCount(), 1);
  assert.equal(backedOff.mode, 'degraded');
  assert.equal(backedOff.pendingWriteCount, 1);
  assert.equal(backedOff.lastError.code, 'bootstrap_retry_backoff');
  assert.equal(server.store.learners.selectedId, null);

  server.clearFailure('GET', '/api/bootstrap');
  now = 7_000;
  const recovered = await restoredRepositories.persistence.retry();

  assert.equal(bootstrapRequestCount(), 3);
  assert.equal(learnerWriteCount(), 2);
  assert.equal(recovered.mode, 'remote-sync');
  assert.equal(recovered.pendingWriteCount, 0);
  assert.equal(server.store.learners.selectedId, 'learner-a');
});

test('subject command responses update the api cache without queuing broad runtime writes', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({
    learners: learnerSnapshot(),
  });
  const commandBodies = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'https://repo.test');
    if (url.pathname === '/api/subjects/spelling/command' && String(init.method || 'GET').toUpperCase() === 'POST') {
      const body = JSON.parse(init.body);
      commandBodies.push(body);
      return new Response(JSON.stringify({
        ok: true,
        subjectReadModel: {
          subjectId: 'spelling',
          learnerId: body.learnerId,
          version: 1,
          phase: 'session',
          session: {
            id: 'server-session',
            type: 'learning',
            mode: 'smart',
            phase: 'question',
            progress: { done: 0, total: 1 },
            currentCard: { prompt: { cloze: 'A ________ prompt.' } },
            serverAuthority: 'worker',
          },
          prefs: { mode: 'smart', yearFilter: 'core', roundLength: '1', showCloze: true, autoSpeak: true },
          stats: {},
          analytics: { pools: {}, wordGroups: [] },
        },
        projections: {
          rewards: {
            systemId: 'monster-codex',
            state: { caught: ['spark'] },
            events: [],
            toastEvents: [],
          },
        },
        events: [{ id: 'evt-1', type: 'spelling.session.started', learnerId: body.learnerId }],
        mutation: {
          appliedRevision: 1,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return server.fetch(input, init);
  };
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch,
    storage,
  });
  await repositories.hydrate();

  const commands = createSubjectCommandClient({
    baseUrl: 'https://repo.test',
    fetch,
    getLearnerRevision: (learnerId) => repositories.runtime.readLearnerRevision(learnerId),
    onCommandApplied: ({ learnerId, subjectId, response }) => {
      repositories.runtime.applySubjectCommandResult({ learnerId, subjectId, response });
    },
  });

  await commands.send({
    subjectId: 'spelling',
    learnerId: 'learner-a',
    command: 'start-session',
    payload: { mode: 'smart', length: 1 },
    requestId: 'cmd-client-1',
  });

  assert.equal(commandBodies[0].expectedLearnerRevision, 0);
  assert.equal(repositories.runtime.readLearnerRevision('learner-a'), 1);
  assert.equal(repositories.subjectStates.read('learner-a', 'spelling').ui.phase, 'session');
  assert.equal(repositories.gameState.read('learner-a', 'monster-codex').caught[0], 'spark');
  assert.equal(repositories.eventLog.list('learner-a').length, 1);
  assert.equal(server.requests.some((request) => request.path === '/api/child-subject-state'), false);
});

test('subject commands rehydrate and retry once after a stale learner revision', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({
    learners: learnerSnapshot(),
    subjectStates: {
      'learner-a::spelling': {
        ui: { phase: 'dashboard' },
        data: {},
        updatedAt: 1,
      },
    },
  });
  const commandBodies = [];
  let bootstrapCount = 0;
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'https://repo.test');
    const method = String(init.method || 'GET').toUpperCase();
    if (url.pathname === '/api/bootstrap' && method === 'GET') {
      bootstrapCount += 1;
      const remote = await server.fetch(input, init);
      const payload = await remote.json();
      return new Response(JSON.stringify({
        ...payload,
        syncState: {
          policyVersion: 1,
          accountRevision: 0,
          learnerRevisions: {
            'learner-a': bootstrapCount === 1 ? 0 : 1,
          },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/subjects/spelling/command' && method === 'POST') {
      const body = JSON.parse(init.body);
      commandBodies.push(body);
      if (commandBodies.length === 1) {
        return new Response(JSON.stringify({
          ok: false,
          code: 'stale_write',
          message: 'Mutation rejected because this state changed in another tab or device.',
          mutation: {
            expectedRevision: body.expectedLearnerRevision,
            currentRevision: 1,
          },
        }), { status: 409, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        ok: true,
        subjectReadModel: {
          subjectId: 'spelling',
          learnerId: body.learnerId,
          version: 1,
          phase: 'session',
          session: {
            id: 'server-session',
            type: 'learning',
            mode: 'smart',
            phase: 'question',
            progress: { done: 0, total: 1 },
            currentCard: { prompt: { cloze: 'A ________ prompt.' } },
            serverAuthority: 'worker',
          },
          prefs: { mode: 'smart', yearFilter: 'core', roundLength: '1', showCloze: true, autoSpeak: true },
          stats: {},
          analytics: { pools: {}, wordGroups: [] },
        },
        projections: {
          rewards: {
            systemId: 'monster-codex',
            state: { caught: ['spark'] },
            events: [],
            toastEvents: [],
          },
        },
        mutation: {
          appliedRevision: 2,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return server.fetch(input, init);
  };
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch,
    storage,
  });
  await repositories.hydrate();

  const commands = createSubjectCommandClient({
    baseUrl: 'https://repo.test',
    fetch,
    getLearnerRevision: (learnerId) => repositories.runtime.readLearnerRevision(learnerId),
    onStaleWrite: async () => {
      await repositories.hydrate({ cacheScope: 'subject-command-stale-write' });
    },
    onCommandApplied: ({ learnerId, subjectId, response }) => {
      repositories.runtime.applySubjectCommandResult({ learnerId, subjectId, response });
    },
  });

  await commands.send({
    subjectId: 'spelling',
    learnerId: 'learner-a',
    command: 'start-session',
    payload: { mode: 'smart', length: 1 },
    requestId: 'cmd-client-stale',
  });

  assert.equal(bootstrapCount, 2);
  assert.deepEqual(commandBodies.map((body) => body.expectedLearnerRevision), [0, 1]);
  assert.equal(commandBodies[0].requestId, commandBodies[1].requestId);
  assert.equal(repositories.runtime.readLearnerRevision('learner-a'), 2);
  assert.equal(repositories.subjectStates.read('learner-a', 'spelling').ui.phase, 'session');
});
