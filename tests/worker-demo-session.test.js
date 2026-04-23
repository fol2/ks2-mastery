import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../worker/src/auth.js';
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

function setCookieValues(response) {
  const raw = response.headers.getSetCookie?.() || String(response.headers.get('set-cookie') || '')
    .split(/,\s*(?=ks2_)/)
    .filter(Boolean);
  return raw
    .map((cookie) => String(cookie || '').split(';')[0])
    .filter(Boolean);
}

function cookieFrom(response) {
  return setCookieValues(response).find((cookie) => cookie.startsWith('ks2_session=')) || '';
}

function cookieHeader(...values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .join('; ');
}

async function postJson(server, path, body = {}, headers = {}) {
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

async function withGoogleProfile(profile, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'google-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return new Response(JSON.stringify({
        sub: profile.subject || 'google-subject',
        email: profile.email || '',
        email_verified: profile.emailVerified !== false,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input);
  };
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function startGoogleLogin(server, cookie = '') {
  const start = await postJson(server, '/api/auth/google/start', {}, cookie ? { cookie } : {});
  const startPayload = await start.json();
  const oauthCookies = setCookieValues(start);
  return {
    state: new URL(startPayload.redirectUrl).searchParams.get('state'),
    oauthCookies,
  };
}

function googleCallback(server, { state, cookie = '', oauthCookies = [] }) {
  return server.fetchRaw(`https://repo.test/api/auth/google/callback?state=${state}&code=provider-code`, {
    headers: {
      cookie: cookieHeader(cookie, oauthCookies),
    },
  });
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

  const missingOrigin = await server.fetchRaw('https://repo.test/api/demo/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const missingPayload = await missingOrigin.json();
  assert.equal(missingOrigin.status, 403);
  assert.equal(missingPayload.code, 'same_origin_required');

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

  const oldDemoSession = await server.fetchRaw('https://repo.test/api/auth/session', {
    headers: { cookie: demoCookie },
  });
  const oldDemoPayload = await oldDemoSession.json();
  assert.equal(oldDemoSession.status, 200);
  assert.equal(oldDemoPayload.session, null);

  const oldDemoBootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie: demoCookie },
  });
  assert.equal(oldDemoBootstrap.status, 401);

  const oldDemoCommand = await postJson(server, '/api/subjects/spelling/command', {
    command: 'check-word-bank-drill',
    learnerId,
    requestId: 'old-demo-command-after-conversion',
    expectedLearnerRevision: 0,
    payload: { slug: 'early', typed: 'early' },
  }, {
    cookie: demoCookie,
  });
  assert.equal(oldDemoCommand.status, 401);

  const realBootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie: realCookie },
  });
  const realBootstrapPayload = await realBootstrap.json();
  assert.equal(realBootstrapPayload.learners.selectedId, learnerId);
  assert.equal(realBootstrapPayload.learners.byId[learnerId].name, 'Demo Learner');

  server.close();
});

test('social demo conversion invalidates the original demo cookie', async () => {
  const server = productionServer({
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
  });

  try {
    const demo = await postJson(server, '/api/demo/session');
    const demoPayload = await demo.json();
    const demoCookie = cookieFrom(demo);
    const demoBootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
      headers: { cookie: demoCookie },
    });
    const demoBootstrapPayload = await demoBootstrap.json();
    const learnerId = demoBootstrapPayload.learners.selectedId;
    const login = await startGoogleLogin(server, demoCookie);

    const callback = await withGoogleProfile({
      subject: 'google-convert-demo',
      email: 'social-converted@example.test',
    }, () => googleCallback(server, {
      state: login.state,
      cookie: demoCookie,
      oauthCookies: login.oauthCookies,
    }));
    const realCookie = cookieFrom(callback);

    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), 'https://repo.test/?auth=success');
    assert.ok(realCookie);

    const account = server.DB.db.prepare('SELECT account_type, email FROM adult_accounts WHERE id = ?')
      .get(demoPayload.session.accountId);
    assert.equal(account.account_type, 'real');
    assert.equal(account.email, 'social-converted@example.test');

    const oldDemoSession = await server.fetchRaw('https://repo.test/api/auth/session', {
      headers: { cookie: demoCookie },
    });
    const oldDemoPayload = await oldDemoSession.json();
    assert.equal(oldDemoSession.status, 200);
    assert.equal(oldDemoPayload.session, null);

    const oldDemoBootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
      headers: { cookie: demoCookie },
    });
    assert.equal(oldDemoBootstrap.status, 401);

    const oldDemoCommand = await postJson(server, '/api/subjects/spelling/command', {
      command: 'check-word-bank-drill',
      learnerId,
      requestId: 'old-social-demo-command-after-conversion',
      expectedLearnerRevision: 0,
      payload: { slug: 'early', typed: 'early' },
    }, {
      cookie: demoCookie,
    });
    assert.equal(oldDemoCommand.status, 401);
  } finally {
    server.close();
  }
});

test('social demo conversion rejects emails owned only by credentials or identities', async () => {
  for (const source of ['credential', 'identity', 'adult']) {
    const server = productionServer({
      GOOGLE_CLIENT_ID: 'google-client',
      GOOGLE_CLIENT_SECRET: 'google-secret',
    });
    try {
      const now = Date.now();
      server.DB.db.prepare(`
        INSERT INTO adult_accounts (id, email, display_name, account_type, created_at, updated_at)
        VALUES (?, ?, 'Existing Parent', 'real', ?, ?)
      `).run(`adult-${source}`, source === 'adult' ? 'shared-social@example.test' : null, now, now);
      if (source === 'credential') {
        server.DB.db.prepare(`
          INSERT INTO account_credentials (account_id, email, password_hash, password_salt, created_at, updated_at)
          VALUES ('adult-credential', 'shared-social@example.test', 'hash', 'salt', ?, ?)
        `).run(now, now);
      }
      if (source === 'identity') {
        server.DB.db.prepare(`
          INSERT INTO account_identities (id, account_id, provider, provider_subject, email, created_at, updated_at)
          VALUES ('identity-existing', 'adult-identity', 'facebook', 'facebook-existing', 'shared-social@example.test', ?, ?)
        `).run(now, now);
      }

      const demo = await postJson(server, '/api/demo/session');
      const demoPayload = await demo.json();
      const demoCookie = cookieFrom(demo);
      const login = await startGoogleLogin(server, demoCookie);
      const callback = await withGoogleProfile({
        subject: `google-conflict-${source}`,
        email: 'shared-social@example.test',
      }, () => googleCallback(server, {
        state: login.state,
        cookie: demoCookie,
        oauthCookies: login.oauthCookies,
      }));

      const account = server.DB.db.prepare('SELECT account_type, email FROM adult_accounts WHERE id = ?')
        .get(demoPayload.session.accountId);
      const demoIdentity = server.DB.db.prepare('SELECT id FROM account_identities WHERE account_id = ?')
        .get(demoPayload.session.accountId);

      assert.equal(callback.status, 302);
      assert.match(callback.headers.get('location') || '', /auth_error=/);
      assert.equal(account.account_type, 'demo', source);
      assert.equal(account.email, null, source);
      assert.equal(demoIdentity, undefined, source);
    } finally {
      server.close();
    }
  }
});

test('ordinary social sign-in reuses emails owned by credentials or identities', async () => {
  for (const source of ['credential', 'identity']) {
    const server = productionServer({
      GOOGLE_CLIENT_ID: 'google-client',
      GOOGLE_CLIENT_SECRET: 'google-secret',
    });
    try {
      const now = Date.now();
      server.DB.db.prepare(`
        INSERT INTO adult_accounts (id, email, display_name, account_type, created_at, updated_at)
        VALUES (?, NULL, 'Existing Parent', 'real', ?, ?)
      `).run(`adult-${source}`, now, now);
      if (source === 'credential') {
        server.DB.db.prepare(`
          INSERT INTO account_credentials (account_id, email, password_hash, password_salt, created_at, updated_at)
          VALUES ('adult-credential', 'ordinary-social@example.test', 'hash', 'salt', ?, ?)
        `).run(now, now);
      } else {
        server.DB.db.prepare(`
          INSERT INTO account_identities (id, account_id, provider, provider_subject, email, created_at, updated_at)
          VALUES ('identity-existing', 'adult-identity', 'facebook', 'facebook-existing', 'ordinary-social@example.test', ?, ?)
        `).run(now, now);
      }

      const login = await startGoogleLogin(server);
      const callback = await withGoogleProfile({
        subject: `google-ordinary-${source}`,
        email: 'ordinary-social@example.test',
      }, () => googleCallback(server, {
        state: login.state,
        oauthCookies: login.oauthCookies,
      }));
      const accountCount = server.DB.db.prepare('SELECT COUNT(*) AS count FROM adult_accounts').get().count;
      const identity = server.DB.db.prepare(`
        SELECT account_id
        FROM account_identities
        WHERE provider = 'google' AND provider_subject = ?
      `).get(`google-ordinary-${source}`);
      const account = server.DB.db.prepare('SELECT email FROM adult_accounts WHERE id = ?')
        .get(`adult-${source}`);

      assert.equal(callback.status, 302);
      assert.equal(callback.headers.get('location'), 'https://repo.test/?auth=success');
      assert.equal(accountCount, 1, source);
      assert.equal(identity.account_id, `adult-${source}`, source);
      assert.equal(account.email, 'ordinary-social@example.test', source);
    } finally {
      server.close();
    }
  }
});

test('demo registration rejects an email already owned by a social-only account', async () => {
  const server = productionServer();
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, account_type, created_at, updated_at)
    VALUES ('adult-social', 'social-only@example.test', 'Social Parent', 'real', ?, ?)
  `).run(now, now);
  server.DB.db.prepare(`
    INSERT INTO account_identities (id, account_id, provider, provider_subject, email, created_at, updated_at)
    VALUES ('identity-social', 'adult-social', 'google', 'google-social', 'social-only@example.test', ?, ?)
  `).run(now, now);

  const demo = await postJson(server, '/api/demo/session');
  const demoPayload = await demo.json();
  const demoCookie = cookieFrom(demo);
  const register = await postJson(server, '/api/auth/register', {
    email: 'social-only@example.test',
    password: 'password-1234',
    convertDemo: true,
  }, {
    cookie: demoCookie,
  });
  const registerPayload = await register.json();
  const demoAccount = server.DB.db.prepare('SELECT account_type, email FROM adult_accounts WHERE id = ?')
    .get(demoPayload.session.accountId);

  assert.equal(register.status, 409);
  assert.equal(registerPayload.code, 'email_already_registered');
  assert.equal(demoAccount.account_type, 'demo');
  assert.notEqual(demoAccount.email, 'social-only@example.test');

  server.close();
});

test('demo registration rolls back account promotion when credential insert races', async () => {
  const server = productionServer();

  const demo = await postJson(server, '/api/demo/session');
  const demoPayload = await demo.json();
  const demoCookie = cookieFrom(demo);

  server.DB.db.exec(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, account_type)
    VALUES ('race-account', NULL, 'Race Account', 'parent', NULL, 1, 1, 'real');

    CREATE TRIGGER simulate_demo_credential_race
    AFTER UPDATE OF email ON adult_accounts
    WHEN NEW.id = '${demoPayload.session.accountId}' AND NEW.email = 'race@example.test'
    BEGIN
      INSERT INTO account_credentials (account_id, email, password_hash, password_salt, created_at, updated_at)
      VALUES ('race-account', 'race@example.test', 'hash', 'salt', 2, 2);
    END;
  `);

  server.env.DB = {
    prepare: (...args) => server.DB.prepare(...args),
    batch: (...args) => server.DB.batch(...args),
  };

  const register = await postJson(server, '/api/auth/register', {
    email: 'race@example.test',
    password: 'LongEnoughPassword123!',
    convertDemo: true,
  }, { cookie: demoCookie });
  const payload = await register.json();

  assert.equal(register.status, 409);
  assert.equal(payload.code, 'email_already_registered');

  const demoAccount = server.DB.db.prepare(`
    SELECT account_type, email, demo_expires_at, converted_from_demo_at
    FROM adult_accounts
    WHERE id = ?
  `).get(demoPayload.session.accountId);
  const demoCredential = server.DB.db.prepare(`
    SELECT account_id
    FROM account_credentials
    WHERE account_id = ?
  `).get(demoPayload.session.accountId);

  assert.equal(demoAccount.account_type, 'demo');
  assert.equal(demoAccount.email, null);
  assert.ok(Number(demoAccount.demo_expires_at) > Date.now());
  assert.equal(demoAccount.converted_from_demo_at, null);
  assert.equal(demoCredential, undefined);

  server.close();
});

test('social demo conversion rejects callbacks for a different active demo session', async () => {
  const server = productionServer({
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
  });

  const demoA = await postJson(server, '/api/demo/session');
  const demoAPayload = await demoA.json();
  const demoACookie = cookieFrom(demoA);

  const start = await postJson(server, '/api/auth/google/start', {}, {
    cookie: demoACookie,
  });
  const startPayload = await start.json();
  const oauthCookies = setCookieValues(start);
  const state = new URL(startPayload.redirectUrl).searchParams.get('state');

  const demoB = await postJson(server, '/api/demo/session');
  const demoBPayload = await demoB.json();
  const demoBCookie = cookieFrom(demoB);

  const callback = await server.fetchRaw(`https://repo.test/api/auth/google/callback?state=${state}&code=provider-code`, {
    headers: {
      cookie: cookieHeader(demoBCookie, oauthCookies),
    },
  });

  const accountA = server.DB.db.prepare('SELECT account_type, email FROM adult_accounts WHERE id = ?')
    .get(demoAPayload.session.accountId);
  const accountB = server.DB.db.prepare('SELECT account_type, email FROM adult_accounts WHERE id = ?')
    .get(demoBPayload.session.accountId);
  const identities = server.DB.db.prepare('SELECT COUNT(*) AS count FROM account_identities').get();

  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location') || '', /auth_error=/);
  assert.equal(accountA.account_type, 'demo');
  assert.equal(accountA.email, null);
  assert.equal(accountB.account_type, 'demo');
  assert.equal(accountB.email, null);
  assert.equal(identities.count, 0);

  server.close();
});
