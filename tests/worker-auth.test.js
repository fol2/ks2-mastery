import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function productionServer(env = {}) {
  return createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
      ...env,
    },
  });
}

function rejectTransactionSql(db) {
  return {
    prepare: (...args) => db.prepare(...args),
    batch: (...args) => db.batch(...args),
    exec: async sql => {
      if (/\b(SAVEPOINT|BEGIN|COMMIT|ROLLBACK|RELEASE)\b/i.test(String(sql || ''))) {
        throw new Error('transaction control SQL is not supported by this D1 binding');
      }
      return db.exec(sql);
    },
  };
}

function cookieFrom(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  const match = /ks2_session=([^;]+)/.exec(setCookie);
  return match ? `ks2_session=${match[1]}` : '';
}

async function postJson(server, path, body, headers = {}) {
  return server.fetchRaw(`https://repo.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('production email registration creates an authenticated D1-backed session', async () => {
  const server = productionServer();

  const register = await postJson(server, '/api/auth/register', {
    email: 'parent@example.test',
    password: 'password-1234',
  });
  const registerPayload = await register.json();
  const cookie = cookieFrom(register);

  assert.equal(register.status, 201);
  assert.equal(registerPayload.ok, true);
  assert.match(registerPayload.session.accountId, /^adult-/);
  assert.ok(cookie);

  const session = await server.fetchRaw('https://repo.test/api/session', {
    headers: { cookie },
  });
  const sessionPayload = await session.json();

  assert.equal(session.status, 200);
  assert.equal(sessionPayload.auth.mode, 'production');
  assert.equal(sessionPayload.auth.productionReady, true);
  assert.equal(sessionPayload.session.email, 'parent@example.test');

  server.close();
});

test('production auth session probe returns an unauthenticated payload without changing the protected session route', async () => {
  const server = productionServer();

  const protectedSession = await server.fetchRaw('https://repo.test/api/session');
  assert.equal(protectedSession.status, 401);

  const authSession = await server.fetchRaw('https://repo.test/api/auth/session');
  const payload = await authSession.json();

  assert.equal(authSession.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.auth.mode, 'production');
  assert.equal(payload.session, null);
  assert.equal(payload.account, null);
  assert.equal(payload.learnerCount, 0);

  server.close();
});

test('production email registration does not rely on transaction control SQL', async () => {
  const server = productionServer();
  server.env.DB = rejectTransactionSql(server.DB);

  const register = await postJson(server, '/api/auth/register', {
    email: 'cloudflare-d1@example.test',
    password: 'password-1234',
  });
  const registerPayload = await register.json();

  assert.equal(register.status, 201);
  assert.equal(registerPayload.ok, true);
  assert.ok(cookieFrom(register));

  server.close();
});

test('production login rejects bad credentials and accepts the registered password', async () => {
  const server = productionServer();

  await postJson(server, '/api/auth/register', {
    email: 'login@example.test',
    password: 'password-1234',
  });

  const badLogin = await postJson(server, '/api/auth/login', {
    email: 'login@example.test',
    password: 'wrong-password',
  });
  const badPayload = await badLogin.json();
  assert.equal(badLogin.status, 400);
  assert.equal(badPayload.code, 'invalid_credentials');

  const goodLogin = await postJson(server, '/api/auth/login', {
    email: 'login@example.test',
    password: 'password-1234',
  });
  assert.equal(goodLogin.status, 200);
  assert.ok(cookieFrom(goodLogin));

  server.close();
});

test('production auth POST routes require same-origin headers before mutating sessions', async () => {
  const server = productionServer({
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
  });

  for (const route of [
    {
      path: '/api/auth/register',
      body: { email: 'missing-origin-register@example.test', password: 'password-1234' },
    },
    {
      path: '/api/auth/login',
      body: { email: 'missing-origin-login@example.test', password: 'password-1234' },
    },
    {
      path: '/api/auth/google/start',
      body: {},
    },
  ]) {
    const missingOrigin = await server.fetchRaw(`https://repo.test${route.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(route.body),
    });
    const missingPayload = await missingOrigin.json();
    assert.equal(missingOrigin.status, 403, route.path);
    assert.equal(missingPayload.code, 'same_origin_required', route.path);

    const crossOrigin = await server.fetchRaw(`https://repo.test${route.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: JSON.stringify(route.body),
    });
    const crossPayload = await crossOrigin.json();
    assert.equal(crossOrigin.status, 403, route.path);
    assert.equal(crossPayload.code, 'same_origin_required', route.path);
  }

  server.close();
});

test('production logout clears the server session and cookie', async () => {
  const server = productionServer();
  const register = await postJson(server, '/api/auth/register', {
    email: 'logout@example.test',
    password: 'password-1234',
  });
  const cookie = cookieFrom(register);

  const logout = await postJson(server, '/api/auth/logout', {}, { cookie });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0/);

  const session = await server.fetchRaw('https://repo.test/api/session', {
    headers: { cookie },
  });
  assert.equal(session.status, 401);

  const authSession = await server.fetchRaw('https://repo.test/api/auth/session', {
    headers: { cookie },
  });
  const authSessionPayload = await authSession.json();
  assert.equal(authSession.status, 200);
  assert.equal(authSessionPayload.session, null);

  server.close();
});

test('production cookie-auth write routes require same-origin headers', async () => {
  const server = productionServer();
  const register = await postJson(server, '/api/auth/register', {
    email: 'same-origin-writes@example.test',
    password: 'password-1234',
  });
  const registerPayload = await register.json();
  const cookie = cookieFrom(register);
  const accountId = registerPayload.session.accountId;
  server.DB.db.prepare("UPDATE adult_accounts SET platform_role = 'admin' WHERE id = ?").run(accountId);

  const learnerWriteBody = {
    learners: {
      byId: {
        'learner-origin': {
          id: 'learner-origin',
          name: 'Origin Learner',
          yearGroup: 'Y5',
          goal: 'sats',
          dailyMinutes: 15,
          avatarColor: '#3E6FA8',
          createdAt: 1,
        },
      },
      allIds: ['learner-origin'],
      selectedId: 'learner-origin',
    },
    mutation: {
      requestId: 'origin-learner-write-1',
      expectedAccountRevision: 0,
    },
  };

  const missingLearnerOrigin = await server.fetchRaw('https://repo.test/api/learners', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify(learnerWriteBody),
  });
  const missingLearnerPayload = await missingLearnerOrigin.json();
  assert.equal(missingLearnerOrigin.status, 403);
  assert.equal(missingLearnerPayload.code, 'same_origin_required');

  const crossLearnerOrigin = await server.fetchRaw('https://repo.test/api/learners', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie,
      origin: 'https://evil.example',
    },
    body: JSON.stringify(learnerWriteBody),
  });
  const crossLearnerPayload = await crossLearnerOrigin.json();
  assert.equal(crossLearnerOrigin.status, 403);
  assert.equal(crossLearnerPayload.code, 'same_origin_required');

  const sameOriginLearnerWrite = await server.fetchRaw('https://repo.test/api/learners', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie,
      origin: 'https://repo.test',
    },
    body: JSON.stringify(learnerWriteBody),
  });
  const sameOriginLearnerPayload = await sameOriginLearnerWrite.json();
  assert.equal(sameOriginLearnerWrite.status, 200, JSON.stringify(sameOriginLearnerPayload));

  for (const route of [
    {
      path: '/api/content/spelling',
      method: 'PUT',
      body: { content: {}, mutation: { requestId: 'origin-content-write-1', expectedAccountRevision: 1 } },
    },
    {
      path: '/api/admin/accounts/role',
      method: 'PUT',
      body: { accountId, platformRole: 'admin', requestId: 'origin-role-write-1' },
    },
    {
      path: '/api/auth/logout',
      method: 'POST',
      body: {},
    },
  ]) {
    const response = await server.fetchRaw(`https://repo.test${route.path}`, {
      method: route.method,
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify(route.body),
    });
    const payload = await response.json();
    assert.equal(response.status, 403, route.path);
    assert.equal(payload.code, 'same_origin_required', route.path);
  }

  server.close();
});

test('production same-origin accepts Worker preview hosts and still denies missing origins from production auth', async () => {
  const previewServer = productionServer({
    APP_HOSTNAME: 'ks2.eugnel.uk',
  });
  const previewResponse = await previewServer.fetchRaw('https://preview.ks2-mastery.workers.dev/api/demo/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://preview.ks2-mastery.workers.dev',
    },
    body: '{}',
  });
  const previewPayload = await previewResponse.json();
  assert.equal(previewResponse.status, 201, JSON.stringify(previewPayload));
  assert.equal(previewPayload.session.demo, true);
  previewServer.close();

  const driftServer = productionServer({
    ENVIRONMENT: 'staging',
  });
  const missingOrigin = await driftServer.fetchRaw('https://repo.test/api/demo/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: '{}',
  });
  const missingPayload = await missingOrigin.json();
  assert.equal(missingOrigin.status, 403);
  assert.equal(missingPayload.code, 'same_origin_required');
  driftServer.close();
});

test('production public bootstrap redacts spelling sentinels from subject state, sessions, and events', async () => {
  const server = productionServer();
  const sentinel = 'ZXQ_FULL_LOCKDOWN_SENTINEL';
  const now = Date.now();

  const register = await postJson(server, '/api/auth/register', {
    email: 'bootstrap-redaction@example.test',
    password: 'password-1234',
  });
  const registerPayload = await register.json();
  const cookie = cookieFrom(register);
  const accountId = registerPayload.session.accountId;
  const learnerId = 'learner-bootstrap-redaction';

  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at)
    VALUES (?, 'Redaction Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?)
  `).run(learnerId, now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);
  server.DB.db.prepare('UPDATE adult_accounts SET selected_learner_id = ?, updated_at = ? WHERE id = ?')
    .run(learnerId, now, accountId);

  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', ?, ?, ?, ?)
  `).run(
    learnerId,
    JSON.stringify({
      phase: 'session',
      feedback: { answer: sentinel, attemptedAnswer: sentinel, body: sentinel },
      summary: { mistakes: [{ word: sentinel, family: sentinel }] },
      session: {
        id: 'session-bootstrap-redaction',
        type: 'learning',
        mode: 'smart',
        label: 'Smart Review',
        phase: 'feedback',
        progress: {
          done: 2,
          total: 5,
          unsafe: sentinel,
          nested: { wordSlug: sentinel.toLowerCase() },
        },
        currentCard: {
          word: { word: sentinel, slug: sentinel.toLowerCase() },
          prompt: { cloze: 'Spell the hidden word', sentence: sentinel },
        },
      },
    }),
    JSON.stringify({
      prefs: { mode: 'smart' },
      progress: {
        [sentinel.toLowerCase()]: { stage: 2, attempts: 3, correct: 2, wrong: 1 },
      },
      audio: { sentence: sentinel },
    }),
    now,
    accountId,
  );
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (
      id, learner_id, subject_id, session_kind, status, session_state_json,
      summary_json, created_at, updated_at, updated_by_account_id
    )
    VALUES (?, ?, 'spelling', 'learning', 'completed', ?, ?, ?, ?, ?)
  `).run(
    'practice-bootstrap-redaction',
    learnerId,
    JSON.stringify({
      currentCard: { word: { word: sentinel }, prompt: { sentence: sentinel } },
      results: [{ answer: sentinel }],
    }),
    JSON.stringify({
      label: sentinel,
      cards: [{ label: sentinel, value: sentinel }],
      mistakes: [{ word: sentinel, family: sentinel, year: sentinel, yearLabel: sentinel }],
    }),
    now,
    now,
    accountId,
  );
  server.DB.db.prepare(`
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, 'spelling', ?, 'spelling.retry-cleared', ?, ?, ?)
  `).run(
    `event-${sentinel}`,
    learnerId,
    sentinel,
    JSON.stringify({
      id: `spelling.retry-cleared:${sentinel}`,
      type: 'spelling.retry-cleared',
      learnerId,
      subjectId: 'spelling',
      sessionId: sentinel,
      systemId: sentinel,
      word: sentinel,
      wordSlug: sentinel.toLowerCase(),
      family: sentinel,
      yearBand: sentinel,
      monsterId: sentinel,
      kind: sentinel,
      prompt: { sentence: sentinel },
      answer: sentinel,
      createdAt: now,
    }),
    now,
    accountId,
  );
  server.DB.db.prepare(`
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, 'spelling', ?, 'spelling.answer-secret', ?, ?, ?)
  `).run(
    `event-private-${sentinel}`,
    learnerId,
    sentinel,
    JSON.stringify({
      id: `spelling.answer-secret:${sentinel}`,
      type: 'spelling.answer-secret',
      learnerId,
      subjectId: 'spelling',
      answer: sentinel,
      createdAt: now + 1,
    }),
    now + 1,
    accountId,
  );
  server.DB.db.prepare(`
    INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
    VALUES (?, 'monster-codex', ?, ?, ?)
  `).run(
    learnerId,
    JSON.stringify({
      inklet: { mastered: [sentinel.toLowerCase()], caught: true, branch: 'b1', wordSlug: sentinel.toLowerCase() },
      glimmerbug: { mastered: [sentinel], caught: true, branch: 'b2' },
      phaeton: { branch: 'b1' },
      pealark: {
        mastered: [],
        caught: false,
        branch: 'b1',
        starHighWater: 1,
        maxStageEver: 0,
        internalMarker: sentinel,
      },
      unsafe: sentinel,
    }),
    now,
    accountId,
  );
  server.DB.db.prepare(`
    INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    learnerId,
    sentinel,
    JSON.stringify({ unsafe: sentinel }),
    now,
    accountId,
  );

  const bootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie },
  });
  const payload = await bootstrap.json();
  const serialised = JSON.stringify(payload).toLowerCase();

  assert.equal(bootstrap.status, 200, JSON.stringify(payload));
  assert.equal(serialised.includes(sentinel.toLowerCase()), false);
  assert.equal(payload.subjectStates[`${learnerId}::spelling`].ui.feedback, null);
  assert.equal(payload.subjectStates[`${learnerId}::spelling`].ui.summary, null);
  assert.deepEqual(payload.subjectStates[`${learnerId}::spelling`].ui.session.progress, { done: 2, total: 5 });
  assert.equal(payload.practiceSessions[0].sessionState, null);
  assert.equal(payload.practiceSessions[0].summary.mistakes[0].word, undefined);
  assert.equal(payload.practiceSessions[0].summary.mistakes[0].family, undefined);
  assert.equal(payload.eventLog[0].id, undefined);
  assert.equal(payload.eventLog[0].sessionId, undefined);
  assert.equal(payload.eventLog[0].systemId, undefined);
  assert.equal(payload.eventLog[0].wordSlug, undefined);
  assert.equal(payload.eventLog[0].word, undefined);
  assert.equal(payload.eventLog[0].family, undefined);
  assert.equal(payload.eventLog[0].answer, undefined);
  assert.equal(payload.eventLog[0].monsterId, undefined);
  assert.equal(payload.eventLog[0].kind, undefined);
  assert.equal(payload.eventLog.length, 1);
  const publicGameState = payload.gameState[`${learnerId}::monster-codex`];
  assert.equal(publicGameState.inklet.mastered, undefined);
  assert.equal(publicGameState.inklet.wordSlug, undefined);
  assert.equal(publicGameState.inklet.masteredCount, 1);
  assert.equal(publicGameState.inklet.branch, 'b1');
  assert.equal(publicGameState.glimmerbug.mastered, undefined);
  assert.equal(publicGameState.glimmerbug.masteredCount, 1);
  assert.equal(publicGameState.glimmerbug.branch, 'b2');
  assert.equal(publicGameState.pealark.mastered, undefined);
  assert.equal(publicGameState.pealark.internalMarker, undefined);
  assert.equal(publicGameState.pealark.masteredCount, 0);
  assert.equal(publicGameState.pealark.caught, false);
  assert.equal(publicGameState.pealark.branch, 'b1');
  assert.equal(publicGameState.pealark.starHighWater, 1);
  assert.equal(publicGameState.pealark.maxStageEver, 0);
  assert.equal(publicGameState.unsafe, undefined);

  server.close();
});

test('production public bootstrap keeps Codex mastery visible from redacted spelling progress', async () => {
  const server = productionServer();
  const register = await postJson(server, '/api/auth/register', {
    email: 'bootstrap-codex@example.test',
    password: 'password-1234',
  });
  const registerPayload = await register.json();
  const cookie = cookieFrom(register);
  const accountId = registerPayload.session.accountId;
  const now = Date.UTC(2026, 0, 1);

  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-codex', 'Ava', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, 'learner-codex', 'owner', 0, ?, ?)
  `).run(accountId, now, now);
  server.DB.db.prepare('UPDATE adult_accounts SET selected_learner_id = ? WHERE id = ?')
    .run('learner-codex', accountId);
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES ('learner-codex', 'spelling', ?, ?, ?, ?)
  `).run(JSON.stringify({ phase: 'dashboard' }), JSON.stringify({
    progress: {
      possess: { stage: 4 },
      accommodate: { stage: 4 },
      necessary: { stage: 4 },
      mollusc: { stage: 4 },
    },
  }), now, accountId);

  const response = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie },
  });
  const payload = await response.json();
  const publicSpelling = payload.subjectStates['learner-codex::spelling'];
  const publicGameState = payload.gameState['learner-codex::monster-codex'];

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(publicSpelling.data.progress, undefined);
  assert.ok(publicSpelling.ui.stats.core.total > 0);
  assert.equal(publicSpelling.ui.stats.all.secure, 3);
  assert.equal(publicSpelling.ui.stats.core.secure, 3);
  assert.equal(publicSpelling.ui.stats.y34.secure, 1);
  assert.equal(publicSpelling.ui.stats.y56.secure, 2);
  assert.equal(publicSpelling.ui.stats.extra.total, 33);
  assert.equal(publicSpelling.ui.stats.extra.secure, 1);
  assert.deepEqual(publicSpelling.ui.analytics.wordGroups, []);
  assert.equal(publicSpelling.ui.analytics.pools.core.secure, 3);
  assert.equal(publicGameState.inklet.mastered, undefined);
  assert.equal(publicGameState.inklet.masteredCount, 1);
  assert.equal(publicGameState.glimmerbug.masteredCount, 2);
  assert.equal(publicGameState.phaeton.masteredCount, 3);
  assert.equal(publicGameState.phaeton.caught, true);
  assert.equal(publicGameState.vellhorn.masteredCount, 1);

  server.close();
});

test('social sign-in start is explicit when a provider is not configured', async () => {
  const server = productionServer();

  const response = await postJson(server, '/api/auth/google/start', {});
  const payload = await response.json();

  assert.equal(response.status, 501);
  assert.equal(payload.code, 'auth_provider_not_configured');

  server.close();
});
