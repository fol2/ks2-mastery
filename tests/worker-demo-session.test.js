import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../worker/src/auth.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function productionServer() {
  return createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
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

async function seedRateLimit(server, bucket, identifier, count) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const windowStartedAt = Math.floor(now / windowMs) * windowMs;
  server.DB.db.prepare(`
    INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(limiter_key) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      request_count = excluded.request_count,
      updated_at = excluded.updated_at
  `).run(`${bucket}:${await sha256(identifier)}`, windowStartedAt, count, now);
}

test('demo session creates an isolated 24-hour server-owned account and learner', async () => {
  const server = productionServer();

  const response = await postJson(server, '/api/demo/session');
  const payload = await response.json();
  const cookie = cookieFrom(response);

  assert.equal(response.status, 201);
  assert.equal(payload.ok, true);
  assert.equal(payload.session.provider, 'demo');
  assert.equal(payload.session.demo, true);
  assert.match(payload.session.accountId, /^demo-/);
  assert.ok(payload.session.expiresAt > Date.now());
  assert.ok(cookie);

  const session = await server.fetchRaw('https://repo.test/api/session', {
    headers: { cookie },
  });
  const sessionPayload = await session.json();

  assert.equal(session.status, 200);
  assert.equal(sessionPayload.session.provider, 'demo');
  assert.equal(sessionPayload.session.demo, true);
  assert.equal(sessionPayload.account.accountType, 'demo');
  assert.equal(sessionPayload.account.demo, true);
  assert.equal(sessionPayload.learnerCount, 1);

  const bootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie },
  });
  const bootstrapPayload = await bootstrap.json();
  const learnerId = bootstrapPayload.learners.selectedId;

  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrapPayload.session.demo, true);
  assert.match(learnerId, /^learner-demo-/);
  assert.equal(bootstrapPayload.learners.byId[learnerId].name, 'Demo Learner');

  server.close();
});

test('/demo creates the same server-owned session and redirects to the app', async () => {
  const server = productionServer();

  const response = await server.fetchRaw('https://repo.test/demo');
  const cookie = cookieFrom(response);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://repo.test/?demo=1');
  assert.ok(cookie);

  const session = await server.fetchRaw('https://repo.test/api/session', {
    headers: { cookie },
  });
  const payload = await session.json();

  assert.equal(session.status, 200);
  assert.equal(payload.session.provider, 'demo');
  assert.equal(payload.session.demo, true);

  server.close();
});

test('state-changing demo creation rejects cross-origin requests', async () => {
  const server = productionServer();

  const response = await postJson(server, '/api/demo/session', {}, {
    origin: 'https://evil.example',
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.code, 'same_origin_required');

  server.close();
});

test('expired demo sessions fail closed on protected routes', async () => {
  const server = productionServer();
  const response = await postJson(server, '/api/demo/session');
  const payload = await response.json();
  const cookie = cookieFrom(response);

  server.DB.db.prepare('UPDATE adult_accounts SET demo_expires_at = ? WHERE id = ?')
    .run(Date.now() - 1_000, payload.session.accountId);

  const protectedSession = await server.fetchRaw('https://repo.test/api/session', {
    headers: { cookie },
  });
  assert.equal(protectedSession.status, 401);

  const authSession = await server.fetchRaw('https://repo.test/api/auth/session', {
    headers: { cookie },
  });
  const authPayload = await authSession.json();
  assert.equal(authSession.status, 200);
  assert.equal(authPayload.session, null);

  await postJson(server, '/api/demo/session');
  const expiredAccount = server.DB.db.prepare('SELECT id FROM adult_accounts WHERE id = ?').get(payload.session.accountId);
  const cleanupMetric = server.DB.db.prepare("SELECT metric_count FROM demo_operation_metrics WHERE metric_key = 'cleanup_count'").get();
  assert.equal(expiredAccount, undefined);
  assert.ok(Number(cleanupMetric?.metric_count) >= 1);

  server.close();
});

test('demo reset restores the template learner without changing the demo account', async () => {
  const server = productionServer();
  const response = await postJson(server, '/api/demo/session');
  const payload = await response.json();
  const cookie = cookieFrom(response);
  const accountId = payload.session.accountId;

  server.DB.db.prepare(`
    UPDATE learner_profiles
    SET name = 'Changed Demo Learner'
    WHERE id IN (
      SELECT learner_id FROM account_learner_memberships WHERE account_id = ?
    )
  `).run(accountId);

  const reset = await postJson(server, '/api/demo/reset', {}, { cookie });
  const resetPayload = await reset.json();

  assert.equal(reset.status, 200);
  assert.equal(resetPayload.ok, true);
  assert.equal(resetPayload.session.accountId, accountId);
  assert.equal(resetPayload.learners.byId[resetPayload.learners.selectedId].name, 'Demo Learner');

  server.close();
});

test('demo commands and Parent Hub reads are rate limited by session', async () => {
  const server = productionServer();
  const response = await postJson(server, '/api/demo/session');
  const cookie = cookieFrom(response);
  const bootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie },
  });
  const bootstrapPayload = await bootstrap.json();
  const learnerId = bootstrapPayload.learners.selectedId;
  const accountId = bootstrapPayload.session.accountId;
  const sessionId = server.DB.db.prepare('SELECT id FROM account_sessions WHERE account_id = ?').get(accountId)?.id;
  assert.ok(sessionId);

  await seedRateLimit(server, 'demo-command-session', sessionId, 120);
  const commandResponse = await postJson(server, '/api/subjects/spelling/command', {
    command: 'check-word-bank-drill',
    learnerId,
    requestId: 'demo-command-limit',
    expectedLearnerRevision: 0,
    payload: { slug: 'early', typed: 'early' },
  }, {
    cookie,
    origin: 'https://repo.test',
  });
  const commandPayload = await commandResponse.json();
  assert.equal(commandResponse.status, 400);
  assert.equal(commandPayload.code, 'demo_rate_limited');

  await seedRateLimit(server, 'demo-parent-hub-session', sessionId, 90);
  const hubResponse = await server.fetchRaw(`https://repo.test/api/hubs/parent?learnerId=${learnerId}`, {
    headers: { cookie },
  });
  const hubPayload = await hubResponse.json();
  assert.equal(hubResponse.status, 400);
  assert.equal(hubPayload.code, 'demo_rate_limited');

  server.close();
});

test('non-expired demo registration promotes the demo account and preserves learner state', async () => {
  const server = productionServer();
  const demo = await postJson(server, '/api/demo/session');
  const demoPayload = await demo.json();
  const demoCookie = cookieFrom(demo);

  const demoBootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie: demoCookie },
  });
  const demoBootstrapPayload = await demoBootstrap.json();
  const learnerId = demoBootstrapPayload.learners.selectedId;

  const register = await postJson(server, '/api/auth/register', {
    email: 'converted-demo@example.test',
    password: 'password-1234',
    convertDemo: true,
  }, {
    cookie: demoCookie,
  });
  const registerPayload = await register.json();
  const realCookie = cookieFrom(register);

  assert.equal(register.status, 201);
  assert.equal(registerPayload.session.accountId, demoPayload.session.accountId);
  assert.equal(registerPayload.session.provider, 'email');
  assert.equal(registerPayload.session.demo, false);
  assert.ok(realCookie);

  const session = await server.fetchRaw('https://repo.test/api/session', {
    headers: { cookie: realCookie },
  });
  const sessionPayload = await session.json();
  assert.equal(sessionPayload.account.accountType, 'real');
  assert.equal(sessionPayload.account.demo, false);

  const realBootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie: realCookie },
  });
  const realBootstrapPayload = await realBootstrap.json();
  assert.equal(realBootstrapPayload.learners.selectedId, learnerId);
  assert.equal(realBootstrapPayload.learners.byId[learnerId].name, 'Demo Learner');

  server.close();
});
