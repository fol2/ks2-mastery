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

test('subject command replay requires current learner write access', async () => {
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
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-a', 'adult-a@example.test', 'Adult A', 'parent', 'learner-a', ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, ?, ?)
  `).run(now, now);

  const body = {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'cmd-replay-access',
    expectedLearnerRevision: 0,
  };
  const first = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify(body),
  }), env, {});
  assert.equal(first.status, 200, await first.text());

  DB.db.prepare(`
    DELETE FROM account_learner_memberships
    WHERE account_id = 'adult-a' AND learner_id = 'learner-a'
  `).run();

  const replay = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify(body),
  }), env, {});
  const replayPayload = await replay.json();

  assert.equal(replay.status, 403);
  assert.equal(replayPayload.code, 'forbidden');

  DB.close();
});

test('subject command writes roll back as one D1 batch without a transaction feature flag', async () => {
  const DB = createMigratedSqliteD1Database();
  delete DB.supportsSqlTransactions;
  const runtime = createSubjectRuntime({
    handlers: {
      spelling: {
        'start-session': async command => ({
          learnerId: command.learnerId,
          changed: true,
          subjectReadModel: { phase: 'started' },
          runtimeWrite: {
            state: { phase: 'session' },
            data: { prefs: { mode: 'smart' } },
            events: [
              { id: 'bad-event', learnerId: 'missing-learner', type: 'spelling.word-secured', createdAt: 1 },
            ],
          },
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

  const response = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'cmd-atomic-failure',
      expectedLearnerRevision: 0,
    }),
  }), env, {});

  assert.equal(response.status, 500);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM child_subject_state WHERE learner_id = ?').get('learner-a').count, 0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM mutation_receipts WHERE request_id = ?').get('cmd-atomic-failure').count, 0);

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

test('production real sessions cannot use legacy broad learner runtime write routes', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const register = await postJson(server, '/api/auth/register', {
    email: 'legacy-runtime@example.test',
    password: 'password-1234',
  });
  const cookie = cookieFrom(register);
  const routes = [
    {
      path: '/api/child-subject-state',
      method: 'PUT',
      body: { learnerId: 'learner-a', subjectId: 'spelling', record: { ui: null, data: {} }, mutation: { requestId: 'legacy-subject-put', expectedLearnerRevision: 0 } },
    },
    {
      path: '/api/practice-sessions',
      method: 'PUT',
      body: { record: { id: 'sess-a', learnerId: 'learner-a', subjectId: 'spelling' }, mutation: { requestId: 'legacy-session-put', expectedLearnerRevision: 0 } },
    },
    {
      path: '/api/child-game-state',
      method: 'PUT',
      body: { learnerId: 'learner-a', systemId: 'monster-codex', state: {}, mutation: { requestId: 'legacy-game-put', expectedLearnerRevision: 0 } },
    },
    {
      path: '/api/event-log',
      method: 'POST',
      body: { event: { learnerId: 'learner-a', type: 'spelling.word-secured' }, mutation: { requestId: 'legacy-event-post', expectedLearnerRevision: 0 } },
    },
    {
      path: '/api/debug/reset',
      method: 'POST',
      body: { mutation: { requestId: 'legacy-debug-reset', expectedAccountRevision: 0 } },
    },
  ];

  for (const route of routes) {
    const response = await server.fetchRaw(`https://repo.test${route.path}`, {
      method: route.method,
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify(route.body),
    });
    const payload = await response.json();
    assert.equal(response.status, 403, `${route.method} ${route.path}`);
    assert.equal(payload.code, 'subject_command_required');
  }

  server.close();
});

test('server-owned learner progress reset clears runtime collections in production', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const register = await postJson(server, '/api/auth/register', {
    email: 'reset-progress@example.test',
    password: 'password-1234',
  });
  const registerPayload = await register.json();
  const cookie = cookieFrom(register);
  const accountId = registerPayload.session.accountId;
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-reset', 'Reset Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, 'learner-reset', 'owner', 0, ?, ?)
  `).run(accountId, now, now);
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES ('learner-reset', 'spelling', '{"phase":"dashboard"}', '{"progress":{"early":{"stage":2}}}', ?, ?)
  `).run(now, accountId);
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at, updated_by_account_id)
    VALUES ('session-reset', 'learner-reset', 'spelling', 'learning', 'active', '{}', NULL, ?, ?, ?)
  `).run(now, now, accountId);
  server.DB.db.prepare(`
    INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
    VALUES ('learner-reset', 'monster-codex', '{"caught":["inklet"]}', ?, ?)
  `).run(now, accountId);
  server.DB.db.prepare(`
    INSERT INTO event_log (id, learner_id, subject_id, event_type, event_json, created_at, actor_account_id)
    VALUES ('event-reset', 'learner-reset', 'spelling', 'spelling.word-secured', '{}', ?, ?)
  `).run(now, accountId);

  const reset = await postJson(server, '/api/learners/reset-progress', {
    learnerId: 'learner-reset',
    mutation: {
      requestId: 'reset-progress-1',
      expectedLearnerRevision: 0,
    },
  }, {
    cookie,
    origin: 'https://repo.test',
  });
  const payload = await reset.json();

  assert.equal(reset.status, 200, JSON.stringify(payload));
  assert.equal(payload.reset, true);
  assert.equal(server.DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE learner_id = 'learner-reset'").get().count, 0);
  assert.equal(server.DB.db.prepare("SELECT COUNT(*) AS count FROM practice_sessions WHERE learner_id = 'learner-reset'").get().count, 0);
  assert.equal(server.DB.db.prepare("SELECT COUNT(*) AS count FROM child_game_state WHERE learner_id = 'learner-reset'").get().count, 0);
  assert.equal(server.DB.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE learner_id = 'learner-reset'").get().count, 0);
  assert.equal(server.DB.db.prepare("SELECT state_revision FROM learner_profiles WHERE id = 'learner-reset'").get().state_revision, 1);

  server.DB.db.prepare(`
    DELETE FROM account_learner_memberships
    WHERE account_id = ? AND learner_id = 'learner-reset'
  `).run(accountId);
  const replay = await postJson(server, '/api/learners/reset-progress', {
    learnerId: 'learner-reset',
    mutation: {
      requestId: 'reset-progress-1',
      expectedLearnerRevision: 0,
    },
  }, {
    cookie,
    origin: 'https://repo.test',
  });
  const replayPayload = await replay.json();
  assert.equal(replay.status, 403);
  assert.equal(replayPayload.code, 'forbidden');

  server.close();
});

test('word-bank drill checks go through the subject command boundary without writing scheduler state', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp();
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };
  const now = Date.now();
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 3)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-a', 'adult-a@example.test', 'Adult A', 'parent', 'learner-a', ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, ?, ?)
  `).run(now, now);

  const response = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'check-word-bank-drill',
      learnerId: 'learner-a',
      requestId: 'drill-check-1',
      expectedLearnerRevision: 1,
      payload: { slug: 'early', typed: 'early' },
    }),
  }), env, {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.mutation.kind, 'subject_command.spelling.check-word-bank-drill');
  assert.equal(payload.mutation.expectedRevision, 1);
  assert.equal(payload.mutation.appliedRevision, 3);
  assert.equal(payload.wordBankDrill.result, 'correct');
  assert.equal(payload.subjectReadModel, undefined);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM mutation_receipts').get().count, 0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM child_subject_state').get().count, 0);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 3);

  DB.close();
});
