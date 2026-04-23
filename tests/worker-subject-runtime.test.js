import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { createSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { normaliseSubjectCommandRequest } from '../worker/src/subjects/command-contract.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

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

test('subject command contract requires command identity and revision metadata', () => {
  assert.throws(() => normaliseSubjectCommandRequest({
    routeSubjectId: 'spelling',
    body: {
      command: 'start',
      learnerId: 'learner-a',
      requestId: 'cmd-1',
    },
  }), /expectedLearnerRevision/);

  const command = normaliseSubjectCommandRequest({
    routeSubjectId: 'spelling',
    body: {
      command: 'Start Session',
      learnerId: 'learner-a',
      requestId: 'cmd-1',
      expectedLearnerRevision: 3,
      payload: { mode: 'smart' },
    },
  });

  assert.deepEqual(command, {
    subjectId: 'spelling',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'cmd-1',
    correlationId: 'cmd-1',
    expectedLearnerRevision: 3,
    payload: { mode: 'smart' },
  });
});

test('subject runtime dispatches to subject-owned handlers', async () => {
  const runtime = createSubjectRuntime({
    handlers: {
      spelling: {
        'start-session': async (command, context) => ({
          ok: true,
          learnerId: command.learnerId,
          subjectReadModel: { phase: 'setup' },
          accountId: context.session.accountId,
        }),
      },
    },
  });

  const result = await runtime.dispatch({
    subjectId: 'spelling',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'cmd-1',
    correlationId: 'cmd-1',
    expectedLearnerRevision: 0,
    payload: {},
  }, {
    session: { accountId: 'adult-a' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.subjectId, 'spelling');
  assert.equal(result.command, 'start-session');
  assert.equal(result.learnerId, 'learner-a');
  assert.deepEqual(result.subjectReadModel, { phase: 'setup' });
});

test('worker subject command route validates auth, same-origin, and handler availability', async () => {
  const DB = createMigratedSqliteD1Database();
  const runtime = createSubjectRuntime({
    handlers: {
      spelling: {
        'start-session': async command => ({
          learnerId: command.learnerId,
          subjectReadModel: { phase: 'started' },
        }),
      },
    },
  });
  const app = createWorkerApp({ subjectRuntime: runtime });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };
  const now = Date.now();
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-a', 'adult-a@example.test', 'Adult A', 'parent', NULL, ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, ?, ?)
  `).run(now, now);
  DB.db.prepare("UPDATE adult_accounts SET selected_learner_id = 'learner-a' WHERE id = 'adult-a'").run();

  const unauthenticated = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }), env, {});
  assert.equal(unauthenticated.status, 401);

  const crossOrigin = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'cmd-1',
      expectedLearnerRevision: 0,
    }),
  }), env, {});
  const crossOriginPayload = await crossOrigin.json();
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOriginPayload.code, 'same_origin_required');

  const ok = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'cmd-2',
      expectedLearnerRevision: 0,
    }),
  }), env, {});
  const okPayload = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(okPayload.ok, true);
  assert.equal(okPayload.subjectId, 'spelling');
  assert.equal(okPayload.command, 'start-session');
  assert.equal(okPayload.mutation.kind, 'subject_command.spelling.start-session');
  assert.equal(okPayload.mutation.appliedRevision, 1);
  assert.deepEqual(okPayload.subjectReadModel, { phase: 'started' });

  const replay = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'cmd-2',
      expectedLearnerRevision: 0,
    }),
  }), env, {});
  const replayPayload = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(replayPayload.mutation.replayed, true);

  const missing = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'missing',
      learnerId: 'learner-a',
      requestId: 'cmd-3',
      expectedLearnerRevision: 1,
    }),
  }), env, {});
  const missingPayload = await missing.json();
  assert.equal(missing.status, 404);
  assert.equal(missingPayload.code, 'subject_command_not_found');

  DB.close();
});

test('demo sessions cannot use legacy broad learner runtime write routes', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const demo = await postJson(server, '/api/demo/session');
  const cookie = cookieFrom(demo);

  const response = await server.fetchRaw('https://repo.test/api/child-subject-state', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify({
      learnerId: 'learner-demo-x',
      subjectId: 'spelling',
      record: { ui: null, data: {} },
      mutation: {
        requestId: 'legacy-write-1',
        expectedLearnerRevision: 0,
      },
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.code, 'subject_command_required');

  server.close();
});
