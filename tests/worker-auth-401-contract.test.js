// SH2-U3: parser-level contract test for the Worker's 401 response shape
// across the `demo_session_expired` and `unauthenticated` code paths.
//
// Rationale (plan section S-04 deepening)
// ---------------------------------------
// PR #227 owns `worker/src/demo/sessions.js` (merged to main); SH2-U3 delivers
// the client-side `DemoExpiryBanner` UX improvement without editing that
// file. The client's branching logic in `bootstrap.js` depends on a stable
// structural contract:
//
//   - Both the `code: 'demo_session_expired'` and `code: 'unauthenticated'`
//     paths MUST return HTTP 401 with the same status, same header set,
//     and a body shape that differs ONLY in the `code` string. A timing
//     difference between the two paths would leak a response-time oracle
//     (an observer with a cookie could probe whether the cookie corresponds
//     to a real-but-expired demo account).
//
//   - If this contract drifts, the divergence is a handoff back to
//     PR #227's zone rather than a patch in this PR. This test is the
//     detector.
//
// The test drives the shipping Worker via `tests/helpers/worker-server.js`
// and the dev-stub session provider. We never edit `worker/src/demo/sessions.js`
// — we only exercise the two error branches via fixtures that already exist
// in the shipping Worker.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const ORIGIN = 'https://repo.test';

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

async function fetchUnauthenticated(server, pathname = '/api/bootstrap') {
  // No cookie, no dev headers — a fully unauthenticated request to an
  // authenticated route hits the `unauthenticated` branch in
  // `worker/src/auth.js::createSessionAuthBoundary`.
  return server.fetchRaw(`${ORIGIN}${pathname}`);
}

async function fetchDemoExpired(server, pathname = '/api/bootstrap') {
  // The dev-stub provider reads `x-ks2-dev-demo` / `x-ks2-dev-demo-expires-at`
  // to emit a demo session whose `demoExpiresAt` is in the past. The
  // bootstrap handler's `requireActiveDemoAccount` guard then throws a
  // `UnauthenticatedError` with `code: 'demo_session_expired'`. This is
  // exactly the path the matrix test at
  // `tests/redaction-access-matrix.test.js` already exercises for F-10.
  const accountId = 'adult-demo-contract';
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, account_type, demo_expires_at
    ) VALUES (?, NULL, 'Demo Visitor', 'parent', NULL, ?, ?, 'demo', ?)
  `).run(accountId, now, now, now - 60_000);
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Demo Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(`learner-${accountId}`, now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, `learner-${accountId}`, now, now);

  return server.fetchRaw(`${ORIGIN}${pathname}`, {
    headers: {
      'x-ks2-dev-account-id': accountId,
      'x-ks2-dev-platform-role': 'parent',
      'x-ks2-dev-demo': '1',
      'x-ks2-dev-demo-expires-at': String(now - 60_000),
    },
  });
}

function canonicalHeaderSet(response) {
  // We pin the semantic header set, not exact values. `x-ks2-request-id`
  // is always fresh per request so the value is not comparable between
  // two calls; `content-length` depends on the body size (which legitimately
  // differs by the exact `code` string length). What must match is the
  // presence / absence of each header name.
  const names = new Set();
  for (const [name] of response.headers) {
    names.add(name.toLowerCase());
  }
  // Drop volatile / per-request headers that are legitimately different.
  names.delete('content-length');
  names.delete('x-ks2-request-id');
  names.delete('date');
  return [...names].sort();
}

test('401 contract: unauthenticated bootstrap returns HTTP 401 with code=unauthenticated', async () => {
  // development-stub WorkerServer — without dev headers, the session provider
  // returns null and auth.js throws `UnauthenticatedError`.
  const server = createWorkerRepositoryServer();
  try {
    const response = await fetchUnauthenticated(server);
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.code, 'unauthenticated');
    assert.equal(payload.ok, false);
  } finally {
    server.close();
  }
});

test('401 contract: expired demo bootstrap returns HTTP 401 with code=demo_session_expired', async () => {
  // F-10 guard: `x-ks2-dev-demo=1` + expired `demoExpiresAt` drives the
  // `requireActiveDemoAccount` path in `worker/src/demo/sessions.js`.
  const server = createWorkerRepositoryServer();
  try {
    const response = await fetchDemoExpired(server);
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.code, 'demo_session_expired');
    assert.equal(payload.ok, false);
  } finally {
    server.close();
  }
});

test('401 contract: both paths use HTTP 401 identically (status parity)', async () => {
  const serverA = createWorkerRepositoryServer();
  const serverB = createWorkerRepositoryServer();
  try {
    const responseUnauth = await fetchUnauthenticated(serverA);
    const responseExpired = await fetchDemoExpired(serverB);
    assert.equal(responseUnauth.status, 401);
    assert.equal(responseExpired.status, 401);
    assert.equal(responseUnauth.status, responseExpired.status, 'Status codes must match exactly.');
  } finally {
    serverA.close();
    serverB.close();
  }
});

test('401 contract: both paths have the same canonical header set', async () => {
  const serverA = createWorkerRepositoryServer();
  const serverB = createWorkerRepositoryServer();
  try {
    const responseUnauth = await fetchUnauthenticated(serverA);
    const responseExpired = await fetchDemoExpired(serverB);
    const headersUnauth = canonicalHeaderSet(responseUnauth);
    const headersExpired = canonicalHeaderSet(responseExpired);
    assert.deepEqual(
      headersUnauth,
      headersExpired,
      'Header sets must be identical between unauthenticated and demo_session_expired 401s — '
      + 'a divergence means the response-time / header oracle is reintroduced.',
    );
  } finally {
    serverA.close();
    serverB.close();
  }
});

test('401 contract: body shapes differ only in the code string (identical key set)', async () => {
  const serverA = createWorkerRepositoryServer();
  const serverB = createWorkerRepositoryServer();
  try {
    const responseUnauth = await fetchUnauthenticated(serverA);
    const responseExpired = await fetchDemoExpired(serverB);
    const payloadUnauth = await responseUnauth.json();
    const payloadExpired = await responseExpired.json();

    const keysUnauth = Object.keys(payloadUnauth).sort();
    const keysExpired = Object.keys(payloadExpired).sort();
    assert.deepEqual(
      keysUnauth,
      keysExpired,
      'Body key sets must be identical between the two 401 paths — only the `code` string value differs.',
    );
    // Required keys: ok, code, message. Extra keys beyond these should
    // appear on both sides or neither.
    assert.equal(payloadUnauth.ok, false);
    assert.equal(payloadExpired.ok, false);
    assert.equal(typeof payloadUnauth.code, 'string');
    assert.equal(typeof payloadExpired.code, 'string');
    assert.notEqual(
      payloadUnauth.code,
      payloadExpired.code,
      'The two codes must differ so the client can branch on the exact cause.',
    );
    // Sanity: neither payload may leak account-existence signals.
    assert.equal(payloadUnauth.accountId, undefined);
    assert.equal(payloadExpired.accountId, undefined);
    assert.equal(payloadUnauth.learners, undefined);
    assert.equal(payloadExpired.learners, undefined);
  } finally {
    serverA.close();
    serverB.close();
  }
});

test('401 contract: content-type is application/json for both paths', async () => {
  const serverA = createWorkerRepositoryServer();
  const serverB = createWorkerRepositoryServer();
  try {
    const responseUnauth = await fetchUnauthenticated(serverA);
    const responseExpired = await fetchDemoExpired(serverB);
    const contentTypeUnauth = String(responseUnauth.headers.get('content-type') || '').toLowerCase();
    const contentTypeExpired = String(responseExpired.headers.get('content-type') || '').toLowerCase();
    assert.match(contentTypeUnauth, /application\/json/);
    assert.match(contentTypeExpired, /application\/json/);
    assert.equal(
      contentTypeUnauth,
      contentTypeExpired,
      'Content-Type must be byte-identical between the two 401 paths.',
    );
  } finally {
    serverA.close();
    serverB.close();
  }
});
